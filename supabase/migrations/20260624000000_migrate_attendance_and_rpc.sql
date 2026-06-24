-- 1. Migrar fichadas a punch_events
insert into public.punch_events (id_empleado, timestamp, direction, source, created_at)
select id_empleado, "timestamp", 
       case when tipo = 'ENTRADA' then 'IN' else 'OUT' end,
       case when origen = 'BIOMETRICO' then 'BIOMETRIC' else 'MANUAL' end,
       created_at
from public.fichadas
on conflict do nothing;

-- 2. Crear default break_policies para todos los horarios existentes
insert into public.break_policies (
  id_horario, 
  mode,
  min_minutes,
  max_minutes,
  expected_start,
  expected_end,
  start_tolerance,
  end_tolerance,
  created_by
)
select 
  h.id_horario,
  'FIXED'::public.break_policy_mode,
  h.minutos_descanso,
  h.minutos_descanso,
  '12:00:00'::time,
  '13:00:00'::time,
  15,
  15,
  (select id from auth.users order by created_at limit 1) -- default admin
from public.horarios h
where not exists (
  select 1 from public.break_policies bp where bp.id_horario = h.id_horario
);

-- 3. Actualizar rpc_preliquidacion para usar attendance_interpretations
create or replace function public.rpc_preliquidacion(periodo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pendientes_json jsonb;
begin
  if periodo !~ '^\d{4}-\d{2}$' then
    raise exception 'Periodo invalido. Formato esperado YYYY-MM.' using errcode = '22023';
  end if;

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
    'resumen', '[]'::jsonb,
    'pendientes', pendientes_json
  );
end;
$$;
