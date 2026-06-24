import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { Clock, AlertCircle, CheckCircle, TrendingUp, Users } from 'lucide-react';
import { useMonthInterpretations, useMonthStats } from '../hooks/useAttendance';
import { attendanceApi } from '../lib/attendanceClient';
import type { InterpretationResult, Anomaly } from '../types';

export default function MisFichadas() {
  const { usuario } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currentMonth, setCurrentMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  
  const { interpretations, summary, loading } = useMonthInterpretations(
    usuario?.idEmpleado || 0,
    currentMonth
  );
  
  const stats = useMonthStats(interpretations);
  const selectedInterpretation = interpretations.find(i => i.workDate === selectedDate);

  const getAnomalyBadgeColor = (severity: string): string => {
    const colors: Record<string, string> = {
      ERROR: 'bg-red-100 text-red-800',
      WARNING: 'bg-yellow-100 text-yellow-800',
      INFO: 'bg-blue-100 text-blue-800',
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  };

  const previousMonth = () => {
    const date = new Date(currentMonth + '-01');
    date.setMonth(date.getMonth() - 1);
    setCurrentMonth(date.toISOString().slice(0, 7));
  };

  const nextMonth = () => {
    const date = new Date(currentMonth + '-01');
    date.setMonth(date.getMonth() + 1);
    setCurrentMonth(date.toISOString().slice(0, 7));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Mis Fichadas</h2>
        <p className="text-gray-500 mt-1">Historial detallado de tus registros de asistencia e interpretación de jornadas.</p>
      </div>

      {/* Monthly Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Días Trabajados</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.daysWorked}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Horas Trabajadas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {Math.floor(stats.totalWorkedMinutes / 60)}h {stats.totalWorkedMinutes % 60}m
              </p>
            </div>
            <Clock className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Horas Extras</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {Math.floor(stats.totalOvertimeMinutes / 60)}h {stats.totalOvertimeMinutes % 60}m
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-orange-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Con Anomalías</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.daysWithAnomalies}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Month Navigation & Day Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={previousMonth}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
            >
              ← Anterior
            </button>
            <h3 className="text-lg font-semibold text-gray-900 min-w-[200px]">
              {format(new Date(currentMonth + '-01'), 'MMMM yyyy', { locale: es })}
            </h3>
            <button
              onClick={nextMonth}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
            >
              Siguiente →
            </button>
          </div>
        </div>

        {/* Day Selection Grid */}
        <div className="grid grid-cols-7 gap-2">
          {interpretations.map((interp) => {
            const dayNum = parseInt(interp.workDate.split('-')[2]);
            const isSelected = interp.workDate === selectedDate;
            const hasAnomalies = interp.anomalies.length > 0;
            const isComplete = interp.status === 'COMPLETE';

            return (
              <button
                key={interp.workDate}
                onClick={() => setSelectedDate(interp.workDate)}
                className={`p-3 rounded-lg border-2 transition-colors text-center ${
                  isSelected
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : hasAnomalies
                    ? 'border-yellow-300 bg-yellow-50 text-gray-900'
                    : isComplete
                    ? 'border-green-300 bg-green-50 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-medium">{dayNum}</div>
                <div className="text-xs mt-1">
                  {isComplete ? '✓' : hasAnomalies ? '!' : '○'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Detail - Interpretation Results */}
      {selectedInterpretation ? (
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {format(new Date(selectedInterpretation.workDate), "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  selectedInterpretation.status === 'COMPLETE'
                    ? 'bg-green-100 text-green-800'
                    : selectedInterpretation.status === 'INCOMPLETE'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {attendanceApi.getStatusLabel(selectedInterpretation.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Tiempo Trabajado</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {attendanceApi.formatMinutes(selectedInterpretation.workedMinutes)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Descanso Tomado</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {attendanceApi.formatMinutes(selectedInterpretation.breakMinutes)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Horas Extras</p>
                <p className={`text-2xl font-bold mt-1 ${
                  (selectedInterpretation.overtimeMinutes || 0) > 0 ? 'text-orange-600' : 'text-gray-900'
                }`}>
                  {attendanceApi.formatMinutes(selectedInterpretation.overtimeMinutes)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Anomalías</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {selectedInterpretation.anomalies.length}
                </p>
              </div>
            </div>
          </div>

          {/* Work Segments */}
          {selectedInterpretation.workSegments.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4">Segmentos de Trabajo</h4>
              <div className="space-y-3">
                {selectedInterpretation.workSegments.map((seg, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(seg.startTime), 'HH:mm')} - {format(new Date(seg.endTime), 'HH:mm')}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-green-800">
                      {attendanceApi.formatMinutes(seg.durationMinutes)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Break Segments */}
          {selectedInterpretation.breakSegments.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4">Descansos Tomados</h4>
              <div className="space-y-3">
                {selectedInterpretation.breakSegments.map((seg, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(seg.startTime), 'HH:mm')} - {format(new Date(seg.endTime), 'HH:mm')}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-blue-800">
                      {attendanceApi.formatMinutes(seg.durationMinutes)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anomalies */}
          {selectedInterpretation.anomalies.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle size={20} className="text-yellow-600" />
                Anomalías Detectadas ({selectedInterpretation.anomalies.length})
              </h4>
              <div className="space-y-3">
                {selectedInterpretation.anomalies.map((anomaly, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${getAnomalyBadgeColor(anomaly.severity)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">
                          {attendanceApi.getAnomalyLabel(anomaly.type)}
                        </p>
                        <p className="text-sm mt-1">{anomaly.description}</p>
                        {anomaly.minutesAffected && (
                          <p className="text-xs mt-2 opacity-75">
                            Afecta: {attendanceApi.formatMinutes(anomaly.minutesAffected)}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-medium opacity-75 ml-4">
                        {anomaly.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Clock className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">
            {loading ? 'Cargando...' : 'Selecciona un día para ver los detalles'}
          </p>
        </div>
      )}
    </div>
  );
}
