/**
 * Seed de simulación: empresa real con 6 empleados — Junio 2026
 *
 * Genera, de forma idempotente:
 *  - Catálogo completo de tipos de novedad (calculada y aprobada)
 *  - 3 empleados faltantes (hasta llegar a 6) + asignación de horario
 *  - punch_events realistas (entrada/almuerzo/salida) por día hábil
 *  - attendance_interpretations coherentes (worked/break/overtime/anomalías)
 *  - novedades_calculadas (TARDANZA, SALIDA_ANTIC, HS_EXTRA_50/100, AUSENCIA)
 *  - novedades_aprobadas (Vacaciones, Licencia por Enfermedad)
 *
 * Modelo de jornada: Lun-Vie 09:00-18:00, almuerzo 13:00-14:00 (60'),
 * jornada neta esperada = 480' (8h). TZ: America/Argentina/Buenos_Aires (UTC-3).
 *
 * Uso: node scripts/seed-junio-2026.mjs
 */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Config / credenciales
// ---------------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_USER = 'a4abe3ce-8e9a-4812-8c5c-aa9955f64dd4';
const HORARIO_ID = 1;
const POLICY_ID = 'f0e2a193-acba-4cd5-b5c7-6c6b113bc6bc';
const POLICY_VERSION = 1;
const TZ = '-03:00';

const SCHED_IN_MIN = 9 * 60;     // 09:00
const SCHED_OUT_MIN = 18 * 60;   // 18:00
const TOL = 15;                  // tolerancia entrada/salida
const EXPECTED_NET = 480;        // jornada neta esperada (min)

// ---------------------------------------------------------------------------
// Helpers REST
// ---------------------------------------------------------------------------
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const get = (p) => rest('GET', p);
const insert = (table, rows) =>
  rest('POST', table, rows, { Prefer: 'return=representation' });
const upsert = (table, rows, onConflict) =>
  rest('POST', `${table}?on_conflict=${onConflict}`, rows, {
    Prefer: 'resolution=merge-duplicates,return=representation',
  });
const del = (p) => rest('DELETE', p, undefined, { Prefer: 'return=minimal' });

// ---------------------------------------------------------------------------
// Helpers tiempo
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
// ISO con offset Argentina, p.ej. 2026-06-01T09:00:00-03:00
const localIso = (dateStr, minutes) =>
  `${dateStr}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00${TZ}`;
// ISO UTC (Z) — como lo persiste el motor en los segmentos
const utcIso = (dateStr, minutes) => new Date(localIso(dateStr, minutes)).toISOString();

function workSeg(dateStr, startMin, endMin) {
  return {
    startTime: utcIso(dateStr, startMin),
    endTime: utcIso(dateStr, endMin),
    durationMinutes: endMin - startMin,
  };
}

// ---------------------------------------------------------------------------
// Generadores de día
// Cada generador devuelve { punches:[{min,dir}], interp:{...}, novedad:{codigo,min}|null }
// ---------------------------------------------------------------------------
function buildDay({ inMin = SCHED_IN_MIN, outMin = SCHED_OUT_MIN, lunch = true } = {}) {
  const punches = [];
  const workSegments = [];
  const breakSegments = [];
  const anomalies = [];
  const novedades = [];

  const LUNCH_START = 13 * 60; // 13:00
  const LUNCH_END = 14 * 60;   // 14:00

  if (lunch && outMin > LUNCH_END) {
    punches.push({ min: inMin, dir: 'IN' });
    punches.push({ min: LUNCH_START, dir: 'OUT' });
    punches.push({ min: LUNCH_END, dir: 'IN' });
    punches.push({ min: outMin, dir: 'OUT' });
  } else {
    punches.push({ min: inMin, dir: 'IN' });
    punches.push({ min: outMin, dir: 'OUT' });
  }

  return { punches, workSegments, breakSegments, anomalies, novedades, inMin, outMin, lunch };
}

