/**
 * Attendance API Client
 * 
 * Wrapper del API client existente para operaciones de asistencia
 * Proporciona métodos type-safe para interactuar con el nuevo sistema de eventos
 */

import { api } from './apiClient';
import type {
  PunchEvent,
  BreakPolicy,
  InterpretationResult,
  CreatePunchEventDTO,
  CreateBreakPolicyDTO,
  UpdateBreakPolicyDTO,
  AttendanceMonthSummary,
} from '../types';

/**
 * Response types from API
 */
interface RecordPunchResponse {
  event: PunchEvent;
  dayInterpretation: InterpretationResult;
  warnings?: string[];
}

interface GetDayInterpretationResponse {
  interpretation: InterpretationResult | null;
  policy: BreakPolicy | null;
  punchEvents: PunchEvent[];
  schedule?: {
    idHorario: number;
    horaEntrada?: string;
    horaSalida?: string;
  };
}

interface GetMonthInterpretationsResponse {
  interpretations: InterpretationResult[];
  summary: {
    period: string;
    idEmpleado: number;
    workedMinutes: number;
    breakMinutes: number;
    overtimeMinutes: number;
    anomaliesByType: Record<string, number>;
    daysWorked: number;
    daysWithAnomalies: number;
  };
}

interface UpdateBreakPolicyResponse {
  policy: BreakPolicy;
  reprocessingQueued: boolean;
  affectedDays: number;
  affectedEmployees: number;
}

/**
 * Attendance API Client
 */
