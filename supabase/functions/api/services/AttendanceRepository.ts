/**
 * AttendanceRepository
 * 
 * Responsabilidades:
 * - Acceso a datos de asistencia (punch_events, interpretations, policies)
 * - Persistencia de eventos e interpretaciones
 * - Queries para obtener datos históricos
 * 
 * Depende de: Supabase client
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import type { Database } from '../types/database.ts';
import type {
  PunchEvent,
  BreakPolicy,
  InterpretationResult,
} from '../../../src/types.ts';

export class AttendanceRepository {
  private client: ReturnType<typeof createClient<Database>>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient<Database>(supabaseUrl, supabaseKey);
  }

  // =========================================================================
  // PUNCH EVENTS
  // =========================================================================

  /**
   * Guardar un nuevo evento de entrada/salida
   */
  async savePunchEvent(event: PunchEvent): Promise<PunchEvent> {
    const { data, error } = await this.client
      .from('punch_events')
      .insert({
        id: event.id,
        id_empleado: event.idEmpleado,
        timestamp: event.timestamp,
        direction: event.direction,
        source: event.source,
        metadata: event.metadata,
        created_by: event.createdBy,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save punch event: ${error.message}`);

    return this.mapPunchEventFromDB(data);
  }

  /**
   * Obtener eventos de punch de un empleado en un rango de fechas
   */
  async getPunchEvents(
    employeeId: number,
    startDate: Date,
    endDate: Date
  ): Promise<PunchEvent[]> {
    const { data, error } = await this.client
      .from('punch_events')
      .select('*')
      .eq('id_empleado', employeeId)
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to get punch events: ${error.message}`);
    }

    return (data || []).map((row) => this.mapPunchEventFromDB(row));
  }

  /**
   * Obtener eventos de punch de un día específico
   */
  async getPunchEventsForDay(
    employeeId: number,
    workDate: Date
  ): Promise<PunchEvent[]> {
    const nextDay = new Date(workDate);
    nextDay.setDate(nextDay.getDate() + 1);

    return this.getPunchEvents(employeeId, workDate, nextDay);
  }

  // =========================================================================
  // BREAK POLICIES
  // =========================================================================

  /**
   * Obtener la política de descanso vigente para un horario en una fecha
   */
  async getBreakPolicy(
    scheduleId: number,
    effectiveDate: Date = new Date()
  ): Promise<BreakPolicy | null> {
    const { data, error } = await this.client
      .from('break_policies')
      .select('*')
      .eq('id_horario', scheduleId)
      .lte('effective_from', effectiveDate.toISOString())
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw new Error(`Failed to get break policy: ${error.message}`);
    }

    return data ? this.mapBreakPolicyFromDB(data) : null;
  }

  /**
   * Crear una nueva política de descanso
   */
  async createBreakPolicy(
    scheduleId: number,
    policy: Omit<BreakPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<BreakPolicy> {
    const { data, error } = await this.client
      .from('break_policies')
      .insert({
        id_horario: scheduleId,
        version: policy.version || 1,
        mode: policy.mode,
        paid: policy.paid,
        mandatory: policy.mandatory,
        min_minutes: policy.minMinutes,
        max_minutes: policy.maxMinutes,
        expected_start: policy.expectedStart || null,
        expected_end: policy.expectedEnd || null,
        start_tolerance: policy.startTolerance || 15,
        end_tolerance: policy.endTolerance || 15,
        allow_continuous_shift: policy.allowContinuousShift,
        effective_from: policy.effectiveFrom || new Date().toISOString(),
        created_by: policy.createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create break policy: ${error.message}`);
    }

    return this.mapBreakPolicyFromDB(data);
  }

  /**
   * Actualizar una política de descanso
   */
  async updateBreakPolicy(
    policyId: string,
    updates: Partial<Omit<BreakPolicy, 'id' | 'createdAt'>>
  ): Promise<BreakPolicy> {
    const { data, error } = await this.client
      .from('break_policies')
      .update({
        mode: updates.mode,
        paid: updates.paid,
        mandatory: updates.mandatory,
        min_minutes: updates.minMinutes,
        max_minutes: updates.maxMinutes,
        expected_start: updates.expectedStart,
        expected_end: updates.expectedEnd,
        start_tolerance: updates.startTolerance,
        end_tolerance: updates.endTolerance,
        allow_continuous_shift: updates.allowContinuousShift,
        updated_at: new Date().toISOString(),
      })
      .eq('id', policyId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update break policy: ${error.message}`);
    }

    return this.mapBreakPolicyFromDB(data);
  }

  // =========================================================================
  // INTERPRETATION RESULTS
  // =========================================================================

  /**
   * Guardar resultado de interpretación
   */
  async saveInterpretationResult(
    result: InterpretationResult
  ): Promise<InterpretationResult> {
    const { data, error } = await this.client
      .from('attendance_interpretations')
      .insert({
        id: result.id,
        id_empleado: result.idEmpleado,
        work_date: result.workDate,
        id_horario: result.idHorario,
        id_policy: result.idPolicy,
        policy_version: result.policyVersion,
        work_segments: result.workSegments,
        break_segments: result.breakSegments,
        worked_minutes: result.workedMinutes,
        break_minutes: result.breakMinutes,
        overtime_minutes: result.overtimeMinutes,
        status: result.status,
        anomalies: result.anomalies,
        interpreted_at: result.interpretedAt,
        interpreted_by: result.interpretedBy,
        notes: result.notes,
      })
      .select()
      .single();

    if (error) {
      // Si ya existe para este día, actualizar
      if (error.code === '23505') {
        // unique constraint violation
        return this.updateInterpretationResult(result);
      }
      throw new Error(`Failed to save interpretation: ${error.message}`);
    }

    return this.mapInterpretationResultFromDB(data);
  }

  /**
   * Actualizar resultado de interpretación (upsert)
   */
  private async updateInterpretationResult(
    result: InterpretationResult
  ): Promise<InterpretationResult> {
    const { data, error } = await this.client
      .from('attendance_interpretations')
      .update({
        id_horario: result.idHorario,
        id_policy: result.idPolicy,
        policy_version: result.policyVersion,
        work_segments: result.workSegments,
        break_segments: result.breakSegments,
        worked_minutes: result.workedMinutes,
        break_minutes: result.breakMinutes,
        overtime_minutes: result.overtimeMinutes,
        status: result.status,
        anomalies: result.anomalies,
        interpreted_at: result.interpretedAt,
        interpreted_by: result.interpretedBy,
        notes: result.notes,
      })
      .eq('id_empleado', result.idEmpleado)
      .eq('work_date', result.workDate)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update interpretation: ${error.message}`);
    }

    return this.mapInterpretationResultFromDB(data);
  }

  /**
   * Obtener interpretación de un día específico
   */
  async getInterpretationResult(
    employeeId: number,
    workDate: Date
  ): Promise<InterpretationResult | null> {
    const dateStr = workDate.toISOString().split('T')[0];

    const { data, error } = await this.client
      .from('attendance_interpretations')
      .select('*')
      .eq('id_empleado', employeeId)
      .eq('work_date', dateStr)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get interpretation: ${error.message}`);
    }

    return data ? this.mapInterpretationResultFromDB(data) : null;
  }

  /**
   * Obtener interpretaciones de un mes
   */
  async getInterpretationsForMonth(
    employeeId: number,
    yearMonth: string // YYYY-MM
  ): Promise<InterpretationResult[]> {
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const { data, error } = await this.client
      .from('attendance_interpretations')
      .select('*')
      .eq('id_empleado', employeeId)
      .gte('work_date', startDate.toISOString().split('T')[0])
      .lte('work_date', endDate.toISOString().split('T')[0])
      .order('work_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to get interpretations for month: ${error.message}`);
    }

    return (data || []).map((row) => this.mapInterpretationResultFromDB(row));
  }

  /**
   * Obtener interpretaciones en rango de fechas
   */
  async getInterpretationsRange(
    employeeId: number,
    startDate: Date,
    endDate: Date
  ): Promise<InterpretationResult[]> {
    const { data, error } = await this.client
      .from('attendance_interpretations')
      .select('*')
      .eq('id_empleado', employeeId)
      .gte('work_date', startDate.toISOString().split('T')[0])
      .lte('work_date', endDate.toISOString().split('T')[0])
      .order('work_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to get interpretations: ${error.message}`);
    }

    return (data || []).map((row) => this.mapInterpretationResultFromDB(row));
  }

  /**
   * Eliminar resultado de interpretación
   */
  async deleteInterpretationResult(
    employeeId: number,
    workDate: Date
  ): Promise<void> {
    const dateStr = workDate.toISOString().split('T')[0];

    const { error } = await this.client
      .from('attendance_interpretations')
      .delete()
      .eq('id_empleado', employeeId)
      .eq('work_date', dateStr);

    if (error) {
      throw new Error(`Failed to delete interpretation: ${error.message}`);
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Obtener horario activo de un empleado en una fecha
   */
  async getEmployeeScheduleForDate(
    employeeId: number,
    workDate: Date
  ): Promise<{ idHorario: number; horaEntrada: string | null; horaSalida: string | null } | null> {
    const dayOfWeek = workDate.getDay();

    const { data, error } = await this.client
      .rpc('get_employee_schedule', {
        p_id_empleado: employeeId,
        p_work_date: workDate.toISOString().split('T')[0],
      });

    if (error) {
      if (error.code === 'PGRST116') return null; // No rows
      throw new Error(`Failed to get employee schedule: ${error.message}`);
    }

    if (!data || data.length === 0) return null;

    const row = data[0];
    return {
      idHorario: row.id_horario,
      horaEntrada: row.hora_entrada,
      horaSalida: row.hora_salida,
    };
  }

  // =========================================================================
  // MAPPERS
  // =========================================================================

  private mapPunchEventFromDB(row: any): PunchEvent {
    return {
      id: row.id,
      idEmpleado: row.id_empleado,
      timestamp: row.timestamp,
      direction: row.direction,
      source: row.source,
      metadata: row.metadata,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  private mapBreakPolicyFromDB(row: any): BreakPolicy {
    return {
      id: row.id,
      idHorario: row.id_horario,
      version: row.version,
      mode: row.mode,
      paid: row.paid,
      mandatory: row.mandatory,
      minMinutes: row.min_minutes,
      maxMinutes: row.max_minutes,
      expectedStart: row.expected_start,
      expectedEnd: row.expected_end,
      startTolerance: row.start_tolerance,
      endTolerance: row.end_tolerance,
      allowContinuousShift: row.allow_continuous_shift,
      effectiveFrom: row.effective_from,
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  private mapInterpretationResultFromDB(row: any): InterpretationResult {
    return {
      id: row.id,
      idEmpleado: row.id_empleado,
      workDate: row.work_date,
      idHorario: row.id_horario,
      idPolicy: row.id_policy,
      policyVersion: row.policy_version,
      workSegments: row.work_segments || [],
      breakSegments: row.break_segments || [],
      workedMinutes: row.worked_minutes,
      breakMinutes: row.break_minutes,
      overtimeMinutes: row.overtime_minutes,
      status: row.status,
      anomalies: row.anomalies || [],
      interpretedAt: row.interpreted_at,
      interpretedBy: row.interpreted_by,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
