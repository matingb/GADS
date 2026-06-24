/**
 * React Hooks para Attendance System
 * 
 * Hooks personalizados para obtener y cachear datos de asistencia
 */

import { useState, useEffect, useCallback } from 'react';
import { attendanceApi } from '../lib/attendanceClient';
import type {
  InterpretationResult,
  BreakPolicy,
  PunchEvent,
  Anomaly,
} from '../types';

/**
 * Hook para obtener la interpretación de un día específico
 */
export function useAttendanceInterpretation(
  employeeId: number,
  workDate: Date | string | null,
  options?: { autoRefresh?: number }
) {
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [policy, setPolicy] = useState<BreakPolicy | null>(null);
  const [punchEvents, setPunchEvents] = useState<PunchEvent[]>([]);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInterpretation = useCallback(async () => {
    if (!workDate || !employeeId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await attendanceApi.getDayInterpretation(employeeId, workDate);
      setInterpretation(response.interpretation);
      setPolicy(response.policy);
      setPunchEvents(response.punchEvents);
      setSchedule(response.schedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error('Failed to fetch interpretation:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, workDate]);

  useEffect(() => {
    fetchInterpretation();

    // Auto-refresh si está configurado
    if (options?.autoRefresh && options.autoRefresh > 0) {
      const interval = setInterval(fetchInterpretation, options.autoRefresh);
      return () => clearInterval(interval);
    }
  }, [fetchInterpretation, options?.autoRefresh]);

  return {
    interpretation,
    policy,
    punchEvents,
    schedule,
    loading,
    error,
    refetch: fetchInterpretation,
  };
}

/**
 * Hook para obtener interpretaciones de un mes completo
 */
export function useMonthInterpretations(
  employeeId: number,
  yearMonth: string | null,
  options?: { autoRefresh?: number }
) {
  const [interpretations, setInterpretations] = useState<InterpretationResult[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMonth = useCallback(async () => {
    if (!yearMonth || !employeeId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await attendanceApi.getMonthInterpretations(
        employeeId,
        yearMonth
      );
      setInterpretations(response.interpretations);
      setSummary(response.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error('Failed to fetch month interpretations:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, yearMonth]);

  useEffect(() => {
    fetchMonth();

    if (options?.autoRefresh && options.autoRefresh > 0) {
      const interval = setInterval(fetchMonth, options.autoRefresh);
      return () => clearInterval(interval);
    }
  }, [fetchMonth, options?.autoRefresh]);

  return {
    interpretations,
    summary,
    loading,
    error,
    refetch: fetchMonth,
  };
}

/**
 * Hook para registrar un punch event
 */
export function usePunchEvent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<InterpretationResult | null>(null);

  const recordPunch = useCallback(
    async (
      employeeId: number,
      timestamp: string,
      direction: 'IN' | 'OUT',
      source?: 'BIOMETRIC' | 'QR' | 'API' | 'MANUAL'
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await attendanceApi.recordPunch(
          employeeId,
          timestamp,
          direction,
          source
        );

        setLastEvent(response.dayInterpretation);

        return {
          success: true,
          event: response.event,
          interpretation: response.dayInterpretation,
          warnings: response.warnings || [],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setError(errorMsg);
        console.error('Failed to record punch:', err);

        return {
          success: false,
          error: errorMsg,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    recordPunch,
    loading,
    error,
    lastEvent,
  };
}

/**
 * Hook para obtener últimos 30 días de asistencia
 */
export function use30DaysAttendance(employeeId: number) {
  const [interpretations, setInterpretations] = useState<InterpretationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch30Days = useCallback(async () => {
    if (!employeeId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await attendanceApi.get30DaysInterpretations(employeeId);
      setInterpretations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error('Failed to fetch 30 days:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetch30Days();
  }, [fetch30Days]);

  return {
    interpretations,
    loading,
    error,
    refetch: fetch30Days,
  };
}

/**
 * Hook para actualizar política de descanso
 */
export function useBreakPolicy() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePolicy = useCallback(
    async (
      scheduleId: number,
      policy: any,
      reprocessFromDate?: Date
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await attendanceApi.updateBreakPolicy(
          scheduleId,
          policy,
          reprocessFromDate
        );

        return {
          success: true,
          policy: response.policy,
          reprocessingQueued: response.reprocessingQueued,
          affectedDays: response.affectedDays,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setError(errorMsg);
        console.error('Failed to update policy:', err);

        return {
          success: false,
          error: errorMsg,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    updatePolicy,
    loading,
    error,
  };
}

/**
 * Hook para calcular estadísticas de un mes
 */
export function useMonthStats(interpretations: InterpretationResult[]) {
  return {
    totalDays: interpretations.length,
    daysWorked: interpretations.filter((i) => i.status === 'COMPLETE').length,
    daysWithAnomalies: interpretations.filter((i) => i.anomalies.length > 0).length,
    totalWorkedMinutes: interpretations.reduce((sum, i) => sum + (i.workedMinutes || 0), 0),
    totalBreakMinutes: interpretations.reduce((sum, i) => sum + (i.breakMinutes || 0), 0),
    totalOvertimeMinutes: interpretations.reduce((sum, i) => sum + (i.overtimeMinutes || 0), 0),
    anomaliesByType: interpretations.reduce(
      (acc, i) => {
        for (const anomaly of i.anomalies) {
          acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}

/**
 * Hook para validar datos de entrada
 */
export function useAttendanceValidation() {
  return {
    validatePunch: attendanceApi.validatePunchInput,
    formatMinutes: attendanceApi.formatMinutes,
    getStatusLabel: attendanceApi.getStatusLabel,
    getStatusColor: attendanceApi.getStatusColor,
    getAnomalyLabel: attendanceApi.getAnomalyLabel,
    getSeverityColor: attendanceApi.getSeverityColor,
  };
}
