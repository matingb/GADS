export type RolUsuario = 'ADMIN' | 'EMPLEADO' | 'CONTADOR';

export interface UsuarioActual {
  idUsuario: string;
  nombre: string;
  rol: RolUsuario;
  idEmpleado?: number;
  legajo?: string;
}

export interface Usuario {
  idUsuario: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
}

export interface Empleado {
  idEmpleado: number;
  idUsuario?: string;
  legajo: string;
  nombreCompleto: string;
  dni: string;
  cuil: string;
  fechaIngreso: string;
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
  modalidadFichada: string;
}

export interface Horario {
  idHorario: number;
  nombreTurno: string;
  esRotativo: boolean;
  toleranciaEntradaMin: number;
  toleranciaSalidaMin: number;
  minutosDescanso: number;
  umbralHorasExtraMin: number;
}

export interface DetalleHorario {
  idDetalle: number;
  idHorario: number;
  numeroSemana: number;
  diaSemana: string;
  horaEntrada: string;
  horaSalida: string;
  esDescanso: boolean;
}

export interface AsignacionHorario {
  idAsignacion: number;
  idEmpleado: number;
  idHorario: number;
  fechaDesde: string;
  fechaHasta?: string;
}

export interface Fichada {
  idFichada: number;
  idEmpleado: number;
  timestamp: string;
  tipo: 'ENTRADA' | 'SALIDA';
  origen: 'BIOMETRICO' | 'MANUAL' | 'QR' | 'API';
  idUsuarioCarga?: string;
  idFichadaOriginal?: number;
}

export interface Feriado {
  idFeriado: number;
  fecha: string;
  descripcion: string;
  esNacional: boolean;
}

export interface TipoNovedadCalculada {
  idTipo: number;
  codigo: string;
  descripcion: string;
  esJustificable: boolean;
  porcentajeAfectacionSueldo: number;
}

export interface NovedadCalculada {
  idNovedadCalc: number;
  idEmpleado: number;
  idTipo: number;
  fecha: string;
  cantidadMinutos: number;
  idCierre?: number;
  idNovedadAprobada?: number;
}

export interface TipoNovedadAprobada {
  idTipo: number;
  codigo: string;
  descripcion: string;
  esJustificada: boolean;
}

export interface NovedadAprobada {
  idNovedadAprobada: number;
  idEmpleado: number;
  idTipo: number;
  fechaInicio: string;
  fechaFin: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  idUsuarioCarga: string;
  idUsuarioAprueba?: string;
  observacion?: string;
  idCierre?: number;
}

export interface CierreMensual {
  idCierre: number;
  fechaCierre: string;
  idUsuarioCerro: string;
  estado: 'BORRADOR' | 'CERRADO';
}

// ============================================================================
// Event-Driven Attendance System
// ============================================================================

/**
 * PunchEvent - Evento inmutable de entrada/salida
 * Fuente de verdad del sistema. Nunca debe modificarse.
 */
export interface PunchEvent {
  id: string;
  idEmpleado: number;
  timestamp: string; // ISO8601 UTC
  direction: 'IN' | 'OUT';
  source: 'BIOMETRIC' | 'QR' | 'API' | 'MANUAL';
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
}

/**
 * BreakPolicy - Política de descanso/almuerzo configurável por horario
 */
export type BreakPolicyMode = 'NONE' | 'FIXED' | 'FLEXIBLE';

export interface BreakPolicy {
  id: string;
  idHorario: number;
  version: number;
  
  mode: BreakPolicyMode;
  paid: boolean;
  mandatory: boolean;
  
  minMinutes: number;
  maxMinutes: number;
  
  expectedStart?: string; // HH:mm, solo para FIXED
  expectedEnd?: string;   // HH:mm, solo para FIXED
  
  startTolerance: number; // minutos
  endTolerance: number;   // minutos
  
  allowContinuousShift: boolean;
  
  effectiveFrom: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * WorkSegment - Período de trabajo (no almacenado, calculado)
 */
export interface WorkSegment {
  startTime: string; // ISO8601
  endTime: string;   // ISO8601
  durationMinutes: number;
}

/**
 * BreakSegment - Período de descanso (no almacenado, calculado)
 */
export interface BreakSegment {
  startTime: string; // ISO8601
  endTime: string;   // ISO8601
  durationMinutes: number;
  type?: string; // 'LUNCH', 'MEDICAL', 'TRAINING', etc. (futuro)
}

/**
 * Anomaly - Anomalía detectada durante interpretación
 */
export interface Anomaly {
  type: string; // 'TARDANZA', 'AUSENCIA', 'BREAK_NOT_TAKEN', 'OVERTIME_50', etc.
  severity: 'INFO' | 'WARNING' | 'ERROR';
  description: string;
  minutesAffected?: number;
  autoApproved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * InterpretationStatus - Estado de la interpretación
 */
export type InterpretationStatus = 
  | 'COMPLETE'          // Entrada y salida registradas
  | 'INCOMPLETE'        // Falta entrada o salida
  | 'CONTINUOUS_SHIFT'  // Jornada continua permitida
  | 'NO_PUNCHES';       // Sin eventos ese día

/**
 * InterpretationResult - Resultado de interpretar eventos contra política
 * Se persiste para auditoría y cálculos. Es recalculable.
 */
export interface InterpretationResult {
  id: string;
  idEmpleado: number;
  workDate: string; // YYYY-MM-DD
  idHorario?: number;
  idPolicy: string;
  policyVersion: number;
  
  workSegments: WorkSegment[];
  breakSegments: BreakSegment[];
  
  workedMinutes?: number;
  breakMinutes?: number;
  overtimeMinutes?: number; // positivo = extra, negativo = falta
  
  status: InterpretationStatus;
  anomalies: Anomaly[];
  
  interpretedAt: string;
  interpretedBy: 'ENGINE' | 'MANUAL';
  notes?: string;
  
  createdAt: string;
  updatedAt?: string;
}

/**
 * DTOs para la API
 */

export interface CreatePunchEventDTO {
  idEmpleado: number;
  timestamp: string; // ISO8601
  direction: 'IN' | 'OUT';
  source?: 'BIOMETRIC' | 'QR' | 'API' | 'MANUAL';
  metadata?: Record<string, unknown>;
}

export interface CreateBreakPolicyDTO {
  mode: BreakPolicyMode;
  paid: boolean;
  mandatory: boolean;
  minMinutes: number;
  maxMinutes: number;
  expectedStart?: string;
  expectedEnd?: string;
  startTolerance?: number;
  endTolerance?: number;
  allowContinuousShift: boolean;
}

export interface UpdateBreakPolicyDTO extends Partial<CreateBreakPolicyDTO> {
  // Permite actualización parcial
}

export interface AttendanceMonthSummary {
  employeeId: number;
  month: string; // YYYY-MM
  interpretations: InterpretationResult[];
  totals: {
    workedMinutes: number;
    breakMinutes: number;
    overtimeMinutes: number;
    anomaliesByType: Record<string, number>;
  };
}
