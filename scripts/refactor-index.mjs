import fs from 'fs';
import path from 'path';

const indexPath = path.resolve('supabase/functions/api/index.ts');
let content = fs.readFileSync(indexPath, 'utf-8');

// Add import
content = content.replace(
  'const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {',
  'import handleAttendanceRequest from "./routes.ts";\n\nconst adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {'
);

// Remove functions
const fnsToRemove = [
  'async function getFichadas',
  'async function borrarTardanzaPendiente',
  'async function procesarTardanzaPorEntrada',
  'async function postFichada',
  'async function deleteFichada',
  'async function getPreliquidacion'
];

for (const fn of fnsToRemove) {
  const regex = new RegExp(`${fn}\\([\\s\\S]*?\\n}\\n`, 'g');
  content = content.replace(regex, '');
}

// Ensure preliquidacion is fully removed if not matched by above
content = content.replace(/async function getPreliquidacion\([\s\S]*?\n}\n/g, '');

// Update routeKey
content = content.replace(
  /if \(\/\^\\\\\/fichadas\\\\\/\\\\d\+\$\/\.test\(path\)\) return "\/fichadas\/:id";\n/g,
  ''
);
content = content.replace(
  /if \(\/\^\\\\\/preliquidacion\\\\\/\\\\d\{4\}-\\\\d\{2\}\$\/\.test\(path\)\) return "\/preliquidacion\/:periodo";\n/g,
  ''
);

// Update roleMatrix
content = content.replace(/  "\/fichadas": \["ADMIN", "EMPLEADO"\],\n/g, '');
content = content.replace(/  "\/fichadas\/:id": \["ADMIN"\],\n/g, '');
content = content.replace(/  "\/preliquidacion\/:periodo": \["ADMIN", "CONTADOR"\],\n/g, '');

// Update Dashboard queries
content = content.replace(
  /adminClient\.from\("fichadas"\)\.select\("id_fichada", { count: "exact", head: true }\)/g,
  'adminClient.from("punch_events").select("id", { count: "exact", head: true })'
);
content = content.replace(
  /adminClient\s*\.from\("fichadas"\)\s*\.select\("id_fichada,id_empleado,timestamp,tipo,origen,empleados\(nombre_completo,legajo\)"\)/g,
  'adminClient.from("punch_events").select("id,id_empleado,timestamp,direction,source,empleados(nombre_completo,legajo)")'
);
content = content.replace(
  /const ultimasFichadas = \(fichadasData \?\? \[\]\)\.map\(\(f\) => \{\n    const empleado = Array\.isArray\(f\.empleados\) \? f\.empleados\[0\] : f\.empleados;\n    return \{\n      id: f\.id_fichada,\n      empleado: empleado\?\.nombre_completo \?\? "Desconocido",\n      legajo: empleado\?\.legajo,\n      hora: f\.timestamp,\n      tipo: f\.tipo,\n      origen: f\.origen,\n    \};\n  \}\);/g,
  `const ultimasFichadas = (fichadasData ?? []).map((f: any) => {
    const empleado = Array.isArray(f.empleados) ? f.empleados[0] : f.empleados;
    return {
      id: f.id,
      empleado: empleado?.nombre_completo ?? "Desconocido",
      legajo: empleado?.legajo,
      hora: f.timestamp,
      tipo: f.direction === 'IN' ? 'ENTRADA' : 'SALIDA',
      origen: f.source,
    };
  });`
);
content = content.replace(
  /adminClient\s*\.from\("fichadas"\)\s*\.select\("id_empleado"\)\s*\.eq\("tipo", "ENTRADA"\)/g,
  'adminClient.from("punch_events").select("id_empleado").eq("direction", "IN")'
);

// Update Deno.serve routing
content = content.replace(
  /    if \(req\.method === "GET" && path === "\/fichadas"\) return await getFichadas\(auth, search\);\n/g,
  ''
);
content = content.replace(
  /    if \(req\.method === "POST" && path === "\/fichadas"\) return await postFichada\(req, auth\);\n/g,
  ''
);
content = content.replace(
  /    if \(req\.method === "DELETE" && key === "\/fichadas\/:id"\) \{\n      const id = Number\(path\.split\("\/"\)\[2\]\);\n      return await deleteFichada\(id\);\n    \}\n/g,
  ''
);
content = content.replace(
  /    if \(req\.method === "GET" && key === "\/preliquidacion\/:periodo"\) \{\n      const periodo = path\.split\("\/"\)\[2\];\n      return await getPreliquidacion\(periodo\);\n    \}\n/g,
  ''
);

// Add fallback to routes.ts for punch and attendance
content = content.replace(
  /    return error\("Ruta no encontrada\.", 404\);/g,
  `    if (path.startsWith("/punch") || path.startsWith("/attendance") || path.startsWith("/break-policies")) {
      return await handleAttendanceRequest(req, path);
    }

    return error("Ruta no encontrada.", 404);`
);

fs.writeFileSync(indexPath, content, 'utf-8');
console.log('Done refactoring api/index.ts');