// Construye interpretación a partir de los punches (segmentos + métricas)
function interpret(dateStr, day) {
  const { punches } = day;
  const workSegments = [];
  const breakSegments = [];
  const anomalies = [];
  const novedades = [];

  for (let i = 0; i < punches.length - 1; i += 2) {
    const a = punches[i];
    const b = punches[i + 1];
    workSegments.push(workSeg(dateStr, a.min, b.min));
    if (i + 2 < punches.length) {
      breakSegments.push(workSeg(dateStr, b.min, punches[i + 2].min));
    }
  }

  const workedMinutes = workSegments.reduce((s, w) => s + w.durationMinutes, 0);
  const breakMinutes = breakSegments.reduce((s, w) => s + w.durationMinutes, 0);
  const overtimeMinutes = workedMinutes - EXPECTED_NET;

  // Tardanza
  const lateMin = day.inMin - SCHED_IN_MIN;
  if (lateMin > TOL) {
    anomalies.push({
      type: 'TARDANZA',
      severity: 'WARNING',
      description: `Entrada tardía: ${lateMin} minutos`,
      minutesAffected: lateMin,
    });
    novedades.push({ codigo: 'TARDANZA', min: lateMin });
  }

  // Salida anticipada
  const earlyMin = SCHED_OUT_MIN - day.outMin;
  if (earlyMin > TOL) {
    anomalies.push({
      type: 'EARLY_EXIT',
      severity: 'WARNING',
      description: `Salida anticipada: ${earlyMin} minutos`,
      minutesAffected: earlyMin,
    });
    novedades.push({ codigo: 'SALIDA_ANTIC', min: earlyMin });
  }

  // Horas extra
  if (overtimeMinutes >= 30) {
    if (overtimeMinutes >= 240) {
      anomalies.push({
        type: 'OVERTIME_100',
        severity: 'INFO',
        description: `Horas extras (100%): ${(overtimeMinutes / 60).toFixed(2)}hs`,
        minutesAffected: overtimeMinutes,
      });
      novedades.push({ codigo: 'HS_EXTRA_100', min: overtimeMinutes });
    } else {
      anomalies.push({
        type: 'OVERTIME_50',
        severity: 'INFO',
        description: `Horas extras (50%): ${(overtimeMinutes / 60).toFixed(2)}hs`,
        minutesAffected: overtimeMinutes,
      });
      novedades.push({ codigo: 'HS_EXTRA_50', min: overtimeMinutes });
    }
  }

  return {
    work_segments: workSegments,
    break_segments: breakSegments,
    worked_minutes: workedMinutes,
    break_minutes: breakMinutes,
    overtime_minutes: overtimeMinutes,
    status: 'COMPLETE',
    anomalies,
    novedades,
  };
}

// ---------------------------------------------------------------------------
// Definición de empleados y su "personalidad" de junio
// specials: { 'YYYY-MM-DD': descriptor }
//   descriptor: {type:'normal'|'late'|'early'|'ot'|'absent', min?}
// leaves: [{codigo, desde, hasta, obs}]  (justificadas -> novedades_aprobadas)
// ---------------------------------------------------------------------------
const NEW_EMPLOYEES = [
  { legajo: '1004', nombre_completo: 'Lucia Fernandez', cuil: '27355128094', dni: '35512809', modalidad: 'Vendedora', fecha_ingreso: '2026-03-10' },
  { legajo: '1005', nombre_completo: 'Carlos Gomez', cuil: '20284417653', dni: '28441765', modalidad: 'Supervisor', fecha_ingreso: '2025-11-04' },
  { legajo: '1006', nombre_completo: 'Sofia Martinez', cuil: '27401298337', dni: '40129833', modalidad: 'Administrativa', fecha_ingreso: '2026-02-17' },
];

