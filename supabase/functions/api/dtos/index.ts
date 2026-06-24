/**
 * Data Transfer Objects (DTOs) para la API
 * 
 * Se usan para serializar/deserializar datos en las respuestas HTTP
 */

import type {
  PunchEvent,
  BreakPolicy,
  InterpretationResult,
  Anomaly,
  WorkSegment,
  BreakSegment,
} from '../../../src/types.ts';

// ============================================================================
// REQUEST DTOs
// ============================================================================

export interface RecordPunchRequest {
  idEmpleado: number;
  timestamp: string; // ISO8601
  direction: 'IN' | 'OUT';
  source?: 'BIOMETRIC' | 'QR' | 'API' | 'MANUAL';
  metadata?: Record<string, unknown>;
}

export interface CreateBreakPolicyRequest {
  mode: 'NONE' | 'FIXED' | 'FLEXIBLE';
  paid: boolean;
  mandatory: boolean;
  minMinutes: number;
  maxMinutes: number;
  expectedStart?: string; // HH:mm
  expectedEnd?: string;   // HH:mm
  startTolerance?: number;
  endTolerance?: number;
  allowContinuousShift: boolean;
}

export interface UpdateBreakPolicyRequest extends Partial<CreateBreakPolicyRequest> {}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export interface PunchEventResponseDTO {
  id: string;
  idEmpleado: number;
  timestamp: string;
  direction: 'IN' | 'OUT';
  source: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
}

export interface BreakPolicyResponseDTO {
  id: string;
  idHorario: number;
  version: number;
  mode: string;
  paid: boolean;
  mandatory: boolean;
  minMinutes: number;
  maxMinutes: number;
  expectedStart?: string;
  expectedEnd?: string;
  startTolerance: number;
  endTolerance: number;
  allowContinuousShift: boolean;
  effectiveFrom: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface WorkSegmentResponseDTO {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface BreakSegmentResponseDTO {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  type?: string;
}

export interface AnomalyResponseDTO {
  type: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  description: string;
  minutesAffected?: number;
  autoApproved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface InterpretationResultResponseDTO {
  id: string;
  idEmpleado: number;
  workDate: string;
  idHorario?: number;
  idPolicy: string;
  policyVersion: number;
  workSegments: WorkSegmentResponseDTO[];
  breakSegments: BreakSegmentResponseDTO[];
  workedMinutes?: number;
  breakMinutes?: number;
  overtimeMinutes?: number;
  status: string;
  anomalies: AnomalyResponseDTO[];
  interpretedAt: string;
  interpretedBy: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RecordPunchResponseDTO {
  event: PunchEventResponseDTO;
  dayInterpretation: InterpretationResultResponseDTO;
  warnings?: string[];
}

export interface GetDayInterpretationResponseDTO {
  interpretation: InterpretationResultResponseDTO;
  policy: BreakPolicyResponseDTO;
  punchEvents: PunchEventResponseDTO[];
  schedule?: {
    idHorario: number;
    horaEntrada?: string;
    horaSalida?: string;
  };
}

export interface GetMonthInterpretationsResponseDTO {
  interpretations: InterpretationResultResponseDTO[];
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

export interface UpdateBreakPolicyResponseDTO {
  policy: BreakPolicyResponseDTO;
  reprocessingQueued: boolean;
  affectedDays: number;
  affectedEmployees: number;
}

// ============================================================================
// ERROR RESPONSE DTOs
// ============================================================================

export interface ErrorResponseDTO {
  error: string;
  code?: string;
  details?: Record<string, string>;
  timestamp: string;
}

// ============================================================================
// MAPPERS
// ============================================================================

export function mapPunchEventToDTO(event: PunchEvent): PunchEventResponseDTO {
  return {
    id: event.id,
    idEmpleado: event.idEmpleado,
    timestamp: event.timestamp,
    direction: event.direction,
    source: event.source,
    metadata: event.metadata,
    createdAt: event.createdAt,
    createdBy: event.createdBy,
  };
}

export function mapBreakPolicyToDTO(policy: BreakPolicy): BreakPolicyResponseDTO {
  return {
    id: policy.id,
    idHorario: policy.idHorario,
    version: policy.version,
    mode: policy.mode,
    paid: policy.paid,
    mandatory: policy.mandatory,
    minMinutes: policy.minMinutes,
    maxMinutes: policy.maxMinutes,
    expectedStart: policy.expectedStart,
    expectedEnd: policy.expectedEnd,
    startTolerance: policy.startTolerance,
    endTolerance: policy.endTolerance,
    allowContinuousShift: policy.allowContinuousShift,
    effectiveFrom: policy.effectiveFrom,
    createdAt: policy.createdAt,
    createdBy: policy.createdBy,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}

export function mapWorkSegmentToDTO(segment: WorkSegment): WorkSegmentResponseDTO {
  return {
    startTime: segment.startTime,
    endTime: segment.endTime,
    durationMinutes: segment.durationMinutes,
  };
}

export function mapBreakSegmentToDTO(segment: BreakSegment): BreakSegmentResponseDTO {
  return {
    startTime: segment.startTime,
    endTime: segment.endTime,
    durationMinutes: segment.durationMinutes,
    type: segment.type,
  };
}

export function mapAnomalyToDTO(anomaly: Anomaly): AnomalyResponseDTO {
  return {
    type: anomaly.type,
    severity: anomaly.severity,
    description: anomaly.description,
    minutesAffected: anomaly.minutesAffected,
    autoApproved: anomaly.autoApproved,
    approvedBy: anomaly.approvedBy,
    approvedAt: anomaly.approvedAt,
  };
}

export function mapInterpretationResultToDTO(
  result: InterpretationResult
): InterpretationResultResponseDTO {
  return {
    id: result.id,
    idEmpleado: result.idEmpleado,
    workDate: result.workDate,
    idHorario: result.idHorario,
    idPolicy: result.idPolicy,
    policyVersion: result.policyVersion,
    workSegments: result.workSegments.map(mapWorkSegmentToDTO),
    breakSegments: result.breakSegments.map(mapBreakSegmentToDTO),
    workedMinutes: result.workedMinutes,
    breakMinutes: result.breakMinutes,
    overtimeMinutes: result.overtimeMinutes,
    status: result.status,
    anomalies: result.anomalies.map(mapAnomalyToDTO),
    interpretedAt: result.interpretedAt,
    interpretedBy: result.interpretedBy,
    notes: result.notes,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}
