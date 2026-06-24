insert into public.tipos_novedad_aprobada (codigo, descripcion, es_justificada)
values
  ('LIC_ENF', 'Licencia por Enfermedad', true),
  ('LIC_EST', 'Licencia por Examen', true),
  ('VAC', 'Vacaciones', true),
  ('SUSP', 'Suspension', false),
  ('PERM', 'Permiso especial', true)
on conflict (codigo) do update
set
  descripcion = excluded.descripcion,
  es_justificada = excluded.es_justificada;

create or replace view public.v_empleado_detalle_mensual as
with periodos as (
  select to_char(current_date, 'YYYY-MM') as periodo
  union
  select distinct to_char(fecha_ingreso, 'YYYY-MM') from public.empleados
  union
  select distinct to_char("timestamp", 'YYYY-MM') from public.fichadas
  union
  select distinct to_char(fecha, 'YYYY-MM') from public.novedades_calculadas
  union
  select distinct to_char(fecha_inicio, 'YYYY-MM') from public.novedades_aprobadas
  union
  select distinct to_char(fecha_fin, 'YYYY-MM') from public.novedades_aprobadas
),
empleado_periodos as (
  select e.id_empleado, p.periodo
  from public.empleados e
  cross join periodos p
),
horario_activo as (
  select
    ah.id_empleado,
    ah.id_horario,
    h.nombre_turno,
    h.minutos_descanso
  from public.asignaciones_horario ah
  join public.horarios h on h.id_horario = ah.id_horario
  where ah.fecha_hasta is null
),
fichadas_diarias as (
  select
    f.id_empleado,
    f."timestamp"::date as fecha,
    min(f."timestamp") filter (where f.tipo = 'ENTRADA') as entrada_ts,
    max(f."timestamp") filter (where f.tipo = 'SALIDA') as salida_ts
  from public.fichadas f
  group by f.id_empleado, f."timestamp"::date
),
novedades_calc_diarias as (
  select
    nc.id_empleado,
    nc.fecha,
    bool_or(tnc.codigo = 'AUSENCIA') as tiene_ausencia,
    bool_or(tnc.codigo = 'TARDANZA') as tiene_tardanza,
    bool_or(tnc.codigo in ('HS_EXTRA_50', 'HS_EXTRA_100')) as tiene_extra
  from public.novedades_calculadas nc
  join public.tipos_novedad_calculada tnc on tnc.id_tipo = nc.id_tipo
  group by nc.id_empleado, nc.fecha
),
dias_detalle as (
  select id_empleado, fecha from fichadas_diarias
  union
  select id_empleado, fecha from novedades_calc_diarias
),
fichadas_detalle as (
  select
    dd.id_empleado,
    to_char(dd.fecha, 'YYYY-MM') as periodo,
    dd.fecha,
    fd.entrada_ts,
    fd.salida_ts,
    case
      when coalesce(ncd.tiene_ausencia, false) then 'AUSENTE'
      when coalesce(ncd.tiene_tardanza, false) then 'TARDE'
      when coalesce(ncd.tiene_extra, false) then 'EXTRA'
      when fd.entrada_ts is null or fd.salida_ts is null then 'INCOMPLETA'
      else 'NORMAL'
    end as estado,
    case
      when fd.entrada_ts is not null and fd.salida_ts is not null then
        round(
          greatest(
            (
              extract(epoch from (fd.salida_ts - fd.entrada_ts)) / 3600.0
            ) - (coalesce(ha.minutos_descanso, 0)::numeric / 60.0),
            0
          ),
          2
        )
      else 0
    end as horas
  from dias_detalle dd
  left join fichadas_diarias fd on fd.id_empleado = dd.id_empleado and fd.fecha = dd.fecha
  left join novedades_calc_diarias ncd on ncd.id_empleado = dd.id_empleado and ncd.fecha = dd.fecha
  left join horario_activo ha on ha.id_empleado = dd.id_empleado
),
stats_fichadas as (
  select
    ep.id_empleado,
    ep.periodo,
    coalesce(count(distinct f."timestamp"::date) filter (where f.tipo = 'ENTRADA'), 0) as asistencias
  from empleado_periodos ep
  left join public.fichadas f
    on f.id_empleado = ep.id_empleado
    and to_char(f."timestamp", 'YYYY-MM') = ep.periodo
  group by ep.id_empleado, ep.periodo
),
stats_novedades as (
  select
    ep.id_empleado,
    ep.periodo,
    coalesce(count(nc.id_novedad_calc) filter (where tnc.codigo = 'AUSENCIA'), 0) as inasistencias,
    coalesce(count(nc.id_novedad_calc) filter (where tnc.codigo = 'TARDANZA'), 0) as llegadas_tarde,
    coalesce(sum(nc.cantidad_minutos) filter (where tnc.codigo in ('HS_EXTRA_50', 'HS_EXTRA_100')), 0) as horas_extra_min
  from empleado_periodos ep
  left join public.novedades_calculadas nc
    on nc.id_empleado = ep.id_empleado
    and to_char(nc.fecha, 'YYYY-MM') = ep.periodo
  left join public.tipos_novedad_calculada tnc on tnc.id_tipo = nc.id_tipo
  group by ep.id_empleado, ep.periodo
),
stats_periodo as (
  select
    ep.id_empleado,
    ep.periodo,
    coalesce(sf.asistencias, 0) as asistencias,
    coalesce(sn.inasistencias, 0) as inasistencias,
    coalesce(sn.llegadas_tarde, 0) as llegadas_tarde,
    coalesce(sn.horas_extra_min, 0) as horas_extra_min
  from empleado_periodos ep
  left join stats_fichadas sf on sf.id_empleado = ep.id_empleado and sf.periodo = ep.periodo
  left join stats_novedades sn on sn.id_empleado = ep.id_empleado and sn.periodo = ep.periodo
),
stats_actual as (
  select
    sp.*,
    coalesce(prev.asistencias, 0) as asistencias_prev,
    coalesce(prev.inasistencias, 0) as inasistencias_prev,
    coalesce(prev.llegadas_tarde, 0) as llegadas_tarde_prev,
    coalesce(prev.horas_extra_min, 0) as horas_extra_min_prev
  from stats_periodo sp
  left join stats_periodo prev
    on prev.id_empleado = sp.id_empleado
    and prev.periodo = to_char((to_date(sp.periodo || '-01', 'YYYY-MM-DD') - interval '1 month')::date, 'YYYY-MM')
),
licencias_json as (
  select
    na.id_empleado,
    p.periodo,
    jsonb_agg(
      jsonb_build_object(
        'id', 'apr_' || na.id_novedad_aprobada,
        'tipo', tna.descripcion,
        'desde', na.fecha_inicio,
        'hasta', na.fecha_fin,
        'estado', na.estado,
        'observacion', na.observacion
      )
      order by na.fecha_inicio desc, na.id_novedad_aprobada desc
    ) as licencias
  from public.novedades_aprobadas na
  join public.tipos_novedad_aprobada tna on tna.id_tipo = na.id_tipo
  join periodos p
    on to_date(p.periodo || '-01', 'YYYY-MM-DD') <= na.fecha_fin
    and (to_date(p.periodo || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date >= na.fecha_inicio
  group by na.id_empleado, p.periodo
),
novedades_json as (
  select
    n.id_empleado,
    p.periodo,
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'tipo', n.descripcion,
        'fecha', n.fecha_inicio,
        'detalle', case
          when n.cantidad_minutos is not null and n.cantidad_minutos > 0 then n.cantidad_minutos || ' minutos'
          when n.observacion is not null and trim(n.observacion) <> '' then n.observacion
          else n.descripcion
        end,
        'cantidadMinutos', n.cantidad_minutos,
        'estado', n.estado,
        'origen', n.origen
      )
      order by n.fecha_inicio desc, n.id desc
    ) as novedades
  from public.v_novedades_unificadas n
  join periodos p
    on to_date(p.periodo || '-01', 'YYYY-MM-DD') <= n.fecha_fin
    and (to_date(p.periodo || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date >= n.fecha_inicio
  group by n.id_empleado, p.periodo
),
fichadas_json as (
  select
    fd.id_empleado,
    fd.periodo,
    jsonb_agg(
      jsonb_build_object(
        'id', fd.id_empleado || '_' || fd.fecha,
        'fecha', fd.fecha,
        'entrada', to_char(fd.entrada_ts, 'HH24:MI'),
        'salida', to_char(fd.salida_ts, 'HH24:MI'),
        'estado', fd.estado
      )
      order by fd.fecha desc
    ) as fichadas,
    jsonb_agg(
      jsonb_build_object(
        'name', initcap(to_char(fd.fecha, 'Dy')),
        'fecha', fd.fecha,
        'horas', fd.horas
      )
      order by fd.fecha
    ) as chart_data
  from fichadas_detalle fd
  group by fd.id_empleado, fd.periodo
)
select
  ep.id_empleado,
  ep.periodo,
  e.nombre_completo,
  e.legajo,
  e.cuil,
  e.modalidad_fichada,
  e.estado,
  e.fecha_ingreso,
  coalesce(ha.nombre_turno, 'Sin asignar') as horario_nombre,
  jsonb_build_object(
    'asistencias', coalesce(sa.asistencias, 0),
    'inasistencias', coalesce(sa.inasistencias, 0),
    'llegadasTarde', coalesce(sa.llegadas_tarde, 0),
    'horasExtras', round((coalesce(sa.horas_extra_min, 0)::numeric / 60.0), 1),
    'tendencias', jsonb_build_object(
      'asistencias', coalesce(sa.asistencias, 0) - coalesce(sa.asistencias_prev, 0),
      'inasistencias', coalesce(sa.inasistencias, 0) - coalesce(sa.inasistencias_prev, 0),
      'llegadasTarde', coalesce(sa.llegadas_tarde, 0) - coalesce(sa.llegadas_tarde_prev, 0),
      'horasExtras', round(((coalesce(sa.horas_extra_min, 0) - coalesce(sa.horas_extra_min_prev, 0))::numeric / 60.0), 1)
    )
  ) as stats,
  coalesce(fj.fichadas, '[]'::jsonb) as fichadas,
  coalesce(lj.licencias, '[]'::jsonb) as licencias,
  coalesce(nj.novedades, '[]'::jsonb) as novedades,
  coalesce(fj.chart_data, '[]'::jsonb) as chart_data
from empleado_periodos ep
join public.empleados e on e.id_empleado = ep.id_empleado
left join horario_activo ha on ha.id_empleado = ep.id_empleado
left join stats_actual sa on sa.id_empleado = ep.id_empleado and sa.periodo = ep.periodo
left join fichadas_json fj on fj.id_empleado = ep.id_empleado and fj.periodo = ep.periodo
left join licencias_json lj on lj.id_empleado = ep.id_empleado and lj.periodo = ep.periodo
left join novedades_json nj on nj.id_empleado = ep.id_empleado and nj.periodo = ep.periodo;
