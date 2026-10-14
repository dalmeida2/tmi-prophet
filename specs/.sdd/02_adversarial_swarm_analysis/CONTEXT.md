<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∄ = does not exist | ∈ = in | § = section ref | & = and | | = or -->
<!-- PRESERVE VERBATIM: code blocks, paths, URLs, file names, identifiers, JSON/YAML -->

# Stage 02: Adversarial Swarm Analysis & Contract Synthesis

Multi-agent technical review & machine contract compiler. Hardens the spec until every observable outcome of every operation is pinned in `specs/contracts/` — zero unconstrained degrees of freedom outside the declared Equivalence Boundary.

**⊥ implementation code while stage active. Output = hardened spec & typed machine contracts in `specs/contracts/`.**

## Inputs
- Layer 4 (working): `specs/SPEC.md`, `specs/DECISION_LOG.md`, `specs/DESIGN.md` (UI)
- Layer 4 (working): `specs/contracts/*` (if existing/drafted)
- Layer 3 (reference): `../_config/spec-template.md`
- Layer 3 (reference): `../_config/references/completeness-checklist.md` + `../_config/contract-matrix.json`
- Layer 3 (reference): `../_config/references/systems-standards.md` (Equivalence Profile) + `../_config/canonical-errors.json`
- Layer 3 (reference): `../_config/schemas/` (manifest, errors, statecharts formats)
- Layer 3 (reference): `../_config/spec-self-review.md`
- Layer 3 (reference): `../_config/iteration-log-format.md`

## Process

### Creator Swarm (Blue Team)
Synthesize hardened `specs/SPEC.md` AND compile the machine contracts the contract matrix requires for the project type:
- `specs/contracts/manifest.json`: project type, interfaces, artifacts, `notApplicable` justifications, `equivalenceTarget` (default 2), `profileOverrides`, `coverageExempt` (schema: `../_config/schemas/contract-manifest.schema.json`).
- `specs/contracts/openapi.yaml` (http): every operation with a unique `operationId`, strict request/response schemas (`additionalProperties: false` on requests), headers, params, pagination, every response status enumerated.
- `specs/contracts/schema.sql` | `.prisma`: explicit DDL, pinned types, indices, foreign keys, OCC `version` columns, `COLLATE "C"` where strings are sorted.
- `specs/contracts/statecharts.json`: ∀ lifecycle entity — states, transitions (with exact guards), terminal retention, illegal-transition error.
- `specs/contracts/errors.json`: canonical + domain codes; statuses & `retryable` per `../_config/canonical-errors.json`.
- Type-specific: `cli.json`, `api.d.ts`, `storage.schema.json`, `levels.schema.json` per the matrix.

Roles: Core Architect, Security Auditor, AI/MLOps Engineer, Data Specialist, UX/UI Lead, Technical Writer.

### Critic Council (Red Team)
Attack both spec prose and typed machine contracts:
1. **Contract & Schema Auditor:** Field name/type mismatches between contracts and `SPEC.md`. Unpinned types (e.g. `string` instead of UUIDv7/regex/enum).
2. **Systems Invariant Auditor:** Compliance with the Equivalence Profile — IDEM, OCC, PAGE, ERR, HTTP-9 evaluation order. Every deviation documented as an override.
3. **Fork Tester:** ∀ operation, ask: *"Could two competent builders, reading only these files, return different observations?"* Probe each value in each response: status, headers, field presence, null vs absent, ordering, rounding, string normalization, error precedence. Any yes = finding. The persona's judgment is backed by the empirical Interpretation Diff (exit criterion 3).
4. **Edge-Case Hunter:** Missing fallback behavior, undefined error paths, unhandled timeouts.
5. **Chaos Engineer:** Assumptions about ordering, consistency, availability. Split-brain scenarios.
6. **Resource Starver:** Unbounded growth, missing pagination, no retention policy.
7. **Quantifier:** Attack vague/unquantified language. ∀ parameter ∈ final spec ! be exact value | bounded range | formula | config ref.
8. **Reconciler:** Cross-ref spec vs actual codebase & running infrastructure (if ∃). <anti_hallucination>⊥ assume spec correct. ! inspect source files & flag ANY spec-vs-reality discrepancy.</anti_hallucination>

### Pipeline Rules

#### Technical vs Policy findings
- **Technical (mechanics)** → resolved autonomously by the Blue Team, applying the Equivalence Profile. ⊥ ask the human about status codes, index design, cursors, DDL types.
- **Policy (business decision Stage 01 missed)** — e.g. who may cancel, what happens to child records, a limit's value → ⛔ STOP the loop. Ask the user exactly ONE question (Stage 01 protocol), record the answer in `specs/DECISION_LOG.md` and SPEC, then resume. ⊥ resolve a policy finding by picking a "sensible default": that is the builder-guess this pipeline exists to prevent. Mark these findings `Escalation Required? = Yes` in the iteration log.

#### Project Type Classification & Completeness Checklist (Step 0c)
Before the first Blue Team draft, classify the project and apply `../_config/references/completeness-checklist.md`.

**⛔ GATE:** Blue Team draft missing even ONE required section or matrix-required artifact → Critic Council ! reject the entire draft. ⊥ adversarial pass on an incomplete draft.

