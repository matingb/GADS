import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  AlertCircle,
  TrendingUp,
  User,
  CalendarDays,
  Download,
  Filter,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../lib/apiClient';

interface EmpleadoDetalle {
  id: number;
  nombre: string;
  legajo: string;
  cuil: string;
  categoria: string;
  estado: string;
  fechaIngreso: string;
  horarioNombre: string;
  antiguedad: string;
  stats: {
    asistencias: number;
    inasistencias: number;
    llegadasTarde: number;
    horasExtras: number;
    tendencias: {
      asistencias: number;
      inasistencias: number;
      llegadasTarde: number;
      horasExtras: number;
    };
  };
  fichadas: {
    id: string;
    fecha: string;
    entrada: string | null;
    salida: string | null;
    estado: 'NORMAL' | 'TARDE' | 'EXTRA' | 'AUSENTE' | 'INCOMPLETA';
  }[];
  licencias: {
    id: string;
    tipo: string;
    desde: string;
    hasta: string;
    estado: string;
    observacion: string | null;
  }[];
  novedades: {
    id: string;
    tipo: string;
    fecha: string;
    detalle: string;
    cantidadMinutos: number | null;
    estado: string;
    origen: string;
  }[];
  chartData: {
    name: string;
    fecha: string;
    horas: number;
  }[];
}

