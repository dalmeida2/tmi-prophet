# Mandatory Completeness Checklist

<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∈ = in | § = section ref | & = and | | = or -->

## Project Type Classification (Step 0c)

One vocabulary, used by every stage, `sdd.cjs` and the manifest. The required and conditional machine contracts per type live in `../contract-matrix.json` (single source of truth; `sdd.cjs check --contracts` enforces it).

| Project type | How to identify | Default interfaces | UI stages (03, 06) |
|---|---|---|---|
| `backend-service` | API-only, server-side logic | http | no |
| `fullstack-app` | Backend + frontend, possibly auth & database | http, browser | yes |
| `client-side-app` | Browser-only, no server | browser | yes |
| `game` | Interactive game loop, levels, scoring | browser, cli (headless simulation) | yes |
| `cli-tool` | Command-line program | cli | no |
| `library` | Package consumed through a public API | library (via frozen adapter) | no |

Unclear → ask the user. ⊥ default silently: the type decides which contracts exist.

Record the type and interfaces in `specs/contracts/manifest.json` (`../schemas/contract-manifest.schema.json`). Conditional artifacts that do not apply ! be listed in `manifest.notApplicable` with a justification.

## Base Checklist

Before ANY Red Team pass, the Blue Team draft ! produce every SPEC section of `../spec-template.md` AND the machine contracts the matrix requires. Missing | placeholder → auto-reject.

| # | Section (SPEC §) | Persona | What ! be defined | Machine artifact |
|---|---|---|---|---|
| 1 | System Architecture (§0, §10) | Core Architect | Services, protocols, network boundaries, deployment topology, port table | SPEC + `manifest.json` |
| 2 | API & Wire Contracts (§5) | Core Architect | Strict types, paths, statuses, params, headers, pagination, error schemas per `systems-standards.md` | `openapi.yaml` (http) · `cli.json` (cli) · `api.d.ts` (library) |
| 2b | State Machines (§4) | Core Architect | ∀ lifecycle entity: states, triggers, guards, targets, actions, illegal-transition error, terminal retention | `statecharts.json` |
| 3 | Data & Persistence (§6) | Data Specialist | Pinned engine, column types, keys, nullability, unique indices, ON DELETE rules, OCC `version`, retention | `schema.sql` · `storage.schema.json` |
| 4 | Auth & Authorization (§3) | Security Auditor | Mechanism, token TTL, header, permission matrix including denials | openapi `securitySchemes` | SPEC |
| 5 | LLM/AI Configuration | AI/MLOps Engineer | Provider, model, temperature, token limits, prompt location, fallbacks, cost guardrails — or `N/A — reason` | SPEC §12 config schema |
| 6 | Frontend Component Hierarchy (§14) | UX/UI Lead | Named components (↔ DESIGN.md keys ↔ `data-testid`), state management, layout, copy table | SPEC + `DESIGN.md` |
| 7 | Infrastructure & Configuration (§12) | Core Architect | Env var table (key, required, format, default), ports, volumes, build/deploy target | SPEC §12 |
| 8 | Systems Resilience & Errors (§7, §13) | Edge-Case Hunter | Idempotency, OCC, pagination, retries, timeouts — profile defaults or documented overrides | `errors.json` |
| 9 | Cross-Section Consistency | Reconciler | Field names, types, ports, env vars identical across SPEC and every contract | `sdd.cjs check --contracts` clean |
| 10 | Visual Design (UI) | UX/UI Lead | Palette, typography, spacing, motion — from user direction | `DESIGN.md` |
| 11 | Invariants (§8) | Data Specialist | ∀ business rule that must never break, as `- **Vn:**` bullets | SPEC §8 |
| 12 | Equivalence Boundary (§9) | Reconciler | Observable surfaces, declared degrees of freedom, internal freedoms | SPEC §9 (→ `variablePaths`) |
| 13 | Observable Environment (§10) | Core Architect | Runtime, DB engine/version, collation, TZ, PRNG | SPEC §10 |

## Type Adapters

### `client-side-app`
| Base section | Replaced with | What ! be defined |
|---|---|---|
| 2. API | State Machine & Event Contracts | ∀ app state, transition, trigger event, payload (`statecharts.json`) |
| 3. Data | Client Storage Schema | localStorage / IndexedDB shapes (`storage.schema.json`) |
| 4. Auth | `N/A — Justification Required` | "No auth because …" ⊥ silently omit |
| 7. Infrastructure | Build & Deployment Target | Build tool, output, hosting target, env vars |
| 8. Resilience | Client Error Handling | Offline handling, validation errors, error boundaries (`errors.json`) |

### `game` (all `client-side-app` substitutions, plus)
| # | Additional section | What ! be defined | Artifact |
|---|---|---|---|
| 14 | Game Loop | Tick rate (rAF vs fixed timestep), update/render split, pause/resume, frame budget | SPEC |
| 15 | Level/Config Schema | JSON schema ∀ level config with a complete example | `levels.schema.json` |
| 16 | Scoring & Progression | Exact formulas, thresholds as numbers, unlock conditions | SPEC + oracle cases |
| 17 | Deterministic Simulation | Headless `cli` entry point: seed + input sequence → final state JSON (profile ENV-4) | `cli.json` |
| 18 | Input & Interaction Contract | ∀ input × game state → behavior, feedback, debounce | SPEC §14 |

### `cli-tool`
Section 2 = `cli.json`: ∀ command, argument, flag (type, default), exit code (profile CLI-1), stdout format (text and `--json`), stderr usage. Section 3 only if it persists data.

### `library`
Section 2 = `api.d.ts` (or language equivalent): ∀ public function/class, signatures, thrown errors ↔ `errors.json` codes. Stage 04 adds a frozen adapter (`specs/fixtures/adapters/`) mapping JSON requests to calls so the oracle can grade it.

**⛔ GATE:** Blue Team draft missing even ONE required section or matrix-required artifact → Critic Council ! reject the entire draft.

---

## Machine Contract Gate

Before a PASS verdict, the Reconciler ! run `node specs/.sdd/scripts/sdd.cjs check --contracts` and paste its output into the iteration log. It verifies the manifest, the matrix-required artifacts, openapi operationIds and declared statuses, errors.json against the profile's canonical codes, and statechart integrity (declared, reachable, non-dangling states; deterministic transitions; valid error references).

The script cannot judge semantics. The Critic Council additionally verifies:
1. **Field name & type symmetry:** ∀ field in openapi ↔ schema.sql ↔ SPEC identical (SER-6; `user_id` vs `userId` = FAIL).
2. **Profile compliance:** Idempotency-Key on every POST (IDEM-1), `version` + ETag/If-Match on mutable resources (OCC), cursor pagination + tie-breaker on collections (PAGE), RFC 9457 envelope (ERR-1).
3. **Quantification:** the Quantifier scans the entire spec and contracts for vague language — "approximately", "around", "e.g.", "periodically", "sometimes", "fast", "slow", "large", "small" as parameter values → replace with exact values, ranges or formulas.
4. **Outcome enumeration:** ∀ operation, every observable outcome (success + each reachable error with its trigger) is declared in the contract — the basis of oracle coverage.
