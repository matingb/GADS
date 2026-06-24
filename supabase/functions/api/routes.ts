/**
 * API Routes - Event-Driven Attendance System
 * 
 * Endpoints:
 * POST   /api/punch                      - Record punch event
 * GET    /api/attendance/:id/:date       - Get day interpretation
 * GET    /api/attendance/:id?month=...   - Get month interpretations
 * PUT    /api/break-policies/:id         - Update break policy
 */

import { AttendanceUseCases } from './usecases/index.ts';
import {
  RecordPunchRequest,
  CreateBreakPolicyRequest,
  RecordPunchResponseDTO,
  GetDayInterpretationResponseDTO,
  GetMonthInterpretationsResponseDTO,
  UpdateBreakPolicyResponseDTO,
  ErrorResponseDTO,
  mapPunchEventToDTO,
  mapBreakPolicyToDTO,
  mapInterpretationResultToDTO,
} from './dtos/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const useCases = new AttendanceUseCases(SUPABASE_URL, SUPABASE_KEY);

/**
 * Error handler helper
 */
function errorResponse(
  error: unknown,
  statusCode: number = 500
): { body: ErrorResponseDTO; status: number } {
  const message = error instanceof Error ? error.message : String(error);

  return {
    body: {
      error: message,
      timestamp: new Date().toISOString(),
    },
    status: statusCode,
  };
}

/**
 * POST /api/punch
 * 
 * Record a punch event (IN or OUT) and generate day interpretation
 */
export async function recordPunch(req: Request): Promise<Response> {
  try {
    // Validar método
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405 }
      );
    }

    // Parsear body
    const body = await req.json() as RecordPunchRequest;

    // Validar entrada
    if (!body.idEmpleado || !body.timestamp || !body.direction) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          details: { required: ['idEmpleado', 'timestamp', 'direction'] },
        }),
        { status: 400 }
      );
    }

    if (!['IN', 'OUT'].includes(body.direction)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid direction',
          details: { valid: ['IN', 'OUT'] },
        }),
        { status: 400 }
      );
    }

    // Obtener user ID del token (simplificado)
    const userId = 'system'; // En producción, extraer del JWT

    // Ejecutar use case
    const result = await useCases.recordDailyPunch(
      body.idEmpleado,
      body.timestamp,
      body.direction,
      body.source || 'MANUAL',
      userId,
      body.metadata
    );

    // Responder
    const response: RecordPunchResponseDTO = {
      event: mapPunchEventToDTO(result.event),
      dayInterpretation: mapInterpretationResultToDTO(result.interpretation),
      warnings: result.warnings,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = errorResponse(error, 400);
    return new Response(JSON.stringify(err.body), { status: err.status });
  }
}

/**
 * GET /api/attendance/:id/:date
 * 
 * Get full day interpretation with events and policy
 * 
 * Query params:
 * - date: YYYY-MM-DD (required)
 */
