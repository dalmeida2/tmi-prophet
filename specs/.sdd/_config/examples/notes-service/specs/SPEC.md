# Notes Service

## 0. Meta
- Project type: backend-service
- Interfaces: http
- Equivalence target: L2 equivalence-verified

## 1. Scope
- In scope: create, read, list, edit, publish and delete short text notes over HTTP.
- Out of scope (explicit): users and authentication, search, attachments, note history, bulk operations.

## 2. Glossary
| Term | Definition | Code name |
|---|---|---|
| Note | A titled piece of text | `note` |
| Draft | A note that can still be edited | `status: "draft"` |
| Published | A note whose title and body are frozen | `status: "published"` |

## 3. Actors & Authorization
- Authentication: none. Justification: the service runs on a private network behind an authenticating gateway; it has a single anonymous actor.
- Permission matrix: the anonymous actor may perform every operation in §5. No denials exist, so `UNAUTHENTICATED` and `PERMISSION_DENIED` are not used.

## 4. Domain Model & Lifecycles
- `note`: `id` (UUIDv7), `title` (1–100 code points), `body` (0–10000 code points, default `""`), `status`, `version`, `created_at`, `updated_at`.
- Lifecycle → `statecharts.json` machine `note`: `draft` → `published` via `PUBLISH` (`publishNote`). `published` is terminal for the lifecycle; a note in any state can be deleted (§6).

## 5. Operations
All operations follow the Equivalence Profile; only deviations and domain rules are listed here. Every outcome → `openapi.yaml`.

### 5.1 Notes collection
- `createNote` — `POST /notes`, requires `Idempotency-Key`. Creates a draft with `version` 1; `created_at` = `updated_at` = creation time. Omitted `body` is stored as `""`.
- `listNotes` — `GET /notes?limit&cursor&status`. Order `created_at DESC, id DESC` (PAGE-3). Optional `status` filter (`draft` | `published`).

### 5.2 Single note
- `getNote` — `GET /notes/{id}`.
- `updateNote` — `PATCH /notes/{id}`, JSON Merge Patch of `title` and/or `body`, requires `If-Match`. Allowed only in `draft`; on a published note → 409 `NOTE_NOT_EDITABLE`. An empty patch `{}` is a successful mutation (version + 1, `updated_at` refreshed).
- `publishNote` — `POST /notes/{id}/publish`, no request body, requires `Idempotency-Key`, `If-Match` optional (OCC-3). `draft` → `published`, version + 1. Publishing a published note → 409 `INVALID_STATE_TRANSITION`.
- `deleteNote` — `DELETE /notes/{id}`, requires `If-Match`. Hard delete in any state → 204.

## 6. Data & Persistence
- PostgreSQL 16 → `schema.sql`. Deleted notes are removed immediately (no tombstone); their ids are never reused.

## 7. Errors
Canonical codes per the profile, plus:
- `NOTE_NOT_EDITABLE` (409) — `updateNote` on a note whose status is not `draft`.

## 8. Invariants (§V)
- **V1:** `version` is 1 on creation and increases by exactly 1 with every successful `updateNote` or `publishNote`.
- **V2:** The `title` and `body` of a published note never change.
- **V3:** `listNotes` returns notes in `created_at DESC, id DESC` order, and following `next_cursor` from the first page visits every matching note exactly once.
- **V4:** Replaying `createNote` with the same `Idempotency-Key` and body never creates a second note.

## 9. Equivalence Boundary
- Observable surfaces: HTTP status, contractual headers (HTTP-10), and JSON bodies of every operation.
- Declared degrees of freedom: note `id` values, `created_at` / `updated_at` values, `pagination.next_cursor` values, problem `detail` text → `oracle.config.json#variablePaths`.
- Internal freedoms: language, framework, module layout, logging, SQL formulation (within `schema.sql`).

## 10. Observable Environment
- Runtime: builder's choice. Database: PostgreSQL 16, strings sorted with `COLLATE "C"`. Timezone: UTC. No randomness affects output except ids.

## 11. Equivalence Profile Overrides
None.

## 12. Configuration
| Env var | Required | Format | Default | Meaning |
|---|---|---|---|---|
| `PORT` | no | integer 1–65535 | `3000` | HTTP listen port |
| `DATABASE_URL` | yes | PostgreSQL URL | — | Storage |
| `SDD_MUTATION_DELAY_MS` | no | integer ≥ 0 | `0` | Profile ENV-5 concurrency testability delay |
| `SDD_TIMESTAMP_GRANULARITY_MS` | no | integer ≥ 0 | `0` | Profile ENV-6 timestamp truncation (ordering testability) |

## 13. Limits & Non-Functional
- `title`: 1–100 code points. `body`: 0–10000 code points (profile SER-9 counting).
- Page size: profile PAGE-1 (default 20, max 100).

## 14. UI
N/A — backend-service.
