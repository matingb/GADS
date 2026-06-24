/**
 * Use Cases - Orquestación de lógica de aplicación
 * 
 * Coordinan entre servicios (Engine, Repository, PolicyService)
 * para implementar casos de uso de negocio
 */

import { AttendanceEngine } from '../services/AttendanceEngine.ts';
import { AttendanceRepository } from '../services/AttendanceRepository.ts';
import { BreakPolicyService } from '../services/BreakPolicyService.ts';
import type { PunchEvent, InterpretationResult, BreakPolicy } from '../../../src/types.ts';

export class AttendanceUseCases {
  private engine: AttendanceEngine;
  private repository: AttendanceRepository;
  private policyService: BreakPolicyService;

  constructor(
    supabaseUrl: string,
    supabaseKey: string
  ) {
    this.repository = new AttendanceRepository(supabaseUrl, supabaseKey);
    this.policyService = new BreakPolicyService(this.repository);
    this.engine = new AttendanceEngine();
  }

  // =========================================================================
  // USE CASE 1: Record Daily Punch
  // =========================================================================

  /**
   * Registrar un evento de entrada/salida y generar interpretación del día
   * 
   * Flujo:
   * 1. Validar entrada
   * 2. Crear PunchEvent
   * 3. Guardar en BD
   * 4. Obtener eventos del día
   * 5. Obtener política de descanso
   * 6. Ejecutar motor de interpretación
   * 7. Guardar interpretación
   * 8. Retornar ambos
   */
  async recordDailyPunch(
    employeeId: number,
    timestamp: string,
    direction: 'IN' | 'OUT',
    source: 'BIOMETRIC' | 'QR' | 'API' | 'MANUAL',
    createdBy: string,
    metadata?: Record<string, unknown>
  ): Promise<{
    event: PunchEvent;
    interpretation: InterpretationResult;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Validar timestamp
    let eventDate: Date;
    try {
      eventDate = new Date(timestamp);
      if (isNaN(eventDate.getTime())) {
        throw new Error('Invalid timestamp');
      }
    } catch (error) {
      throw new Error(`Invalid timestamp format: ${timestamp}`);
    }

    // Crear evento
    const event: PunchEvent = {
      id: crypto.randomUUID(),
      idEmpleado: employeeId,
      timestamp: eventDate.toISOString(),
      direction,
      source,
      metadata,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    // Guardar evento
    const savedEvent = await this.repository.savePunchEvent(event);

    // Obtener eventos del día
    const dayEvents = await this.repository.getPunchEventsForDay(employeeId, eventDate);

    // Obtener horario activo para ese día
    const schedule = await this.repository.getEmployeeScheduleForDate(employeeId, eventDate);

    if (!schedule) {
      warnings.push('No schedule found for this employee on this date');
      // Continuar con horario vacío
    }

    if (schedule?.esDescanso) {
      warnings.push('Punch recorded on a rest day — no interpretation generated');
      return { event: savedEvent, interpretation: null as any, warnings };
    }

    // Obtener política vigente
    const policy = await this.policyService.getActivePolicy(schedule?.idHorario || 0);

    if (!policy) {
      throw new Error('No break policy found for employee schedule');
    }

    // Ejecutar motor de interpretación
    const interpretation = this.engine.interpret(
      dayEvents,
      policy,
      schedule?.horaEntrada || null,
      schedule?.horaSalida || null,
      eventDate
    );

    // Actualizar con datos reales
    interpretation.idEmpleado = employeeId;
    interpretation.idHorario = schedule?.idHorario;

    // Guardar interpretación
    const savedInterpretation = await this.repository.saveInterpretationResult(
      interpretation
    );

    return {
      event: savedEvent,
      interpretation: savedInterpretation,
      warnings,
    };
  }

  // =========================================================================
  // USE CASE 2: Get Day Interpretation
  // =========================================================================

  /**
   * Obtener interpretación completa de un día
   */
  async getDayInterpretation(
    employeeId: number,
    workDate: Date
  ): Promise<{
    interpretation: InterpretationResult | null;
    policy: BreakPolicy | null;
    punchEvents: PunchEvent[];
    schedule: { idHorario: number; horaEntrada?: string; horaSalida?: string } | null;
  }> {
    // Obtener interpretación guardada (si existe)
    const interpretation = await this.repository.getInterpretationResult(
      employeeId,
      workDate
    );

    // Obtener eventos del día
    const punchEvents = await this.repository.getPunchEventsForDay(employeeId, workDate);

    // Obtener horario
    const schedule = await this.repository.getEmployeeScheduleForDate(employeeId, workDate);

    // Obtener política
    let policy: BreakPolicy | null = null;
    if (interpretation) {
      policy = await this.policyService.getActivePolicy(
        interpretation.idHorario || 0,
        workDate
      );
    }

    return {
      interpretation,
      policy,
      punchEvents,
      schedule,
    };
  }

  // =========================================================================
  // USE CASE 3: Get Month Interpretations with Summary
  // =========================================================================

  /**
   * Obtener todas las interpretaciones de un mes con resumen
   */
  async getMonthInterpretations(
    employeeId: number,
    yearMonth: string // YYYY-MM
  ): Promise<{
    interpretations: InterpretationResult[];
    summary: {
      period: string;
      workedMinutes: number;
      breakMinutes: number;
      overtimeMinutes: number;
      anomaliesByType: Record<string, number>;
      daysWorked: number;
      daysWithAnomalies: number;
    };
  }> {
    // Obtener todas las interpretaciones del mes
    const interpretations = await this.repository.getInterpretationsForMonth(
      employeeId,
      yearMonth
    );

    // Calcular resumen
    let totalWorked = 0;
    let totalBreak = 0;
    let totalOvertime = 0;
    const anomalyCounts: Record<string, number> = {};
    let daysWithAnomalies = 0;

    for (const interpretation of interpretations) {
      totalWorked += interpretation.workedMinutes || 0;
      totalBreak += interpretation.breakMinutes || 0;
      totalOvertime += interpretation.overtimeMinutes || 0;

      if (interpretation.anomalies.length > 0) {
        daysWithAnomalies++;

        for (const anomaly of interpretation.anomalies) {
          anomalyCounts[anomaly.type] = (anomalyCounts[anomaly.type] || 0) + 1;
        }
      }
    }

    return {
      interpretations,
      summary: {
        period: yearMonth,
        workedMinutes: totalWorked,
        breakMinutes: totalBreak,
        overtimeMinutes: totalOvertime,
        anomaliesByType: anomalyCounts,
        daysWorked: interpretations.filter((i) => i.status === 'COMPLETE').length,
        daysWithAnomalies,
      },
    };
  }

  // =========================================================================
  // USE CASE 4: Reprocess Historical Period
  // =========================================================================

  /**
   * Reprocesar período histórico con política vigente
   * 
   * Útil cuando:
   * - Se cambia la política
   * - Se corrigen eventos históricos
   * - Se quiere recalcular con nueva versión del motor
   */
  async reprocessPeriod(
    employeeId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{
    reprocessedDays: number;
    summary: {
      daysProcessed: number;
      anomaliesFound: number;
      averageOvertimeMinutes: number;
    };
  }> {
    // Obtener eventos en rango
    const allEvents = await this.repository.getPunchEvents(
      employeeId,
      startDate,
      endDate
    );

    // Agrupar por fecha
    const eventsByDate = this.groupEventsByDate(allEvents);

    let daysProcessed = 0;
    let totalAnomalies = 0;
    let totalOvertime = 0;

    // Para cada fecha
    for (const [dateStr, dayEvents] of eventsByDate.entries()) {
      const workDate = new Date(dateStr);

      // Obtener horario
      const schedule = await this.repository.getEmployeeScheduleForDate(
        employeeId,
        workDate
      );

      if (!schedule || schedule.esDescanso) {
        continue; // Saltar si no hay horario o es día de descanso
      }

      // Obtener política vigente
      const policy = await this.policyService.getActivePolicy(schedule.idHorario, workDate);

      if (!policy) {
        continue; // Saltar si no hay política
      }

      // Ejecutar motor
      const interpretation = this.engine.interpret(
        dayEvents,
        policy,
        schedule.horaEntrada || null,
        schedule.horaSalida || null,
        workDate
      );

      // Actualizar con datos reales
      interpretation.idEmpleado = employeeId;
      interpretation.idHorario = schedule.idHorario;

      // Guardar (overwrite si existe)
      await this.repository.saveInterpretationResult(interpretation);

      daysProcessed++;
      totalAnomalies += interpretation.anomalies.length;
      totalOvertime += interpretation.overtimeMinutes || 0;
    }

    return {
      reprocessedDays: daysProcessed,
      summary: {
        daysProcessed,
        anomaliesFound: totalAnomalies,
        averageOvertimeMinutes: daysProcessed > 0 ? totalOvertime / daysProcessed : 0,
      },
    };
  }

  // =========================================================================
  // USE CASE 5: Update Policy and Reprocess
  // =========================================================================

  /**
   * Actualizar política de descanso y reprocesar período
   */
  async updatePolicyAndReprocess(
    scheduleId: number,
    input: any, // BreakPolicyInput
    updatedBy: string,
    reprocessFromDate?: Date
  ): Promise<{
    policy: BreakPolicy;
    reprocessedDays: number;
    affectedEmployees: number;
  }> {
    // Obtener política vigente
    const existingPolicy = await this.policyService.getActivePolicy(scheduleId);

    if (!existingPolicy) {
      throw new Error('No existing policy found');
    }

    // Actualizar política
    const updatedPolicy = await this.policyService.updateBreakPolicy(
      existingPolicy.id,
      input,
      updatedBy
    );

    // Obtener empleados asignados a este horario
    // (Esta query estaría en repository, pero por ahora simplificado)

    // Reprocessar desde fecha
    const fromDate = reprocessFromDate || new Date();
    const today = new Date();

    // Para demo, procesar últimos 30 días
    const startDate = new Date(fromDate);
    startDate.setDate(startDate.getDate() - 30);

    // Simular: asumir 1 empleado por horario en este ejemplo
    const reprocessResult = await this.reprocessPeriod(1, startDate, today);

    return {
      policy: updatedPolicy,
      reprocessedDays: reprocessResult.reprocessedDays,
      affectedEmployees: 1, // Simplificado
    };
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Agrupar eventos por fecha
   */
  private groupEventsByDate(events: PunchEvent[]): Map<string, PunchEvent[]> {
    const grouped = new Map<string, PunchEvent[]>();

    for (const event of events) {
      // Usar fecha local Argentina, no UTC, para evitar que eventos nocturnos
      // (ej: salida 22:00 ART = 01:00 UTC siguiente día) caigan en el día equivocado.
      const date = new Date(event.timestamp).toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      });
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(event);
    }

    return grouped;
  }
}
