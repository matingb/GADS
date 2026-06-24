import { useEffect, useState } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/apiClient';

interface ConfigGlobal {
  toleranciaEntradaMin: number;
  toleranciaSalidaMin: number;
  umbralHorasExtraMin: number;
  minutosDescansoDefault: number;
}

const CONFIG_INICIAL: ConfigGlobal = {
  toleranciaEntradaMin: 5,
  toleranciaSalidaMin: 0,
  umbralHorasExtraMin: 30,
  minutosDescansoDefault: 60,
};

export default function Configuracion() {
  const [config, setConfig] = useState<ConfigGlobal>(CONFIG_INICIAL);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ConfigGlobal>('/configuracion')
      .then((data) => setConfig(data))
      .catch((err: any) => setError(err?.message || 'Error al cargar configuracion.'))
      .finally(() => setCargando(false));
  }, []);

  const actualizar = (campo: keyof ConfigGlobal, valor: string) => {
    const n = Number(valor);
    setConfig((prev) => ({ ...prev, [campo]: Number.isFinite(n) ? n : 0 }));
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setOkMsg(null);
    try {
      const data = await api.put<ConfigGlobal>('/configuracion', config);
      setConfig(data);
      setOkMsg('Cambios guardados correctamente.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la configuracion.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="p-8 text-gray-600">Cargando configuracion...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Configuracion del Sistema</h2>
        <p className="text-gray-500 mt-1">Ajustes generales y parametros del motor de reglas.</p>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}
      {okMsg && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> {okMsg}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Parametros Globales por Defecto</h3>
          <p className="text-sm text-gray-500 mt-1">Estos valores se aplican como referencia del motor de reglas.</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CampoNumero
              label="Tolerancia de Entrada (minutos)"
              hint="Tiempo de gracia antes de marcar tardanza."
              value={config.toleranciaEntradaMin}
              onChange={(v) => actualizar('toleranciaEntradaMin', v)}
            />
            <CampoNumero
              label="Tolerancia de Salida (minutos)"
              hint="Tiempo permitido para salir antes del horario."
              value={config.toleranciaSalidaMin}
              onChange={(v) => actualizar('toleranciaSalidaMin', v)}
            />
            <CampoNumero
              label="Umbral Horas Extra (minutos)"
              hint="Minimo de tiempo extra para generar novedad."
              value={config.umbralHorasExtraMin}
              onChange={(v) => actualizar('umbralHorasExtraMin', v)}
            />
            <CampoNumero
              label="Descanso por defecto (minutos)"
              hint="Duracion esperada del descanso del mediodia."
              value={config.minutosDescansoDefault}
              onChange={(v) => actualizar('minutosDescansoDefault', v)}
            />
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={guardar}
            disabled={guardando}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Save size={18} />
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoNumero({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
      />
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  );
}
