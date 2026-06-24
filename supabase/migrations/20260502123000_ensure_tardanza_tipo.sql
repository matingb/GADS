insert into public.tipos_novedad_calculada (
  codigo,
  descripcion,
  es_justificable,
  porcentaje_afectacion_sueldo
)
values ('TARDANZA', 'Tardanza', true, 0)
on conflict (codigo) do update
set
  descripcion = excluded.descripcion,
  es_justificable = excluded.es_justificable,
  porcentaje_afectacion_sueldo = excluded.porcentaje_afectacion_sueldo;
