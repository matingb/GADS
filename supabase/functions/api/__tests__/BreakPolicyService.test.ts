/**
 * Unit Tests para BreakPolicyService
 * 
 * Pruebas para:
 * - Validación de políticas
 * - Formato de tiempo
 * - Business rules
 */

import { assertEquals, assertExists, assertTrue, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { BreakPolicyService, type BreakPolicyInput } from './services/BreakPolicyService.ts';

// Mock repository para tests
class MockAttendanceRepository {
  async getBreakPolicy() {
    return null;
  }

  async createBreakPolicy(scheduleId: number, policy: any) {
    return { id: crypto.randomUUID(), idHorario: scheduleId, ...policy };
  }

  async updateBreakPolicy(policyId: string, updates: any) {
    return { id: policyId, ...updates };
  }
}

// ============================================================================
// TESTS: VALIDATION
// ============================================================================

Deno.test('BreakPolicyService - validate FIXED mode requires times', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FIXED',
    paid: false,
    mandatory: true,
    minMinutes: 30,
    maxMinutes: 90,
    allowContinuousShift: false,
    // Missing expectedStart and expectedEnd
  };

  const errors = service.validatePolicy(input);

  assertEquals(errors.length, 2); // Dos campos faltando
  assertExists(errors.find((e) => e.field === 'expectedStart'));
  assertExists(errors.find((e) => e.field === 'expectedEnd'));
});

Deno.test('BreakPolicyService - validate min/max minutes order', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FLEXIBLE',
    paid: false,
    mandatory: true,
    minMinutes: 90, // Invertido
    maxMinutes: 30,
    allowContinuousShift: false,
  };

  const errors = service.validatePolicy(input);

  assertExists(errors.find((e) => e.field === 'minMinutes' && e.message.includes('must be <=')));
});

Deno.test('BreakPolicyService - validate time format HH:mm', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const inputs = [
    { time: '12:00', valid: true },
    { time: '09:15', valid: true },
    { time: '23:59', valid: true },
    { time: '24:00', valid: false },
    { time: '12:60', valid: false },
    { time: '9:00', valid: false }, // Debe ser HH:mm
    { time: '12-00', valid: false },
    { time: 'noon', valid: false },
  ];

  const repo2 = new MockAttendanceRepository() as any;
  const service2 = new BreakPolicyService(repo2);

  for (const testCase of inputs) {
    const input: BreakPolicyInput = {
      mode: 'FIXED',
      paid: false,
      mandatory: true,
      minMinutes: 30,
      maxMinutes: 90,
      expectedStart: testCase.time,
      expectedEnd: '13:00',
      allowContinuousShift: false,
    };

    const errors = service2.validatePolicy(input);

    if (testCase.valid) {
      const hasTimeError = errors.some(
        (e) => e.field === 'expectedStart' && e.message.includes('Invalid time')
      );
      assertFalse(hasTimeError, `Time ${testCase.time} should be valid`);
    } else {
      const hasTimeError = errors.some(
        (e) => e.field === 'expectedStart' && e.message.includes('Invalid time')
      );
      assertTrue(hasTimeError, `Time ${testCase.time} should be invalid`);
    }
  }
});

Deno.test('BreakPolicyService - validate FLEXIBLE mode no times', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FLEXIBLE',
    paid: false,
    mandatory: true,
    minMinutes: 30,
    maxMinutes: 90,
    expectedStart: '12:00', // Shouldn't be set for FLEXIBLE
    expectedEnd: '13:00',   // Shouldn't be set for FLEXIBLE
    allowContinuousShift: false,
  };

  const errors = service.validatePolicy(input);

  assertExists(errors.find((e) => e.field === 'expectedStart'));
  assertExists(errors.find((e) => e.field === 'expectedEnd'));
});

Deno.test('BreakPolicyService - validate start time < end time', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FIXED',
    paid: false,
    mandatory: true,
    minMinutes: 30,
    maxMinutes: 90,
    expectedStart: '14:00',
    expectedEnd: '12:00', // Invertido
    allowContinuousShift: false,
  };

  const errors = service.validatePolicy(input);

  assertExists(errors.find((e) => e.field === 'expectedStart' && e.message.includes('must be before')));
});

Deno.test('BreakPolicyService - validate negative tolerances', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FLEXIBLE',
    paid: false,
    mandatory: true,
    minMinutes: 30,
    maxMinutes: 90,
    startTolerance: -5, // Inválido
    endTolerance: -10,  // Inválido
    allowContinuousShift: false,
  };

  const errors = service.validatePolicy(input);

  assertExists(errors.find((e) => e.field === 'startTolerance'));
  assertExists(errors.find((e) => e.field === 'endTolerance'));
});

Deno.test('BreakPolicyService - validate required fields', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input = {} as BreakPolicyInput;

  const errors = service.validatePolicy(input);

  // Debe tener errores para campos requeridos
  assertTrue(errors.length > 0);
  assertExists(errors.find((e) => e.field === 'mode'));
});

Deno.test('BreakPolicyService - validate negative minutes', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FLEXIBLE',
    paid: false,
    mandatory: true,
    minMinutes: -30, // Inválido
    maxMinutes: -90,  // Inválido
    allowContinuousShift: false,
  };

  const errors = service.validatePolicy(input);

  assertExists(errors.find((e) => e.field === 'minMinutes' && e.message.includes('>=')));
  assertExists(errors.find((e) => e.field === 'maxMinutes' && e.message.includes('>=')));
});

// ============================================================================
// TESTS: VALID POLICIES
// ============================================================================

Deno.test('BreakPolicyService - validate valid FIXED policy', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
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
  };

  const errors = service.validatePolicy(input);

  assertEquals(errors.length, 0);
});

Deno.test('BreakPolicyService - validate valid FLEXIBLE policy', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'FLEXIBLE',
    paid: true,
    mandatory: false,
    minMinutes: 15,
    maxMinutes: 120,
    allowContinuousShift: true,
  };

  const errors = service.validatePolicy(input);

  assertEquals(errors.length, 0);
});

Deno.test('BreakPolicyService - validate valid NONE policy', () => {
  const repo = new MockAttendanceRepository() as any;
  const service = new BreakPolicyService(repo);

  const input: BreakPolicyInput = {
    mode: 'NONE',
    paid: false,
    mandatory: false,
    minMinutes: 0,
    maxMinutes: 0,
    allowContinuousShift: true,
  };

  const errors = service.validatePolicy(input);

  assertEquals(errors.length, 0);
});
