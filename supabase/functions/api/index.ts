import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type RolUsuario = "ADMIN" | "EMPLEADO" | "CONTADOR";

type AuthContext = {
  userId: string;
  rol: RolUsuario;
  nombre: string;
  activo: boolean;
  idEmpleado?: number;
  legajo?: string;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUSINESS_TIME_ZONE = Deno.env.get("BUSINESS_TIME_ZONE") ?? "America/Argentina/Buenos_Aires";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required Supabase env vars in Edge Function.");
}

import handleAttendanceRequest from "./routes.ts";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Garantiza headers CORS en CUALQUIER respuesta, incluidas las que devuelven
 * handlers importados (routes.ts). En el runtime de Supabase, los headers CORS
 * solo se emiten de forma fiable cuando el Response final se construye en el
 * modulo del Deno.serve, por eso reconstruimos la respuesta aqui.
 */
function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function nonNegativeInteger(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} debe ser un entero no negativo.`);
  }
  return n;
}

function routeFromUrl(req: Request): { path: string; search: URLSearchParams } {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const apiIdx = parts.lastIndexOf("api");
  const routeParts = apiIdx >= 0 ? parts.slice(apiIdx + 1) : parts;
  const path = `/${routeParts.join("/")}`.replace(/\/+$/, "") || "/";
  return { path, search: url.searchParams };
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return (body ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function resolveAuth(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) return null;

  const { data: perfil, error: perfilError } = await adminClient
    .from("perfiles")
    .select("user_id,rol,nombre,activo")
    .eq("user_id", user.id)
    .maybeSingle();

  if (perfilError || !perfil) return null;

  const { data: empleado } = await adminClient
    .from("empleados")
    .select("id_empleado,legajo")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    rol: perfil.rol,
    nombre: perfil.nombre,
    activo: perfil.activo,
    idEmpleado: empleado?.id_empleado,
    legajo: empleado?.legajo,
  };
}

function ensureRole(auth: AuthContext, allowed: RolUsuario[]): Response | null {
  if (!allowed.includes(auth.rol)) {
    return error("No autorizado.", 403);
  }
  return null;
}

function parseNovedadId(id: string): { kind: "calc" | "apr"; numericId: number } | null {
  if (id.startsWith("calc_")) return { kind: "calc", numericId: Number(id.slice(5)) };
  if (id.startsWith("apr_")) return { kind: "apr", numericId: Number(id.slice(4)) };
  return null;
}

function currentPeriodo(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatAntiguedad(fechaIngreso: string): string {
  const inicio = new Date(`${fechaIngreso}T00:00:00`);
  const hoy = new Date();
  let anios = hoy.getFullYear() - inicio.getFullYear();
  let meses = hoy.getMonth() - inicio.getMonth();

  if (hoy.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }

  const partes: string[] = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? "ano" : "anos"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
  return partes.length > 0 ? partes.join(", ") : "Menos de 1 mes";
}

function localTimestampParts(timestamp: string): { fecha: string; diaSemana: number; minutosDia: number } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("Timestamp invalido.");

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const fecha = `${parts.year}-${parts.month}-${parts.day}`;
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return {
    fecha,
    diaSemana: jsDay === 0 ? 7 : jsDay,
    minutosDia: hour * 60 + minute,
  };
}

function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

async function getHorarios(): Promise<Response> {
  const { data, error: dbError } = await adminClient
    .from("horarios")
    .select("id_horario,nombre_turno,es_rotativo,tolerancia_entrada_min,tolerancia_salida_min,minutos_descanso,umbral_horas_extra_min")
    .order("id_horario");
  if (dbError) return error("No se pudieron cargar los horarios.", 500);

  const ids = (data ?? []).map((h) => h.id_horario);
  const { data: detalles, error: detallesError } = ids.length
    ? await adminClient
      .from("horario_detalles")
      .select("id_detalle,id_horario,numero_semana,dia_semana,hora_entrada,hora_salida,es_descanso")
      .in("id_horario", ids)
      .order("dia_semana", { ascending: true })
    : { data: [], error: null };

  if (detallesError) return error("No se pudieron cargar los detalles de horarios.", 500);

  const detallesByHorario = new Map<number, JsonValue[]>();
  for (const detalle of detalles ?? []) {
    const rows = detallesByHorario.get(detalle.id_horario) ?? [];
    rows.push({
      id: detalle.id_detalle,
      idHorario: detalle.id_horario,
      numeroSemana: detalle.numero_semana,
      diaSemana: detalle.dia_semana,
      horaEntrada: detalle.hora_entrada,
      horaSalida: detalle.hora_salida,
      esDescanso: detalle.es_descanso,
    });
    detallesByHorario.set(detalle.id_horario, rows);
  }

  return json(
    (data ?? []).map((h) => ({
      id: h.id_horario,
      nombre: h.nombre_turno,
      nombreTurno: h.nombre_turno,
      esRotativo: h.es_rotativo,
      toleranciaEntradaMin: h.tolerancia_entrada_min,
      toleranciaSalidaMin: h.tolerancia_salida_min,
      minutosDescanso: h.minutos_descanso,
      umbralHorasExtraMin: h.umbral_horas_extra_min,
      detalles: detallesByHorario.get(h.id_horario) ?? [],
    })),
  );
}

async function createHorario(req: Request): Promise<Response> {
  const body = await parseBody(req);
  const nombre = String(body.nombre ?? "").trim();
  const detalles = Array.isArray(body.detalles) ? body.detalles : [];

  if (!nombre) return error("El nombre del horario es obligatorio.", 400);
  if (detalles.length !== 7) return error("El horario debe incluir los 7 dias de la semana.", 400);

  let detallesNormalizados: { diaSemana: number; esDescanso: boolean; horaEntrada: string | null; horaSalida: string | null }[];
  try {
    detallesNormalizados = detalles.map((detalle) => {
      const row = detalle as Record<string, unknown>;
      const diaSemana = Number(row.diaSemana);
      const esDescanso = Boolean(row.esDescanso);
      const horaEntrada = row.horaEntrada ? String(row.horaEntrada) : null;
      const horaSalida = row.horaSalida ? String(row.horaSalida) : null;

      if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) {
        throw new Error("Dia de semana invalido.");
      }
      if (!esDescanso && (!horaEntrada || !horaSalida)) {
        throw new Error("Los dias trabajados requieren hora de entrada y salida.");
      }

      return {
        diaSemana,
        esDescanso,
        horaEntrada: esDescanso ? null : horaEntrada,
        horaSalida: esDescanso ? null : horaSalida,
      };
    });
  } catch (err) {
    return error((err as Error).message, 400);
  }

  if (!detallesNormalizados.some((detalle) => !detalle.esDescanso)) {
    return error("Debe existir al menos un dia trabajado.", 400);
  }

  let payload;
  try {
    payload = {
      p_nombre: nombre,
      p_tolerancia_entrada_min: nonNegativeInteger(body.toleranciaEntradaMin ?? 15, "toleranciaEntradaMin"),
      p_tolerancia_salida_min: nonNegativeInteger(body.toleranciaSalidaMin ?? 0, "toleranciaSalidaMin"),
      p_minutos_descanso: nonNegativeInteger(body.minutosDescanso ?? 60, "minutosDescanso"),
      p_umbral_horas_extra_min: nonNegativeInteger(body.umbralHorasExtraMin ?? 30, "umbralHorasExtraMin"),
      p_detalles: detallesNormalizados,
    };
  } catch (err) {
    return error((err as Error).message, 400);
  }

  const { data, error: dbError } = await adminClient.rpc("rpc_create_horario", payload);
  if (dbError) return error(dbError.message || "No se pudo crear el horario.", 400);

  const row = Array.isArray(data) ? data[0] : null;
  return json({ id: row?.id, nombre: row?.nombre ?? nombre }, 201);
}

async function deleteHorario(id: number): Promise<Response> {
  const { data: horario, error: horarioError } = await adminClient
    .from("horarios")
    .select("id_horario")
    .eq("id_horario", id)
    .maybeSingle();

  if (horarioError) return error("Error buscando horario.", 500);
  if (!horario) return error("Horario no encontrado.", 404);

  await adminClient.from("asignaciones_horario").delete().eq("id_horario", id);

  const { error: dbError } = await adminClient.from("horarios").delete().eq("id_horario", id);
  if (dbError) return error(dbError.message || "No se pudo eliminar el horario.", 400);

  return json({ ok: true });
}

async function getEmpleados(): Promise<Response> {
  const { data: emps, error: empsError } = await adminClient
    .from("empleados")
    .select("id_empleado,legajo,nombre_completo,cuil,modalidad_fichada,estado")
    .order("id_empleado");

  if (empsError) return error("No se pudieron cargar los empleados.", 500);

  const { data: asigs, error: asigError } = await adminClient
    .from("asignaciones_horario")
    .select("id_empleado,id_horario,horarios(id_horario,nombre_turno)")
    .is("fecha_hasta", null);

  if (asigError) return error("No se pudieron cargar las asignaciones de horario.", 500);

  const asigByEmpleado = new Map<number, { id_horario: number; horarios?: { nombre_turno: string } }>();
  for (const a of asigs ?? []) {
    asigByEmpleado.set(a.id_empleado, { id_horario: a.id_horario, horarios: Array.isArray(a.horarios) ? a.horarios[0] : a.horarios });
  }

  const payload = (emps ?? []).map((emp) => {
    const asig = asigByEmpleado.get(emp.id_empleado);
    return {
      id: emp.id_empleado,
      legajo: emp.legajo,
      nombre: emp.nombre_completo,
      cuil: emp.cuil,
      categoriaLaboral: emp.modalidad_fichada,
      estado: emp.estado,
      horarioId: asig?.id_horario ?? null,
      horarioNombre: asig?.horarios?.nombre_turno ?? "Sin asignar",
    };
  });

  return json(payload);
}

async function getEmpleadoById(id: number, search: URLSearchParams): Promise<Response> {
  const periodo = search.get("periodo") || currentPeriodo();
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return error("Periodo invalido. Formato esperado YYYY-MM.", 400);
  }

  const { data: detalle, error: detalleError } = await adminClient
    .from("v_empleado_detalle_mensual")
    .select("*")
    .eq("id_empleado", id)
    .eq("periodo", periodo)
    .maybeSingle();

  if (detalleError) return error("Error cargando detalle del empleado.", 500);

  if (detalle) {
    return json({
      id: detalle.id_empleado,
      nombre: detalle.nombre_completo,
      legajo: detalle.legajo,
      cuil: detalle.cuil,
      categoria: detalle.modalidad_fichada,
      estado: detalle.estado,
      fechaIngreso: detalle.fecha_ingreso,
      horarioNombre: detalle.horario_nombre,
      antiguedad: formatAntiguedad(detalle.fecha_ingreso),
      stats: detalle.stats,
      fichadas: detalle.fichadas,
      licencias: detalle.licencias,
      novedades: detalle.novedades,
      chartData: detalle.chart_data,
    } as JsonValue);
  }

  const { data: emp, error: empError } = await adminClient
    .from("empleados")
    .select("id_empleado,nombre_completo,legajo,cuil,modalidad_fichada,estado,fecha_ingreso")
    .eq("id_empleado", id)
    .maybeSingle();

  if (empError) return error("Error cargando empleado.", 500);
  if (!emp) return error("Empleado no encontrado", 404);

  const { data: asig } = await adminClient
    .from("asignaciones_horario")
    .select("id_horario,horarios(nombre_turno)")
    .eq("id_empleado", id)
    .is("fecha_hasta", null)
    .maybeSingle();

  const horario = asig && Array.isArray(asig.horarios) ? asig.horarios[0] : asig?.horarios;

  return json({
    id: emp.id_empleado,
    nombre: emp.nombre_completo,
    legajo: emp.legajo,
    cuil: emp.cuil,
    categoria: emp.modalidad_fichada,
    estado: emp.estado,
    fechaIngreso: emp.fecha_ingreso,
    antiguedad: formatAntiguedad(emp.fecha_ingreso),
    horarioNombre: horario?.nombre_turno ?? "Sin asignar",
    stats: {
      asistencias: 0,
      inasistencias: 0,
      llegadasTarde: 0,
      horasExtras: 0,
      tendencias: {
        asistencias: 0,
        inasistencias: 0,
        llegadasTarde: 0,
        horasExtras: 0,
      },
    },
    fichadas: [],
    licencias: [],
    novedades: [],
    chartData: [],
  });
}

async function createEmpleado(req: Request): Promise<Response> {
  const body = await parseBody(req);
  const legajo = String(body.legajo ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  const cuil = String(body.cuil ?? "").trim();
  const categoriaLaboral = String(body.categoriaLaboral ?? "MANUAL").trim();
  const estado = String(body.estado ?? "ACTIVO").trim();
  const horarioId = body.horarioId ? Number(body.horarioId) : null;

  if (!legajo || !nombre || !cuil) {
    return error("Faltan datos obligatorios (legajo, nombre, cuil).", 400);
  }

  const { data, error: dbError } = await adminClient.rpc("rpc_create_empleado", {
    p_legajo: legajo,
    p_nombre: nombre,
    p_cuil: cuil,
    p_categoria_laboral: categoriaLaboral,
    p_estado: estado,
    p_horario_id: horarioId,
  });

  if (dbError) {
    if ((dbError.message ?? "").toLowerCase().includes("duplicate")) {
      return error("Ya existe un empleado con ese legajo o CUIL.", 409);
    }
    return error(dbError.message || "Error al crear empleado.", 400);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return json({ id: row?.id, nombre: row?.nombre ?? nombre }, 201);
}

async function deleteEmpleado(id: number): Promise<Response> {
  const { data: emp, error: empError } = await adminClient
    .from("empleados")
    .select("id_empleado")
    .eq("id_empleado", id)
    .maybeSingle();

  if (empError) return error("Error buscando empleado.", 500);
  if (!emp) return error("Empleado no encontrado.", 404);

  await adminClient.from("novedades_calculadas").delete().eq("id_empleado", id);
  await adminClient.from("novedades_aprobadas").delete().eq("id_empleado", id);
  await adminClient.from("fichadas").delete().eq("id_empleado", id);
  await adminClient.from("asignaciones_horario").delete().eq("id_empleado", id);

  const { error: dbError } = await adminClient.from("empleados").delete().eq("id_empleado", id);
  if (dbError) return error(dbError.message || "No se pudo eliminar el empleado.", 400);

  return json({ ok: true });
}

async function getFichadas(auth: AuthContext, search: URLSearchParams): Promise<Response> {
  const empleadoId = search.get("empleadoId");
  const from = search.get("from");
  const to = search.get("to");

  let query = adminClient
    .from("fichadas")
    .select("id_fichada,id_empleado,timestamp,tipo,origen,empleados(nombre_completo,legajo)")
    .order("timestamp", { ascending: false });

  if (empleadoId) query = query.eq("id_empleado", Number(empleadoId));
  if (from) query = query.gte("timestamp", from);
  if (to) query = query.lte("timestamp", to);

  const { data, error: dbError } = await query;
  if (dbError) return error("No se pudieron cargar las fichadas.", 500);

  const mapped = (data ?? []).map((f) => {
    const empleado = Array.isArray(f.empleados) ? f.empleados[0] : f.empleados;
    return {
      id: f.id_fichada,
      empleadoId: f.id_empleado,
      empleadoNombre: empleado?.nombre_completo ?? "Desconocido",
      empleadoLegajo: empleado?.legajo ?? "N/A",
      timestamp: f.timestamp,
      tipo: f.tipo,
      origen: f.origen,
    };
  });

  if (auth.rol === "EMPLEADO") {
    if (!auth.idEmpleado) return json([]);
    return json(mapped.filter((f) => f.empleadoId === auth.idEmpleado));
  }

  return json(mapped);
}

async function borrarTardanzaPendiente(empId: number, fecha: string, idTipoTardanza: number): Promise<void> {
  await adminClient
    .from("novedades_calculadas")
    .delete()
    .eq("id_empleado", empId)
    .eq("id_tipo", idTipoTardanza)
    .eq("fecha", fecha)
    .eq("estado", "PENDIENTE");
}

async function procesarTardanzaPorEntrada(empId: number, timestamp: string): Promise<void> {
  const partes = localTimestampParts(timestamp);

  const { data: tipoTardanza, error: tipoError } = await adminClient
    .from("tipos_novedad_calculada")
    .select("id_tipo")
    .eq("codigo", "TARDANZA")
    .maybeSingle();

  if (tipoError || !tipoTardanza) return;

  const { data: asignacion } = await adminClient
    .from("asignaciones_horario")
    .select("id_horario,horarios(tolerancia_entrada_min)")
    .eq("id_empleado", empId)
    .is("fecha_hasta", null)
    .maybeSingle();

  if (!asignacion?.id_horario) return;

  const horario = asignacion.horarios && Array.isArray(asignacion.horarios) ? asignacion.horarios[0] : asignacion.horarios;
  const toleranciaEntradaMin = Number(horario?.tolerancia_entrada_min ?? 0);

  const { data: detalle } = await adminClient
    .from("horario_detalles")
    .select("hora_entrada,es_descanso")
    .eq("id_horario", asignacion.id_horario)
    .eq("numero_semana", 1)
    .eq("dia_semana", partes.diaSemana)
    .maybeSingle();

  if (!detalle || detalle.es_descanso) return;

  const horaEntradaMin = timeToMinutes(detalle.hora_entrada);
  if (horaEntradaMin === null) return;

  const minutosTarde = Math.floor(partes.minutosDia - (horaEntradaMin + toleranciaEntradaMin));

  const { data: existentes } = await adminClient
    .from("novedades_calculadas")
    .select("id_novedad_calc,estado")
    .eq("id_empleado", empId)
    .eq("id_tipo", tipoTardanza.id_tipo)
    .eq("fecha", partes.fecha)
    .order("id_novedad_calc", { ascending: true });

  const bloqueada = (existentes ?? []).some((n) => n.estado === "APROBADA" || n.estado === "RECHAZADA");
  if (bloqueada) return;

  const pendientes = (existentes ?? []).filter((n) => n.estado === "PENDIENTE");

  if (minutosTarde <= 0) {
    await borrarTardanzaPendiente(empId, partes.fecha, tipoTardanza.id_tipo);
    return;
  }

  if (pendientes.length > 0) {
    const principal = pendientes[0];
    await adminClient
      .from("novedades_calculadas")
      .update({ cantidad_minutos: minutosTarde })
      .eq("id_novedad_calc", principal.id_novedad_calc);

    const duplicadas = pendientes.slice(1).map((n) => n.id_novedad_calc);
    if (duplicadas.length > 0) {
      await adminClient.from("novedades_calculadas").delete().in("id_novedad_calc", duplicadas);
    }
    return;
  }

  await adminClient.from("novedades_calculadas").insert({
    id_empleado: empId,
    id_tipo: tipoTardanza.id_tipo,
    fecha: partes.fecha,
    cantidad_minutos: minutosTarde,
    estado: "PENDIENTE",
  });
}

async function postFichada(req: Request, auth: AuthContext): Promise<Response> {
  const body = await parseBody(req);
  const tipo = String(body.tipo ?? "");
  const origen = String(body.origen ?? "");
  const timestamp = body.timestamp ? String(body.timestamp) : new Date().toISOString();
  const legajo = body.legajo ? String(body.legajo).trim() : null;
  const empleadoId = body.empleadoId ? Number(body.empleadoId) : null;
  const registradoPorId = body.registradoPorId ? String(body.registradoPorId) : auth.userId;

  let empId = empleadoId;
  if (legajo) {
    const { data: emp, error: empError } = await adminClient
      .from("empleados")
      .select("id_empleado")
      .eq("legajo", legajo)
      .maybeSingle();
    if (empError || !emp) return error("Empleado no encontrado con ese legajo.", 404);
    empId = emp.id_empleado;
  }

  if (!empId || !tipo || !origen) {
    return error("Faltan datos obligatorios (empleado, tipo, origen).", 400);
  }

  if (auth.rol === "EMPLEADO" && auth.idEmpleado && auth.idEmpleado !== empId) {
    return error("No autorizado para registrar fichadas de otro empleado.", 403);
  }

  if (tipo !== "ENTRADA" && tipo !== "SALIDA") {
    return error("Tipo de fichada invalido.", 400);
  }

  const { data, error: dbError } = await adminClient
    .from("fichadas")
    .insert({
      id_empleado: empId,
      timestamp,
      tipo,
      origen,
      id_usuario_carga: registradoPorId,
    })
    .select("id_fichada,id_empleado,timestamp,tipo,origen,empleados(nombre_completo,legajo)")
    .single();

  if (dbError) return error("No se pudo registrar la fichada.", 400);

  if (tipo === "ENTRADA") {
    try {
      await procesarTardanzaPorEntrada(empId, timestamp);
    } catch (err) {
      console.warn("No se pudo procesar tardanza automatica", err);
    }
  }

  const empleado = Array.isArray(data.empleados) ? data.empleados[0] : data.empleados;

  return json(
    {
      id: data.id_fichada,
      empleadoId: data.id_empleado,
      empleadoNombre: empleado?.nombre_completo,
      empleadoLegajo: empleado?.legajo,
      timestamp: data.timestamp,
      tipo: data.tipo,
      origen: data.origen,
    },
    201,
  );
}

async function deleteFichada(id: number): Promise<Response> {
  const { data: fichada, error: fichadaError } = await adminClient
    .from("fichadas")
    .select("id_fichada,id_empleado,timestamp,tipo")
    .eq("id_fichada", id)
    .maybeSingle();

  if (fichadaError) return error("Error buscando fichada.", 500);
  if (!fichada) return error("Fichada no encontrada.", 404);

  const { error: dbError } = await adminClient.from("fichadas").delete().eq("id_fichada", id);
  if (dbError) return error(dbError.message || "No se pudo eliminar la fichada.", 400);

  if (fichada.tipo === "ENTRADA") {
    const partes = localTimestampParts(fichada.timestamp);
    const { data: tipoTardanza } = await adminClient
      .from("tipos_novedad_calculada")
      .select("id_tipo")
      .eq("codigo", "TARDANZA")
      .maybeSingle();

    if (tipoTardanza) {
      await borrarTardanzaPendiente(fichada.id_empleado, partes.fecha, tipoTardanza.id_tipo);
    }
  }

  return json({ ok: true });
}

async function getNovedades(search: URLSearchParams): Promise<Response> {
  let query = adminClient.from("v_novedades_unificadas").select("*").order("fecha_inicio", { ascending: false });
  const estado = search.get("estado");
  const empleadoId = search.get("empleadoId");
  if (estado) query = query.eq("estado", estado);
  if (empleadoId) query = query.eq("id_empleado", Number(empleadoId));

  const { data, error: dbError } = await query;
  if (dbError) return error("No se pudieron cargar las novedades.", 500);

  const payload = (data ?? []).map((n) => ({
    id: n.id,
    empleadoId: n.id_empleado,
    empleadoNombre: n.empleado_nombre,
    empleadoLegajo: n.empleado_legajo,
    tipo: n.tipo,
    descripcion: n.descripcion,
    fechasAfectadas: [n.fecha_inicio],
    cantidadMinutos: n.cantidad_minutos,
    estado: n.estado,
    origen: n.origen,
    observacion: n.observacion,
    fechaInicio: n.fecha_inicio,
    fechaFin: n.fecha_fin,
  }));

  return json(payload);
}

async function getTiposNovedad(): Promise<Response> {
  const { data, error: dbError } = await adminClient
    .from("tipos_novedad_aprobada")
    .select("id_tipo,codigo,descripcion")
    .order("id_tipo");

  if (dbError) return error("No se pudieron cargar los tipos de novedad.", 500);

  return json((data ?? []).map((t) => ({ id: t.id_tipo, codigo: t.codigo, descripcion: t.descripcion })));
}

async function createNovedad(req: Request, auth: AuthContext): Promise<Response> {
  const body = await parseBody(req);
  const empleadoId = Number(body.empleadoId);
  const idTipo = Number(body.idTipo);
  const fechaInicio = String(body.fechaInicio ?? "");
  const fechaFin = String(body.fechaFin ?? fechaInicio);
  const observacion = body.observacion ? String(body.observacion) : "";

  if (!empleadoId || !idTipo || !fechaInicio) {
    return error("Faltan datos obligatorios (empleadoId, idTipo, fechaInicio).", 400);
  }

  const { data, error: dbError } = await adminClient
    .from("novedades_aprobadas")
    .insert({
      id_empleado: empleadoId,
      id_tipo: idTipo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado: "PENDIENTE",
      id_usuario_carga: auth.userId,
      observacion,
    })
    .select("id_novedad_aprobada")
    .single();

  if (dbError) return error(dbError.message || "No se pudo crear la novedad.", 400);

  const { data: nov, error: novError } = await adminClient
    .from("v_novedades_unificadas")
    .select("*")
    .eq("id", `apr_${data.id_novedad_aprobada}`)
    .maybeSingle();

  if (novError || !nov) return error("Novedad creada pero no se pudo mapear respuesta.", 500);

  return json(
    {
      id: nov.id,
      empleadoId: nov.id_empleado,
      empleadoNombre: nov.empleado_nombre,
      empleadoLegajo: nov.empleado_legajo,
      tipo: nov.tipo,
      descripcion: nov.descripcion,
      fechasAfectadas: [nov.fecha_inicio],
      estado: nov.estado,
      origen: nov.origen,
      observacion: nov.observacion,
    },
    201,
  );
}

async function patchNovedad(id: string, req: Request, auth: AuthContext): Promise<Response> {
  const parsed = parseNovedadId(id);
  if (!parsed) return error("ID de novedad invalido.", 400);

  const body = await parseBody(req);
  const estado = String(body.estado ?? "");
  const idUsuarioAprueba = body.idUsuarioAprueba ? String(body.idUsuarioAprueba) : auth.userId;
  const observacion = body.observacion !== undefined ? String(body.observacion) : undefined;

  if (!["PENDIENTE", "APROBADA", "RECHAZADA"].includes(estado)) {
    return error("Estado invalido. Debe ser PENDIENTE, APROBADA o RECHAZADA.", 400);
  }

  if (parsed.kind === "calc") {
    const { error: dbError } = await adminClient
      .from("novedades_calculadas")
      .update({ estado })
      .eq("id_novedad_calc", parsed.numericId);
    if (dbError) return error("No se pudo actualizar la novedad.", 400);
  } else {
    const patch: Record<string, unknown> = { estado };
    if (estado === "APROBADA") patch.id_usuario_aprueba = idUsuarioAprueba;
    if (observacion !== undefined) patch.observacion = observacion;

    const { error: dbError } = await adminClient
      .from("novedades_aprobadas")
      .update(patch)
      .eq("id_novedad_aprobada", parsed.numericId);
    if (dbError) return error("No se pudo actualizar la novedad.", 400);
  }

  const { data: nov, error: novError } = await adminClient
    .from("v_novedades_unificadas")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (novError || !nov) return error("Novedad no encontrada.", 404);

  return json({
    id: nov.id,
    empleadoId: nov.id_empleado,
    empleadoNombre: nov.empleado_nombre,
    empleadoLegajo: nov.empleado_legajo,
    tipo: nov.tipo,
    descripcion: nov.descripcion,
    fechasAfectadas: [nov.fecha_inicio],
    cantidadMinutos: nov.cantidad_minutos,
    estado: nov.estado,
    origen: nov.origen,
    observacion: nov.observacion,
  });
}

async function deleteNovedad(id: string): Promise<Response> {
  const parsed = parseNovedadId(id);
  if (!parsed) return error("ID de novedad invalido.", 400);

  const table = parsed.kind === "calc" ? "novedades_calculadas" : "novedades_aprobadas";
  const idColumn = parsed.kind === "calc" ? "id_novedad_calc" : "id_novedad_aprobada";

  const { data: existing, error: existingError } = await adminClient
    .from(table)
    .select(idColumn)
    .eq(idColumn, parsed.numericId)
    .maybeSingle();

  if (existingError) return error("Error buscando novedad.", 500);
  if (!existing) return error("Novedad no encontrada.", 404);

  const { error: dbError } = await adminClient.from(table).delete().eq(idColumn, parsed.numericId);
  if (dbError) return error(dbError.message || "No se pudo eliminar la novedad.", 400);

  return json({ ok: true });
}

async function aprobarNovedadesLote(req: Request, auth: AuthContext): Promise<Response> {
  const body = await parseBody(req);
  const periodo = String(body.periodo ?? "");
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return error("Periodo invalido. Formato esperado YYYY-MM.", 400);
  }

  const { data, error: dbError } = await adminClient.rpc("rpc_aprobar_novedades_pendientes", {
    p_periodo: periodo,
    p_usuario_aprueba: auth.userId,
  });

  if (dbError) return error(dbError.message || "No se pudieron aprobar novedades.", 400);
  const row = Array.isArray(data) ? data[0] : null;

  return json({ actualizadas: row?.actualizadas ?? 0 });
}

async function getConfiguracion(): Promise<Response> {
  const { data, error: dbError } = await adminClient
    .from("configuracion_global")
    .select("tolerancia_entrada_min,tolerancia_salida_min,umbral_horas_extra_min,minutos_descanso_default")
    .eq("id", 1)
    .single();

  if (dbError) return error("No se pudo cargar la configuracion.", 500);

  return json({
    toleranciaEntradaMin: data.tolerancia_entrada_min,
    toleranciaSalidaMin: data.tolerancia_salida_min,
    umbralHorasExtraMin: data.umbral_horas_extra_min,
    minutosDescansoDefault: data.minutos_descanso_default,
  });
}

async function putConfiguracion(req: Request): Promise<Response> {
  const body = await parseBody(req);

  try {
    const patch = {
      tolerancia_entrada_min: nonNegativeInteger(body.toleranciaEntradaMin, "toleranciaEntradaMin"),
      tolerancia_salida_min: nonNegativeInteger(body.toleranciaSalidaMin, "toleranciaSalidaMin"),
      umbral_horas_extra_min: nonNegativeInteger(body.umbralHorasExtraMin, "umbralHorasExtraMin"),
      minutos_descanso_default: nonNegativeInteger(body.minutosDescansoDefault, "minutosDescansoDefault"),
      updated_at: new Date().toISOString(),
    };

    const { data, error: dbError } = await adminClient
      .from("configuracion_global")
      .update(patch)
      .eq("id", 1)
      .select("tolerancia_entrada_min,tolerancia_salida_min,umbral_horas_extra_min,minutos_descanso_default")
      .single();

    if (dbError) return error("No se pudo guardar la configuracion.", 400);

    return json({
      toleranciaEntradaMin: data.tolerancia_entrada_min,
      toleranciaSalidaMin: data.tolerancia_salida_min,
      umbralHorasExtraMin: data.umbral_horas_extra_min,
      minutosDescansoDefault: data.minutos_descanso_default,
    });
  } catch (err) {
    return error((err as Error).message, 400);
  }
}

async function getPreliquidacion(periodo: string): Promise<Response> {
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return error("Periodo invalido. Formato esperado YYYY-MM.", 400);
  }

  const { data, error: dbError } = await adminClient.rpc("rpc_preliquidacion", {
    periodo,
  });

  if (dbError) return error(dbError.message || "No se pudo cargar la preliquidacion.", 400);
  return json(data as JsonValue);
}

async function getCierres(): Promise<Response> {
  const { data, error: dbError } = await adminClient
    .from("cierres_mensuales")
    .select("id_cierre,periodo,fecha_cierre,estado")
    .order("periodo", { ascending: false });

  if (dbError) return error("No se pudieron cargar los cierres.", 500);

  return json(
    (data ?? []).map((c) => ({
      id: c.id_cierre,
      periodo: c.periodo,
      fechaCierre: c.fecha_cierre,
      estado: c.estado,
    })),
  );
}

async function postCierre(req: Request, auth: AuthContext): Promise<Response> {
  const body = await parseBody(req);
  const periodo = String(body.periodo ?? "");

  const { data, error: dbError } = await adminClient.rpc("rpc_cerrar_periodo", {
    p_periodo: periodo,
    p_usuario_cerro: auth.userId,
  });

  if (dbError) {
    if (dbError.code === "23505") return error("El periodo ya se encuentra cerrado.", 409);
    if (dbError.code === "23514") return error(dbError.message, 409);
    return error(dbError.message || "No se pudo cerrar el periodo.", 400);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return json(
    {
      id: row?.id,
      periodo: row?.periodo,
      fechaCierre: row?.fecha_cierre,
      estado: row?.estado,
    },
    201,
  );
}

async function getDashboard(): Promise<Response> {
  const now = new Date();
  const hoy = now.toISOString().slice(0, 10);
  const mesActual = now.toISOString().slice(0, 7);

  const [{ count: empleadosActivos }, { count: fichadasHoyCount }, { data: estadoCalc }, { data: estadoApr }, { data: fichadasData }] =
    await Promise.all([
      adminClient.from("empleados").select("id_empleado", { count: "exact", head: true }).eq("estado", "ACTIVO"),
      adminClient.from("punch_events").select("id", { count: "exact", head: true }).gte("timestamp", `${hoy}T00:00:00`).lte("timestamp", `${hoy}T23:59:59.999`),
      adminClient.from("novedades_calculadas").select("estado,id_tipo,cantidad_minutos,fecha"),
      adminClient.from("novedades_aprobadas").select("estado"),
      adminClient
        .from("punch_events")
        .select("id,id_empleado,timestamp,direction,source,empleados(nombre_completo,legajo)")
        .order("timestamp", { ascending: false })
        .limit(10),
    ]);

  const novedadesPendientes = (estadoCalc ?? []).filter((n) => n.estado === "PENDIENTE").length + (estadoApr ?? []).filter((n) => n.estado === "PENDIENTE").length;

  const { data: tiposCalc } = await adminClient.from("tipos_novedad_calculada").select("id_tipo,codigo");
  const codigoByTipo = new Map<number, string>((tiposCalc ?? []).map((t) => [t.id_tipo, t.codigo]));

  const hsExtraMinMes = (estadoCalc ?? [])
    .filter((n) => n.fecha?.startsWith?.(mesActual))
    .filter((n) => {
      const code = codigoByTipo.get(n.id_tipo);
      return code === "HS_EXTRA_50" || code === "HS_EXTRA_100";
    })
    .reduce((acc, n) => acc + (n.cantidad_minutos ?? 0), 0);

  // Para calcular ausencias hay que saber qué empleados activos deben trabajar cada día
  // según su horario asignado vigente. Un empleado solo es "ausente" si ese día le tocaba
  // trabajar (no es descanso) y no fichó.
  const [{ data: empleadosActivosRows }, { data: asignacionesRows }] = await Promise.all([
    adminClient.from("empleados").select("id_empleado").eq("estado", "ACTIVO"),
    adminClient.from("asignaciones_horario").select("id_empleado,id_horario").is("fecha_hasta", null),
  ]);

  const empleadoIdsActivos = (empleadosActivosRows ?? []).map((e) => e.id_empleado);
  const horarioByEmpleado = new Map<number, number>(
    (asignacionesRows ?? []).map((a) => [a.id_empleado, a.id_horario]),
  );

  const horarioIds = [...new Set(horarioByEmpleado.values())];
  const { data: detallesRows } = horarioIds.length
    ? await adminClient
        .from("horario_detalles")
        .select("id_horario,dia_semana,es_descanso")
        .in("id_horario", horarioIds)
        .eq("numero_semana", 1)
    : { data: [] as { id_horario: number; dia_semana: number; es_descanso: boolean }[] };

  // id_horario -> set de dias laborables (1=Lunes ... 7=Domingo, igual que horario_detalles)
  const diasLaborablesByHorario = new Map<number, Set<number>>();
  for (const det of detallesRows ?? []) {
    if (det.es_descanso) continue;
    if (!diasLaborablesByHorario.has(det.id_horario)) diasLaborablesByHorario.set(det.id_horario, new Set());
    diasLaborablesByHorario.get(det.id_horario)!.add(det.dia_semana);
  }

  const asistenciaSemanal: { name: string; fecha: string; presentes: number; ausentes: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10);

    // Día de semana ISO (1=Lunes ... 7=Domingo) coherente con la fecha (iso) consultada
    const utcDow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=Domingo ... 6=Sábado
    const diaSemana = utcDow === 0 ? 7 : utcDow;

    const { data: presentesRows } = await adminClient
      .from("punch_events")
      .select("id_empleado")
      .eq("direction", "IN")
      .gte("timestamp", `${iso}T00:00:00`)
      .lte("timestamp", `${iso}T23:59:59.999`);

    const presentesSet = new Set((presentesRows ?? []).map((r) => r.id_empleado));

    // Solo cuentan como ausentes los empleados que debían trabajar ese día y no ficharon.
    const ausentes = empleadoIdsActivos.filter((id) => {
      const idHorario = horarioByEmpleado.get(id);
      if (idHorario === undefined) return false; // sin horario asignado => no se cuenta
      const debeTrabajar = diasLaborablesByHorario.get(idHorario)?.has(diaSemana) ?? false;
      return debeTrabajar && !presentesSet.has(id);
    }).length;

    asistenciaSemanal.push({
      name: new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" }),
      fecha: iso,
      presentes: presentesSet.size,
      ausentes,
    });
  }

  const estadoNovedades = [
    { name: "Pendientes", value: novedadesPendientes, color: "#f59e0b" },
    {
      name: "Aprobadas",
      value: (estadoCalc ?? []).filter((n) => n.estado === "APROBADA").length + (estadoApr ?? []).filter((n) => n.estado === "APROBADA").length,
      color: "#10b981",
    },
    {
      name: "Rechazadas",
      value: (estadoCalc ?? []).filter((n) => n.estado === "RECHAZADA").length + (estadoApr ?? []).filter((n) => n.estado === "RECHAZADA").length,
      color: "#ef4444",
    },
  ];

  const ultimasFichadas = (fichadasData ?? []).map((f: any) => {
    const empleado = Array.isArray(f.empleados) ? f.empleados[0] : f.empleados;
    return {
      id: f.id,
      empleado: empleado?.nombre_completo ?? "Desconocido",
      legajo: empleado?.legajo,
      hora: f.timestamp,
      tipo: f.direction === "IN" ? "ENTRADA" : "SALIDA",
      origen: f.source,
    };
  });

  return json({
    empleadosActivos: empleadosActivos ?? 0,
    novedadesPendientes,
    fichadasHoy: fichadasHoyCount ?? 0,
    horasExtraMes: Math.round((hsExtraMinMes / 60) * 10) / 10,
    asistenciaSemanal,
    estadoNovedades,
    ultimasFichadas,
  });
}

async function getMe(auth: AuthContext): Promise<Response> {
  return json({
    idUsuario: auth.userId,
    nombre: auth.nombre,
    rol: auth.rol,
    idEmpleado: auth.idEmpleado,
    legajo: auth.legajo,
  });
}

function routeKey(path: string): string {
  if (/^\/empleados\/\d+$/.test(path)) return "/empleados/:id";
  if (/^\/horarios\/\d+$/.test(path)) return "/horarios/:id";
  if (/^\/novedades\/[^/]+$/.test(path)) return "/novedades/:id";
  return path;
}

const roleMatrix: Record<string, RolUsuario[]> = {
  "/me": ["ADMIN", "EMPLEADO", "CONTADOR"],
  "/horarios": ["ADMIN"],
  "/horarios/:id": ["ADMIN"],
  "/empleados": ["ADMIN"],
  "/empleados/:id": ["ADMIN"],
  "/novedades": ["ADMIN"],
  "/novedades/tipos": ["ADMIN"],
  "/novedades/:id": ["ADMIN"],
  "/novedades/aprobar-todas": ["ADMIN"],
  "/configuracion": ["ADMIN"],
  "/cierres": ["ADMIN", "CONTADOR"],
  "/dashboard": ["ADMIN"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const { path, search } = routeFromUrl(req);
  const key = routeKey(path);

  if (path === "/health") {
    return json({ status: "ok", message: "API is running" });
  }

  const auth = await resolveAuth(req);
  if (!auth) return error("No autenticado.", 401);
  if (!auth.activo) return error("Usuario inactivo.", 403);

  const allowedRoles = roleMatrix[key];
  if (allowedRoles) {
    const roleError = ensureRole(auth, allowedRoles);
    if (roleError) return roleError;
  }

  try {
    if (req.method === "GET" && path === "/me") return await getMe(auth);

    if (req.method === "GET" && path === "/horarios") return await getHorarios();
    if (req.method === "POST" && path === "/horarios") return await createHorario(req);
    if (req.method === "DELETE" && key === "/horarios/:id") {
      const id = Number(path.split("/")[2]);
      return await deleteHorario(id);
    }

    if (req.method === "GET" && path === "/empleados") return await getEmpleados();
    if (req.method === "POST" && path === "/empleados") return await createEmpleado(req);
    if (req.method === "DELETE" && key === "/empleados/:id") {
      const id = Number(path.split("/")[2]);
      return await deleteEmpleado(id);
    }
    if (req.method === "GET" && key === "/empleados/:id") {
      const id = Number(path.split("/")[2]);
      return await getEmpleadoById(id, search);
    }

    if (req.method === "GET" && path === "/novedades") return await getNovedades(search);
    if (req.method === "GET" && path === "/novedades/tipos") return await getTiposNovedad();
    if (req.method === "POST" && path === "/novedades") return await createNovedad(req, auth);
    if (req.method === "POST" && path === "/novedades/aprobar-todas") return await aprobarNovedadesLote(req, auth);
    if (req.method === "PATCH" && key === "/novedades/:id") {
      const id = path.split("/")[2];
      return await patchNovedad(id, req, auth);
    }
    if (req.method === "DELETE" && key === "/novedades/:id") {
      const id = path.split("/")[2];
      return await deleteNovedad(id);
    }

    if (req.method === "GET" && path === "/configuracion") return await getConfiguracion();
    if (req.method === "PUT" && path === "/configuracion") return await putConfiguracion(req);

    if (req.method === "GET" && path === "/cierres") return await getCierres();
    if (req.method === "POST" && path === "/cierres") return await postCierre(req, auth);

    if (req.method === "GET" && path === "/dashboard") return await getDashboard();

    if (path.startsWith("/punch") || path.startsWith("/attendance") || path.startsWith("/break-policies")) {
      return withCors(await handleAttendanceRequest(req, path));
    }

    return error("Ruta no encontrada.", 404);
  } catch (err) {
    return error((err as Error).message || "Error interno.", 500);
  }
});
