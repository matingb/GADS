import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, Filter, Trash2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { attendanceApi } from '../lib/attendanceClient';
import { usePunchEvent, useAttendanceInterpretation } from '../hooks/useAttendance';
import type { InterpretationResult, PunchEvent } from '../types';

export default function AdminFichadas() {
  const { usuario } = useAuth();
  const [punchEvents, setPunchEvents] = useState<PunchEvent[]>([]);
  const [interpretations, setInterpretations] = useState<Map<string, InterpretationResult>>(new Map());
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [empleadoId, setEmpleadoId] = useState('');
  const [tipo, setTipo] = useState<'IN' | 'OUT'>('IN');
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hora, setHora] = useState(format(new Date(), 'HH:mm'));

  const { recordPunch, loading: cargando } = usePunchEvent();

  const cargarDatos = async () => {
    try {
      setError(null);
      const [fichadasData, empleadosData] = await Promise.all([
        api.get('/api/punch'),
        api.get('/empleados')
      ]);
      setPunchEvents(fichadasData as PunchEvent[]);
      setEmpleados(empleadosData as any[]);

      // Cargar interpretaciones para cada día con eventos
      const daysWithEvents = new Set(
        fichadasData.map((e: any) => e.timestamp?.split('T')[0])
      );

      for (const day of daysWithEvents) {
        const empleadoId = fichadasData.find((e: any) => e.timestamp?.startsWith(day))?.idEmpleado;
        if (empleadoId && day) {
          try {
            const interpretation = await attendanceApi.getDayInterpretation(empleadoId, day);
            if (interpretation.interpretation) {
              setInterpretations(prev => 
                new Map(prev).set(`${empleadoId}-${day}`, interpretation.interpretation!)
              );
            }
          } catch (err) {
            console.error(`Failed to load interpretation for ${empleadoId} on ${day}`, err);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error cargando datos.');
    }
  };

  useEffect(() => {
    void cargarDatos();
  }, []);

  const registrarFichadaManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleadoId) return;

    try {
      setError(null);
      const timestamp = new Date(`${fecha}T${hora}:00`).toISOString();

      const result = await recordPunch(
        parseInt(empleadoId),
        timestamp,
        tipo,
        'MANUAL'
      );

      if (result.success) {
        setSuccessMessage(`Fichada ${tipo === 'IN' ? 'de entrada' : 'de salida'} registrada exitosamente`);
        setMostrarModal(false);
        setTimeout(() => setSuccessMessage(null), 3000);
        
        // Recargar datos
        await cargarDatos();

        // Reset form
        setTipo('IN');
        setFecha(format(new Date(), 'yyyy-MM-dd'));
        setHora(format(new Date(), 'HH:mm'));
      } else {
        setError(result.error || 'Error al registrar la fichada');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error registrando fichada');
      console.error('Error registrando fichada manual', error);
    }
  };

  const eliminarFichada = async (fichada: any) => {
    if (!window.confirm(`Eliminar fichada de ${fichada.empleadoNombre}?`)) return;
    try {
      setError(null);
      await api.delete(`/fichadas/${fichada.id}`);
      await cargarDatos();
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la fichada.');
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Registro de Fichadas</h2>
          <p className="text-gray-500 mt-1">Historial completo de entradas/salidas e interpretación de jornadas.</p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Registrar Fichada Manual
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
          <CheckCircle size={18} />
          {successMessage}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex gap-4 bg-gray-50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por empleado o legajo..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
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
                <th className="px-6 py-4">Fecha y Hora</th>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Estado Jornada</th>
                <th className="px-6 py-4">Anomalías</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {punchEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No hay fichadas registradas aun.
                  </td>
                </tr>
              ) : (
                punchEvents.map((evento) => {
                  const dateStr = evento.timestamp.split('T')[0];
                  const interpretation = interpretations.get(`${evento.idEmpleado}-${dateStr}`);
                  const empleado = empleados.find(e => e.id === evento.idEmpleado);

                  return (
                    <tr key={evento.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {format(new Date(evento.timestamp), 'dd MMM yyyy, HH:mm', { locale: es })}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {empleado?.nombre} <span className="text-gray-500 text-xs">({empleado?.legajo})</span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            evento.direction === 'IN'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {evento.direction === 'IN' ? 'ENTRADA' : 'SALIDA'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {interpretation ? (
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                              interpretation.status === 'COMPLETE'
                                ? 'bg-green-100 text-green-800'
                                : interpretation.status === 'INCOMPLETE'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            <Clock size={12} />
                            {attendanceApi.getStatusLabel(interpretation.status)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Cargando...</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {interpretation?.anomalies.length ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                            <AlertCircle size={12} />
                            {interpretation.anomalies.length} anomalía{interpretation.anomalies.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Sin anomalías</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => void eliminarFichada(evento)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar fichada"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Registrar Fichada Manual</h3>
              <p className="text-sm text-gray-500 mt-1">Ingresa una entrada o salida en nombre de un empleado.</p>
            </div>
            <form onSubmit={registrarFichadaManual} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empleado</label>
                <select
                  required
                  value={empleadoId}
                  onChange={(e) => setEmpleadoId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="">Seleccionar empleado...</option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} (Legajo: {emp.legajo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Fichada</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipo('IN')}
                    className={`py-2 rounded-lg font-medium border ${
                      tipo === 'IN' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('OUT')}
                    className={`py-2 rounded-lg font-medium border ${
                      tipo === 'OUT' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    Salida
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input
                    type="time"
                    required
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setMostrarModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {cargando ? 'Guardando...' : 'Guardar Fichada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
