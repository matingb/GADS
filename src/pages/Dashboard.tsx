import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
import { Users, Clock, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../lib/apiClient';

interface DashboardStats {
  empleadosActivos: number;
  novedadesPendientes: number;
  fichadasHoy: number;
  horasExtraMes: number;
  asistenciaSemanal: { name: string; fecha: string; presentes: number; ausentes: number }[];
  estadoNovedades: { name: string; value: number; color: string }[];
  ultimasFichadas: { id: number; empleado: string; legajo: string; hora: string; tipo: string; origen: string }[];
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardStats>('/dashboard')
      .then(setStats)
      .catch((err: any) => setError(err?.message || 'No se pudieron cargar las metricas.'));
  }, []);

  if (!usuario) return null;
  if (usuario.rol !== 'ADMIN') {
    return <Navigate to={usuario.rol === 'EMPLEADO' ? '/terminal' : '/cierres'} replace />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard General</h2>
        <p className="text-gray-500 mt-1">Resumen de actividad y metricas clave.</p>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard
          icon={<Users size={24} />}
          iconBg="bg-blue-50 text-blue-600"
          label="Empleados Activos"
          value={stats?.empleadosActivos ?? '-'}
          valueColor="text-gray-900"
        />
        <KpiCard
          icon={<AlertCircle size={24} />}
          iconBg="bg-amber-50 text-amber-600"
          label="Novedades Pendientes"
          value={stats?.novedadesPendientes ?? '-'}
          valueColor="text-amber-600"
        />
        <KpiCard
          icon={<Clock size={24} />}
          iconBg="bg-green-50 text-green-600"
          label="Fichadas Hoy"
          value={stats?.fichadasHoy ?? '-'}
          valueColor="text-green-600"
        />
        <KpiCard
          icon={<FileText size={24} />}
          iconBg="bg-purple-50 text-purple-600"
          label="Horas Extra (Mes)"
          value={stats ? `${stats.horasExtraMes}h` : '-'}
          valueColor="text-purple-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Asistencia Ultimos 7 Dias</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.asistenciaSemanal ?? []} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f9fafb' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                <Bar dataKey="presentes" name="Presentes" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="ausentes" name="Ausentes" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Estado de Novedades</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.estadoNovedades ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.estadoNovedades ?? []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">Ultimas Fichadas</h3>
          <Link to="/fichadas" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Ver todas
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="p-4 font-medium">Empleado</th>
                <th className="p-4 font-medium">Hora</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {(!stats || stats.ultimasFichadas.length === 0) && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500">
                    Todavia no hay fichadas registradas.
                  </td>
                </tr>
              )}
              {stats?.ultimasFichadas.map((f) => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-4 font-medium text-gray-900">
                    {f.empleado}
                    <span className="ml-2 text-xs text-gray-500 font-mono">#{f.legajo}</span>
                  </td>
                  <td className="p-4 text-gray-600">{format(new Date(f.hora), 'dd/MM HH:mm')}</td>
                  <td className="p-4 text-gray-600">{f.tipo}</td>
                  <td className="p-4 text-gray-500 text-xs">{f.origen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
