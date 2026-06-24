import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = [
  {
    email: 'admin@pyme.com',
    password: 'admin123',
    perfil: { rol: 'ADMIN', nombre: 'Admin Pyme', activo: true },
    empleado: null,
  },
  {
    email: 'juan@pyme.com',
    password: 'juan123',
    perfil: { rol: 'EMPLEADO', nombre: 'Juan Perez', activo: true },
    empleado: {
      legajo: '042',
      nombre_completo: 'Juan Perez',
      dni: '12345678',
      cuil: '20-12345678-9',
      fecha_ingreso: '2020-01-01',
      estado: 'ACTIVO',
      modalidad_fichada: 'MANUAL',
    },
  },
  {
    email: 'estudio@contable.com',
    password: 'cont123',
    perfil: { rol: 'CONTADOR', nombre: 'Estudio Contable', activo: true },
    empleado: null,
  },
];

async function ensureUser(seedUser) {
  const { data: existingList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let user = existingList.users.find((u) => u.email?.toLowerCase() === seedUser.email.toLowerCase());

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: seedUser.email,
      password: seedUser.password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: seedUser.password,
      email_confirm: true,
    });
    if (error) throw error;
  }

  return user;
}

async function upsertBusinessData(user, seedUser) {
  const { error: perfilError } = await admin.from('perfiles').upsert(
    {
      user_id: user.id,
      rol: seedUser.perfil.rol,
      nombre: seedUser.perfil.nombre,
      activo: seedUser.perfil.activo,
    },
    { onConflict: 'user_id' },
  );

  if (perfilError) throw perfilError;

  if (!seedUser.empleado) return;

  const { error: empleadoError } = await admin.from('empleados').upsert(
    {
      ...seedUser.empleado,
      user_id: user.id,
    },
    { onConflict: 'legajo' },
  );

  if (empleadoError) throw empleadoError;
}

async function run() {
  for (const seedUser of users) {
    const user = await ensureUser(seedUser);
    await upsertBusinessData(user, seedUser);
  }

  console.log('Auth seed completed successfully.');
}

run().catch((err) => {
  console.error('Auth seed failed:', err.message || err);
  process.exitCode = 1;
});
