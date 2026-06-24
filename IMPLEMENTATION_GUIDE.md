# Implementation Guide - Event-Driven Attendance System

## Phase 1 Complete ✅

Se ha completado la **Phase 1: Core Engine & API**

### Archivos Creados

#### Database & Migrations
- `supabase/migrations/20260623000000_event_driven_attendance.sql`
  - Nuevas tablas: `punch_events`, `break_policies`, `attendance_interpretations`
  - Enums: `break_policy_mode`, `interpretation_status`, `anomaly_severity`
  - Helper functions (RPC)
  - Índices para optimización

#### Backend - Services
- `supabase/functions/api/services/AttendanceEngine.ts`
  - Motor de interpretación (lógica pura, sin dependencias externas)
  - Métodos: `interpret()`, `buildSegments()`, `detectAnomalies()`, etc.
  - ~600 líneas

- `supabase/functions/api/services/AttendanceRepository.ts`
  - Acceso a datos (Supabase client)
  - CRUD para events, policies, interpretations
  - ~350 líneas

- `supabase/functions/api/services/BreakPolicyService.ts`
  - Validación de políticas de descanso
  - Business rules validation
  - ~200 líneas

#### Backend - Application
- `supabase/functions/api/dtos/index.ts`
  - Data Transfer Objects (request/response)
  - Mappers para serialización
  - ~200 líneas

- `supabase/functions/api/usecases/index.ts`
  - Orquestación de lógica (use cases)
  - UC1: Record Daily Punch
  - UC2: Get Day Interpretation
  - UC3: Get Month Interpretations
  - UC4: Reprocess Historical Period
  - UC5: Update Policy & Reprocess
  - ~400 líneas

- `supabase/functions/api/routes.ts`
  - Endpoints HTTP (REST API)
  - POST /api/punch
  - GET /api/attendance/:id/:date
  - GET /api/attendance/:id?month=YYYY-MM
  - PUT /api/break-policies/:id
  - ~300 líneas

#### Frontend Types
- `src/types.ts` (extended)
  - PunchEvent, BreakPolicy, WorkSegment, BreakSegment
  - InterpretationResult, Anomaly
  - DTOs para API

#### Tests
- `supabase/functions/api/__tests__/AttendanceEngine.test.ts`
  - 20+ unit tests
  - Cubre: segments, anomalies (FIXED/FLEXIBLE), overtime, edge cases

- `supabase/functions/api/__tests__/BreakPolicyService.test.ts`
  - 15+ validation tests
  - Cubre: formato tiempo, business rules, modos de política

---

## How to Run Tests

```bash
# Run all Deno tests
deno test supabase/functions/api/__tests__/*.test.ts

# Run specific test file
deno test supabase/functions/api/__tests__/AttendanceEngine.test.ts

# Run with verbose output
deno test --allow-all --unstable supabase/functions/api/__tests__/*.test.ts
```

---

## How to Deploy

### 1. Create Database Tables

```bash
# Apply migration to Supabase
supabase db push
```

### 2. Deploy Edge Functions

```bash
# Deploy main API handler
supabase functions deploy api

# Or with environment variables
supabase functions deploy api --env-file .env.local
```

### 3. Verify Deployment

```bash
# Check function is running
curl https://<your-project>.supabase.co/functions/v1/api/ping

# Test record punch endpoint
curl -X POST https://<your-project>.supabase.co/functions/v1/api/punch \
  -H "Content-Type: application/json" \
  -d '{
    "idEmpleado": 1,
    "timestamp": "2026-06-23T09:00:00Z",
    "direction": "IN",
    "source": "MANUAL"
  }'
```

---

## API Endpoints

### 1. Record Punch Event

**POST** `/api/punch`

Request:
```json
{
  "idEmpleado": 1,
  "timestamp": "2026-06-23T09:00:00Z",
  "direction": "IN",
  "source": "BIOMETRIC|QR|API|MANUAL",
  "metadata": {}
}
```

Response:
```json
{
  "event": { ... },
  "dayInterpretation": { ... },
  "warnings": []
}
```

### 2. Get Day Interpretation

**GET** `/api/attendance/:id/:date`

