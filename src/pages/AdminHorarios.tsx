import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Clock, Plus, Trash2, X, Settings } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useBreakPolicy } from '../hooks/useAttendance';
import type { UpdateBreakPolicyDTO } from '../types';

type DetalleHorarioForm = {
  diaSemana: number;
  nombre: string;
  esDescanso: boolean;
  horaEntrada: string;
  horaSalida: string;
};

type HorarioDetalle = {
  id: number;
  diaSemana: number;
  horaEntrada: string | null;
  horaSalida: string | null;
  esDescanso: boolean;
};

type Horario = {
  id: number;
  nombre: string;
  toleranciaEntradaMin: number;
  toleranciaSalidaMin: number;
  minutosDescanso: number;
  umbralHorasExtraMin: number;
  detalles: HorarioDetalle[];
};

const DIAS_BASE: DetalleHorarioForm[] = [
  { diaSemana: 1, nombre: 'Lunes', esDescanso: false, horaEntrada: '09:00', horaSalida: '18:00' },
  { diaSemana: 2, nombre: 'Martes', esDescanso: false, horaEntrada: '09:00', horaSalida: '18:00' },
  { diaSemana: 3, nombre: 'Miercoles', esDescanso: false, horaEntrada: '09:00', horaSalida: '18:00' },
  { diaSemana: 4, nombre: 'Jueves', esDescanso: false, horaEntrada: '09:00', horaSalida: '18:00' },
  { diaSemana: 5, nombre: 'Viernes', esDescanso: false, horaEntrada: '09:00', horaSalida: '18:00' },
  { diaSemana: 6, nombre: 'Sabado', esDescanso: true, horaEntrada: '09:00', horaSalida: '13:00' },
  { diaSemana: 7, nombre: 'Domingo', esDescanso: true, horaEntrada: '09:00', horaSalida: '13:00' },
];

const NUEVO_FORM = {
  nombre: '',
  toleranciaEntradaMin: 15,
  toleranciaSalidaMin: 0,
  minutosDescanso: 60,
  umbralHorasExtraMin: 30,
  detalles: DIAS_BASE,
};

const nombreDia = (diaSemana: number) => DIAS_BASE.find((d) => d.diaSemana === diaSemana)?.nombre ?? `Dia ${diaSemana}`;

const horaCorta = (hora: string | null) => (hora ? hora.slice(0, 5) : '');

