# Implementation Phases
*Derived from specs/SPEC.md and specs/contracts/*

## Phase 1: Service skeleton
- [ ] Task 1: HTTP server, routing, problem-details error handling (ERR-1), 404/405 (HTTP-5)
- [ ] Task 2: `GET /healthz`
- [ ] **Verification:** `node specs/.sdd/scripts/oracle.cjs run --phase 1`

## Phase 2: Create and read
- [ ] Task 1: `notes` table migration per `schema.sql`
- [ ] Task 2: Request validation with sorted `errors[]` (ERR-3), content-type and parse handling (HTTP-3, HTTP-9)
- [ ] Task 3: `createNote` with idempotency (IDEM-1..6) and ENV-5 delay; `getNote` with ETag (OCC-2)
- [ ] **Verification:** `node specs/.sdd/scripts/oracle.cjs run --phase 2`

## Phase 3: List
- [ ] Task 1: `listNotes` keyset pagination and status filter (PAGE-1..5)
- [ ] **Verification:** `node specs/.sdd/scripts/oracle.cjs run --phase 3`

## Phase 4: Edit and delete
- [ ] Task 1: `updateNote` with JSON Merge Patch and If-Match (HTTP-2, OCC-3, OCC-4)
- [ ] Task 2: `deleteNote` with If-Match
- [ ] **Verification:** `node specs/.sdd/scripts/oracle.cjs run --phase 4`

## Phase 5: Publish
- [ ] Task 1: `publishNote` state transition with idempotency and optional If-Match
- [ ] **Verification:** `node specs/.sdd/scripts/oracle.cjs run --phase 5`