Example: `GET /api/attendance/1/2026-06-23`

Response:
```json
{
  "interpretation": { ... },
  "policy": { ... },
  "punchEvents": [ ... ],
  "schedule": { ... }
}
```

### 3. Get Month Interpretations

**GET** `/api/attendance/:id?month=YYYY-MM`

Example: `GET /api/attendance/1?month=2026-06`

Response:
```json
{
  "interpretations": [ ... ],
  "summary": {
    "period": "2026-06",
    "workedMinutes": 160,
    "breakMinutes": 450,
    "overtimeMinutes": 120,
    "anomaliesByType": { "TARDANZA": 2, "OVERTIME_50": 3 },
    "daysWorked": 20,
    "daysWithAnomalies": 5
  }
}
```

### 4. Update Break Policy

**PUT** `/api/break-policies/:scheduleId`

Request:
```json
{
  "mode": "FIXED|FLEXIBLE|NONE",
  "paid": false,
  "mandatory": true,
  "minMinutes": 30,
  "maxMinutes": 90,
  "expectedStart": "12:00",
  "expectedEnd": "13:00",
  "allowContinuousShift": false
}
```

Query params:
- `reprocessFrom=YYYY-MM-DD` (optional) - Fecha desde la que reprocesar

Response:
```json
{
  "policy": { ... },
  "reprocessingQueued": true,
  "affectedDays": 20,
  "affectedEmployees": 5
}
```

---

## Ejemplo de Uso: Flujo Completo

### Escenario: Empleado llega a las 09:20 (20 min tarde)

```bash
# 1. Registrar entrada
curl -X POST /api/punch \
  -d '{
    "idEmpleado": 1,
    "timestamp": "2026-06-23T09:20:00Z",
    "direction": "IN"
  }'

# Response:
{
  "event": {
    "id": "abc123...",
    "timestamp": "2026-06-23T09:20:00Z",
    "direction": "IN",
    ...
  },
  "dayInterpretation": {
    "status": "INCOMPLETE",
    "anomalies": [
      {
        "type": "TARDANZA",
        "severity": "WARNING",
        "description": "Entrada tardía: 20 minutos",
        "minutesAffected": 20
      }
    ]
  }
}

# 2. Registrar salida al mediodía (sin descanso, caso especial)
curl -X POST /api/punch \
  -d '{
    "idEmpleado": 1,
    "timestamp": "2026-06-23T13:00:00Z",
    "direction": "OUT"
  }'

# Response: Interpretación actualizada muestra BREAK_NOT_TAKEN

# 3. Consultar interpretación del día
curl /api/attendance/1/2026-06-23

# Response: Histórico completo con todos los anomalías
```

---

## Architecture Decisions Implemented

✅ **Reemplazo Completo**: Las nuevas tablas son la única fuente de verdad

✅ **Backend (Deno)**: Motor reside en Edge Function, no en frontend

✅ **Eventos Inmutables**: `punch_events` nunca se modifican

✅ **Políticas Configurables**: Por horario, con versioning (Phase 2)

✅ **Segmentos Calculados**: Construidos bajo demanda del motor

✅ **Anomalías Generadas por Motor**: Reemplaza `procesarTardanzaPorEntrada()`

✅ **Resultados Persistidos**: Auditable y reprocesable

✅ **SOLID & Clean Architecture**: Domain → Application → Infrastructure

---

## Next Steps - Phase 2

### 1. UI Integration (Semanas 4-5)

- [ ] Actualizar `AdminHorarios.tsx` → UI para editar BreakPolicy
- [ ] Actualizar `AdminFichadas.tsx` → usar nuevo endpoint `/api/punch`
- [ ] Actualizar `MisFichadas.tsx` → mostrar InterpretationResult detalles
- [ ] Actualizar `PreLiquidacion.tsx` → leer de `attendance_interpretations`
- [ ] Implementar reprocessing UI (botón "Recalcular periodo")

### 2. Data Migration (Semana 6)

- [ ] Script de migración: `fichadas` → `punch_events`
- [ ] Script de migración: crear políticas por defecto
- [ ] Run full historical reprocessing
- [ ] Validate results vs old system
- [ ] Deprecate old tables

