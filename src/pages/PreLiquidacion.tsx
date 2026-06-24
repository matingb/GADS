import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FileSpreadsheet,
  FileText,
  CheckCircle,
  AlertCircle,
  Lock,
  Clock,
  Users,
  CalendarCheck,
  TrendingUp,
  UserX,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { descargarArchivo, resumenACsv, resumenAPdf, ResumenEmpleado } from '../lib/exportar';
import { api } from '../lib/apiClient';
import { attendanceApi } from '../lib/attendanceClient';
import { useMonthInterpretations } from '../hooks/useAttendance';
import type { InterpretationResult } from '../types';

interface Cierre {
  id: number;
  periodo: string;
  estado: string;
}

export default function PreLiquidacion() {
  const { usuario } = useAuth();
  const [periodo, setPeriodo] = useState(format(new Date(), 'yyyy-MM'));
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [accionando, setAccionando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState<string | null>(null);

  // Para admin, cargar TODOS los empleados
  const [todasInterpretaciones, setTodasInterpretaciones] = useState<
    Map<number, InterpretationResult[]>
  >(new Map());

  const cargarDatos = async () => {
    setCargando(true);
    setError(null);

    try {
      // Cargar cierres
      const cierresData = await api.get('/cierres');
      setCierres(cierresData as Cierre[]);

      // Cargar empleados
      const empleadosData = await api.get('/empleados');
      setEmpleados(empleadosData as any[]);

      // Cargar interpretaciones para cada empleado del mes actual
      const interpretacionesMap = new Map<number, InterpretationResult[]>();

      for (const emp of (empleadosData as any[])) {
        try {
          const response = await attendanceApi.getMonthInterpretations(emp.id, periodo);
          if (response.interpretations.length > 0) {
            interpretacionesMap.set(emp.id, response.interpretations);
          }
        } catch (err) {
          console.error(`Failed to load interpretations for employee ${emp.id}:`, err);
        }
      }

      setTodasInterpretaciones(interpretacionesMap);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los datos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
  }, [periodo]);

  const periodoYaCerrado = useMemo(
    () => cierres.some((c) => c.periodo === periodo && c.estado === 'CERRADO'),
    [cierres, periodo]
  );

  /**
   * Calcular resumen consolidado por empleado a partir de las interpretaciones
   */
  const resumenCalculado: ResumenEmpleado[] = useMemo(() => {
    const result: ResumenEmpleado[] = [];

    for (const [empId, interpretaciones] of todasInterpretaciones) {
      const empleado = empleados.find((e) => e.id === empId);
      if (!empleado) continue;

      let diasTrabajados = 0;
      let tardanzasMin = 0;
      let horasExtra50Min = 0;
      let horasExtra100Min = 0;
      let ausencias = 0;

      for (const interp of interpretaciones) {
        // Contar días trabajados
        if (interp.status === 'COMPLETE') {
          diasTrabajados++;
        }

        // Procesar anomalías
        for (const anomaly of interp.anomalies) {
          switch (anomaly.type) {
            case 'TARDANZA':
              tardanzasMin += anomaly.minutesAffected || 0;
              break;
            case 'OVERTIME_50':
              horasExtra50Min += anomaly.minutesAffected || 0;
              break;
            case 'OVERTIME_100':
              horasExtra100Min += anomaly.minutesAffected || 0;
              break;
            case 'AUSENCIA':
              ausencias++;
              break;
          }
        }
      }

      result.push({
        empleadoId: empId,
        legajo: empleado.legajo,
        nombre: empleado.nombre,
        diasTrabajados,
        tardanzasMin,
        horasExtra50Min,
        horasExtra100Min,
        salidaAnticipadaMin: 0,
        ausencias,
        novedadesAprobadas: [],
      });
    }

    return result.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [todasInterpretaciones, empleados]);

  /**
   * Totales del período para las tarjetas de KPI.
   */
  const kpis = useMemo(() => {
    return resumenCalculado.reduce(
      (acc, r) => {
        acc.diasTrabajados += r.diasTrabajados;
        acc.horasExtraMin += r.horasExtra50Min + r.horasExtra100Min;
        acc.tardanzasMin += r.tardanzasMin;
        acc.ausencias += r.ausencias;
        return acc;
      },
      { diasTrabajados: 0, horasExtraMin: 0, tardanzasMin: 0, ausencias: 0 }
    );
  }, [resumenCalculado]);

  /**
   * Datos para el gráfico de barras de horas extra (Top 10 por minutos totales).
   * Los minutos se convierten a horas con un decimal para una lectura consistente.
   */
  const datosHorasExtra = useMemo(() => {
    return resumenCalculado
      .filter((r) => r.horasExtra50Min + r.horasExtra100Min > 0)
      .sort(
        (a, b) =>
          b.horasExtra50Min + b.horasExtra100Min - (a.horasExtra50Min + a.horasExtra100Min)
      )
      .slice(0, 10)
      .map((r) => {
        // Etiqueta única (nombre + inicial del apellido) para evitar colisiones
        const partes = r.nombre.trim().split(/\s+/);
        const etiqueta = partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0];
        return {
          name: etiqueta,
          nombreCompleto: r.nombre,
          extra50: Number((r.horasExtra50Min / 60).toFixed(1)),
          extra100: Number((r.horasExtra100Min / 60).toFixed(1)),
        };
      });
  }, [resumenCalculado]);

  /**
   * Distribución de jornadas del período para el gráfico de torta.
   * Clasifica TODAS las interpretaciones del período en categorías excluyentes,
   * de modo que las porciones suman el universo de jornadas (días hábiles × empleados).
   */
  const datosJornadas = useMemo(() => {
    let trabajados = 0;
    let licencias = 0;
    let ausencias = 0;
    let incompletas = 0;

    for (const [, interps] of todasInterpretaciones) {
      for (const interp of interps) {
        const tieneAusencia = interp.anomalies.some((a) => a.type === 'AUSENCIA');
        if (tieneAusencia) {
          ausencias++;
          continue;
        }
        switch (interp.status) {
          case 'COMPLETE':
          case 'CONTINUOUS_SHIFT':
            trabajados++;
            break;
          case 'NO_PUNCHES':
            // Sin fichadas y sin anomalía de ausencia => licencia / vacaciones justificada
            licencias++;
            break;
          case 'INCOMPLETE':
            incompletas++;
            break;
        }
      }
    }

    return [
      { name: 'Días Trabajados', value: trabajados, color: '#22c55e' },
      { name: 'Licencias / Vacaciones', value: licencias, color: '#3b82f6' },
      { name: 'Ausencias', value: ausencias, color: '#ef4444' },
      { name: 'Jornadas Incompletas', value: incompletas, color: '#f59e0b' },
    ].filter((d) => d.value > 0);
  }, [todasInterpretaciones]);

  const horasExtra = (kpis.horasExtraMin / 60).toFixed(1);

  const cerrarPeriodo = async () => {
    setAccionando(true);
    setError(null);
    setMsgOk(null);
    try {
      await api.post('/cierres', { periodo, idUsuarioCerro: usuario?.idUsuario });
      setMsgOk(`Periodo ${periodo} cerrado exitosamente.`);
      await cargarDatos();
    } catch (err: any) {
      setError(err?.message || 'No se pudo cerrar el periodo.');
    } finally {
      setAccionando(false);
    }
  };

  const exportarCsv = () => {
    if (!resumenCalculado.length) return;
    descargarArchivo(
      `preliquidacion_${periodo}.csv`,
      resumenACsv(periodo, resumenCalculado),
      'text/csv'
    );
  };

  const exportarPdf = () => {
    if (!resumenCalculado.length) return;
    descargarArchivo(
      `preliquidacion_${periodo}.pdf`,
      resumenAPdf(periodo, resumenCalculado),
      'application/pdf'
    );
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cierre Mensual y Preliquidación</h2>
          <p className="text-gray-500 mt-1">
            Resumen consolidado a partir del nuevo sistema de interpretación de asistencia.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Período</label>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
            />
          </div>
          <button
            onClick={exportarCsv}
            disabled={!resumenCalculado.length}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            <FileSpreadsheet size={18} /> CSV
          </button>
          <button
            onClick={exportarPdf}
            disabled={!resumenCalculado.length}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            <FileText size={18} /> PDF
          </button>
          <button
            onClick={cerrarPeriodo}
            disabled={accionando || periodoYaCerrado}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              accionando || periodoYaCerrado
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Lock size={18} />
            {periodoYaCerrado ? 'Período Cerrado' : 'Cerrar Período'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {msgOk && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
          <CheckCircle size={18} />
          {msgOk}
        </div>
      )}

      {cargando ? (
        <div className="p-8 text-center text-gray-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 animate-spin" />
          Cargando datos del período...
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KpiCard
            icon={<Users size={24} />}
            iconBg="bg-blue-50 text-blue-600"
            label="Empleados con Datos"
            value={resumenCalculado.length}
            valueColor="text-gray-900"
          />
          <KpiCard
            icon={<CalendarCheck size={24} />}
            iconBg="bg-green-50 text-green-600"
            label="Días Trabajados"
            value={kpis.diasTrabajados}
            valueColor="text-green-600"
          />
          <KpiCard
            icon={<TrendingUp size={24} />}
            iconBg="bg-orange-50 text-orange-600"
            label="Horas Extra"
            value={`${horasExtra}h`}
            valueColor="text-orange-600"
          />
          <KpiCard
            icon={<UserX size={24} />}
            iconBg="bg-red-50 text-red-600"
            label="Ausencias"
            value={kpis.ausencias}
            valueColor="text-red-600"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Horas Extra por Empleado</h3>
            <p className="text-sm text-gray-500 mb-6">Top 10 por horas extra acumuladas en el período.</p>
            <div className="h-72">
              {datosHorasExtra.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <TrendingUp className="w-8 h-8 mb-2" />
                  <p className="text-sm">Sin horas extra registradas.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosHorasExtra} margin={{ top: 5, right: 30, left: -20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} unit="h" />
                    <Tooltip
                      cursor={{ fill: '#f9fafb' }}
                      formatter={(v, name) => [`${v} h`, name]}
                      labelFormatter={(_label, payload) =>
                        payload?.[0]?.payload?.nombreCompleto ?? _label
                      }
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                    <Bar dataKey="extra50" name="Extra 50%" stackId="he" fill="#f97316" radius={[0, 0, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="extra100" name="Extra 100%" stackId="he" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Distribución de Jornadas</h3>
            <p className="text-sm text-gray-500 mb-6">
              Consolidado de todas las jornadas del período por estado.
            </p>
            <div className="h-72">
              {datosJornadas.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <CalendarCheck className="w-8 h-8 mb-2" />
                  <p className="text-sm">Sin jornadas registradas.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosJornadas}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ value }) => `${value}`}
                      labelLine={false}
                    >
                      {datosJornadas.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`${v} jornadas`, name]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">
              Resumen Consolidado por Empleado
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Datos calculados a partir de las interpretaciones de asistencia del período{' '}
              <strong>{format(new Date(periodo + '-01'), 'MMMM yyyy', { locale: es })}</strong>.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200 font-medium">
                  <th className="p-4">Legajo</th>
                  <th className="p-4">Empleado</th>
                  <th className="p-4 text-center">Días Trabajados</th>
                  <th className="p-4 text-center">Tardanzas</th>
                  <th className="p-4 text-center">Hs Extra 50%</th>
                  <th className="p-4 text-center">Hs Extra 100%</th>
                  <th className="p-4 text-center">Ausencias</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {resumenCalculado.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-500">
                      <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      Sin datos de asistencia registrados en este período.
                    </td>
                  </tr>
                ) : (
                  resumenCalculado.map((r) => (
                    <tr key={r.empleadoId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4 font-mono text-gray-700 font-medium">{r.legajo}</td>
                      <td className="p-4 text-gray-900 font-medium">{r.nombre}</td>
                      <td className="p-4 text-center text-gray-700">
                        <span className="inline-block bg-green-50 px-3 py-1 rounded font-medium">
                          {r.diasTrabajados}
                        </span>
                      </td>
                      <td className="p-4 text-center text-gray-700">
                        {r.tardanzasMin > 0 ? (
                          <span className="inline-block bg-yellow-50 px-3 py-1 rounded font-medium text-yellow-800">
                            {attendanceApi.formatMinutes(r.tardanzasMin)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-700">
                        {r.horasExtra50Min > 0 ? (
                          <span className="inline-block bg-orange-50 px-3 py-1 rounded font-medium text-orange-800">
                            {attendanceApi.formatMinutes(r.horasExtra50Min)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-700">
                        {r.horasExtra100Min > 0 ? (
                          <span className="inline-block bg-red-50 px-3 py-1 rounded font-medium text-red-800">
                            {attendanceApi.formatMinutes(r.horasExtra100Min)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-700">
                        {r.ausencias > 0 ? (
                          <span className="inline-block bg-red-50 px-3 py-1 rounded font-medium text-red-800">
                            {r.ausencias}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {periodoYaCerrado && (
            <div className="p-4 bg-blue-50 border-t border-blue-200 flex items-center gap-2 text-blue-800 text-sm">
              <Lock size={16} />
              Este período ha sido cerrado y no puede ser modificado.
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  valueColor: string;
}) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${iconBg}`}>{icon}</div>
      <div>
        <h3 className="text-gray-500 text-sm font-medium">{label}</h3>
        <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
}