#### Machine validation before every Red Team pass
Run `node specs/.sdd/scripts/sdd.cjs check --contracts` and paste the output into the iteration log. Errors → fix before attacking: the Red Team's time goes to semantics, not syntax.

#### Mandatory Visible Iteration Logs
⊥ claim "internally looped" (all iterations inside one hidden thought block with only the final output shown). Execute iterations sequentially without stopping for user input (except policy escalations). Write each iteration log in full, using the Adversarial Swarm Iteration Log format ∈ `../_config/iteration-log-format.md`, and append it to `specs/logs/02-swarm.md` — the persisted log is the audit trail, the chat shows a summary.

**⛔ GATE:** Missing | summarized iteration log in `specs/logs/02-swarm.md` → entire swarm run invalid.

#### Exit criteria (objective, all required)
⊥ minimum iteration counts and ⊥ forced failures: a manufactured finding is noise that hides real ones. The loop ends only when ALL hold:
1. `sdd.cjs check --contracts` passes (output in the final iteration log).
2. A complete Red Team round, ALL personas, finds zero new findings.
3. The **Outcome Table** is complete: ∀ operation | command, every observable outcome (success + each reachable error, with its trigger) is listed and pinned in the contracts. It is the input for Stage 04 coverage. The gate cross-checks it against openapi/cli.json: nothing missing, nothing undeclared.
3b. **Interpretation Diff (empirical Fork Test):** turn every Outcome Table row into a request-only case (one file per suite in `specs/changes/interp/requests/`; titles neutral — `Predict: POST /orders`, never the expected outcome). Two fresh sub-agents — given ONLY `specs/SPEC.md`, `specs/contracts/` and the Equivalence Profile, never the swarm log or this conversation — each copy the requests and write the full expected response with `derivedFrom` citations, using `{"$unspecified": "<what is missing>"}` where the files do not determine a value (`specs/changes/interp/a/`, `…/b/`). Then `node specs/.sdd/scripts/oracle.cjs diff-expect --a specs/changes/interp/a --b specs/changes/interp/b --label interp` ! report zero gaps. Each gap → fix the spec or contracts (policy gaps → ask the user), then re-predict the affected cases. ⊥ resolve a gap by choosing one author's answer. These cases are the starting point for Stage 04.
4. `../_config/spec-self-review.md` checks 1–19 pass, reported as "Spec self-review passed: N checks clear, M issues fixed inline."
5. The Pre-Pass Hardening Verification Checklist below is in the final iteration log.

#### Pre-Pass Hardening Verification Checklist
- **Structural**: matrix-required contracts present; typed schemas, DDL, req/res contracts, config shapes; no missing SPEC §.
- **Systems Standards**: Equivalence Profile compliance or documented overrides.
- **Concurrency & Tx**: race conditions, request isolation, rollback, file-to-db atomicity.
- **Resource Limits**: payload limits, scale limits, timeout budgets, backoff curves — exact numbers.
- **Determinism**: total ordering, seeds, numeric representation, string normalization; SPEC §9 Equivalence Boundary lists every declared degree of freedom and nothing else.

### Iterative Workflow

Execute this exact loop:
0. **Pre-Flight Context Map:** Identify ∀ frameworks/versions ∈ target architecture → SPEC §10 Observable Environment.
0b. **Pre-Flight Codebase Grounding (∃ existing code):** Reconciler ! read existing files before Blue Team drafts.
0c. **Project Type Classification:** confirm type → `manifest.json`.
1. **Generation Pass:** Blue Team → draft `specs/SPEC.md` AND contracts. **! pass Completeness Checklist + `sdd.cjs check --contracts`.**
2. **Adversarial Pass:** Critic Council attacks prose and contracts. ∀ finding ! be logged ∈ Iteration Log format.
3. **Resolution:** Technical findings → Blue Team fixes via the profile. Policy findings → escalate (above).
4. **Loop:** repeat 1–3 until the exit criteria hold.
5. **Save:** finalized `specs/SPEC.md` and `specs/contracts/`. ⊥ implementation code.
6. **Update state:** `node specs/.sdd/scripts/sdd.cjs transition --completed 02` (refuses unless `check --contracts` passes, `specs/logs/02-swarm.md` was written this stage with a complete Outcome Table, and a fresh zero-gap `diff-expect` exists; skips 03 automatically for non-UI projects).
7. **Handoff:** Present spec & contracts to user.
   - UI project & spec introduces new visual components, states, layouts → ! route `03_interactive_wireframing`.
   - Otherwise → prompt user to proceed `04_writing_implementation_phases`.
8. **Report:** Output Swarm Log. Format: `| Spec/Contract Section | Attacking Persona | Ambiguity/Flaw Found | Blue Team Resolution |`.

## Outputs
- `specs/SPEC.md` (Hardened, with §9 Equivalence Boundary)
- `specs/contracts/manifest.json` + matrix-required contracts
- `specs/DECISION_LOG.md` (policy escalations, profile overrides)
- `specs/logs/02-swarm.md` (iteration logs + Outcome Table)
- `specs/.sdd/_config/sdd-state.json` (via `sdd.cjs transition`)
