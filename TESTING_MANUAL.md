# Testing Manual - Phase 2

## Preparación

### Requisitos
- Backend corriendo (Supabase/Edge Functions)
- Base de datos poblada con:
  - ✅ Empleados
  - ✅ Horarios
  - ✅ Algunas fichadas de prueba
- Frontend corriendo en modo dev

---

## Test 1: Registrar Fichada Manual (AdminFichadas)

### Precondiciones
- Rol: ADMIN
- Página: AdminFichadas

### Pasos

1. **Cargar página**
   ```
   Esperado: Tabla con fichadas existentes se carga
   Verificar: ✅ Sin errores en consola
   ```

2. **Clic en "Registrar Fichada Manual"**
   ```
   Esperado: Modal se abre
   Verificar: ✅ Título "Registrar Fichada Manual"
             ✅ Botones Entrada/Salida
   ```

3. **Llenar formulario**
   ```
   - Empleado: Seleccionar cualquiera
   - Tipo: Entrada (IN)
   - Fecha: Hoy
   - Hora: 09:15
   - Clic en "Guardar Fichada"
   ```

4. **Verificar resultado**
   ```
   Esperado: 
   ✅ Mensaje verde: "Fichada de entrada registrada exitosamente"
   ✅ Modal se cierra
   ✅ Nueva fila aparece en tabla
   ✅ Fila muestra:
      - Fecha/Hora correcta
      - Tipo: ENTRADA (verde)
      - Estado jornada: "Cargando..." → "Jornada Incompleta" (naranja)
      - Anomalías: "Sin anomalías"
   ```

5. **Registrar salida**
   ```
   - Repetir pasos 2-3 pero seleccionar "Salida" a las 18:00
   ```

6. **Verificar estado final**
   ```
   Esperado:
   ✅ Fila actualizada muestra:
      - Estado: "Jornada Completa" (verde) SI las horas son válidas
      - Anomalías: Puede mostrar "1 anomalía" SI hay (ej: tardanza)
   ```

### Errores Esperados Comunes
- ❌ "Error al registrar la fichada" → Revisar backend logs
- ❌ Modal no se cierra → Check console for JS errors
- ❌ Interpretación no aparece → Backend no ejecutó AttendanceEngine

---

## Test 2: Ver Mis Fichadas con Detalles (MisFichadas)

### Precondiciones
- Rol: EMPLEADO
- Empleado con fichadas registradas en el mes actual

### Pasos

1. **Cargar página**
   ```
   Esperado:
   ✅ Resumen mensual aparece con:
      - Días Trabajados: número
      - Horas Trabajadas: Xh YYm
      - Horas Extras: 0h 0m (si no hay)
      - Con Anomalías: número
   ```

2. **Verificar grid de días**
   ```
   Esperado:
   ✅ Botones de días 1-30/31
   ✅ Colores:
      - Verde: días con jornada completa
      - Amarillo: días con anomalías
      - Blanco: días sin datos
   ```

3. **Clic en día con jornada completa (verde)**
   ```
   Esperado:
   ✅ Panel de detalles se llena:
      - Estado: "Jornada Completa"
      - Tiempo Trabajado: mostrando horas
      - Descanso: mostrando minutos
      - Horas Extras: 0h 0m (si aplica)
      - Anomalías: 0
   ```

4. **Verificar segmentos de trabajo**
   ```
   Esperado:
   ✅ Tabla verde con segmentos:
      - 09:00 - 12:00 = 3h 0m
      - 13:00 - 18:00 = 5h 0m
   ```

5. **Verificar segmentos de descanso**
   ```
   Esperado:
   ✅ Tabla azul con segmentos:
      - 12:00 - 13:00 = 1h 0m
   ```

6. **Clic en día con anomalías (amarillo)**
   ```
   Esperado:
   ✅ Panel muestra anomalías:
      - Tarjeta roja/amarilla según severidad
      - Tipo: "Entrada Tardía" / "Descanso Muy Corto" / etc
      - Descripción legible
      - Minutos afectados: mostrados
   ```

7. **Cambiar mes**
   ```
   - Clic en "Anterior" o "Siguiente"
   Esperado:
   ✅ Grid de días se actualiza
   ✅ Titulo muestra mes correcto
   ✅ Resumen se recalcula
   ```

