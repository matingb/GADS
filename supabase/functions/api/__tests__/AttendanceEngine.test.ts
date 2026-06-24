/**
 * Unit Tests para AttendanceEngine
 * 
 * Pruebas para:
 * - Construcción de segmentos
 * - Detección de anomalías (todos los modos)
 * - Cálculos de horas extras
 * - Casos especiales
 */

import { assertEquals, assertExists, assertTrue, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { AttendanceEngine } from './services/AttendanceEngine.ts';
import type { PunchEvent, BreakPolicy, InterpretationResult } from '../../../src/types.ts';

// ============================================================================
// HELPERS
// ============================================================================

function createPunchEvent(
  employeeId: number,
  timestamp: string, // ISO8601
  direction: 'IN' | 'OUT',
  source: 'BIOMETRIC' | 'MANUAL' = 'MANUAL'
): PunchEvent {
  return {
    id: crypto.randomUUID(),
    idEmpleado: employeeId,
    timestamp,
    direction,
    source,
    createdAt: new Date().toISOString(),
  };
}

function createBreakPolicy(overrides: Partial<BreakPolicy> = {}): BreakPolicy {
  return {
    id: crypto.randomUUID(),
    idHorario: 1,
    version: 1,
    mode: 'FIXED',
    paid: false,
    mandatory: true,
    minMinutes: 30,
    maxMinutes: 90,
    expectedStart: '12:00',
    expectedEnd: '13:00',
    startTolerance: 15,
    endTolerance: 15,
    allowContinuousShift: false,
    effectiveFrom: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    ...overrides,
  };
}

// ============================================================================
// TESTS: BUILD SEGMENTS
// ============================================================================

Deno.test('AttendanceEngine - buildSegments: simple IN/OUT pair', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  assertEquals(result.workSegments.length, 1);
  assertEquals(result.workSegments[0].durationMinutes, 9 * 60); // 9 horas
  assertEquals(result.breakSegments.length, 0);
  assertEquals(result.status, 'COMPLETE');
});

Deno.test('AttendanceEngine - buildSegments: multiple work segments with break', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:45:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  assertEquals(result.workSegments.length, 2);
  assertEquals(result.breakSegments.length, 1);

  // Primer segmento de trabajo: 09:00 - 13:00 = 4 horas
  assertEquals(result.workSegments[0].durationMinutes, 4 * 60);

  // Descanso: 13:00 - 13:45 = 45 minutos
  assertEquals(result.breakSegments[0].durationMinutes, 45);

  // Segundo segmento: 13:45 - 18:00 = 4:15 = 255 minutos
  assertEquals(result.workSegments[1].durationMinutes, 4 * 60 + 15);

  // Total trabajado: 8 horas 15 minutos
  assertEquals(result.workedMinutes, 8 * 60 + 15);
});

// ============================================================================
// TESTS: ANOMALIES - FIXED MODE
// ============================================================================

Deno.test('AttendanceEngine - FIXED mode: TARDANZA detection', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Entrada a las 09:20 (20 minutos tarde)
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:20:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:45:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({ startTolerance: 15 });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const tardanzaAnomaly = result.anomalies.find((a) => a.type === 'TARDANZA');
  assertExists(tardanzaAnomaly);
  assertEquals(tardanzaAnomaly?.severity, 'WARNING');
  assertEquals(tardanzaAnomaly?.minutesAffected, 20);
});

Deno.test('AttendanceEngine - FIXED mode: NO tardanza within tolerance', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Entrada a las 09:10 (dentro de tolerancia de 15 minutos)
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:10:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:45:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({ startTolerance: 15 });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const tardanzaAnomaly = result.anomalies.find((a) => a.type === 'TARDANZA');
  assertFalse(tardanzaAnomaly !== undefined);
});

Deno.test('AttendanceEngine - FIXED mode: BREAK_NOT_TAKEN', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Sin descanso
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({ mandatory: true, allowContinuousShift: false });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const breakNotTaken = result.anomalies.find((a) => a.type === 'BREAK_NOT_TAKEN');
  assertExists(breakNotTaken);
  assertEquals(breakNotTaken?.severity, 'WARNING');
});

Deno.test('AttendanceEngine - FIXED mode: NO BREAK_NOT_TAKEN if continuous shift allowed', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Sin descanso pero jornada continua permitida
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({
    mandatory: true,
    allowContinuousShift: true,
  });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const breakNotTaken = result.anomalies.find((a) => a.type === 'BREAK_NOT_TAKEN');
  assertFalse(breakNotTaken !== undefined);
});

