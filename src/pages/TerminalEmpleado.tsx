import React, { useState } from 'react';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '../lib/apiClient';

export default function TerminalEmpleado() {
  const [legajo, setLegajo] = useState('');
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null);
  const [cargando, setCargando] = useState(false);

  const registrarFichada = async (tipo: 'ENTRADA' | 'SALIDA') => {
    if (!legajo.trim()) {
      setMensaje({ texto: 'Por favor, ingrese su legajo.', tipo: 'error' });
      return;
    }

    setCargando(true);
    setMensaje(null);

    try {
      const data = await api.post<{ timestamp?: string }>('/fichadas', {
        legajo: legajo.trim(),
        tipo,
        origen: 'MANUAL',
      });

      const hora = data?.timestamp ? format(new Date(data.timestamp), 'HH:mm') : format(new Date(), 'HH:mm');
      setMensaje({
        texto: `Fichada de ${tipo.toLowerCase()} registrada correctamente a las ${hora}.`,
        tipo: 'exito',
      });
      setLegajo('');
    } catch (error: any) {
      setMensaje({ texto: error.message, tipo: 'error' });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
      <div className="bg-gray-900 p-8 text-center">
        <Clock className="w-16 h-16 text-blue-400 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-white">Terminal de Reloj</h2>
        <p className="text-gray-400 mt-2">{format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}</p>
      </div>

      <div className="p-8">
        <div className="mb-6">
          <label htmlFor="legajo" className="block text-sm font-medium text-gray-700 mb-2">
            Numero de Legajo
          </label>
          <input
            type="text"
            id="legajo"
            value={legajo}
            onChange={(e) => setLegajo(e.target.value)}
            className="w-full text-center text-3xl tracking-widest p-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
            placeholder="Ej: 042"
            autoComplete="off"
          />
        </div>

        {mensaje && (
          <div
            className={`p-4 rounded-lg mb-6 flex items-start gap-3 ${
              mensaje.tipo === 'exito' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {mensaje.tipo === 'exito' ? (
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
            )}
            <p className="text-sm font-medium">{mensaje.texto}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => registrarFichada('ENTRADA')}
            disabled={cargando}
            className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold text-lg transition-colors disabled:opacity-50"
          >
            ENTRADA
          </button>
          <button
            onClick={() => registrarFichada('SALIDA')}
            disabled={cargando}
            className="bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg transition-colors disabled:opacity-50"
          >
            SALIDA
          </button>
        </div>
      </div>
    </div>
  );
}
