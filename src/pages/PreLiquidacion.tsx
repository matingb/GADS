import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, CheckCircle, AlertCircle, Lock } from 'lucide-react';
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

      for (const emp of empleadosData) {
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
        ausencias,
      });
    }

    return result.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [todasInterpretaciones, empleados]);

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
                  <th className="p-4 text-center">Tardanzas (min)</th>
                  <th className="p-4 text-center">Hs Extra 50% (min)</th>
                  <th className="p-4 text-center">Hs Extra 100% (min)</th>
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
                            {r.tardanzasMin}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-700">
                        {r.horasExtra50Min > 0 ? (
                          <span className="inline-block bg-orange-50 px-3 py-1 rounded font-medium text-orange-800">
                            {r.horasExtra50Min}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-center text-gray-700">
                        {r.horasExtra100Min > 0 ? (
                          <span className="inline-block bg-red-50 px-3 py-1 rounded font-medium text-red-800">
                            {r.horasExtra100Min}
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
      )}
    </div>
  );
}

