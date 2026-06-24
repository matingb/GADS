import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { descargarArchivo, resumenACsv, resumenAPdf, ResumenEmpleado } from '../lib/exportar';
import { api } from '../lib/apiClient';

interface Cierre {
  id: number;
  periodo: string;
  fechaCierre: string;
  estado: string;
}

export default function CierresMensuales() {
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Cierre[]>('/cierres')
      .then(setCierres)
      .catch((err: any) => setError(err?.message || 'No se pudieron cargar los cierres.'));
  }, []);

  const descargarReporte = async (formato: 'csv' | 'pdf', cierre: Cierre) => {
    setDescargando(`${cierre.id}-${formato}`);
    setError(null);
    try {
      const data = await api.get<{ resumen: ResumenEmpleado[] }>(`/preliquidacion/${cierre.periodo}`);
      const resumen = (data?.resumen ?? []) as ResumenEmpleado[];

      if (formato === 'csv') {
        descargarArchivo(`cierre_${cierre.periodo}.csv`, resumenACsv(cierre.periodo, resumen), 'text/csv');
      } else {
        descargarArchivo(`cierre_${cierre.periodo}.pdf`, resumenAPdf(cierre.periodo, resumen), 'application/pdf');
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo generar el reporte.');
    } finally {
      setDescargando(null);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Cierres Mensuales</h2>
        <p className="text-gray-500 mt-1">Exportaciones de novedades consolidadas para liquidacion.</p>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

      {cierres.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Aun no hay cierres registrados.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cierres.map((cierre) => (
            <div key={cierre.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                  <FileSpreadsheet size={24} />
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    cierre.estado === 'CERRADO' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {cierre.estado}
                </span>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-1">Periodo {cierre.periodo}</h3>
              <p className="text-sm text-gray-500 mb-6">
                Cerrado el {format(new Date(cierre.fechaCierre), "dd 'de' MMMM, yyyy", { locale: es })}
              </p>

              <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                <button
                  disabled={descargando === `${cierre.id}-csv`}
                  onClick={() => descargarReporte('csv', cierre)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  <Download size={16} />
                  {descargando === `${cierre.id}-csv` ? '...' : 'CSV'}
                </button>
                <button
                  disabled={descargando === `${cierre.id}-pdf`}
                  onClick={() => descargarReporte('pdf', cierre)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  <FileText size={16} />
                  {descargando === `${cierre.id}-pdf` ? '...' : 'PDF'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
