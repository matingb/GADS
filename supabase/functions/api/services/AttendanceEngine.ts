/**
 * AttendanceEngine
 * 
 * Motor de interpretación de eventos de asistencia.
 * 
 * Responsabilidades:
 * - Interpretar eventos crudos de entrada/salida contra una política
 * - Construir segmentos de trabajo y descanso
 * - Detectar anomalías
 * - Calcular minutos trabajados y horas extras
 * 
 * No tiene dependencias externas (BD, API, etc.)
 * Lógica pura y determinista.
 */

import type {
  PunchEvent,
  BreakPolicy,
  WorkSegment,
  BreakSegment,
  InterpretationResult,
  Anomaly,
  InterpretationStatus,
} from '../../../src/types.ts';

interface SegmentBuildResult {
  workSegments: WorkSegment[];
  breakSegments: BreakSegment[];
}

export class AttendanceEngine {
  /**
   * Interpretar eventos de un día contra una política de descanso
   */
  public interpret(
    events: PunchEvent[],
    policy: BreakPolicy,
    scheduleStartTime: string | null, // HH:mm, ej: "09:00"
    scheduleEndTime: string | null,   // HH:mm, ej: "18:00"
    workDate: Date
  ): InterpretationResult {
    // Validar entrada
    if (!policy) {
      throw new Error('Break policy is required');
    }

    // Filtrar eventos del día y ordenar por timestamp
    const dayEvents = this.filterAndSortEvents(events, workDate);

    // Construir segmentos
    const segments = this.buildSegments(dayEvents);

    // Determinar estado
    const status = this.determineStatus(dayEvents, segments);

    // Calcular métricas
    const workedMinutes = this.calculateWorkedMinutes(segments.workSegments);
    const breakMinutes = this.calculateBreakMinutes(segments.breakSegments);

    // Calcular horas extras basado en schedule esperado
    const expectedMinutes = scheduleStartTime && scheduleEndTime
      ? this.calculateExpectedMinutes(scheduleStartTime, scheduleEndTime)
      : 0;
    const overtimeMinutes = this.calculateOvertime(workedMinutes, expectedMinutes);

    // Detectar anomalías
    const anomalies = this.detectAnomalies(
      dayEvents,
      segments,
      policy,
      workedMinutes,
      expectedMinutes,
      scheduleStartTime,
      scheduleEndTime,
      status
    );

    // Construir resultado
    const result: InterpretationResult = {
      id: crypto.randomUUID(),
      idEmpleado: policy.idHorario, // Será actualizado en repo
      workDate: this.formatDate(workDate),
      idHorario: policy.idHorario,
      idPolicy: policy.id,
      policyVersion: policy.version,
      workSegments: segments.workSegments,
      breakSegments: segments.breakSegments,
      workedMinutes,
      breakMinutes,
      overtimeMinutes,
      status,
      anomalies,
      interpretedAt: new Date().toISOString(),
      interpretedBy: 'ENGINE',
      createdAt: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Filtrar eventos del día especificado y ordenar cronológicamente.
   * Compara por fecha local Argentina (UTC-3) para evitar que eventos
   * nocturnos (ej: salida 22:00 ART = 01:00 UTC siguiente día) se
   * atribuyan al día equivocado.
   */
  private filterAndSortEvents(events: PunchEvent[], workDate: Date): PunchEvent[] {
    const workDateStr = this.formatDate(workDate); // YYYY-MM-DD en UTC (fecha laboral)

    return events
      .filter((e) => {
        const localDate = this.toArgentinaDateStr(new Date(e.timestamp));
        return localDate === workDateStr;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /** Convierte un Date a YYYY-MM-DD en zona horaria America/Argentina/Buenos_Aires */
  private toArgentinaDateStr(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  }

  /**
   * Construir segmentos de trabajo y descanso a partir de eventos
   * 
   * Asume alternancia: IN, OUT, IN, OUT, ...
   * 
   * IN[0] → OUT[0] = WorkSegment 1
   * OUT[0] → IN[1] = BreakSegment 1
   * IN[1] → OUT[1] = WorkSegment 2
   * etc.
   */
  private buildSegments(events: PunchEvent[]): SegmentBuildResult {
    const workSegments: WorkSegment[] = [];
    const breakSegments: BreakSegment[] = [];

    // Necesitamos pares IN/OUT
    for (let i = 0; i < events.length - 1; i += 2) {
      const current = events[i];
      const next = events[i + 1];

      // Validar alternancia: si ambos son IN o OUT, hay error
      if (current.direction === next.direction) {
        // Saltar el evento problemático
        continue;
      }

      // Si current es IN y next es OUT
      if (current.direction === 'IN' && next.direction === 'OUT') {
        const segment = this.createWorkSegment(
          new Date(current.timestamp),
          new Date(next.timestamp)
        );
        workSegments.push(segment);

        // Si hay siguiente par, es un break
        if (i + 2 < events.length) {
          const breakStart = new Date(next.timestamp);
          const breakEnd = new Date(events[i + 2].timestamp);

          // Solo crear break si el siguiente es IN
          if (events[i + 2].direction === 'IN') {
            const breakSeg = this.createBreakSegment(breakStart, breakEnd);
            breakSegments.push(breakSeg);
          }
        }
      }
    }

    return { workSegments, breakSegments };
  }

  /**
   * Crear un segmento de trabajo
   */
  private createWorkSegment(startTime: Date, endTime: Date): WorkSegment {
    const durationMinutes = Math.floor(
      (endTime.getTime() - startTime.getTime()) / (1000 * 60)
    );

    return {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes,
    };
  }

  /**
   * Crear un segmento de descanso
   */
  private createBreakSegment(startTime: Date, endTime: Date): BreakSegment {
    const durationMinutes = Math.floor(
      (endTime.getTime() - startTime.getTime()) / (1000 * 60)
    );

    return {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes,
    };
  }

  /**
   * Determinar el estado de la interpretación
   */
  private determineStatus(
    events: PunchEvent[],
    segments: SegmentBuildResult
  ): InterpretationStatus {
    if (events.length === 0) {
      return 'NO_PUNCHES';
    }

    // Contar IN y OUT
    const inCount = events.filter((e) => e.direction === 'IN').length;
    const outCount = events.filter((e) => e.direction === 'OUT').length;

    // Si hay dos eventos y es IN/OUT: jornada completa
    if (inCount === 1 && outCount === 1 && events[0].direction === 'IN') {
      return 'COMPLETE';
    }

    // Si hay múltiples segmentos: jornada completa
    if (segments.workSegments.length > 0 && inCount === outCount && inCount > 1) {
      return 'COMPLETE';
    }

    // Si hay múltiples eventos pero IN !== OUT: incompleto
    if (inCount !== outCount) {
      return 'INCOMPLETE';
    }

    return 'INCOMPLETE';
  }

  /**
   * Calcular minutos trabajados (suma de todos los work segments)
   */
  private calculateWorkedMinutes(workSegments: WorkSegment[]): number {
    return workSegments.reduce((sum, seg) => sum + seg.durationMinutes, 0);
  }

  /**
   * Calcular minutos de descanso (suma de todos los break segments)
   */
  private calculateBreakMinutes(breakSegments: BreakSegment[]): number {
    return breakSegments.reduce((sum, seg) => sum + seg.durationMinutes, 0);
  }

  /**
   * Calcular minutos esperados basado en horario
   */
  private calculateExpectedMinutes(startTime: string, endTime: string): number {
    // Parsear HH:mm
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;

    return Math.max(0, endTotalMin - startTotalMin);
  }

  /**
   * Calcular horas extras
   * 
   * Si trabajado > esperado + 30min: horas extra
   * Si trabajado < esperado - 30min: falta de horas
   */
  private calculateOvertime(worked: number, expected: number): number {
    return worked - expected;
  }

  /**
   * Detectar anomalías según política y datos
   */
  private detectAnomalies(
    events: PunchEvent[],
    segments: SegmentBuildResult,
    policy: BreakPolicy,
    workedMinutes: number,
    expectedMinutes: number,
    scheduleStartTime: string | null,
    scheduleEndTime: string | null,
    status: InterpretationStatus
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // ========================================================================
    // Anomalías comunes
    // ========================================================================

    // NO_PUNCHES
    if (status === 'NO_PUNCHES') {
      anomalies.push({
        type: 'AUSENCIA',
        severity: 'ERROR',
        description: 'Sin registros de entrada/salida',
        minutesAffected: expectedMinutes,
      });
      return anomalies;
    }

    // INCOMPLETE (falta entrada o salida)
    if (status === 'INCOMPLETE') {
      const inCount = events.filter((e) => e.direction === 'IN').length;
      const outCount = events.filter((e) => e.direction === 'OUT').length;

      if (inCount === 0) {
        anomalies.push({
          type: 'AUSENCIA',
          severity: 'ERROR',
          description: 'Sin registro de entrada',
          minutesAffected: expectedMinutes,
        });
      } else if (outCount === 0) {
        anomalies.push({
          type: 'INCOMPLETE',
          severity: 'WARNING',
          description: 'Sin registro de salida',
        });
      }
    }

    // ========================================================================
    // Anomalías específicas por modo de política
    // ========================================================================

    if (policy.mode === 'FIXED') {
      this.detectAnomaliesFixed(
        anomalies,
        events,
        segments,
        policy,
        workedMinutes,
        expectedMinutes,
        scheduleStartTime,
        scheduleEndTime
      );
    } else if (policy.mode === 'FLEXIBLE') {
      this.detectAnomaliesFlexible(
        anomalies,
        segments,
        policy,
        workedMinutes,
        expectedMinutes
      );
    } else if (policy.mode === 'NONE') {
      this.detectAnomaliesNone(anomalies, segments);
    }

    return anomalies;
  }

  /**
   * Detectar anomalías en modo FIXED
   */
  private detectAnomaliesFixed(
    anomalies: Anomaly[],
    events: PunchEvent[],
    segments: SegmentBuildResult,
    policy: BreakPolicy,
    workedMinutes: number,
    expectedMinutes: number,
    scheduleStartTime: string | null,
    scheduleEndTime: string | null
  ): void {
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    // ====== TARDANZA ======
    if (
      firstEvent?.direction === 'IN' &&
      scheduleStartTime &&
      !this.isEventWithinTolerance(
        new Date(firstEvent.timestamp),
        scheduleStartTime,
        policy.startTolerance
      )
    ) {
      const lateMinutes = this.calculateLateness(
        new Date(firstEvent.timestamp),
        scheduleStartTime
      );

      if (lateMinutes > 0) {
        anomalies.push({
          type: 'TARDANZA',
          severity: 'WARNING',
          description: `Entrada tardía: ${lateMinutes} minutos`,
          minutesAffected: lateMinutes,
        });
      }
    }

    // ====== EARLY EXIT ======
    if (
      lastEvent?.direction === 'OUT' &&
      scheduleEndTime &&
      !this.isEventWithinTolerance(
        new Date(lastEvent.timestamp),
        scheduleEndTime,
        policy.endTolerance,
        'after' // tolerancia se aplica después
      )
    ) {
      const earlyMinutes = this.calculateEarlyExit(
        new Date(lastEvent.timestamp),
        scheduleEndTime
      );

      if (earlyMinutes > 0) {
        anomalies.push({
          type: 'EARLY_EXIT',
          severity: 'WARNING',
          description: `Salida anticipada: ${earlyMinutes} minutos`,
          minutesAffected: earlyMinutes,
        });
      }
    }

    // ====== BREAK VALIDATION ======
    this.validateBreakFixed(anomalies, segments, policy);

    // ====== OVERTIME ======
    this.detectOvertimeAnomalies(anomalies, workedMinutes, expectedMinutes);
  }

  /**
   * Validar descanso en modo FIXED
   */
  private validateBreakFixed(
    anomalies: Anomaly[],
    segments: SegmentBuildResult,
    policy: BreakPolicy
  ): void {
    // Si no hay break segments
    if (segments.breakSegments.length === 0) {
      if (policy.mandatory && !policy.allowContinuousShift) {
        anomalies.push({
          type: 'BREAK_NOT_TAKEN',
          severity: 'WARNING',
          description: 'Descanso obligatorio no registrado',
          minutesAffected: policy.minMinutes,
        });
      }
      return;
    }

    // Validar cada break segment
    for (const breakSeg of segments.breakSegments) {
      const breakStart = new Date(breakSeg.startTime);
      const breakEnd = new Date(breakSeg.endTime);
      const breakDuration = breakSeg.durationMinutes;

      // Validar duración mínima
      if (breakDuration < policy.minMinutes) {
        anomalies.push({
          type: 'BREAK_TOO_SHORT',
          severity: 'WARNING',
          description: `Descanso muy corto: ${breakDuration} min (mínimo ${policy.minMinutes} min)`,
          minutesAffected: policy.minMinutes - breakDuration,
        });
      }

      // Validar duración máxima
      if (breakDuration > policy.maxMinutes) {
        anomalies.push({
          type: 'BREAK_TOO_LONG',
          severity: 'INFO',
          description: `Descanso muy largo: ${breakDuration} min (máximo ${policy.maxMinutes} min)`,
          minutesAffected: breakDuration - policy.maxMinutes,
        });
      }

      // Validar que esté en horario esperado (si aplica)
      if (
        policy.expectedStart &&
        policy.expectedEnd &&
        !this.isBreakWithinExpectedWindow(breakStart, breakEnd, policy)
      ) {
        anomalies.push({
          type: 'BREAK_OUT_OF_SCHEDULE',
          severity: 'INFO',
          description: `Descanso fuera del horario esperado (${policy.expectedStart}-${policy.expectedEnd})`,
        });
      }
    }
  }

  /**
   * Detectar anomalías en modo FLEXIBLE
   */
  private detectAnomaliesFlexible(
    anomalies: Anomaly[],
    segments: SegmentBuildResult,
    policy: BreakPolicy,
    workedMinutes: number,
    expectedMinutes: number
  ): void {
    // ====== BREAK VALIDATION ======
    if (segments.breakSegments.length === 0) {
      if (policy.mandatory) {
        anomalies.push({
          type: 'BREAK_NOT_TAKEN',
          severity: 'WARNING',
          description: 'Descanso obligatorio no registrado',
          minutesAffected: policy.minMinutes,
        });
      }
      return;
    }

    // Validar duración de cada break
    for (const breakSeg of segments.breakSegments) {
      const breakDuration = breakSeg.durationMinutes;

      if (breakDuration < policy.minMinutes) {
        anomalies.push({
          type: 'BREAK_TOO_SHORT',
          severity: 'WARNING',
          description: `Descanso muy corto: ${breakDuration} min (mínimo ${policy.minMinutes} min)`,
          minutesAffected: policy.minMinutes - breakDuration,
        });
      }

      if (breakDuration > policy.maxMinutes) {
        anomalies.push({
          type: 'BREAK_TOO_LONG',
          severity: 'INFO',
          description: `Descanso muy largo: ${breakDuration} min (máximo ${policy.maxMinutes} min)`,
          minutesAffected: breakDuration - policy.maxMinutes,
        });
      }
    }

    // ====== OVERTIME ======
    this.detectOvertimeAnomalies(anomalies, workedMinutes, expectedMinutes);
  }

  /**
   * Detectar anomalías en modo NONE (jornada continua)
   */
  private detectAnomaliesNone(
    anomalies: Anomaly[],
    segments: SegmentBuildResult
  ): void {
    // Si hay múltiples segments en modo NONE, es anómalo
    if (segments.workSegments.length > 1) {
      anomalies.push({
        type: 'UNEXPECTED_BREAK',
        severity: 'WARNING',
        description: 'Se esperaba jornada continua pero hay descanso(s)',
        minutesAffected: segments.breakSegments.reduce(
          (sum, b) => sum + b.durationMinutes,
          0
        ),
      });
    }
  }

  /**
   * Detectar anomalías de horas extras
   */
  private detectOvertimeAnomalies(
    anomalies: Anomaly[],
    workedMinutes: number,
    expectedMinutes: number
  ): void {
    const diff = workedMinutes - expectedMinutes;

    if (diff >= 30) {
      // Hay horas extra
      const overtimeMinutes = Math.floor(diff);
      const overtimeHours = (overtimeMinutes / 60).toFixed(2);

      // Determinar si es 50% o 100%
      if (diff >= 240) {
        // 4+ horas extra = 100%
        anomalies.push({
          type: 'OVERTIME_100',
          severity: 'INFO',
          description: `Horas extras (100%): ${overtimeHours}hs`,
          minutesAffected: overtimeMinutes,
        });
      } else {
        // Menos de 4 horas = 50%
        anomalies.push({
          type: 'OVERTIME_50',
          severity: 'INFO',
          description: `Horas extras (50%): ${overtimeHours}hs`,
          minutesAffected: overtimeMinutes,
        });
      }
    } else if (diff < -30) {
      // Falta de horas
      const underpaidMinutes = Math.abs(diff);
      const underpaidHours = (underpaidMinutes / 60).toFixed(2);

      anomalies.push({
        type: 'UNDERPAID_HOURS',
        severity: 'WARNING',
        description: `Horas faltantes: ${underpaidHours}hs`,
        minutesAffected: underpaidMinutes,
      });
    }
  }

  /**
   * Verificar si evento está dentro tolerancia.
   * expectedTime es HH:mm en hora local Argentina; eventTime es UTC.
   */
  private isEventWithinTolerance(
    eventTime: Date,
    expectedTime: string,
    toleranceMinutes: number,
    direction: 'before' | 'after' = 'before'
  ): boolean {
    const diffMins = this.diffFromScheduleTime(eventTime, expectedTime);

    if (direction === 'before') {
      return diffMins <= toleranceMinutes;
    } else {
      return diffMins >= -toleranceMinutes;
    }
  }

  /**
   * Calcular minutos de tardanza
   */
  private calculateLateness(eventTime: Date, expectedTime: string): number {
    return Math.max(0, this.diffFromScheduleTime(eventTime, expectedTime));
  }

  /**
   * Calcular minutos de salida anticipada
   */
  private calculateEarlyExit(eventTime: Date, expectedTime: string): number {
    return Math.max(0, -this.diffFromScheduleTime(eventTime, expectedTime));
  }

  /**
   * Diferencia en minutos entre un evento UTC y una hora de horario HH:mm local Argentina.
   * Positivo = el evento ocurrió después del horario esperado.
   */
  private diffFromScheduleTime(eventTime: Date, scheduleTime: string): number {
    const [expHour, expMin] = scheduleTime.split(':').map(Number);

    // Obtener la fecha en Argentina para construir el instante esperado
    const argDateStr = this.toArgentinaDateStr(eventTime); // YYYY-MM-DD
    // Construir el instante esperado como hora local Argentina → UTC
    const expectedDate = new Date(
      `${argDateStr}T${String(expHour).padStart(2, '0')}:${String(expMin).padStart(2, '0')}:00-03:00`
    );

    return Math.floor((eventTime.getTime() - expectedDate.getTime()) / (1000 * 60));
  }

  /**
   * Validar que descanso está dentro de ventana esperada
   */
  private isBreakWithinExpectedWindow(
    breakStart: Date,
    breakEnd: Date,
    policy: BreakPolicy
  ): boolean {
    if (!policy.expectedStart || !policy.expectedEnd) {
      return true;
    }

    const argDateStr = this.toArgentinaDateStr(breakStart);

    const windowStart = new Date(`${argDateStr}T${policy.expectedStart}:00-03:00`);
    const windowEnd = new Date(`${argDateStr}T${policy.expectedEnd}:00-03:00`);

    const startOk = breakStart >= new Date(
      windowStart.getTime() - policy.startTolerance * 60 * 1000
    );

    const endOk = breakEnd <= new Date(
      windowEnd.getTime() + policy.endTolerance * 60 * 1000
    );

    return startOk && endOk;
  }

  /**
   * Formatear fecha como YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