export async function getDayInterpretation(req: Request): Promise<Response> {
  try {
    // Parsear URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const employeeId = parseInt(pathParts[pathParts.length - 2]);
    const dateStr = pathParts[pathParts.length - 1];

    // Validar
    if (isNaN(employeeId) || !dateStr) {
      return new Response(
        JSON.stringify({ error: 'Invalid employee ID or date' }),
        { status: 400 }
      );
    }

    // Parsear fecha
    const workDate = new Date(dateStr);
    if (isNaN(workDate.getTime())) {
      return new Response(
        JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD' }),
        { status: 400 }
      );
    }

    // Ejecutar use case
    const result = await useCases.getDayInterpretation(employeeId, workDate);

    // Responder
    const response: GetDayInterpretationResponseDTO = {
      interpretation: result.interpretation
        ? mapInterpretationResultToDTO(result.interpretation)
        : null!,
      policy: result.policy ? mapBreakPolicyToDTO(result.policy) : null!,
      punchEvents: result.punchEvents.map(mapPunchEventToDTO),
      schedule: result.schedule || undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = errorResponse(error, 400);
    return new Response(JSON.stringify(err.body), { status: err.status });
  }
}

/**
 * GET /api/attendance/:id?month=YYYY-MM
 * 
 * Get month interpretations with summary
 * 
 * Query params:
 * - month: YYYY-MM (required)
 */
export async function getMonthInterpretations(req: Request): Promise<Response> {
  try {
    // Parsear URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const employeeId = parseInt(pathParts[pathParts.length - 1]);
    const month = url.searchParams.get('month');

    // Validar
    if (isNaN(employeeId) || !month) {
      return new Response(
        JSON.stringify({ error: 'Missing employee ID or month parameter' }),
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return new Response(
        JSON.stringify({ error: 'Invalid month format. Use YYYY-MM' }),
        { status: 400 }
      );
    }

    // Ejecutar use case
    const result = await useCases.getMonthInterpretations(employeeId, month);

    // Responder
    const response: GetMonthInterpretationsResponseDTO = {
      interpretations: result.interpretations.map(mapInterpretationResultToDTO),
      summary: result.summary,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = errorResponse(error, 400);
    return new Response(JSON.stringify(err.body), { status: err.status });
  }
}

/**
 * PUT /api/break-policies/:scheduleId
 * 
 * Update break policy and optionally reprocess historical data
 * 
 * Query params:
 * - reprocessFrom: YYYY-MM-DD (optional, defaults to 30 days ago)
 */
export async function updateBreakPolicy(req: Request): Promise<Response> {
  try {
    // Validar método
    if (req.method !== 'PUT') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405 }
      );
    }

    // Parsear URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const scheduleId = parseInt(pathParts[pathParts.length - 1]);
    const reprocessFromStr = url.searchParams.get('reprocessFrom');

    // Validar
    if (isNaN(scheduleId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid schedule ID' }),
        { status: 400 }
      );
    }

    // Parsear body
    const body = await req.json() as CreateBreakPolicyRequest;

    // Validar entrada
    if (!body.mode) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: mode' }),
        { status: 400 }
      );
    }

    // Obtener user ID del token
    const userId = 'system';

    // Parsear fecha de reprocessing
    let reprocessFromDate: Date | undefined = undefined;
    if (reprocessFromStr) {
      reprocessFromDate = new Date(reprocessFromStr);
      if (isNaN(reprocessFromDate.getTime())) {
        return new Response(
          JSON.stringify({
            error: 'Invalid reprocessFrom date. Use YYYY-MM-DD',
          }),
          { status: 400 }
        );
      }
    }

    // Ejecutar use case
    const result = await useCases.updatePolicyAndReprocess(
      scheduleId,
      body,
      userId,
      reprocessFromDate
    );

    // Responder
    const response: UpdateBreakPolicyResponseDTO = {
      policy: mapBreakPolicyToDTO(result.policy),
      reprocessingQueued: result.reprocessedDays > 0,
      affectedDays: result.reprocessedDays,
      affectedEmployees: result.affectedEmployees,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = errorResponse(error, 400);
    return new Response(JSON.stringify(err.body), { status: err.status });
  }
}
/**
 * GET /api/punch
 * 
 * Get all punch events
 */
export async function getPunches(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const empleadoId = url.searchParams.get("empleadoId");
    
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    let query = supabase
      .from("punch_events")
      .select("id,id_empleado,timestamp,direction,source,empleados(nombre_completo,legajo)")
      .order("timestamp", { ascending: false });

    if (empleadoId) {
      query = query.eq("id_empleado", Number(empleadoId));
    }

    const { data, error } = await query;
    if (error) throw error;

    const mapped = (data ?? []).map((f: any) => {
      const empleado = Array.isArray(f.empleados) ? f.empleados[0] : f.empleados;
      return {
        id: f.id,
        empleadoId: f.id_empleado,
        empleadoNombre: empleado?.nombre_completo ?? "Desconocido",
        empleadoLegajo: empleado?.legajo ?? "N/A",
        timestamp: f.timestamp,
        direction: f.direction,
        source: f.source,
      };
    });

    return new Response(JSON.stringify(mapped), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = errorResponse(error, 500);
    return new Response(JSON.stringify(err.body), { status: err.status });
  }
}

/**
 * Router
 */
export async function handleRequest(req: Request, cleanPath: string): Promise<Response> {
  const url = new URL(req.url);

  // POST /punch
  if (req.method === 'POST' && cleanPath === '/punch') {
    return recordPunch(req);
  }

  // GET /punch
  if (req.method === 'GET' && cleanPath === '/punch') {
    return getPunches(req);
  }

  // GET /attendance/:id/:date
  if (req.method === 'GET' && cleanPath.match(/^\/attendance\/\d+\/\d{4}-\d{2}-\d{2}$/)) {
    return getDayInterpretation(req);
  }

  // GET /attendance/:id?month=YYYY-MM
  if (req.method === 'GET' && cleanPath.match(/^\/attendance\/\d+$/) && url.searchParams.has('month')) {
    return getMonthInterpretations(req);
  }

  // PUT /break-policies/:scheduleId
  if (req.method === 'PUT' && cleanPath.match(/^\/break-policies\/\d+$/)) {
    return updateBreakPolicy(req);
  }

  // 404
  return new Response(
    JSON.stringify({ error: 'Not found in attendance routes' }),
    { status: 404 }
  );
}

// Export handler for Supabase Functions
export default handleRequest;
