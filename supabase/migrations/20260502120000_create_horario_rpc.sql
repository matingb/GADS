create or replace function public.rpc_create_horario(
  p_nombre text,
  p_tolerancia_entrada_min integer,
  p_tolerancia_salida_min integer,
  p_minutos_descanso integer,
  p_umbral_horas_extra_min integer,
  p_detalles jsonb
)
returns table(id bigint, nombre text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_detalle jsonb;
  v_dia integer;
  v_es_descanso boolean;
  v_hora_entrada text;
  v_hora_salida text;
  v_trabajados integer := 0;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del horario es obligatorio.' using errcode = '22023';
  end if;

  if p_tolerancia_entrada_min < 0
    or p_tolerancia_salida_min < 0
    or p_minutos_descanso < 0
    or p_umbral_horas_extra_min < 0 then
    raise exception 'Los valores numericos deben ser no negativos.' using errcode = '22023';
  end if;

  if p_detalles is null or jsonb_typeof(p_detalles) <> 'array' or jsonb_array_length(p_detalles) <> 7 then
    raise exception 'El horario debe incluir los 7 dias de la semana.' using errcode = '22023';
  end if;

  insert into public.horarios (
    nombre_turno,
    es_rotativo,
    tolerancia_entrada_min,
    tolerancia_salida_min,
    minutos_descanso,
    umbral_horas_extra_min
  ) values (
    trim(p_nombre),
    false,
    p_tolerancia_entrada_min,
    p_tolerancia_salida_min,
    p_minutos_descanso,
    p_umbral_horas_extra_min
  )
  returning id_horario into v_id;

  for v_detalle in select * from jsonb_array_elements(p_detalles)
  loop
    v_dia := (v_detalle->>'diaSemana')::integer;
    v_es_descanso := coalesce((v_detalle->>'esDescanso')::boolean, false);
    v_hora_entrada := nullif(v_detalle->>'horaEntrada', '');
    v_hora_salida := nullif(v_detalle->>'horaSalida', '');

    if v_dia is null or v_dia < 1 or v_dia > 7 then
      raise exception 'Dia de semana invalido.' using errcode = '22023';
    end if;

    if v_es_descanso then
      insert into public.horario_detalles (
        id_horario,
        numero_semana,
        dia_semana,
        hora_entrada,
        hora_salida,
        es_descanso
      ) values (v_id, 1, v_dia, null, null, true);
    else
      if v_hora_entrada is null or v_hora_salida is null then
        raise exception 'Los dias trabajados requieren hora de entrada y salida.' using errcode = '22023';
      end if;

      insert into public.horario_detalles (
        id_horario,
        numero_semana,
        dia_semana,
        hora_entrada,
        hora_salida,
        es_descanso
      ) values (v_id, 1, v_dia, v_hora_entrada::time, v_hora_salida::time, false);

      v_trabajados := v_trabajados + 1;
    end if;
  end loop;

  if v_trabajados = 0 then
    raise exception 'Debe existir al menos un dia trabajado.' using errcode = '22023';
  end if;

  return query select v_id, trim(p_nombre);
end;
$$;
