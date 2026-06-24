import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Check, X, Search, Filter, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';

type Estado = 'TODAS' | 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

interface Novedad {
  id: string;
  empleadoId: number;
  empleadoNombre: string;
  empleadoLegajo: string;
  tipo?: string;
  descripcion?: string;
  fechasAfectadas: string[];
  cantidadMinutos?: number;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  origen: 'AUTOMATICA' | 'MANUAL';
  observacion?: string;
}

interface TipoNovedad {
  id: number;
  codigo: string;
  descripcion: string;
}

interface EmpleadoLite {
  id: number;
  nombre: string;
  legajo: string;
}

export default function AdminNovedades() {
  const { usuario } = useAuth();
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<Estado>('PENDIENTE');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [tipos, setTipos] = useState<TipoNovedad[]>([]);
  const [empleados, setEmpleados] = useState<EmpleadoLite[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState({
    empleadoId: '',
    idTipo: '',
    fechaInicio: format(new Date(), 'yyyy-MM-dd'),
    fechaFin: format(new Date(), 'yyyy-MM-dd'),
    observacion: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setError(null);
      const [novData, tiposData, empsData] = await Promise.all([
        api.get('/novedades'),
        api.get('/novedades/tipos'),
        api.get('/empleados'),
      ]);

      setNovedades(novData as Novedad[]);
      setTipos(tiposData as TipoNovedad[]);
      setEmpleados(empsData as EmpleadoLite[]);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar novedades.');
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const cambiarEstado = async (nov: Novedad, estado: 'APROBADA' | 'RECHAZADA') => {
    try {
      await api.patch(`/novedades/${nov.id}`, { estado, idUsuarioAprueba: usuario?.idUsuario });
      await cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar la novedad.');
    }
  };

  const eliminarNovedad = async (nov: Novedad) => {
    if (!window.confirm(`Eliminar novedad de ${nov.empleadoNombre}?`)) return;
    try {
      setError(null);
      await api.delete(`/novedades/${nov.id}`);
      await cargar();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la novedad.');
    }
  };

  const crearNovedad = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);
    try {
      await api.post('/novedades', {
        empleadoId: Number(form.empleadoId),
        idTipo: Number(form.idTipo),
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin || form.fechaInicio,
        observacion: form.observacion,
        idUsuarioCarga: usuario?.idUsuario,
      });

      setMostrarModal(false);
      setForm({
        empleadoId: '',
        idTipo: '',
        fechaInicio: format(new Date(), 'yyyy-MM-dd'),
        fechaFin: format(new Date(), 'yyyy-MM-dd'),
        observacion: '',
      });
      await cargar();
    } catch (err: any) {
      setErrorForm(err?.message || 'No se pudo crear la novedad.');
    } finally {
      setGuardando(false);
    }
  };

  const novedadesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return novedades.filter((n) => {
      if (filtroEstado !== 'TODAS' && n.estado !== filtroEstado) return false;
      if (!texto) return true;
      return (
        n.empleadoNombre.toLowerCase().includes(texto) ||
        n.empleadoLegajo.toLowerCase().includes(texto) ||
        (n.tipo ?? '').toLowerCase().includes(texto)
      );
    });
  }, [novedades, filtroEstado, busqueda]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestion de Novedades</h2>
          <p className="text-gray-500 mt-1">Revisa y aprueba las incidencias generadas por el motor de reglas.</p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Nueva Novedad
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex gap-4 bg-gray-50 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por empleado, legajo o tipo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as Estado)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TODAS">Todas</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="APROBADA">Aprobadas</option>
              <option value="RECHAZADA">Rechazadas</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Tipo de Novedad</th>
                <th className="px-6 py-4">Fecha(s)</th>
                <th className="px-6 py-4">Detalle</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {novedadesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    No hay novedades con ese criterio.
                  </td>
                </tr>
              )}
              {novedadesFiltradas.map((nov) => (
                <tr key={nov.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{nov.empleadoNombre}</p>
                    <p className="text-xs text-gray-500">Legajo: {nov.empleadoLegajo}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-700">{(nov.tipo ?? '').replace(/_/g, ' ')}</span>
                    {nov.origen === 'AUTOMATICA' && (
                      <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">AUTO</span>
                    )}
                    {nov.origen === 'MANUAL' && (
                      <span className="ml-2 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">MANUAL</span>
                    )}
                    {nov.descripcion && <p className="text-xs text-gray-500 mt-1">{nov.descripcion}</p>}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {nov.fechasAfectadas.map((f) => format(new Date(`${f}T00:00:00`), 'dd/MM/yyyy')).join(', ')}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {nov.cantidadMinutos ? `${nov.cantidadMinutos} min` : nov.observacion ? nov.observacion : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        nov.estado === 'PENDIENTE'
                          ? 'bg-amber-100 text-amber-800'
                          : nov.estado === 'APROBADA'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {nov.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {nov.estado === 'PENDIENTE' && (
                        <>
                        <button
                          onClick={() => cambiarEstado(nov, 'APROBADA')}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Aprobar"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => cambiarEstado(nov, 'RECHAZADA')}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Rechazar"
                        >
                          <X size={18} />
                        </button>
                        </>
                      )}
                      <button
                        onClick={() => void eliminarNovedad(nov)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Nueva Novedad</h3>
              <p className="text-sm text-gray-500 mt-1">Registra una novedad manual (licencia, permiso, suspension).</p>
            </div>
            <form onSubmit={crearNovedad} className="p-6 space-y-4">
              {errorForm && (
                <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">{errorForm}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empleado</label>
                <select
                  required
                  value={form.empleadoId}
                  onChange={(e) => setForm((f) => ({ ...f, empleadoId: e.target.value }))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Seleccionar...</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.legajo} - {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Novedad</label>
                <select
                  required
                  value={form.idTipo}
                  onChange={(e) => setForm((f) => ({ ...f, idTipo: e.target.value }))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">{tipos.length === 0 ? 'No hay tipos disponibles' : 'Seleccionar...'}</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.descripcion}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    required
                    value={form.fechaInicio}
                    onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                  <input
                    type="date"
                    value={form.fechaFin}
                    onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observacion</label>
                <textarea
                  rows={3}
                  value={form.observacion}
                  onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModal(false);
                    setErrorForm(null);
                  }}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando || tipos.length === 0}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Guardar Novedad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
