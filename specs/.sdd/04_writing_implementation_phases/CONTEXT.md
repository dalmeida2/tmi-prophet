<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∄ = does not exist | ∈ = in | § = section ref | & = and | | = or -->

# Stage 04: Oracle Synthesis, Implementation Phases & Freeze

Critical governance bridge. Converts the hardened spec into (1) the **Immutable Test Oracle** (`specs/fixtures/`) every build is graded by, (2) a sequenced build checklist (`IMPLEMENTATION_PHASES.md`), and (3) the **freeze**: a user-approved lock over the whole frozen set.

**⊥ write implementation code while this stage is active.** Oracle cases, seed data, the oracle config, UI specs and (library projects) the oracle adapter are test artifacts, not implementation, and are written here.

## Inputs
- Layer 4 (working): `specs/SPEC.md`, `specs/contracts/*`, `specs/DECISION_LOG.md`
- Layer 4 (working): `specs/logs/02-swarm.md` — the Outcome Table only (the list of outcomes to cover; ⊥ treat its discussion as spec). Adoption option C: the reviewed characterization cases from Stage 01b take its place.
- Layer 4 (working): `specs/DESIGN.md`, `specs/wireframes/*.html` (UI projects)
- Layer 3 (reference): `../_config/references/oracle-standard.md` (format, matchers, coverage, probes)
- Layer 3 (reference): `../_config/schemas/oracle-cases.schema.json`, `../_config/schemas/oracle-config.schema.json`
- Layer 3 (reference): `../_config/references/systems-standards.md` (profile rules cited in `derivedFrom`)
- Layer 3 (reference): `../_config/examples/notes-service/specs/fixtures/` (reference oracle: exact problem bodies, idempotency, OCC, concurrency, pagination)

## Process

### Part A — Oracle Synthesis (`specs/fixtures/`)

**Independence:** write the oracle in a fresh session or sub-agent whose only inputs are the files above. An author who remembers the Stage 01–02 conversation fills gaps from memory; a fresh author hits them — and every gap hit here is one a Stage 05 builder would otherwise have guessed.

1. **Configure** `specs/fixtures/oracle.config.json`: targets `default`, `a`, `b` (machine-specific values via `${ENV}`), `reset` hook + seed data in `specs/fixtures/seed/`, `adapters.sql` (if cases assert storage), readiness probe, `variablePaths` mirroring SPEC §9, `buildEnv` with the SPEC §12 values every graded build starts with (ENV-3).
2. **Derive cases** from the Outcome Table: ∀ operation | command | transition, every outcome. Each case cites its sources in `derivedFrom`.
   **⛔ GATE (Derivability):** an expected value that cannot be cited from SPEC, contracts or the profile = spec gap. ⊥ invent it. Log it in `specs/logs/04-spec-gaps.md`; at the end of Part A, route all gaps to Stage 02 (technical) or the user (policy), update the spec, then continue. Before the first freeze these spec edits need no SCR; after a freeze they are part of the Class 1 iteration.
3. **Cover the mandatory case families** in `oracle-standard.md` (idempotency, OCC, pagination, validation ordering, evaluation-order precedence, null/whitespace round-trips). Concurrency (in-flight idempotency, OCC races) uses `parallel` steps with the ENV-5 delay frozen in `buildEnv`.
4. **Probes:** run `node specs/.sdd/scripts/oracle.cjs gen-probes` (http projects) to derive edge-case probes from the contracts, then add hand-written probes (`"probe": true`) for domain-specific edge inputs. Probes power `oracle diff`; re-run `gen-probes` whenever the contracts change.
4b. **Dual authoring:** `node specs/.sdd/scripts/oracle.cjs strip-expect --from specs/fixtures/cases --out specs/changes/oracle-b` writes request-only skeletons with neutral titles. A second fresh author — given ONLY that directory, `specs/SPEC.md`, `specs/contracts/` and the Equivalence Profile, never `specs/fixtures/cases` or A's drafts — fills in `expect` and `derivedFrom` in place. `node specs/.sdd/scripts/oracle.cjs diff-expect --a specs/fixtures/cases --b specs/changes/oracle-b --label final` ! report zero gaps. Every gap → spec fix, never a coin flip. (Starting from the Stage 02 interpretation cases makes this cheap.)
5. **UI projects:** a frozen `specs/fixtures/ui/playwright.config.ts` plus black-box Playwright specs selecting only by `data-testid`, role + accessible name, or copy-table text (profile UI-3). ∀ UI State Matrix state & ∀ interaction ≥ 1 test, coverage declared with `// covers:` comments, `observe(page, name)` calls at every screen/state for `diff-ui` (`oracle-standard.md` §UI specs).
6. **Library projects:** a minimal JSON-in/JSON-out adapter in `specs/fixtures/adapters/`, invoked by `run` steps. It may call only the public API in `api.d.ts`.
7. **Iterative cycle (Class 1 change on a frozen project):** ⊥ delete, loosen (exact → subset, literal → matcher) or re-expect an existing case unless a DECISION_LOG entry from this iteration declares that behavior change. List every changed or removed case id in `specs/phase-integrity-check.md`. Existing cases are the regression oracle that keeps old behavior equivalent.

