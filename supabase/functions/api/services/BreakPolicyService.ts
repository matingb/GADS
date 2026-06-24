/**
 * BreakPolicyService
 * 
 * Responsabilidades:
 * - Validación de políticas de descanso
 * - CRUD de políticas
 * - Business rules validation
 * 
 * Depende de: AttendanceRepository
 */

import { AttendanceRepository } from './AttendanceRepository.ts';
import type { BreakPolicy, BreakPolicyMode } from '../../../src/types.ts';

export interface BreakPolicyInput {
  mode: BreakPolicyMode;
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

export interface ValidationError {
  field: string;
  message: string;
}

export class BreakPolicyService {
  constructor(private repository: AttendanceRepository) {}

  /**
   * Crear una nueva política de descanso para un horario
   */
  async createBreakPolicy(
    scheduleId: number,
    input: BreakPolicyInput,
    createdBy: string
  ): Promise<BreakPolicy> {
    // Validar
    const errors = this.validatePolicy(input);
    if (errors.length > 0) {
      throw new Error(`Policy validation failed: ${errors.map((e) => e.message).join('; ')}`);
    }

    // Crear
    const policy: Omit<BreakPolicy, 'id' | 'createdAt' | 'updatedAt'> = {
      idHorario: scheduleId,
      version: 1,
      mode: input.mode,
      paid: input.paid,
      mandatory: input.mandatory,
      minMinutes: input.minMinutes,
      maxMinutes: input.maxMinutes,
      expectedStart: input.expectedStart,
      expectedEnd: input.expectedEnd,
      startTolerance: input.startTolerance ?? 15,
      endTolerance: input.endTolerance ?? 15,
      allowContinuousShift: input.allowContinuousShift,
      effectiveFrom: new Date().toISOString(),
      createdBy,
    };

    return this.repository.createBreakPolicy(scheduleId, policy);
  }

  /**
   * Actualizar política de descanso
   */
  async updateBreakPolicy(
    policyId: string,
    input: Partial<BreakPolicyInput>,
    updatedBy: string
  ): Promise<BreakPolicy> {
    // Validar si se proporcionan datos
    if (Object.keys(input).length > 0) {
      const errors = this.validatePolicy(input as BreakPolicyInput);
      if (errors.length > 0) {
        throw new Error(`Policy validation failed: ${errors.map((e) => e.message).join('; ')}`);
      }
    }

    // Actualizar
    const updates: Partial<Omit<BreakPolicy, 'id' | 'createdAt'>> = {
      mode: input.mode,
      paid: input.paid,
      mandatory: input.mandatory,
      minMinutes: input.minMinutes,
      maxMinutes: input.maxMinutes,
      expectedStart: input.expectedStart,
      expectedEnd: input.expectedEnd,
      startTolerance: input.startTolerance,
      endTolerance: input.endTolerance,
      allowContinuousShift: input.allowContinuousShift,
      updatedBy,
    };

    return this.repository.updateBreakPolicy(policyId, updates);
  }

  /**
   * Obtener política vigente para un horario
   */
  async getActivePolicy(
    scheduleId: number,
    effectiveDate?: Date
  ): Promise<BreakPolicy | null> {
    return this.repository.getBreakPolicy(scheduleId, effectiveDate);
  }

  /**
   * Validar política
   */
  validatePolicy(input: Partial<BreakPolicyInput>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Mode es requerido
    if (!input.mode) {
      errors.push({
        field: 'mode',
        message: 'Mode is required (NONE, FIXED, or FLEXIBLE)',
      });
      return errors; // No continuar si mode no existe
    }

    // minMinutes es requerido
    if (input.minMinutes === undefined || input.minMinutes === null) {
      errors.push({
        field: 'minMinutes',
        message: 'Min minutes is required',
      });
    } else if (input.minMinutes < 0) {
      errors.push({
        field: 'minMinutes',
        message: 'Min minutes must be >= 0',
      });
    }

    // maxMinutes es requerido
    if (input.maxMinutes === undefined || input.maxMinutes === null) {
      errors.push({
        field: 'maxMinutes',
        message: 'Max minutes is required',
      });
    } else if (input.maxMinutes < 0) {
      errors.push({
        field: 'maxMinutes',
        message: 'Max minutes must be >= 0',
      });
    }

    // minMinutes <= maxMinutes
    if (
      input.minMinutes !== undefined &&
      input.maxMinutes !== undefined &&
      input.minMinutes > input.maxMinutes
    ) {
      errors.push({
        field: 'minMinutes',
        message: 'Min minutes must be <= max minutes',
      });
    }

    // Validaciones específicas por mode
    if (input.mode === 'FIXED') {
      // expectedStart y expectedEnd son requeridos
      if (!input.expectedStart) {
        errors.push({
          field: 'expectedStart',
          message: 'Expected start time is required for FIXED mode',
        });
      } else if (!this.isValidTime(input.expectedStart)) {
        errors.push({
          field: 'expectedStart',
          message: 'Invalid time format. Use HH:mm',
        });
      }

      if (!input.expectedEnd) {
        errors.push({
          field: 'expectedEnd',
          message: 'Expected end time is required for FIXED mode',
        });
      } else if (!this.isValidTime(input.expectedEnd)) {
        errors.push({
          field: 'expectedEnd',
          message: 'Invalid time format. Use HH:mm',
        });
      }

      // Validar que expectedStart < expectedEnd
      if (
        input.expectedStart &&
        input.expectedEnd &&
        this.isValidTime(input.expectedStart) &&
        this.isValidTime(input.expectedEnd)
      ) {
        const [sh, sm] = input.expectedStart.split(':').map(Number);
        const [eh, em] = input.expectedEnd.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;

        if (startMins >= endMins) {
          errors.push({
            field: 'expectedStart',
            message: 'Start time must be before end time',
          });
        }
      }
    } else if (input.mode === 'FLEXIBLE') {
      // expectedStart y expectedEnd deben ser nulos
      if (input.expectedStart) {
        errors.push({
          field: 'expectedStart',
          message: 'Expected start time should not be set for FLEXIBLE mode',
        });
      }
      if (input.expectedEnd) {
        errors.push({
          field: 'expectedEnd',
          message: 'Expected end time should not be set for FLEXIBLE mode',
        });
      }
    } else if (input.mode === 'NONE') {
      // expectedStart y expectedEnd deben ser nulos
      if (input.expectedStart) {
        errors.push({
          field: 'expectedStart',
          message: 'Expected start time should not be set for NONE mode',
        });
      }
      if (input.expectedEnd) {
        errors.push({
          field: 'expectedEnd',
          message: 'Expected end time should not be set for NONE mode',
        });
      }
    }

    // Tolerancias deben ser >= 0
    if (input.startTolerance !== undefined && input.startTolerance < 0) {
      errors.push({
        field: 'startTolerance',
        message: 'Start tolerance must be >= 0',
      });
    }

    if (input.endTolerance !== undefined && input.endTolerance < 0) {
      errors.push({
        field: 'endTolerance',
        message: 'End tolerance must be >= 0',
      });
    }

    return errors;
  }

  /**
   * Validar formato de tiempo HH:mm
   */
  private isValidTime(timeStr: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(timeStr);
  }
}