export default function AdminHorarios() {
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarPolicyModal, setMostrarPolicyModal] = useState(false);
  const [horarioSeleccionado, setHorarioSeleccionado] = useState<Horario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [form, setForm] = useState(NUEVO_FORM);

  // Estado para la política de descanso
  const [breakPolicyForm, setBreakPolicyForm] = useState<UpdateBreakPolicyDTO>({
    mode: 'FIXED',
    minMinutes: 30,
    maxMinutes: 90,
    expectedStart: '12:00',
    expectedEnd: '13:00',
    earlyTolerance: 15,
    lateTolerance: 15,
    allowContinuousShift: false,
  });

  const { updatePolicy: updateBreakPolicy, loading: updatingPolicy } = useBreakPolicy();

  const cargarHorarios = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await api.get<Horario[]>('/horarios');
      setHorarios(data);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los horarios.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarHorarios();
  }, []);

  const resumenHorarios = useMemo(
    () =>
      horarios.map((horario) => ({
        ...horario,
        diasTrabajados: horario.detalles
          .filter((d) => !d.esDescanso)
          .map((d) => `${nombreDia(d.diaSemana).slice(0, 3)} ${horaCorta(d.horaEntrada)}-${horaCorta(d.horaSalida)}`)
          .join(' / '),
      })),
    [horarios],
  );

  const actualizarDetalle = (diaSemana: number, patch: Partial<DetalleHorarioForm>) => {
    setForm((actual) => ({
      ...actual,
      detalles: actual.detalles.map((detalle) => (detalle.diaSemana === diaSemana ? { ...detalle, ...patch } : detalle)),
    }));
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setErrorForm(null);
    setForm(NUEVO_FORM);
  };

  const cerrarPolicyModal = () => {
    setMostrarPolicyModal(false);
    setHorarioSeleccionado(null);
    setBreakPolicyForm({
      mode: 'FIXED',
      minMinutes: 30,
      maxMinutes: 90,
      expectedStart: '12:00',
      expectedEnd: '13:00',
      earlyTolerance: 15,
      lateTolerance: 15,
      allowContinuousShift: false,
    });
  };

  const abrirPolicyModal = (horario: Horario) => {
    setHorarioSeleccionado(horario);
    // Aquí podrías cargar la política actual del horario si existe
    setMostrarPolicyModal(true);
  };

  const guardarBreakPolicy = async (e: FormEvent) => {
    e.preventDefault();
    if (!horarioSeleccionado) return;

    setGuardando(true);
    setErrorForm(null);

    try {
      const result = await updateBreakPolicy(
        horarioSeleccionado.id,
        breakPolicyForm
      );

      if (result.success) {
        cerrarPolicyModal();
        // Recargar horarios para reflejar cambios
        await cargarHorarios();
      } else {
        setErrorForm(result.error || 'No se pudo actualizar la política de descanso');
      }
    } catch (err: any) {
      setErrorForm(err?.message || 'Error al guardar la política');
    } finally {
      setGuardando(false);
    }
  };

  const crearHorario = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);

    const diasTrabajados = form.detalles.filter((d) => !d.esDescanso);
    if (diasTrabajados.length === 0) {
      setErrorForm('Debe existir al menos un dia trabajado.');
      setGuardando(false);
      return;
    }

    const diaIncompleto = diasTrabajados.find((d) => !d.horaEntrada || !d.horaSalida);
    if (diaIncompleto) {
      setErrorForm(`${diaIncompleto.nombre} requiere hora de entrada y salida.`);
      setGuardando(false);
      return;
    }

    try {
      await api.post('/horarios', {
        nombre: form.nombre,
        toleranciaEntradaMin: form.toleranciaEntradaMin,
        toleranciaSalidaMin: form.toleranciaSalidaMin,
        minutosDescanso: form.minutosDescanso,
        umbralHorasExtraMin: form.umbralHorasExtraMin,
        detalles: form.detalles.map((detalle) => ({
          diaSemana: detalle.diaSemana,
          esDescanso: detalle.esDescanso,
          horaEntrada: detalle.esDescanso ? null : detalle.horaEntrada,
          horaSalida: detalle.esDescanso ? null : detalle.horaSalida,
        })),
      });

      cerrarModal();
      await cargarHorarios();
    } catch (err: any) {
      setErrorForm(err?.message || 'No se pudo crear el horario.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarHorario = async (horario: Horario) => {
    if (!window.confirm(`Eliminar horario ${horario.nombre}? Los empleados que lo tengan asignado quedaran sin horario.`)) return;
    try {
      setError(null);
      await api.delete(`/horarios/${horario.id}`);
      await cargarHorarios();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el horario.');
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Horarios</h2>
          <p className="text-gray-500 mt-1">Crea jornadas semanales para asignarlas a empleados.</p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Nuevo Horario
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

      {cargando ? (
        <div className="text-gray-600">Cargando horarios...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {resumenHorarios.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-500">
              Todavia no hay horarios creados.
            </div>
          )}

          {resumenHorarios.map((horario) => (
            <div key={horario.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Clock size={20} className="text-blue-600" />
                    {horario.nombre}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{horario.diasTrabajados || 'Sin dias trabajados'}</p>
                </div>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                  #{horario.id}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => void abrirPolicyModal(horario)}
                    className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Configurar política de descanso"
                  >
                    <Settings size={18} />
                  </button>
                  <button
                    onClick={() => void eliminarHorario(horario)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Eliminar horario"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Metric label="Tol. entrada" value={`${horario.toleranciaEntradaMin} min`} />
                <Metric label="Tol. salida" value={`${horario.toleranciaSalidaMin} min`} />
                <Metric label="Descanso" value={`${horario.minutosDescanso} min`} />
                <Metric label="Extra desde" value={`${horario.umbralHorasExtraMin} min`} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {horario.detalles.map((detalle) => (
                  <div key={detalle.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-medium text-gray-700">{nombreDia(detalle.diaSemana)}</span>
                    <span className={detalle.esDescanso ? 'text-gray-400' : 'text-gray-700 font-mono'}>
                      {detalle.esDescanso ? 'Descanso' : `${horaCorta(detalle.horaEntrada)} - ${horaCorta(detalle.horaSalida)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Nuevo Horario</h3>
                <p className="text-sm text-gray-500 mt-1">Carga una semana fija de lunes a domingo.</p>
              </div>
              <button onClick={cerrarModal} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={crearHorario} className="p-6 space-y-6">
              {errorForm && (
                <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">{errorForm}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del horario</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((actual) => ({ ...actual, nombre: e.target.value }))}
                  placeholder="Ej: Lun-Vie 09:00 a 18:00"
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <NumberField label="Tol. entrada (min)" value={form.toleranciaEntradaMin} onChange={(v) => setForm((f) => ({ ...f, toleranciaEntradaMin: v }))} />
                <NumberField label="Tol. salida (min)" value={form.toleranciaSalidaMin} onChange={(v) => setForm((f) => ({ ...f, toleranciaSalidaMin: v }))} />
                <NumberField label="Descanso (min)" value={form.minutosDescanso} onChange={(v) => setForm((f) => ({ ...f, minutosDescanso: v }))} />
                <NumberField label="Extra desde (min)" value={form.umbralHorasExtraMin} onChange={(v) => setForm((f) => ({ ...f, umbralHorasExtraMin: v }))} />
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                  <CalendarDays size={18} className="text-blue-600" />
                  Semana
                </h4>
                <div className="grid gap-3">
                  {form.detalles.map((detalle) => (
                    <div key={detalle.diaSemana} className="grid grid-cols-1 md:grid-cols-[130px_120px_1fr_1fr] gap-3 items-center rounded-xl border border-gray-200 p-3">
                      <p className="font-medium text-gray-800">{detalle.nombre}</p>
                      <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={detalle.esDescanso}
                          onChange={(e) => actualizarDetalle(detalle.diaSemana, { esDescanso: e.target.checked })}
                        />
                        Descanso
                      </label>
                      <input
                        type="time"
                        disabled={detalle.esDescanso}
                        value={detalle.horaEntrada}
                        onChange={(e) => actualizarDetalle(detalle.diaSemana, { horaEntrada: e.target.value })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                      />
                      <input
                        type="time"
                        disabled={detalle.esDescanso}
                        value={detalle.horaSalida}
                        onChange={(e) => actualizarDetalle(detalle.diaSemana, { horaSalida: e.target.value })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Guardar Horario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarPolicyModal && horarioSeleccionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Política de Descanso</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Configurar descansos para: <strong>{horarioSeleccionado.nombre}</strong>
                </p>
              </div>
              <button onClick={cerrarPolicyModal} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={guardarBreakPolicy} className="p-6 space-y-6">
              {errorForm && (
                <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
                  {errorForm}
                </div>
              )}

              {/* Modo de Política */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Modo de Descanso</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['NONE', 'FIXED', 'FLEXIBLE'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBreakPolicyForm((f) => ({ ...f, mode }))}
                      className={`p-3 rounded-lg border-2 text-center font-medium transition-colors ${
                        breakPolicyForm.mode === mode
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {mode === 'NONE' && '❌ Sin Descanso'}
                      {mode === 'FIXED' && '⏰ Descanso Fijo'}
                      {mode === 'FLEXIBLE' && '🔄 Flexible'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minutos de Descanso */}
              <div className="grid grid-cols-2 gap-4">
                <NumberField
                  label="Mínimo de descanso (min)"
                  value={breakPolicyForm.minMinutes}
                  onChange={(v) => setBreakPolicyForm((f) => ({ ...f, minMinutes: v }))}
                />
                <NumberField
                  label="Máximo de descanso (min)"
                  value={breakPolicyForm.maxMinutes}
                  onChange={(v) => setBreakPolicyForm((f) => ({ ...f, maxMinutes: v }))}
                />
              </div>

              {/* Horario esperado (solo para FIXED) */}
              {breakPolicyForm.mode === 'FIXED' && (
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio esperado</label>
                    <input
                      type="time"
                      value={breakPolicyForm.expectedStart || ''}
                      onChange={(e) =>
                        setBreakPolicyForm((f) => ({ ...f, expectedStart: e.target.value }))
                      }
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora fin esperado</label>
                    <input
                      type="time"
                      value={breakPolicyForm.expectedEnd || ''}
                      onChange={(e) =>
                        setBreakPolicyForm((f) => ({ ...f, expectedEnd: e.target.value }))
                      }
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Tolerancias */}
              <div className="grid grid-cols-2 gap-4">
                <NumberField
                  label="Tolerancia inicio (min)"
                  value={breakPolicyForm.earlyTolerance}
                  onChange={(v) =>
                    setBreakPolicyForm((f) => ({ ...f, earlyTolerance: v }))
                  }
                />
                <NumberField
                  label="Tolerancia fin (min)"
                  value={breakPolicyForm.lateTolerance}
                  onChange={(v) =>
                    setBreakPolicyForm((f) => ({ ...f, lateTolerance: v }))
                  }
                />
              </div>

              {/* Opción de jornada continua */}
              <label className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={breakPolicyForm.allowContinuousShift || false}
                  onChange={(e) =>
                    setBreakPolicyForm((f) => ({
                      ...f,
                      allowContinuousShift: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="font-medium text-gray-700">
                  Permitir jornada continua (sin descanso obligatorio)
                </span>
              </label>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={cerrarPolicyModal}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando || updatingPolicy}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {guardando || updatingPolicy ? 'Guardando...' : 'Guardar Política'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      <input
        type="number"
        min={0}
        required
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
      />
    </label>
  );
}