Deno.test('AttendanceEngine - FIXED mode: BREAK_TOO_SHORT', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Descanso de solo 20 minutos
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:20:00Z', 'IN'), // Solo 20 min de pausa
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({ minMinutes: 30 });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const breakTooShort = result.anomalies.find((a) => a.type === 'BREAK_TOO_SHORT');
  assertExists(breakTooShort);
  assertEquals(breakTooShort?.severity, 'WARNING');
});

Deno.test('AttendanceEngine - FIXED mode: BREAK_TOO_LONG', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Descanso de 120 minutos (máximo 90)
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T14:40:00Z', 'IN'), // 100 min de pausa
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({ maxMinutes: 90 });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const breakTooLong = result.anomalies.find((a) => a.type === 'BREAK_TOO_LONG');
  assertExists(breakTooLong);
  assertEquals(breakTooLong?.severity, 'INFO');
});

// ============================================================================
// TESTS: ANOMALIES - FLEXIBLE MODE
// ============================================================================

Deno.test('AttendanceEngine - FLEXIBLE mode: valid break within range', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // Descanso de 45 minutos (dentro de 30-60)
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:45:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({
    mode: 'FLEXIBLE',
    minMinutes: 30,
    maxMinutes: 60,
    expectedStart: undefined,
    expectedEnd: undefined,
  });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const breakAnomalies = result.anomalies.filter((a) =>
    a.type.includes('BREAK')
  );
  assertEquals(breakAnomalies.length, 0); // Sin anomalías
});

Deno.test('AttendanceEngine - FLEXIBLE mode: BREAK_NOT_TAKEN mandatory', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({
    mode: 'FLEXIBLE',
    mandatory: true,
    minMinutes: 30,
    maxMinutes: 60,
    expectedStart: undefined,
    expectedEnd: undefined,
  });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const breakNotTaken = result.anomalies.find((a) => a.type === 'BREAK_NOT_TAKEN');
  assertExists(breakNotTaken);
});

// ============================================================================
// TESTS: OVERTIME
// ============================================================================

Deno.test('AttendanceEngine - OVERTIME_50 detection', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // 9 horas de trabajo (1 hora extra a 50%)
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:45:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T19:00:00Z', 'OUT'), // Hasta las 19:00 = 1h extra
  ];

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const overtime50 = result.anomalies.find((a) => a.type === 'OVERTIME_50');
  assertExists(overtime50);
  assertEquals(overtime50?.severity, 'INFO');
});

Deno.test('AttendanceEngine - OVERTIME_100 detection', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // 12 horas de trabajo (4+ horas extra a 100%)
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T13:00:00Z', 'OUT'),
    createPunchEvent(1, '2026-06-23T13:45:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T22:00:00Z', 'OUT'), // 4h 15min extra
  ];

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  const overtime100 = result.anomalies.find((a) => a.type === 'OVERTIME_100');
  assertExists(overtime100);
});

// ============================================================================
// TESTS: NO PUNCHES
// ============================================================================

Deno.test('AttendanceEngine - NO_PUNCHES status and AUSENCIA anomaly', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  const events: PunchEvent[] = []; // Sin eventos

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  assertEquals(result.status, 'NO_PUNCHES');

  const ausencia = result.anomalies.find((a) => a.type === 'AUSENCIA');
  assertExists(ausencia);
  assertEquals(ausencia?.severity, 'ERROR');
});

// ============================================================================
// TESTS: EDGE CASES
// ============================================================================

Deno.test('AttendanceEngine - NONE mode without breaks is OK', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy({
    mode: 'NONE',
  });

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  assertEquals(result.status, 'COMPLETE');
  // En NONE mode, jornada continua es lo normal
});

Deno.test('AttendanceEngine - calculate expected minutes correctly', () => {
  const engine = new AttendanceEngine();
  const workDate = new Date('2026-06-23');

  // 9 horas: 09:00 a 18:00 = 9 horas
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  assertEquals(result.workedMinutes, 9 * 60);
  assertEquals(result.breakMinutes, 0);
});

Deno.test('AttendanceEngine - respects timezone for date filtering', () => {
  const engine = new AttendanceEngine();
  // Fecha específica
  const workDate = new Date('2026-06-23');

  // Eventos en UTC que corresponden al 23-06
  const events: PunchEvent[] = [
    createPunchEvent(1, '2026-06-23T09:00:00Z', 'IN'),
    createPunchEvent(1, '2026-06-23T18:00:00Z', 'OUT'),
  ];

  const policy = createBreakPolicy();

  const result = engine.interpret(events, policy, '09:00', '18:00', workDate);

  assertEquals(result.workDate, '2026-06-23');
  assertEquals(result.workSegments.length, 1);
});
