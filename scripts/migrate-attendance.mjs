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

async function run() {
  console.log('Starting migration script...');

  // Ensure break policies exist, if not create default ones to trigger the endpoint safely.
  // Actually, the PUT endpoint allows creating them. We just need to trigger PUT for every schedule.
  
  console.log('Fetching all schedules (horarios)...');
  const { data: horarios, error: hError } = await admin.from('horarios').select('id_horario');
  if (hError) throw hError;

  const VITE_SUPABASE_FUNCTIONS_URL = process.env.VITE_SUPABASE_FUNCTIONS_URL || `${url.replace(/\/+$/, '')}/functions/v1/api`;

  for (const h of horarios) {
    console.log(`Triggering reprocessing for schedule ID: ${h.id_horario}...`);
    try {
      const endpoint = `${VITE_SUPABASE_FUNCTIONS_URL}/api/break-policies/${h.id_horario}?reprocessFrom=2024-01-01`;
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRole}` // Using service role to bypass RLS or simulate admin
        },
        body: JSON.stringify({
          mode: 'FIXED',
          paid: false,
          mandatory: true,
          minMinutes: 60,
          maxMinutes: 60,
          expectedStart: '12:00:00',
          expectedEnd: '13:00:00',
          startTolerance: 15,
          endTolerance: 15,
          allowContinuousShift: false
        })
      });

      const body = await res.json();
      if (!res.ok) {
        console.error(`Error processing schedule ${h.id_horario}:`, body);
      } else {
        console.log(`Successfully reprocessed schedule ${h.id_horario}: ${body.affectedDays} days affected.`);
      }
    } catch (e) {
      console.error(`Fetch error for schedule ${h.id_horario}:`, e);
    }
  }

  console.log('Migration triggers completed.');
}

run().catch((err) => {
  console.error('Migration failed:', err.message || err);
  process.exitCode = 1;
});
