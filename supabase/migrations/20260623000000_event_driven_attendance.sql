-- ============================================================================
-- Event-Driven Attendance Interpretation System
-- Phase 1: Core Tables
-- ============================================================================

-- Enums para políticas de descanso
create type public.break_policy_mode as enum ('NONE', 'FIXED', 'FLEXIBLE');
create type public.interpretation_status as enum ('COMPLETE', 'INCOMPLETE', 'CONTINUOUS_SHIFT', 'NO_PUNCHES');
create type public.anomaly_severity as enum ('INFO', 'WARNING', 'ERROR');

-- ============================================================================
-- 1. PUNCH_EVENTS (Reemplaza fichadas, pero inmutable)
-- ============================================================================
create table public.punch_events (
  id uuid primary key default gen_random_uuid(),
  id_empleado bigint not null references public.empleados (id_empleado) on delete cascade,
  timestamp timestamptz not null,
  direction text not null check (direction in ('IN', 'OUT')),
  source text not null default 'MANUAL',
  metadata jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  
  -- Garantizar que no haya duplicados de mismo empleado/timestamp/dirección
  unique(id_empleado, timestamp, direction)
);

create index idx_punch_events_employee_date on public.punch_events (id_empleado, date(timestamp at time zone 'America/Argentina/Buenos_Aires'));
create index idx_punch_events_timestamp on public.punch_events (timestamp desc);

-- ============================================================================
-- 2. BREAK_POLICIES (Configurable por horario)
-- ============================================================================
create table public.break_policies (
  id uuid primary key default gen_random_uuid(),
  id_horario bigint not null references public.horarios (id_horario) on delete cascade unique,
  version integer not null default 1,
  
  -- Modo de política
  mode public.break_policy_mode not null default 'FIXED',
  
  -- Características
  paid boolean not null default false,
  mandatory boolean not null default true,
  
  -- Duración en minutos
  min_minutes integer not null check (min_minutes >= 0),
  max_minutes integer not null check (max_minutes >= min_minutes),
  
  -- Solo para FIXED mode
  expected_start time,
  expected_end time,
  
  -- Tolerancia
  start_tolerance integer not null default 15 check (start_tolerance >= 0),
  end_tolerance integer not null default 15 check (end_tolerance >= 0),
  
  -- Jornada continua
  allow_continuous_shift boolean not null default false,
  
  -- Auditoría y efectividad
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  
  -- Validaciones de reglas de negocio
  check (
    case 
      when mode = 'FIXED' then expected_start is not null and expected_end is not null
      else true
    end
  )
);

create index idx_break_policies_horario on public.break_policies (id_horario);
create index idx_break_policies_effective on public.break_policies (id_horario, effective_from desc);

-- ============================================================================
-- 3. ATTENDANCE_INTERPRETATIONS (Resultados persistidos, reprocesables)
-- ============================================================================
create table public.attendance_interpretations (
  id uuid primary key default gen_random_uuid(),
  id_empleado bigint not null references public.empleados (id_empleado) on delete cascade,
  work_date date not null,
  id_horario bigint references public.horarios (id_horario),
  id_policy uuid not null references public.break_policies (id),
  policy_version integer not null,
  
  -- Segmentos detectados (JSON porque cantidad variable)
  work_segments jsonb not null default '[]'::jsonb,
  break_segments jsonb not null default '[]'::jsonb,
  
  -- Cálculos en minutos
  worked_minutes integer,
  break_minutes integer,
  overtime_minutes integer, -- positivo: extra, negativo: falta
  
  -- Estado
  status public.interpretation_status not null default 'INCOMPLETE',
  
  -- Anomalías detectadas
  anomalies jsonb not null default '[]'::jsonb,
  
  -- Auditoría
  interpreted_at timestamptz not null default now(),
  interpreted_by text not null default 'ENGINE' check (interpreted_by in ('ENGINE', 'MANUAL')),
  notes text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Una interpretación por empleado y día
  unique(id_empleado, work_date)
);

create index idx_interpretations_employee_date on public.attendance_interpretations (id_empleado, work_date desc);
create index idx_interpretations_status on public.attendance_interpretations (status);
create index idx_interpretations_month on public.attendance_interpretations (id_empleado, date_trunc('month', work_date::timestamp));

