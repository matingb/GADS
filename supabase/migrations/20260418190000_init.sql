
--create extension if not exists "pgcrypto";

create type public.rol_usuario as enum ('ADMIN', 'EMPLEADO', 'CONTADOR');
create type public.estado_empleado as enum ('ACTIVO', 'INACTIVO', 'SUSPENDIDO');
create type public.tipo_fichada as enum ('ENTRADA', 'SALIDA');
create type public.origen_fichada as enum ('BIOMETRICO', 'MANUAL', 'QR', 'API');
create type public.estado_novedad as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');
create type public.estado_cierre as enum ('BORRADOR', 'CERRADO');

create table public.perfiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rol public.rol_usuario not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.empleados (
  id_empleado bigint generated always as identity primary key,
  user_id uuid unique references auth.users (id) on delete set null,
  legajo text not null unique,
  nombre_completo text not null,
  dni text,
  cuil text not null unique,
  fecha_ingreso date not null,
  estado public.estado_empleado not null default 'ACTIVO',
  modalidad_fichada text not null default 'MANUAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index empleados_estado_idx on public.empleados (estado);

create table public.horarios (
  id_horario bigint generated always as identity primary key,
  nombre_turno text not null,
  es_rotativo boolean not null default false,
  tolerancia_entrada_min integer not null default 5,
  tolerancia_salida_min integer not null default 0,
  minutos_descanso integer not null default 60,
  umbral_horas_extra_min integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tolerancia_entrada_min >= 0),
  check (tolerancia_salida_min >= 0),
  check (minutos_descanso >= 0),
  check (umbral_horas_extra_min >= 0)
);

create table public.horario_detalles (
  id_detalle bigint generated always as identity primary key,
  id_horario bigint not null references public.horarios (id_horario) on delete cascade,
  numero_semana integer not null default 1,
  dia_semana integer not null,
  hora_entrada time,
  hora_salida time,
  es_descanso boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (numero_semana >= 1),
  check (dia_semana between 1 and 7)
);

create table public.asignaciones_horario (
  id_asignacion bigint generated always as identity primary key,
  id_empleado bigint not null references public.empleados (id_empleado) on delete cascade,
  id_horario bigint not null references public.horarios (id_horario),
  fecha_desde date not null,
  fecha_hasta date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_hasta is null or fecha_hasta >= fecha_desde)
);

create index asignaciones_horario_empleado_desde_idx on public.asignaciones_horario (id_empleado, fecha_desde desc);
create unique index asignaciones_horario_activa_uidx on public.asignaciones_horario (id_empleado) where fecha_hasta is null;

create table public.fichadas (
  id_fichada bigint generated always as identity primary key,
  id_empleado bigint not null references public.empleados (id_empleado),
  "timestamp" timestamptz not null default now(),
  tipo public.tipo_fichada not null,
  origen public.origen_fichada not null,
  id_usuario_carga uuid references auth.users (id),
  id_fichada_original bigint references public.fichadas (id_fichada),
  created_at timestamptz not null default now()
);

create index fichadas_empleado_timestamp_idx on public.fichadas (id_empleado, "timestamp" desc);
create index fichadas_timestamp_idx on public.fichadas ("timestamp" desc);

create table public.tipos_novedad_calculada (
  id_tipo bigint generated always as identity primary key,
  codigo text not null unique,
  descripcion text not null,
  es_justificable boolean not null default false,
  porcentaje_afectacion_sueldo numeric(5,2) not null default 0
);

create table public.tipos_novedad_aprobada (
  id_tipo bigint generated always as identity primary key,
  codigo text not null unique,
  descripcion text not null,
  es_justificada boolean not null default true
);

create table public.cierres_mensuales (
  id_cierre bigint generated always as identity primary key,
  periodo text not null unique,
  fecha_cierre timestamptz not null default now(),
  id_usuario_cerro uuid not null references auth.users (id),
  estado public.estado_cierre not null default 'CERRADO',
  created_at timestamptz not null default now(),
  check (periodo ~ '^\\d{4}-\\d{2}$')
);

create table public.novedades_calculadas (
  id_novedad_calc bigint generated always as identity primary key,
  id_empleado bigint not null references public.empleados (id_empleado),
  id_tipo bigint not null references public.tipos_novedad_calculada (id_tipo),
  fecha date not null,
  cantidad_minutos integer not null default 0,
  estado public.estado_novedad not null default 'PENDIENTE',
  id_cierre bigint references public.cierres_mensuales (id_cierre),
  id_novedad_aprobada bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cantidad_minutos >= 0)
);

create index novedades_calculadas_empleado_fecha_idx on public.novedades_calculadas (id_empleado, fecha);
create index novedades_calculadas_estado_idx on public.novedades_calculadas (estado);