### Part B — Implementation Phases

1. **Deconstruct into Phases:** Break system → logical, dependency-ordered phases.
   - Infrastructure & storage schemas = always Phase 1 & 2. Frontend UIs = always final phases.
   - **Data-Flow Traceability:** ∀ REST endpoint | UI component | API ∈ checklist ! explicitly state data source.
2. **Bind every phase to the oracle:** ∀ non-probe case has `phase: N`; the phase's verification is `node specs/.sdd/scripts/oracle.cjs run --phase N` (cumulative: runs phases ≤ N). "Verify it works" | builder-written tests as phase verification = STRICTLY FORBIDDEN.
3. **Write Checklist:** Append new phase(s) to `specs/IMPLEMENTATION_PHASES.md`. Keep new tasks sequenced & unchecked (`- [ ]`).

### Part C — Integrity Checks

**⛔ GATE:** ! create tracking artifact `specs/phase-integrity-check.md`. ! evaluate steps sequentially, write reasoning, check box only when proven.

1. **Machine check:** `node specs/.sdd/scripts/sdd.cjs check` → ! pass. It enforces case schema validity, cross-references, phase binding, and coverage of every `op:<operationId>:<status>`, transition, illegal transition, invariant, error code and CLI exit code. It also reports response fields no case ever pins to a literal value — treat each as either a missing assertion or a degree of freedom to declare in SPEC §9 / `variablePaths`. Paste the output.
2. **Dependency Ordering:** ∀ phase → list dependencies. Verify acyclic graph. Flag any phase referencing a component not built in a prior phase.
3. **Phase Size Check:** Phase with >8 items → split. Phase with 1 item → merge into adjacent.
4. **DESIGN.md Cross-Ref (UI):** ∃ `specs/DESIGN.md` → ∀ phase creating a frontend component ! include "Read `specs/DESIGN.md` tokens for [component]" as first item.
5. **Wireframe Sync Check (UI):** ∃ `specs/wireframes/*.html` → verify ∀ new UI components, states, layouts exist in wireframes with their `data-testid`s.
6. **Matcher Audit:** ∀ variable matcher (`$type`, `$regex`, `$any`, `$oneOf`) and ∀ `bodyMatch: subset` → justify against SPEC §9 or another case that pins the full shape. Unjustified → replace with exact literals.
7. **Changed-case ledger (iterations only):** every changed/removed existing case ↔ its DECISION_LOG entry.

### Part D — Freeze

**Builder conventions:** if the project wants internal coding conventions for builders, write `specs/CODING_STANDARDS.md` now — it is frozen with the rest, so every builder sees the same file. ⊥ put observable behavior in it.

**⛔ GATE (User approval):** present the oracle summary — case count per suite, the coverage line from `sdd.cjs check`, declared degrees of freedom (`variablePaths` + variable matchers), and changed cases (iterations) — and ask the user to approve the freeze. On explicit approval:

```bash
node specs/.sdd/scripts/sdd.cjs freeze --reason "<Initial freeze | Class 1: feature X>" --approved-by "<user's name>"
```

`freeze` refuses unless `sdd.cjs check` passes. From now on the frozen set changes only through a Class 1 iteration or a Stage 00 SCR.

### Handoff / Transitions
1. **Update state:** `node specs/.sdd/scripts/sdd.cjs transition --completed 04` (refuses unless check passes, the phases file exists, `phase-integrity-check.md` was written this stage, a fresh zero-gap `diff-expect` covers the current `specs/fixtures/cases`, and the lock is intact).
2. **Handoff:** Prompt user to proceed to `05_development_swarm` — in a fresh session, per Stage 05's spec-only rule.

### Document Format (`specs/IMPLEMENTATION_PHASES.md`)
```markdown
# Implementation Phases
*Derived from specs/SPEC.md and specs/contracts/*

## Phase 1: [Name]
- [ ] Task 1: Scaffolding / Schema migration
- [ ] Task 2: Service / Repository implementation
- [ ] **Verification:** `node specs/.sdd/scripts/oracle.cjs run --phase 1`

## Phase 2: [Name]
...
```

## Outputs
- `specs/fixtures/oracle.config.json`, `specs/fixtures/cases/*.json`, `specs/fixtures/seed/*`
- `specs/fixtures/ui/*.spec.ts` (UI) · `specs/fixtures/adapters/*` (library)
- `specs/IMPLEMENTATION_PHASES.md`
- `specs/phase-integrity-check.md`, `specs/logs/04-spec-gaps.md`
- `specs/spec.lock.json` (freeze)
- `specs/.sdd/_config/sdd-state.json` (via `sdd.cjs transition`)