### Errores Esperados
- ❌ "Cargando..." indefinidamente → Backend `/api/attendance` no responde
- ❌ Segmentos vacíos → InterpretationResult.workSegments no poblan
- ❌ Anomalías no aparecen → Anomalies array vacío o mapper incorrecto

---

## Test 3: Preliquidación (PreLiquidacion)

### Precondiciones
- Rol: ADMIN
- Múltiples empleados con fichadas en el mes

### Pasos

1. **Cargar página**
   ```
   Esperado:
   ✅ Cargando... → Tabla aparece con empleados
   ✅ Cada fila muestra:
      - Legajo
      - Nombre
      - Días Trabajados: X
      - Tardanzas: 0 o XXX min
      - Hs Extra 50%: 0 o XXX min
      - Hs Extra 100%: 0 o XXX min
      - Ausencias: 0 o X
   ```

2. **Cambiar período**
   ```
   - Input "Período": seleccionar mes anterior
   Esperado:
   ✅ Tabla se recarga con datos del mes anterior
   ✅ Números cambian según período
   ```

3. **Verificar cálculos**
   ```
   Para empleado X:
   - Días Trabajados: debería = interpretations.filter(i => i.status === 'COMPLETE').length
   - Tardanzas: debería = sum(anomalies.TARDANZA.minutesAffected)
   - Hs Extra 50%: debería = sum(anomalies.OVERTIME_50.minutesAffected)
   
   Verificar: ✅ Números coinciden con MisFichadas
   ```

4. **Exportar CSV**
   ```
   - Clic en botón "CSV"
   Esperado:
   ✅ Descarga archivo preliquidacion_YYYY-MM.csv
   ✅ Contiene datos de tabla
   ✅ Formato correcto (separado por comas)
   ```

5. **Exportar PDF**
   ```
   - Clic en botón "PDF"
   Esperado:
   ✅ Descarga archivo preliquidacion_YYYY-MM.pdf
   ✅ Contiene tabla con datos
   ✅ Formato legible
   ```

6. **Cerrar período**
   ```
   - Clic en "Cerrar Período"
   Esperado:
   ✅ Mensaje: "Periodo YYYY-MM cerrado exitosamente."
   ✅ Botón cambia a "Período Cerrado" (gris)
   ✅ No se puede cerrar nuevamente
   ```

### Errores Esperados
- ❌ "Cargando..." indefinidamente → Frontend no obtiene interpretaciones
- ❌ Números en 0 para todos → Interpretaciones no existen
- ❌ Descarga falla → Funciones resumenACsv/resumenAPdf tienen error

---

## Test 4: Configurar Política de Descanso (AdminHorarios)

### Precondiciones
- Rol: ADMIN
- Página: AdminHorarios
- Múltiples horarios creados

### Pasos

1. **Cargar página**
   ```
   Esperado:
   ✅ Grid de tarjetas con horarios
   ✅ Cada tarjeta tiene:
      - Nombre del horario
      - ID
      - Métricas (tolerancia, descanso, etc)
      - Detalle de días (lun-dom)
      - Botones: Settings (azul), Trash (rojo)
   ```

2. **Clic en Settings**
   ```
   - Clic en botón azul "Settings" de cualquier horario
   Esperado:
   ✅ Modal se abre: "Política de Descanso"
   ✅ Subtítulo: "Configurar descansos para: [Nombre Horario]"
   ✅ Selector de modo visible: NONE / FIXED / FLEXIBLE
   ✅ Modo inicial: FIXED
   ```

3. **Cambiar modo a FLEXIBLE**
   ```
   - Clic en botón "🔄 Flexible"
   Esperado:
   ✅ breakPolicyForm.mode = 'FLEXIBLE'
   ✅ Campos expectedStart y expectedEnd desaparecen
   ✅ Solo quedan: min/max minutos, tolerancias, checkbox
   ```

4. **Cambiar modo a FIXED**
   ```
   - Clic en botón "⏰ Descanso Fijo"
   Esperado:
   ✅ breakPolicyForm.mode = 'FIXED'
   ✅ Campos expectedStart y expectedEnd reaparecen
   ✅ Tienen valores por defecto: 12:00 - 13:00
   ```

5. **Cambiar modo a NONE**
   ```
   - Clic en botón "❌ Sin Descanso"
   Esperado:
   ✅ breakPolicyForm.mode = 'NONE'
   ✅ Campos de descanso se deshabilitan (opcional UI)
   ```