create table public.novedades_aprobadas (
  id_novedad_aprobada bigint generated always as identity primary key,
  id_empleado bigint not null references public.empleados (id_empleado),
  id_tipo bigint not null references public.tipos_novedad_aprobada (id_tipo),
  fecha_inicio date not null,
  fecha_fin date not null,
  estado public.estado_novedad not null default 'PENDIENTE',
  id_usuario_carga uuid not null references auth.users (id),
  id_usuario_aprueba uuid references auth.users (id),
  observacion text,
  id_cierre bigint references public.cierres_mensuales (id_cierre),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index novedades_aprobadas_empleado_inicio_idx on public.novedades_aprobadas (id_empleado, fecha_inicio);
create index novedades_aprobadas_estado_idx on public.novedades_aprobadas (estado);

create table public.configuracion_global (
  id integer primary key default 1,
  tolerancia_entrada_min integer not null default 5,
  tolerancia_salida_min integer not null default 0,
  umbral_horas_extra_min integer not null default 30,
  minutos_descanso_default integer not null default 60,
  updated_at timestamptz not null default now(),
  check (id = 1),
  check (tolerancia_entrada_min >= 0),
  check (tolerancia_salida_min >= 0),
  check (umbral_horas_extra_min >= 0),
  check (minutos_descanso_default >= 0)
);

create table public.feriados (
  id_feriado bigint generated always as identity primary key,
  fecha date not null unique,
  descripcion text not null,
  es_nacional boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger perfiles_touch_updated_at before update on public.perfiles
for each row execute function public.touch_updated_at();

create trigger empleados_touch_updated_at before update on public.empleados
for each row execute function public.touch_updated_at();

create trigger horarios_touch_updated_at before update on public.horarios
for each row execute function public.touch_updated_at();

create trigger horario_detalles_touch_updated_at before update on public.horario_detalles
for each row execute function public.touch_updated_at();

create trigger asignaciones_horario_touch_updated_at before update on public.asignaciones_horario
for each row execute function public.touch_updated_at();

create trigger novedades_calculadas_touch_updated_at before update on public.novedades_calculadas
for each row execute function public.touch_updated_at();

create trigger novedades_aprobadas_touch_updated_at before update on public.novedades_aprobadas
for each row execute function public.touch_updated_at();

create or replace view public.v_novedades_unificadas as
select
  'calc_' || nc.id_novedad_calc as id,
  nc.id_empleado,
  e.nombre_completo as empleado_nombre,
  e.legajo as empleado_legajo,
  tnc.codigo as tipo,
  tnc.descripcion,
  nc.fecha as fecha_inicio,
  nc.fecha as fecha_fin,
  nc.cantidad_minutos,
  nc.estado,
  'AUTOMATICA'::text as origen,
  null::text as observacion
from public.novedades_calculadas nc
join public.empleados e on e.id_empleado = nc.id_empleado
join public.tipos_novedad_calculada tnc on tnc.id_tipo = nc.id_tipo
union all
select
  'apr_' || na.id_novedad_aprobada as id,
  na.id_empleado,
  e.nombre_completo as empleado_nombre,
  e.legajo as empleado_legajo,
  tna.codigo as tipo,
  tna.descripcion,
  na.fecha_inicio,
  na.fecha_fin,
  null::integer as cantidad_minutos,
  na.estado,
  'MANUAL'::text as origen,
  na.observacion
from public.novedades_aprobadas na
join public.empleados e on e.id_empleado = na.id_empleado
join public.tipos_novedad_aprobada tna on tna.id_tipo = na.id_tipo;

create or replace function public.rpc_preliquidacion(periodo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resumen_json jsonb;
  pendientes_json jsonb;
begin
  if periodo !~ '^\\d{4}-\\d{2}$' then
    raise exception 'Periodo invalido. Formato esperado YYYY-MM.' using errcode = '22023';
  end if;

  with resumen_base as (
    select
      e.id_empleado,
      e.legajo,
      e.nombre_completo,
      count(distinct date(f."timestamp")) filter (
        where to_char(f."timestamp", 'YYYY-MM') = periodo and f.tipo = 'ENTRADA'
      ) as dias_trabajados,
      coalesce(sum(case when tnc.codigo = 'TARDANZA' then nc.cantidad_minutos else 0 end), 0) as tardanzas_min,
      coalesce(sum(case when tnc.codigo = 'HS_EXTRA_50' then nc.cantidad_minutos else 0 end), 0) as horas_extra_50_min,
      coalesce(sum(case when tnc.codigo = 'HS_EXTRA_100' then nc.cantidad_minutos else 0 end), 0) as horas_extra_100_min,
      coalesce(sum(case when tnc.codigo = 'SALIDA_ANTIC' then nc.cantidad_minutos else 0 end), 0) as salida_anticipada_min,
      coalesce(sum(case when tnc.codigo = 'AUSENCIA' then nc.cantidad_minutos else 0 end), 0) as ausencias_min
    from public.empleados e
    left join public.fichadas f on f.id_empleado = e.id_empleado
    left join public.novedades_calculadas nc
      on nc.id_empleado = e.id_empleado
      and to_char(nc.fecha, 'YYYY-MM') = periodo
    left join public.tipos_novedad_calculada tnc on tnc.id_tipo = nc.id_tipo
    group by e.id_empleado, e.legajo, e.nombre_completo
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'empleadoId', rb.id_empleado,
        'legajo', rb.legajo,
        'nombre', rb.nombre_completo,
        'diasTrabajados', rb.dias_trabajados,
        'tardanzasMin', rb.tardanzas_min,
        'horasExtra50Min', rb.horas_extra_50_min,
        'horasExtra100Min', rb.horas_extra_100_min,
        'salidaAnticipadaMin', rb.salida_anticipada_min,
        'ausencias', round((rb.ausencias_min::numeric / 480.0))::integer,
        'novedadesAprobadas', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'codigo', tna.codigo,
              'descripcion', tna.descripcion,
              'fechaInicio', na.fecha_inicio,
              'fechaFin', na.fecha_fin,
              'estado', na.estado,
              'observacion', na.observacion
            )
            order by na.fecha_inicio
          )
          from public.novedades_aprobadas na
          join public.tipos_novedad_aprobada tna on tna.id_tipo = na.id_tipo
          where na.id_empleado = rb.id_empleado
            and to_char(na.fecha_inicio, 'YYYY-MM') = periodo
        ), '[]'::jsonb)
      )
      order by rb.legajo
    ),
    '[]'::jsonb
  ) into resumen_json
  from resumen_base rb;

  with pendientes as (
    select
      'calc_' || nc.id_novedad_calc as id,
      e.nombre_completo as empleado_nombre,
      e.legajo as empleado_legajo,
      tnc.codigo as tipo,
      jsonb_build_array(to_char(nc.fecha, 'YYYY-MM-DD')) as fechas_afectadas,
      nc.estado,
      'AUTOMATICA'::text as origen,
      nc.cantidad_minutos,
      null::text as observacion
    from public.novedades_calculadas nc
    join public.empleados e on e.id_empleado = nc.id_empleado
    join public.tipos_novedad_calculada tnc on tnc.id_tipo = nc.id_tipo
    where to_char(nc.fecha, 'YYYY-MM') = periodo and nc.estado = 'PENDIENTE'

    union all

    select
      'apr_' || na.id_novedad_aprobada as id,
      e.nombre_completo as empleado_nombre,
      e.legajo as empleado_legajo,
      tna.codigo as tipo,
      jsonb_build_array(to_char(na.fecha_inicio, 'YYYY-MM-DD')) as fechas_afectadas,
      na.estado,
      'MANUAL'::text as origen,
      null::integer as cantidad_minutos,
      na.observacion
    from public.novedades_aprobadas na
    join public.empleados e on e.id_empleado = na.id_empleado
    join public.tipos_novedad_aprobada tna on tna.id_tipo = na.id_tipo
    where to_char(na.fecha_inicio, 'YYYY-MM') = periodo and na.estado = 'PENDIENTE'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'empleadoNombre', p.empleado_nombre,
        'empleadoLegajo', p.empleado_legajo,
        'tipo', p.tipo,
        'fechasAfectadas', p.fechas_afectadas,
        'estado', p.estado,
        'origen', p.origen,
        'cantidadMinutos', p.cantidad_minutos,
        'observacion', p.observacion
      )
      order by p.empleado_legajo
    ),
    '[]'::jsonb
  ) into pendientes_json
  from pendientes p;

  return jsonb_build_object(
    'periodo', periodo,
    'resumen', resumen_json,
    'pendientes', pendientes_json
  );
