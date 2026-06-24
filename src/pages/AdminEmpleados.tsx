import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Trash2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';

export default function AdminEmpleados() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [horarios, setHorarios] = useState<any[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [legajo, setLegajo] = useState('');
  const [cuil, setCuil] = useState('');
  const [categoriaLaboral, setCategoriaLaboral] = useState('');
  const [estado, setEstado] = useState('ACTIVO');
  const [horarioId, setHorarioId] = useState('');

  const cargarDatos = () => {
    Promise.all([api.get('/empleados'), api.get('/horarios')])
      .then(([empData, horData]) => {
        setEmpleados(empData as any[]);
        setHorarios(horData as any[]);
      })
      .catch((err) => setError(err?.message || 'No se pudieron cargar los empleados.'));
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setErrorForm(null);
    try {
      await api.post('/empleados', { nombre, legajo, cuil, categoriaLaboral, estado, horarioId });
      setMostrarModal(false);
      setNombre('');
      setLegajo('');
      setCuil('');
      setCategoriaLaboral('');
      setHorarioId('');
      cargarDatos();
    } catch (error: any) {
      setErrorForm(error?.message ?? 'Error desconocido al crear empleado.');
    } finally {
      setCargando(false);
    }
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setErrorForm(null);
  };

  const eliminarEmpleado = async (emp: any) => {
    if (!window.confirm(`Eliminar empleado ${emp.nombre}? Tambien se eliminaran sus fichadas y novedades.`)) return;
    try {
      setError(null);
      await api.delete(`/empleados/${emp.id}`);
      cargarDatos();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el empleado.');
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestion de Empleados</h2>
          <p className="text-gray-500 mt-1">Administra la nomina y horarios asignados.</p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Nuevo Empleado
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex gap-4 bg-gray-50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, legajo o CUIL..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <button className="px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 text-gray-700 hover:bg-gray-100 bg-white transition-colors">
            <Filter size={18} />
            Filtros
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-4">Legajo</th>
                <th className="px-6 py-4">Nombre Completo</th>
                <th className="px-6 py-4">CUIL</th>
                <th className="px-6 py-4">Horario Asignado</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empleados.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/empleados/${emp.id}`)}
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{emp.legajo}</td>
                  <td className="px-6 py-4 text-gray-700">{emp.nombre}</td>
                  <td className="px-6 py-4 text-gray-500">{emp.cuil}</td>
                  <td className="px-6 py-4 text-gray-500">{emp.horarioNombre}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        emp.estado === 'ACTIVO' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {emp.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2">
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                      <button
                        className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50"
                        title="Eliminar empleado"
                        onClick={(e) => {
                          e.stopPropagation();
                          void eliminarEmpleado(emp);
                        }}
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
              <h3 className="text-xl font-bold text-gray-900">Nuevo Empleado</h3>
              <p className="text-sm text-gray-500 mt-1">Ingresa los datos del nuevo trabajador.</p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorForm && (
                <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">{errorForm}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Legajo</label>
                  <input
                    type="text"
                    required
                    value={legajo}
                    onChange={(e) => setLegajo(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CUIL</label>
                  <input
                    type="text"
                    required
                    value={cuil}
                    onChange={(e) => setCuil(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Laboral</label>
                <input
                  type="text"
                  required
                  value={categoriaLaboral}
                  onChange={(e) => setCategoriaLaboral(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horario Asignado</label>
                  <select
                    value={horarioId}
                    onChange={(e) => setHorarioId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Sin asignar</option>
                    {horarios.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                    <option value="SUSPENDIDO">Suspendido</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Guardar Empleado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
