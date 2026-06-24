import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CierresMensuales() {
  const [cierres, setCierres] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/cierres')
      .then(res => res.json())
      .then(data => setCierres(data))
      .catch(err => console.error(err));
  }, []);

  const descargarArchivo = (formato: 'excel' | 'pdf', periodo: string) => {
    // Simulación de descarga de archivo
    const content = formato === 'excel' 
      ? 'Legajo,Nombre,DiasTrabajados,Ausencias,HorasExtra\n042,Juan Perez,20,0,5\n043,Maria Gomez,19,1,0' 
      : 'Reporte de Preliquidación\nPeríodo: ' + periodo + '\n\nJuan Perez - Legajo 042: 20 días trabajados, 5 horas extra.\nMaria Gomez - Legajo 043: 19 días trabajados, 1 ausencia.';
    
    const blob = new Blob([content], { type: formato === 'excel' ? 'text/csv;charset=utf-8;' : 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cierre_${periodo}.${formato === 'excel' ? 'csv' : 'pdf'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Cierres Mensuales</h2>
        <p className="text-gray-500 mt-1">Exportaciones de novedades consolidadas para liquidación.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cierres.map((cierre) => (
          <div key={cierre.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <FileSpreadsheet size={24} />
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                cierre.estado === 'CERRADO' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {cierre.estado}
              </span>
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-1">Período {cierre.periodo}</h3>
            <p className="text-sm text-gray-500 mb-6">
              Cerrado el {format(new Date(cierre.fechaCierre), "dd 'de' MMMM, yyyy", { locale: es })}
            </p>

            <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
              <button 
                onClick={() => descargarArchivo('excel', cierre.periodo)}
                className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                <Download size={16} />
                Excel
              </button>
              <button 
                onClick={() => descargarArchivo('pdf', cierre.periodo)}
                className="w-full flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                <FileText size={16} />
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