end;
$$;

create or replace function public.rpc_create_empleado(
  p_legajo text,
  p_nombre text,
  p_cuil text,
  p_categoria_laboral text,
  p_estado public.estado_empleado default 'ACTIVO',
  p_horario_id bigint default null
)
returns table(id bigint, nombre text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.empleados (
    legajo,
    nombre_completo,
    dni,
    cuil,
    fecha_ingreso,
    estado,
    modalidad_fichada
  ) values (
    p_legajo,
    p_nombre,
    '',
    p_cuil,
    current_date,
    coalesce(p_estado, 'ACTIVO'),
    coalesce(nullif(trim(p_categoria_laboral), ''), 'MANUAL')
  )
  returning id_empleado into v_id;

  if p_horario_id is not null then
    insert into public.asignaciones_horario (id_empleado, id_horario, fecha_desde, fecha_hasta)
    values (v_id, p_horario_id, current_date, null);
  end if;

  return query select v_id, p_nombre;
end;
$$;

create or replace function public.rpc_cerrar_periodo(
  p_periodo text,
  p_usuario_cerro uuid
)
returns table(id bigint, periodo text, fecha_cierre timestamptz, estado public.estado_cierre)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendientes integer;
begin
  if p_periodo !~ '^\\d{4}-\\d{2}$' then
    raise exception 'Periodo invalido. Formato esperado YYYY-MM.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.cierres_mensuales c
    where c.periodo = p_periodo
      and c.estado = 'CERRADO'
  ) then
    raise exception 'El periodo ya se encuentra cerrado.' using errcode = '23505';
  end if;

  select (
    select count(*)
    from public.novedades_calculadas nc
    where to_char(nc.fecha, 'YYYY-MM') = p_periodo
      and nc.estado = 'PENDIENTE'
  ) + (
    select count(*)
    from public.novedades_aprobadas na
    where to_char(na.fecha_inicio, 'YYYY-MM') = p_periodo
      and na.estado = 'PENDIENTE'
  ) into v_pendientes;

  if v_pendientes > 0 then
    raise exception 'No se puede cerrar: quedan % novedad(es) pendientes.', v_pendientes using errcode = '23514';
  end if;

  return query
  insert into public.cierres_mensuales (periodo, id_usuario_cerro, estado)
  values (p_periodo, p_usuario_cerro, 'CERRADO')
  returning id_cierre, cierres_mensuales.periodo, cierres_mensuales.fecha_cierre, cierres_mensuales.estado;