export default function DetalleEmpleado() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [empleado, setEmpleado] = useState<EmpleadoDetalle | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState(format(new Date(), 'yyyy-MM'));
  const [tabActiva, setTabActiva] = useState<'asistencia' | 'licencias' | 'novedades'>('asistencia');

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setErrorCarga(null);

    api
      .get<EmpleadoDetalle>(`/empleados/${id}`, { periodo })
      .then((data) => {
        if (!cancelado) setEmpleado(data);
      })
      .catch((err: any) => {
        if (!cancelado) setErrorCarga(err?.message || 'No se pudo cargar el empleado.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [id, periodo]);

  if (cargando) return <div className="p-8 text-gray-600">Cargando...</div>;
  if (errorCarga) {
    return (
      <div className="p-8 max-w-xl">
        <button onClick={() => navigate('/empleados')} className="mb-4 text-blue-600 hover:underline text-sm">
          - Volver a empleados
        </button>
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">{errorCarga}</div>
      </div>
    );
  }
  if (!empleado) return null;

  const stats = empleado.stats;
  const chartData = empleado.chartData;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/empleados')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-gray-900">{empleado.nombre}</h2>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  empleado.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {empleado.estado}
              </span>
            </div>
            <p className="text-gray-500 font-mono mt-1">Legajo: {empleado.legajo} | CUIL: {empleado.cuil}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
            />
          </div>
          <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Asistencias" value={stats.asistencias} icon={<CalendarDays className="text-blue-600" />} trend={trendText(stats.tendencias.asistencias, 'vs mes anterior')} color="blue" />
        <StatCard title="Inasistencias" value={stats.inasistencias} icon={<AlertCircle className="text-red-600" />} trend={trendText(stats.tendencias.inasistencias, 'vs mes anterior')} color="red" />
        <StatCard title="Llegadas Tarde" value={stats.llegadasTarde} icon={<Clock className="text-amber-600" />} trend={trendText(stats.tendencias.llegadasTarde, 'vs mes anterior')} color="amber" />
        <StatCard title="Horas Extras" value={`${stats.horasExtras}h`} icon={<TrendingUp className="text-green-600" />} trend={trendText(stats.tendencias.horasExtras, 'h vs mes anterior')} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User size={20} className="text-blue-500" />
              Informacion General
            </h3>
            <div className="space-y-4">
              <InfoRow label="Categoria" value={empleado.categoria} />
              <InfoRow label="Fecha Ingreso" value={format(parseISO(empleado.fechaIngreso), 'dd/MM/yyyy')} />
              <InfoRow label="Horario" value={empleado.horarioNombre} />
              <InfoRow label="Antiguedad" value={empleado.antiguedad} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Horas Trabajadas</h3>
            <div className="h-64">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: '#f3f4f6' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="horas" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.horas > 8 ? '#10b981' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center">
                  <EmptyState text="No hay horas trabajadas para el periodo seleccionado." />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
              <TabButton active={tabActiva === 'asistencia'} onClick={() => setTabActiva('asistencia')} label="Asistencia" icon={<Clock size={18} />} />
              <TabButton active={tabActiva === 'licencias'} onClick={() => setTabActiva('licencias')} label="Licencias" icon={<FileText size={18} />} />
              <TabButton active={tabActiva === 'novedades'} onClick={() => setTabActiva('novedades')} label="Novedades" icon={<AlertCircle size={18} />} />
            </div>

            <div className="p-6">
              {tabActiva === 'asistencia' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-gray-900">Registro de Fichadas</h4>
                    <button className="text-sm text-blue-600 font-medium hover:underline">Ver todo</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                          <th className="pb-3 font-medium">Fecha</th>
                          <th className="pb-3 font-medium">Entrada</th>
                          <th className="pb-3 font-medium">Salida</th>
                          <th className="pb-3 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {empleado.fichadas.map((f) => (
                          <tr key={f.id} className="group hover:bg-gray-50/50">
                            <td className="py-3 text-gray-700">{format(parseISO(f.fecha), 'EEE dd/MM', { locale: es })}</td>
                            <td className="py-3 font-mono text-gray-600">{f.entrada ?? '-'}</td>
                            <td className="py-3 font-mono text-gray-600">{f.salida ?? '-'}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  f.estado === 'NORMAL'
                                    ? 'bg-blue-50 text-blue-600'
                                    : f.estado === 'TARDE'
                                      ? 'bg-amber-50 text-amber-600'
                                      : f.estado === 'EXTRA'
                                        ? 'bg-green-50 text-green-600'
                                        : 'bg-red-50 text-red-600'
                                }`}
                              >
                                {f.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {empleado.fichadas.length === 0 && <EmptyState text="No hay fichadas registradas para este periodo." />}
                </div>
              )}

              {tabActiva === 'licencias' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-900">Historial de Licencias</h4>
                    <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">
                      Registrar Licencia
                    </button>
                  </div>
                  <div className="grid gap-4">
                    {empleado.licencias.map((l) => (
                      <div
                        key={l.id}
                        className="p-4 border border-gray-100 rounded-xl hover:border-blue-200 transition-colors flex justify-between items-center"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{l.tipo}</p>
                            <p className="text-xs text-gray-500">
                              {format(parseISO(l.desde), 'dd/MM/yyyy')} - {format(parseISO(l.hasta), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${estadoNovedadClass(l.estado)}`}>{l.estado}</span>
                      </div>
                    ))}
                  </div>
                  {empleado.licencias.length === 0 && <EmptyState text="No hay licencias o novedades manuales para este periodo." />}
                </div>
              )}

              {tabActiva === 'novedades' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-900">Novedades y Ajustes</h4>
                    <button className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1">
                      <Filter size={14} /> Filtrar
                    </button>
                  </div>
                  <div className="space-y-4">
                    {empleado.novedades.map((n) => (
                      <NovedadItem
                        key={n.id}
                        tipo={n.tipo}
                        fecha={format(parseISO(n.fecha), 'dd/MM/yyyy')}
                        detalle={n.detalle}
                        valor={n.cantidadMinutos ? `${n.cantidadMinutos} min` : n.estado}
                        isPositive={n.tipo.toUpperCase().includes('EXTRA')}
                      />
                    ))}
                  </div>
                  {empleado.novedades.length === 0 && <EmptyState text="No hay novedades para este periodo." />}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function trendText(value: number, suffix: string) {
  if (value === 0) return 'Sin cambios';
  return `${value > 0 ? '+' : ''}${value} ${suffix}`;
}

function estadoNovedadClass(estado: string) {
  if (estado === 'APROBADA') return 'text-green-600 bg-green-50';
  if (estado === 'RECHAZADA') return 'text-red-600 bg-red-50';
  return 'text-amber-600 bg-amber-50';
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-6 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function StatCard({ title, value, icon, trend, color }: any) {
  const colors: any = {
    blue: 'bg-blue-50 border-blue-100',
    red: 'bg-red-50 border-red-100',
    amber: 'bg-amber-50 border-amber-100',
    green: 'bg-green-50 border-green-100',
  };

  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} shadow-sm`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-white rounded-xl shadow-sm">{icon}</div>
      </div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <h4 className="text-2xl font-bold text-gray-900 mt-1">{value}</h4>
      <p className="text-xs text-gray-400 mt-2">{trend}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all border-b-2 ${
        active
          ? 'text-blue-600 border-blue-600 bg-blue-50/30'
          : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function NovedadItem({ tipo, fecha, detalle, valor, isPositive }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-10 rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`} />
        <div>
          <p className="font-bold text-gray-900">{tipo}</p>
          <p className="text-xs text-gray-500">
            {fecha} - {detalle}
          </p>
        </div>
      </div>
      <p className={`font-mono font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>{valor}</p>
    </div>
  );
}