-- ============================================================================
-- 4. TRIGGER para actualizar updated_at en break_policies
-- ============================================================================
create trigger break_policies_touch_updated_at 
before update on public.break_policies
for each row execute function public.touch_updated_at();

create trigger attendance_interpretations_touch_updated_at 
before update on public.attendance_interpretations
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Obtener la política de descanso vigente para un horario en una fecha
create or replace function public.get_active_break_policy(
  p_id_horario bigint,
  p_date date
)
returns table (
  id uuid,
  id_horario bigint,
  version integer,
  mode text,
  paid boolean,
  mandatory boolean,
  min_minutes integer,
  max_minutes integer,
  expected_start time,
  expected_end time,
  start_tolerance integer,
  end_tolerance integer,
  allow_continuous_shift boolean
) as $$
begin
  return query
  select 
    bp.id,
    bp.id_horario,
    bp.version,
    bp.mode::text,
    bp.paid,
    bp.mandatory,
    bp.min_minutes,
    bp.max_minutes,
    bp.expected_start,
    bp.expected_end,
    bp.start_tolerance,
    bp.end_tolerance,
    bp.allow_continuous_shift
  from public.break_policies bp
  where bp.id_horario = p_id_horario
    and bp.effective_from <= (p_date::timestamp + '23:59:59'::interval)
  order by bp.effective_from desc
  limit 1;
end;
$$ language plpgsql stable;

-- Obtener eventos de un empleado en un rango de fechas
create or replace function public.get_punch_events_range(
  p_id_empleado bigint,
  p_start_date date,
  p_end_date date
)
returns table (
  id uuid,
  id_empleado bigint,
  timestamp timestamptz,
  direction text,
  source text
) as $$
begin
  return query
  select 
    pe.id,
    pe.id_empleado,
    pe.timestamp,
    pe.direction,
    pe.source
  from public.punch_events pe
  where pe.id_empleado = p_id_empleado
    and date(pe.timestamp at time zone 'America/Argentina/Buenos_Aires') >= p_start_date
    and date(pe.timestamp at time zone 'America/Argentina/Buenos_Aires') <= p_end_date
  order by pe.timestamp asc;
end;
$$ language plpgsql stable;

-- Obtener horario activo de un empleado en una fecha
create or replace function public.get_employee_schedule(
  p_id_empleado bigint,
  p_work_date date
)
returns table (
  id_horario bigint,
  nombre_turno text,
  hora_entrada time,
  hora_salida time,
  es_descanso boolean
) as $$
begin
  return query
  select 
    h.id_horario,
    h.nombre_turno,
    hd.hora_entrada,
    hd.hora_salida,
    hd.es_descanso
  from public.asignaciones_horario ah
  join public.horarios h on ah.id_horario = h.id_horario
  join public.horario_detalles hd on h.id_horario = hd.id_horario
  where ah.id_empleado = p_id_empleado
    and ah.fecha_desde <= p_work_date
    and (ah.fecha_hasta is null or ah.fecha_hasta >= p_work_date)
    and hd.dia_semana = extract(dow from p_work_date)::integer
  limit 1;
end;
$$ language plpgsql stable;

-- ============================================================================
-- 6. COMMENTS para documentación
-- ============================================================================

comment on table public.punch_events is
'Eventos de entrada/salida inmutables. Son la fuente de verdad del sistema.
No se deben modificar una vez creados.';

comment on column public.punch_events.direction is
'IN = Entrada, OUT = Salida';

comment on column public.punch_events.source is
'BIOMETRIC, QR, API, o MANUAL - de dónde proviene el evento';

comment on table public.break_policies is
'Política de descanso/almuerzo configurable por horario.
Una política puede tener múltiples versiones en el tiempo (futuro).';

comment on column public.break_policies.mode is
'NONE: sin descanso obligatorio
FIXED: descanso a hora fija (expectedStart/expectedEnd)
FLEXIBLE: descanso flexible dentro de min/max minutos';

comment on table public.attendance_interpretations is
'Resultado de interpretar eventos de un día contra una política.
Se recalcula bajo demanda con nuevas políticas.
Es la fuente para reportes y cálculos de nómina.';

comment on column public.attendance_interpretations.status is
'COMPLETE: día con entrada y salida
INCOMPLETE: falta entrada o salida
CONTINUOUS_SHIFT: jornada continua permitida
NO_PUNCHES: sin eventos ese día';