end;
$$;

create or replace function public.rpc_aprobar_novedades_pendientes(
  p_periodo text,
  p_usuario_aprueba uuid
)
returns table(actualizadas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_calc integer;
  v_count_apr integer;
begin
  if p_periodo !~ '^\\d{4}-\\d{2}$' then
    raise exception 'Periodo invalido. Formato esperado YYYY-MM.' using errcode = '22023';
  end if;

  update public.novedades_calculadas
  set estado = 'APROBADA'
  where estado = 'PENDIENTE'
    and to_char(fecha, 'YYYY-MM') = p_periodo;
  get diagnostics v_count_calc = row_count;

  update public.novedades_aprobadas
  set estado = 'APROBADA',
      id_usuario_aprueba = p_usuario_aprueba
  where estado = 'PENDIENTE'
    and to_char(fecha_inicio, 'YYYY-MM') = p_periodo;
  get diagnostics v_count_apr = row_count;

  return query select v_count_calc + v_count_apr;
end;
$$;

insert into public.configuracion_global (id) values (1)
on conflict (id) do nothing;

alter table public.perfiles enable row level security;
alter table public.empleados enable row level security;
alter table public.horarios enable row level security;
alter table public.horario_detalles enable row level security;
alter table public.asignaciones_horario enable row level security;
alter table public.fichadas enable row level security;
alter table public.tipos_novedad_calculada enable row level security;
alter table public.tipos_novedad_aprobada enable row level security;
alter table public.novedades_calculadas enable row level security;
alter table public.novedades_aprobadas enable row level security;
alter table public.cierres_mensuales enable row level security;
alter table public.configuracion_global enable row level security;
alter table public.feriados enable row level security;

create policy perfiles_closed_auth on public.perfiles for all to authenticated using (false) with check (false);
create policy empleados_closed_auth on public.empleados for all to authenticated using (false) with check (false);
create policy horarios_closed_auth on public.horarios for all to authenticated using (false) with check (false);
create policy horario_detalles_closed_auth on public.horario_detalles for all to authenticated using (false) with check (false);
create policy asignaciones_horario_closed_auth on public.asignaciones_horario for all to authenticated using (false) with check (false);
create policy fichadas_closed_auth on public.fichadas for all to authenticated using (false) with check (false);
create policy tipos_novedad_calculada_closed_auth on public.tipos_novedad_calculada for all to authenticated using (false) with check (false);
create policy tipos_novedad_aprobada_closed_auth on public.tipos_novedad_aprobada for all to authenticated using (false) with check (false);
create policy novedades_calculadas_closed_auth on public.novedades_calculadas for all to authenticated using (false) with check (false);
create policy novedades_aprobadas_closed_auth on public.novedades_aprobadas for all to authenticated using (false) with check (false);
create policy cierres_mensuales_closed_auth on public.cierres_mensuales for all to authenticated using (false) with check (false);
create policy configuracion_global_closed_auth on public.configuracion_global for all to authenticated using (false) with check (false);
create policy feriados_closed_auth on public.feriados for all to authenticated using (false) with check (false);