### 3. Advanced Features (Future)

- [ ] Policy versioning (V1, V2, V3...)
- [ ] AUTO_DEDUCT break mode
- [ ] Multiple breaks per day
- [ ] Time zone per employee
- [ ] Batch reprocessing UI
- [ ] Audit log viewer

---

## Key Files for Phase 2

When integrating with UI, you'll need:

```typescript
// Import types
import type {
  PunchEvent,
  BreakPolicy,
  InterpretationResult,
  Anomaly
} from '@/types';

// Create API client wrapper
// src/lib/attendanceClient.ts
async function recordPunch(employeeId, timestamp, direction) {
  return fetch('/api/punch', { ... })
}

// Use in React
// src/hooks/useAttendanceInterpretation.ts
function useAttendanceInterpretation(employeeId, date) {
  const [data, setData] = useState<InterpretationResult | null>(null)
  useEffect(() => {
    fetch(`/api/attendance/${employeeId}/${date}`)
      .then(r => r.json())
      .then(d => setData(d.interpretation))
  }, [employeeId, date])
  return data
}
```

---

## Testing Guide

### Unit Tests Coverage

| Component | Tests | Coverage |
|-----------|-------|----------|
| AttendanceEngine | 20+ | Segments, Anomalies, Overtime |
| BreakPolicyService | 15+ | Validation, Time Format, Rules |
| AttendanceRepository | (Integration) | CRUD operations |
| API Routes | (Integration) | Request/Response flow |

### How to Add Tests

1. Create test file in `__tests__/` folder
2. Use Deno.test() and assert utilities
3. Run: `deno test supabase/functions/api/__tests__/*.test.ts`

Example:
```typescript
Deno.test('MyTest', () => {
  const result = myFunction()
  assertEquals(result, expected)
})
```

---

## Troubleshooting

### Issue: Tests fail with "Module not found"

**Solution**: Ensure imports use correct paths from project root

```typescript
// ✅ Correct
import type { PunchEvent } from '../../../src/types.ts'

// ❌ Wrong
import type { PunchEvent } from '../../types.ts'
```

### Issue: Database migration error

**Solution**: Check Supabase connection and permissions

```bash
supabase db list  # Verify connection
supabase status   # Check status
```

### Issue: API endpoint returns 401

**Solution**: Verify Supabase service role key in environment

```bash
echo $SUPABASE_SERVICE_ROLE_KEY  # Should be set
supabase functions deploy api --env-file .env.local
```

---

## Support & Documentation

- **AttendanceEngine**: [~600 lines, fully commented]
- **Repository Pattern**: [~350 lines]
- **Domain Layer**: [types.ts - clean interfaces]
- **Tests**: [~35 test cases]

All code is production-ready with:
- ✅ Error handling
- ✅ Input validation
- ✅ Comprehensive comments
- ✅ Type safety (TypeScript)
- ✅ SOLID principles

---

## Files Structure

```
supabase/
├── migrations/
│   └── 20260623000000_event_driven_attendance.sql
├── functions/
│   └── api/
│       ├── services/
│       │   ├── AttendanceEngine.ts
│       │   ├── AttendanceRepository.ts
│       │   └── BreakPolicyService.ts
│       ├── dtos/
│       │   └── index.ts
│       ├── usecases/
│       │   └── index.ts
│       ├── __tests__/
│       │   ├── AttendanceEngine.test.ts
│       │   └── BreakPolicyService.test.ts
│       └── routes.ts

src/
├── types.ts (extended with new entities)
├── lib/
│   ├── attendanceClient.ts (to create - Phase 2)
│   └── ...
└── hooks/
    ├── useAttendanceInterpretation.ts (to create - Phase 2)
    └── ...
```

---

## Version Info

- **Phase**: 1 (Core Engine)
- **Status**: ✅ Complete
- **Components Implemented**: 8
- **Tests**: 35+
- **Lines of Code**: ~2000+ (backend)
- **Architecture**: Domain Driven Design + Clean Architecture

---

Generated: 2026-06-23
Next Review: End of Phase 1, before Phase 2 UI integration