6. **Configurar modo FIXED completo**
   ```
   - Mode: FIXED
   - Mínimo descanso: 30
   - Máximo descanso: 90
   - Hora inicio: 12:00
   - Hora fin: 13:00
   - Tolerancia inicio: 15
   - Tolerancia fin: 15
   - Checkbox: Sin marcar (NO jornada continua)
   ```

7. **Guardar política**
   ```
   - Clic en "Guardar Política"
   Esperado:
   ✅ Modal muestra "Guardando..."
   ✅ Después: Modal se cierra
   ✅ Lista de horarios se recarga
   ✅ Card se actualiza (opcional visualización de policy)
   ```

8. **Verificar guardado (si hay indicador visual)**
   ```
   Esperado:
   ✅ Policy se muestra en tarjeta (opcional)
   ✅ O simplemente modal se cerró sin errores
   ```

### Errores Esperados
- ❌ Modal no se abre → Evento onClick falla
- ❌ Campos no aparecen/desaparecen → Lógica condicional incorrecta
- ❌ "Error al guardar la política" → Backend rechazó UpdateBreakPolicyDTO
- ❌ Modal no se cierra → updatePolicy() falló silenciosamente

---

## Test 5: Validación Completa de Ciclo

### Escenario: Un empleado trabaja un día y se ve reflejado en todo el sistema

1. **Admin registra dos fichadas manuales**
   - Entrada: 09:15
   - Salida: 18:00

2. **Verificar en AdminFichadas**
   ```
   ✅ Ambos eventos aparecen
   ✅ Estado: "Jornada Completa"
   ✅ Si entrada tardía: "1 anomalía"
   ```

3. **Empleado ve en MisFichadas**
   ```
   ✅ Día aparece en verde
   ✅ Clic muestra segmentos correctos
   ✅ Muestra "1 anomalía: Entrada Tardía"
   ```

4. **Admin ve en PreLiquidacion**
   ```
   ✅ Empleado aparece en tabla
   ✅ Días Trabajados: 1 (o más si tiene más de 1 jornada)
   ✅ Tardanzas: 15 (minutos)
   ✅ Totales coinciden con MisFichadas
   ```

5. **Admin configura policy diferente**
   ```
   ✅ Cambia modo a FLEXIBLE
   ✅ Guarda
   ✅ Interpretaciones se recalculan (backend)
   ✅ Anomalías pueden cambiar
   ```

---

## Checklist Final

```
COMPONENTES
✅ AdminFichadas carga y registra
✅ MisFichadas muestra detalles
✅ PreLiquidacion calcula consolidado
✅ AdminHorarios configura policies

DATOS
✅ PunchEvents se crean correctamente
✅ InterpretationResults se calculan
✅ Anomalies se detectan
✅ WorkSegments/BreakSegments se cargan

VALIDACIONES
✅ Fechas en formato correcto
✅ Números se formatan (Xh YYm)
✅ Colores corresponden a estados
✅ Errores se muestran en UI

ERRORES
✅ Errores de red se capturan
✅ Estados de carga (loading) funcionan
✅ Auto-refresh no causa loops infinitos

PERFORMANCE
✅ Cargas no son lentas (< 2s)
✅ Grid de días responde bien
✅ Sin errores de memoria/crashes
```

---

## Comandos Útiles

```bash
# Ver logs de consola
DevTools → Console

# Verificar requests
DevTools → Network → buscar "api/punch" o "api/attendance"

# Ver estado de hooks
DevTools → React → seleccionar componente → ver hook state

# Verificar tipos TypeScript
npm run type-check

# Rebuild frontend
npm run build
```

---

## Notas de Debugging

Si algo falla:

1. **"Cargando..." indefinidamente**
   - Check: Network tab → ver si request está pending
   - Check: Backend logs → ver si endpoint existe
   - Check: Console → ver si hay errores CORS

2. **Datos vacíos**
   - Check: Database → select * from punch_events
   - Check: Database → select * from attendance_interpretations
   - Check: Backend → ¿AttendanceEngine genera resultados?

3. **Anomalías no aparecen**
   - Check: Datos de entrada (fichadas)
   - Check: BreakPolicy vigente
   - Check: AttendanceEngine.detectAnomalies() logic

4. **Colores/estilos incorrectos**
   - Check: Console → ver valores de `status` y `severity`
   - Check: Mapeos en attendanceApi.getStatusColor()
   - Check: Tailwind clases aplicadas correctamente