export const attendanceApi = {
  /**
   * Registrar un evento de entrada/salida
   * 
   * Crea un PunchEvent y genera la interpretación del día automáticamente
   */
  async recordPunch(
    employeeId: number,
    timestamp: string, // ISO8601
    direction: 'IN' | 'OUT',
    source?: 'BIOMETRIC' | 'QR' | 'API' | 'MANUAL',
    metadata?: Record<string, unknown>
  ): Promise<RecordPunchResponse> {
    const payload: CreatePunchEventDTO = {
      idEmpleado: employeeId,
      timestamp,
      direction,
      source: source || 'MANUAL',
      metadata,
    };

    return api.post<RecordPunchResponse>('/api/punch', payload);
  },

  /**
   * Obtener la interpretación completa de un día
   * 
   * Retorna:
   * - InterpretationResult (segmentos, anomalías, cálculos)
   * - BreakPolicy vigente
   * - Todos los PunchEvents del día
   * - Schedule del empleado
   */
  async getDayInterpretation(
    employeeId: number,
    workDate: Date | string
  ): Promise<GetDayInterpretationResponse> {
    const dateStr = typeof workDate === 'string'
      ? workDate
      : workDate.toISOString().split('T')[0];

    return api.get<GetDayInterpretationResponse>(
      `/api/attendance/${employeeId}/${dateStr}`
    );
  },

  /**
   * Obtener interpretaciones de un mes completo
   * 
   * Retorna array de InterpretationResult + resumen agregado
   */
  async getMonthInterpretations(
    employeeId: number,
    yearMonth: string // YYYY-MM
  ): Promise<GetMonthInterpretationsResponse> {
    return api.get<GetMonthInterpretationsResponse>(
      `/api/attendance/${employeeId}`,
      { month: yearMonth }
    );
  },

  /**
   * Obtener periodo de 30 días (últimos 30 días desde hoy)
   */
  async get30DaysInterpretations(employeeId: number): Promise<InterpretationResult[]> {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const startMonth = thirtyDaysAgo.toISOString().slice(0, 7);
    const endMonth = today.toISOString().slice(0, 7);

    const results: InterpretationResult[] = [];

    // Si cae en mismo mes
    if (startMonth === endMonth) {
      const response = await this.getMonthInterpretations(employeeId, startMonth);
      results.push(...response.interpretations);
    } else {
      // Si cruza dos meses
      const startResponse = await this.getMonthInterpretations(employeeId, startMonth);
      const endResponse = await this.getMonthInterpretations(employeeId, endMonth);
      results.push(...startResponse.interpretations, ...endResponse.interpretations);
    }

    // Filtrar solo últimos 30 días
    return results.filter((r) => {
      const date = new Date(r.workDate);
      return date >= thirtyDaysAgo && date <= today;
    });
  },

  /**
   * Actualizar política de descanso de un horario
   * 
   * Opcionalmente reprocesa datos históricos
   */
  async updateBreakPolicy(
    scheduleId: number,
    policy: UpdateBreakPolicyDTO,
    reprocessFromDate?: Date
  ): Promise<UpdateBreakPolicyResponse> {
    const params: Record<string, string> = {};
    if (reprocessFromDate) {
      params.reprocessFrom = reprocessFromDate.toISOString().split('T')[0];
    }

    return api.put<UpdateBreakPolicyResponse>(
      `/api/break-policies/${scheduleId}`,
      policy,
      params
    );
  },

  /**
   * Crear una nueva política de descanso (rara vez necesario vía UI)
   */
  async createBreakPolicy(
    scheduleId: number,
    policy: CreateBreakPolicyDTO
  ): Promise<BreakPolicy> {
    return api.post<BreakPolicy>(
      `/api/break-policies/${scheduleId}`,
      policy
    );
  },

  /**
   * Obtener información formateada para display
   * Calcula minutos trabajados, horas extras, etc.
   */
  getInterpretationSummary(result: InterpretationResult): {
    workedHours: number;
    workedMinutes: number;
    breakMinutes: number;
    overtimeHours: number;
    overtimeMinutes: number;
    status: string;
    anomalyCount: number;
  } {
    const worked = result.workedMinutes || 0;
    const overtime = result.overtimeMinutes || 0;

    return {
      workedHours: Math.floor(worked / 60),
      workedMinutes: worked % 60,
      breakMinutes: result.breakMinutes || 0,
      overtimeHours: Math.floor(overtime / 60),
      overtimeMinutes: overtime % 60,
      status: result.status,
      anomalyCount: result.anomalies.length,
    };
  },

  /**
   * Obtener descripción amigable de un estado
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      COMPLETE: 'Jornada Completa',
      INCOMPLETE: 'Jornada Incompleta',
      CONTINUOUS_SHIFT: 'Jornada Continua',
      NO_PUNCHES: 'Sin Registros',
    };
    return labels[status] || status;
  },

  /**
   * Obtener color para badge de estado
   */
  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      COMPLETE: 'green',
      INCOMPLETE: 'orange',
      CONTINUOUS_SHIFT: 'blue',
      NO_PUNCHES: 'red',
    };
    return colors[status] || 'gray';
  },

  /**
   * Obtener descripción de anomalía
   */
  getAnomalyLabel(type: string): string {
    const labels: Record<string, string> = {
      TARDANZA: 'Entrada Tardía',
      AUSENCIA: 'Ausencia',
      BREAK_NOT_TAKEN: 'Descanso No Tomado',
      BREAK_TOO_SHORT: 'Descanso Muy Corto',
      BREAK_TOO_LONG: 'Descanso Muy Largo',
      BREAK_OUT_OF_SCHEDULE: 'Descanso Fuera de Horario',
      EARLY_EXIT: 'Salida Anticipada',
      OVERTIME_50: 'Horas Extra (50%)',
      OVERTIME_100: 'Horas Extra (100%)',
      UNDERPAID_HOURS: 'Horas Faltantes',
      UNEXPECTED_BREAK: 'Descanso Inesperado',
      CONTINUOUS_SHIFT_OK: 'Jornada Continua Permitida',
    };
    return labels[type] || type;
  },

  /**
   * Obtener color para badge de severidad
   */
  getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      ERROR: 'red',
      WARNING: 'orange',
      INFO: 'blue',
    };
    return colors[severity] || 'gray';
  },

  /**
   * Formatear minutos como "Xh YYm"
   */
  formatMinutes(minutes: number | undefined): string {
    if (minutes === undefined || minutes === null) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  },

  /**
   * Validar que un timestamp y dirección son válidos
   */
  validatePunchInput(timestamp: string, direction: 'IN' | 'OUT'): string[] {
    const errors: string[] = [];

    if (!timestamp) {
      errors.push('Timestamp es requerido');
    } else {
      try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          errors.push('Timestamp inválido');
        }
      } catch {
        errors.push('Timestamp inválido');
      }
    }

    if (!['IN', 'OUT'].includes(direction)) {
      errors.push('Direction debe ser IN o OUT');
    }

    return errors;
  },
};
