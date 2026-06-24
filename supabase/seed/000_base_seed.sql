-- Base seed data for catalogs and defaults

insert into public.horarios (
  nombre_turno,
  es_rotativo,
  tolerancia_entrada_min,
  tolerancia_salida_min,
  minutos_descanso,
  umbral_horas_extra_min
)
values
  ('Lun-Vie 09:00 a 18:00', false, 15, 15, 60, 30),
  ('Turno Manana 08:00 a 14:00', false, 10, 10, 30, 30)
on conflict do nothing;

insert into public.tipos_novedad_calculada (codigo, descripcion, es_justificable, porcentaje_afectacion_sueldo)
values
  ('TARDANZA', 'Tardanza', true, 0),
  ('AUSENCIA', 'Ausencia', true, 100),
  ('HS_EXTRA_50', 'Horas extra al 50%', false, 0),
  ('HS_EXTRA_100', 'Horas extra al 100%', false, 0),
  ('SALIDA_ANTIC', 'Salida anticipada', true, 0)
on conflict (codigo) do nothing;

insert into public.tipos_novedad_aprobada (codigo, descripcion, es_justificada)
values
  ('LIC_ENF', 'Licencia por Enfermedad', true),
  ('LIC_EST', 'Licencia por Examen', true),
  ('VAC', 'Vacaciones', true),
  ('SUSP', 'Suspension', false),
  ('PERM', 'Permiso especial', true)
on conflict (codigo) do nothing;

insert into public.configuracion_global (
  id,
  tolerancia_entrada_min,
  tolerancia_salida_min,
  umbral_horas_extra_min,
  minutos_descanso_default
)
values (1, 5, 0, 30, 60)
on conflict (id) do update
set
  tolerancia_entrada_min = excluded.tolerancia_entrada_min,
  tolerancia_salida_min = excluded.tolerancia_salida_min,
  umbral_horas_extra_min = excluded.umbral_horas_extra_min,
  minutos_descanso_default = excluded.minutos_descanso_default,
  updated_at = now();