// Se completa con ids reales tras crear/leer empleados
const PROFILES = {
  '1': { // Matias Garcia (id 2) — puntual, algo de horas extra
    specials: {
      '2026-06-03': { type: 'ot', outMin: 20 * 60 + 30 },
      '2026-06-10': { type: 'ot', outMin: 21 * 60 },
      '2026-06-17': { type: 'late', inMin: 9 * 60 + 20 },
    },
    leaves: [],
  },
  '1002': { // Martin Perez (id 3) — cadete impuntual, 1 ausencia injustificada
    specials: {
      '2026-06-02': { type: 'late', inMin: 9 * 60 + 25 },
      '2026-06-09': { type: 'late', inMin: 9 * 60 + 40 },
      '2026-06-11': { type: 'absent' },
      '2026-06-16': { type: 'late', inMin: 9 * 60 + 18 },
      '2026-06-23': { type: 'early', outMin: 16 * 60 + 45 },
    },
    leaves: [],
  },
  '1003': { // Mati Querel (id 4) — normal, licencia por enfermedad 2 días
    specials: {
      '2026-06-05': { type: 'ot', outMin: 19 * 60 + 30 },
    },
    leaves: [
      { codigo: 'LIC_ENF', desde: '2026-06-15', hasta: '2026-06-16', obs: 'Reposo por gripe (certificado médico)' },
    ],
  },
  '1004': { // Lucia Fernandez — vacaciones 1 semana
    specials: {
      '2026-06-18': { type: 'late', inMin: 9 * 60 + 22 },
    },
    leaves: [
      { codigo: 'VAC', desde: '2026-06-08', hasta: '2026-06-12', obs: 'Vacaciones programadas' },
    ],
  },
  '1005': { // Carlos Gomez — supervisor, muchas horas extra
    specials: {
      '2026-06-02': { type: 'ot', outMin: 21 * 60 },
      '2026-06-04': { type: 'ot', outMin: 22 * 60 + 30 },
      '2026-06-09': { type: 'ot', outMin: 20 * 60 },
      '2026-06-12': { type: 'ot', outMin: 23 * 60 },
      '2026-06-19': { type: 'ot', outMin: 20 * 60 + 30 },
    },
    leaves: [],
  },
  '1006': { // Sofia Martinez — administrativa, salidas anticipadas + 1 tardanza
    specials: {
      '2026-06-03': { type: 'early', outMin: 17 * 60 },
      '2026-06-10': { type: 'late', inMin: 9 * 60 + 30 },
      '2026-06-17': { type: 'early', outMin: 16 * 60 + 30 },
    },
    leaves: [],
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('▶ Conectando a', SUPABASE_URL);

  // 1) Completar catálogo de tipos de novedad ----------------------------------
  await upsert('tipos_novedad_calculada', [
    { codigo: 'TARDANZA', descripcion: 'Tardanza', es_justificable: true, porcentaje_afectacion_sueldo: 0 },
    { codigo: 'AUSENCIA', descripcion: 'Ausencia', es_justificable: true, porcentaje_afectacion_sueldo: 100 },
    { codigo: 'HS_EXTRA_50', descripcion: 'Horas extra al 50%', es_justificable: false, porcentaje_afectacion_sueldo: 0 },
    { codigo: 'HS_EXTRA_100', descripcion: 'Horas extra al 100%', es_justificable: false, porcentaje_afectacion_sueldo: 0 },
    { codigo: 'SALIDA_ANTIC', descripcion: 'Salida anticipada', es_justificable: true, porcentaje_afectacion_sueldo: 0 },
  ], 'codigo');
  await upsert('tipos_novedad_aprobada', [
    { codigo: 'LIC_ENF', descripcion: 'Licencia por Enfermedad', es_justificada: true },
    { codigo: 'LIC_EST', descripcion: 'Licencia por Examen', es_justificada: true },
    { codigo: 'VAC', descripcion: 'Vacaciones', es_justificada: true },
    { codigo: 'SUSP', descripcion: 'Suspension', es_justificada: false },
    { codigo: 'PERM', descripcion: 'Permiso especial', es_justificada: true },
  ], 'codigo');
  const tiposCalc = Object.fromEntries(
    (await get('tipos_novedad_calculada?select=id_tipo,codigo')).map((t) => [t.codigo, t.id_tipo])
  );
  const tiposApr = Object.fromEntries(
    (await get('tipos_novedad_aprobada?select=id_tipo,codigo')).map((t) => [t.codigo, t.id_tipo])
  );
  console.log('✓ Catálogo de novedades completo');

  // 2) Empleados ---------------------------------------------------------------
  let empleados = await get('empleados?select=id_empleado,legajo,nombre_completo');
  const byLegajo = Object.fromEntries(empleados.map((e) => [e.legajo, e]));

  for (const e of NEW_EMPLOYEES) {
    if (byLegajo[e.legajo]) {
      console.log(`· Empleado legajo ${e.legajo} ya existe (id ${byLegajo[e.legajo].id_empleado})`);
      continue;
    }
    const [created] = await insert('empleados', [{
      legajo: e.legajo,
      nombre_completo: e.nombre_completo,
      dni: e.dni,
      cuil: e.cuil,
      fecha_ingreso: e.fecha_ingreso,
      estado: 'ACTIVO',
      modalidad_fichada: e.modalidad,
    }]);
    byLegajo[e.legajo] = created;
    console.log(`✓ Empleado creado: ${e.nombre_completo} (legajo ${e.legajo}, id ${created.id_empleado})`);
  }

  empleados = await get('empleados?select=id_empleado,legajo,nombre_completo&order=legajo');

  // 3) Asignaciones de horario (cubrir todo junio) -----------------------------
  const asignaciones = await get('asignaciones_horario?select=id_asignacion,id_empleado,fecha_desde,fecha_hasta');
  const asignByEmp = Object.fromEntries(asignaciones.map((a) => [a.id_empleado, a]));
  for (const leg of Object.keys(PROFILES)) {
    const emp = byLegajo[leg];
    if (!emp) continue;
    const existing = asignByEmp[emp.id_empleado];
    if (!existing) {
      await insert('asignaciones_horario', [{
        id_empleado: emp.id_empleado, id_horario: HORARIO_ID,
        fecha_desde: '2026-06-01', fecha_hasta: null,
      }]);
      console.log(`✓ Asignación horario para ${emp.nombre_completo}`);
    } else if (existing.fecha_desde > '2026-06-01') {
      await rest('PATCH', `asignaciones_horario?id_asignacion=eq.${existing.id_asignacion}`,
        { fecha_desde: '2026-06-01' }, { Prefer: 'return=minimal' });
      console.log(`✓ Asignación de ${emp.nombre_completo} ajustada a 2026-06-01`);
    }
  }

  // 4) Limpiar datos previos de junio (idempotencia) ---------------------------
  const empIds = Object.values(byLegajo)
    .filter((e) => PROFILES[e.legajo])
    .map((e) => e.id_empleado);
  const idList = `(${empIds.join(',')})`;
  await del(`punch_events?id_empleado=in.${idList}&timestamp=gte.2026-06-01&timestamp=lt.2026-07-01`);
  await del(`attendance_interpretations?id_empleado=in.${idList}&work_date=gte.2026-06-01&work_date=lt.2026-07-01`);
  await del(`novedades_calculadas?id_empleado=in.${idList}&fecha=gte.2026-06-01&fecha=lt.2026-07-01`);
  await del(`novedades_aprobadas?id_empleado=in.${idList}&fecha_inicio=gte.2026-06-01&fecha_inicio=lt.2026-07-01`);
  console.log('✓ Datos de junio previos limpiados para', empIds.length, 'empleados');

  // 5) Generar datos por día ---------------------------------------------------
  const punchRows = [];
  const interpRows = [];
  const novCalcRows = [];
  const novAprRows = [];

  // Días hábiles de junio 1..23 (mes en curso, hoy = 24)
  const dias = [];
  for (let d = 1; d <= 23; d++) {
    const dateStr = `2026-06-${pad(d)}`;
    const dow = new Date(`${dateStr}T12:00:00${TZ}`).getDay(); // 0=Dom..6=Sab
    if (dow >= 1 && dow <= 5) dias.push(dateStr);
  }

  const inLeave = (leaves, dateStr) =>
    leaves.find((lv) => dateStr >= lv.desde && dateStr <= lv.hasta);

  for (const leg of Object.keys(PROFILES)) {
    const emp = byLegajo[leg];
    if (!emp) continue;
    const prof = PROFILES[leg];
    let stats = { trab: 0, tard: 0, ot: 0, early: 0, aus: 0, lic: 0 };

    // Licencias / vacaciones -> novedades_aprobadas
    for (const lv of prof.leaves) {
      novAprRows.push({
        id_empleado: emp.id_empleado,
        id_tipo: tiposApr[lv.codigo],
        fecha_inicio: lv.desde,
        fecha_fin: lv.hasta,
        estado: 'APROBADA',
        id_usuario_carga: ADMIN_USER,
        id_usuario_aprueba: ADMIN_USER,
        observacion: lv.obs,
      });
    }

    for (const dateStr of dias) {
      const lv = inLeave(prof.leaves, dateStr);
      if (lv) {
        // Día de licencia/vacaciones: sin fichadas, interpretación informativa
        interpRows.push({
          id_empleado: emp.id_empleado, work_date: dateStr,
          id_horario: HORARIO_ID, id_policy: POLICY_ID, policy_version: POLICY_VERSION,
          work_segments: [], break_segments: [],
          worked_minutes: 0, break_minutes: 0, overtime_minutes: 0,
          status: 'NO_PUNCHES', anomalies: [],
          interpreted_by: 'MANUAL',
          notes: lv.codigo === 'VAC' ? 'Vacaciones' : 'Licencia por enfermedad',
        });
        stats.lic++;
        continue;
      }

      const sp = prof.specials[dateStr] || { type: 'normal' };

      if (sp.type === 'absent') {
        // Ausencia injustificada: sin fichadas, novedad AUSENCIA pendiente
        interpRows.push({
          id_empleado: emp.id_empleado, work_date: dateStr,
          id_horario: HORARIO_ID, id_policy: POLICY_ID, policy_version: POLICY_VERSION,
          work_segments: [], break_segments: [],
          worked_minutes: 0, break_minutes: 0, overtime_minutes: 0,
          status: 'NO_PUNCHES',
          anomalies: [{ type: 'AUSENCIA', severity: 'ERROR', description: 'Sin registros de entrada/salida', minutesAffected: EXPECTED_NET }],
          interpreted_by: 'ENGINE', notes: null,
        });
        novCalcRows.push({
          id_empleado: emp.id_empleado, id_tipo: tiposCalc['AUSENCIA'],
          fecha: dateStr, cantidad_minutos: EXPECTED_NET, estado: 'PENDIENTE',
        });
        stats.aus++;
        continue;
      }

      const opts = {};
      if (sp.type === 'late') opts.inMin = sp.inMin;
      if (sp.type === 'early') opts.outMin = sp.outMin;
      if (sp.type === 'ot') opts.outMin = sp.outMin;

      const day = buildDay(opts);
      const interp = interpret(dateStr, day);

      // punch_events
      for (const p of day.punches) {
        punchRows.push({
          id_empleado: emp.id_empleado,
          timestamp: localIso(dateStr, p.min),
          direction: p.dir,
          source: emp.id_empleado % 2 === 0 ? 'BIOMETRIC' : 'MANUAL',
        });
      }

      // interpretación
      interpRows.push({
        id_empleado: emp.id_empleado, work_date: dateStr,
        id_horario: HORARIO_ID, id_policy: POLICY_ID, policy_version: POLICY_VERSION,
        work_segments: interp.work_segments, break_segments: interp.break_segments,
        worked_minutes: interp.worked_minutes, break_minutes: interp.break_minutes,
        overtime_minutes: interp.overtime_minutes, status: interp.status,
        anomalies: interp.anomalies, interpreted_by: 'ENGINE', notes: null,
      });

      // novedades calculadas
      for (const n of interp.novedades) {
        novCalcRows.push({
          id_empleado: emp.id_empleado, id_tipo: tiposCalc[n.codigo],
          fecha: dateStr, cantidad_minutos: n.min, estado: 'PENDIENTE',
        });
        if (n.codigo === 'TARDANZA') stats.tard++;
        if (n.codigo === 'SALIDA_ANTIC') stats.early++;
        if (n.codigo.startsWith('HS_EXTRA')) stats.ot++;
      }
      stats.trab++;
    }

    console.log(`  ${emp.nombre_completo}: ${stats.trab} días trab, ${stats.tard} tardanzas, ${stats.ot} c/extra, ${stats.early} salidas antic, ${stats.aus} ausencias, ${stats.lic} días licencia/vac`);
  }

  // 6) Insertar en lote --------------------------------------------------------
  await insert('punch_events', punchRows);
  await insert('attendance_interpretations', interpRows);
  if (novCalcRows.length) await insert('novedades_calculadas', novCalcRows);
  if (novAprRows.length) await insert('novedades_aprobadas', novAprRows);

  console.log('\n✓ Insertados:');
  console.log(`   punch_events:               ${punchRows.length}`);
  console.log(`   attendance_interpretations: ${interpRows.length}`);
  console.log(`   novedades_calculadas:       ${novCalcRows.length}`);
  console.log(`   novedades_aprobadas:        ${novAprRows.length}`);
  console.log('\n✅ Simulación de junio 2026 completa (6 empleados).');
}

main().catch((e) => {
  console.error('✗ Error:', e.message);
  process.exit(1);
});
