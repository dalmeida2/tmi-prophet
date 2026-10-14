<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∄ = does not exist | ∈ = in | § = section ref | & = and | | = or -->

# Stage 05: Spec-Only Development Swarm

Builder vs. Critic loop during implementation. The builder's mandate is narrow: make the frozen oracle pass using only the frozen spec set. Equivalence follows from that narrowness — a second builder with the same files must be able to reach the same observations without anything this builder knew from elsewhere.

**! execute the attack-and-refine loop until the Red Team finds zero findings with terminal evidence. Stopping after a single unverified pass = severe failure.**

## Inputs (the ONLY inputs)
- Layer 4 (frozen): `specs/SPEC.md`, `specs/DESIGN.md` (UI), `specs/contracts/*`, `specs/fixtures/*`, `specs/wireframes/*.html` (UI)
- Layer 4 (frozen): `specs/CODING_STANDARDS.md` (if exists — internal conventions only; frozen so every builder sees the same file)
- Layer 4 (working): `specs/IMPLEMENTATION_PHASES.md`
- Layer 3 (reference): `../_config/role-standards.md`, `../_config/iteration-log-format.md`, `../_config/references/systems-standards.md`

## Process

### ⛔ GATE: Spec-Only Context
- Run Stage 05 in a fresh session | sub-agent. ⊥ read Stage 01–04 conversation history, `specs/logs/` (swarm and gap logs), `specs/DECISION_LOG.md` rationale, or any other implementation of this spec. Those carry information outside the frozen set that a second builder would not have.
- Need a fact the frozen set does not state (a value, an ordering, a message, an edge case) → **spec gap**. ⊥ guess, ⊥ pick "the obvious" option. Draft `specs/changes/SCR-NNN.md` (Stage 00 format, class C) and stop work on that item. Work on unaffected items may continue.
- Believe an oracle case is wrong → same route (class B). The case stays as-is until the user approves the SCR.

### ⛔ IMMUTABLE GATE (Anti-Tampering)
- Builder ⊥ modify, add or delete any file in the frozen set (`specs/SPEC.md`, `specs/DESIGN.md`, `specs/CODING_STANDARDS.md`, `specs/contracts/`, `specs/fixtures/`, `specs/wireframes/`, `specs/.sdd/`). Relaxing an assertion, skipping a case or altering an expected payload = AUTOMATIC PROCESS FAILURE. If a case fails, the CODE is defective, not the case — unless an approved SCR says otherwise.
- `node specs/.sdd/scripts/sdd.cjs verify` ! pass before starting and after finishing every phase. Failing → stop, report which frozen files changed, restore them (`git checkout -- <file>`).
- Files Stage 05 may write under `specs/`: checkboxes in `IMPLEMENTATION_PHASES.md`, `dev-swarm-reconciliation.md`, `logs/**`, `changes/SCR-*` drafts.

### Implementation Swarm (Blue Team)
Roles: Infrastructure, Backend, Security, Frontend, Writer.
∃ role standards → read `../_config/role-standards.md`.
∃ project standards → read `specs/CODING_STANDARDS.md`.
Analyze project stack → instantiate additional specialist roles as needed.

*∀ Builders SHOULD query Context7 MCP server before writing code → ensure syntax matches latest framework versions. ⊥ Context7 → use web search | training knowledge, but note "docs not verified against latest version" ∈ iteration log.*

### Validation Swarm (Red Team)
After Blue Team drafts code, adopt attack roles *before* saving:
Roles: Penetration Tester, Chaos Engineer, Resource Starver, Compliance Enforcer, DX Auditor, Architect (Spec Enforcer), Visual QA Tester, Design Token Auditor.
∃ role standards → read `../_config/role-standards.md`.

### Pipeline Rules (∀ roles)

#### Build Rules
- **Oracle Fulfillment:** the build is done when `oracle.cjs run` passes 100% against the current lock (plus the frozen UI specs for browser projects). Nothing else is acceptance evidence.
- **Internal tests:** builders MAY write unit/integration tests outside `specs/` for their own feedback. They never replace, extend or count as oracle evidence.
- **Graded configuration:** start the build for every oracle run with the frozen build environment: `eval "$(node specs/.sdd/scripts/oracle.cjs env)"` before the start command. Defaults that differ from it are fine for development, never for evidence.
- **Observable environment:** runtime, database engine/version, collation and timezone ! match SPEC §10. Internal structure (modules, folders, helper libraries) is the builder's choice unless SPEC pins it; list every new runtime dependency with a one-line justification in the reconciliation.
- **Equivalence Profile:** ∀ behavior SPEC does not override follows `../_config/references/systems-standards.md` exactly (envelope, statuses, evaluation order, formats). The profile is part of the spec.
- **Docker (backend-service, fullstack-app):** ! generate `.dockerignore` when `Dockerfile` created | modified.
- **Failure Routing (Backprop):** unresolvable spec defect → Stage 00 via SCR draft. ⊥ patch code around a spec defect.

#### Design Token Mandate (UI + ∃ `specs/DESIGN.md`)
- Before generating a frontend component, ! read `specs/DESIGN.md` & extract YAML tokens.
- ∀ color/font/spacing/border-radius values ! reference tokens. Hardcoded values that ∃ as DESIGN.md tokens = automatic FAIL.
- Component names ! match DESIGN.md `components:`; `data-testid`s, copy text and state ids ! match the wireframes and SPEC §14 exactly (profile UI-1…UI-4).

#### Verification Rules
- ⊥ PASS on `200 OK` | code inspection alone. ! run `oracle.cjs run --phase N` + include terminal output ∈ iteration log.
- **TypeScript:** ! execute `tsc --noEmit` & verify zero errors. Bundler build ⊥ sufficient.
- **Headless Mock Caveat:** mocked unit tests ⊥ evidence for integration | contract behavior. The oracle runs against the real runtime and storage.

#### Spec & Contract Enforcement
- Architect ! cross-ref code vs `specs/SPEC.md`, `specs/contracts/`, and `specs/IMPLEMENTATION_PHASES.md`.
- ∀ API endpoints match `specs/contracts/openapi.yaml` schemas, headers, status codes.
- ∀ database queries match `specs/contracts/schema.sql` columns, indices, OCC `version` handling.
- **Orphan Check:** ∀ helper/utility created → verify imported & called ∈ main entry files. Module only imported ∈ unit tests = FAIL.

#### Visual Smoke Check (∃ UI)
- Screenshot each screen touched by the phase; verify components present/visible/interactive. ⊥ PASS based on code inspection alone. The formal visual gate is Stage 06.

### Anti-Simulation Enforcement

#### Mandatory Visible Iteration Logs
<format_enforcement>
⊥ claim "internally looped" (all iterations inside one hidden thought block with only the final output shown). Execute iterations sequentially without stopping for user input (unless a spec gap or user guidance is required). Write each iteration log in full using the Development Swarm Iteration Log format ∈ `../_config/iteration-log-format.md` and append it to `specs/logs/05-swarm.md`.

**⛔ GATE:** Missing | summarized iteration log → swarm run invalid.
</format_enforcement>

#### Mandatory Empirical Evidence
Red Team ⊥ PASS based on inspection alone. ! run code/tests/build & include terminal output ∈ Iteration Log. A Red Team PASS on a first draft is allowed only with that evidence attached.

> [!NOTE]
> **Iterative Execution:** Only execute the new unchecked phases (`- [ ]`) in `specs/IMPLEMENTATION_PHASES.md`. Skip phases marked completed (`- [x]`). `--phase N` is cumulative, so earlier phases keep being re-graded as regressions.
> **Class 0 changes** (refactor, dependency bump): no new phases; the full oracle ! stay green and `sdd.cjs verify` ! pass unchanged.

> [!TIP]
> **Lockstep build B (recommended for L2):** start the independent build early instead of at Stage 07. `sdd.cjs export ../<project>-eqb` after the freeze; a fresh session builds there phase by phase. After each phase, both builds green: `node specs/.sdd/scripts/oracle.cjs diff --phase N --b-root ../<project>-eqb` — a filtered diff is an early warning, not evidence. Divergences found while little code depends on them are cheap: route them to Stage 00 here, re-freeze, then `sdd.cjs export ../<project>-eqb --update` (keeps B's code and progress, refreshes its frozen files).

### Test-Driven Implementation Loop
Execute this exact sequence ∀ file/component:

**⛔ GATE: One File at a Time:** ⊥ build entire Phase (multiple files) ∈ single loop. ! select one file → complete Draft → Attack → Refine loop until PASS → write to disk → select next file.
- **Continuous Session Execution**: User explicitly requests "run continuously" | "finish development" → agent ! proceed through ∀ files & phases sequentially. ⊥ pause | return to user after single file/phase written. Loop next files/phases via tool calls.

0. **Pre-Flight:** `sdd.cjs verify` passes. ∃ Context7 MCP → invoke its resolving tools; ⊥ Context7 → web search | training knowledge. Log documentation source.
0b. **Decision Inventory (once per phase, before any code):** list every observable decision the phase requires — each status, header, field value, ordering, message, default, limit — and cite the frozen file line that pins it, in `specs/logs/05-decisions.md`. A decision you cannot cite = spec gap → SCR draft now, not after the code exists. This is the builder-side interpretation check: it catches the gaps a second builder would fill differently.
1. **Draft (Blue Team):** Appropriate Builder generates code fulfilling phase task.
2. **Attack (Red Team):** Critics analyze drafted code against contracts, the profile, edge cases, security.
3. **Refine (Blue Team):** Builder fixes based on Red Team findings.
4. **Deploy & Verify:** repeat 1–3 until Critics → "PASS" with ZERO findings and evidence. **Hard Limit:** Max 5 iterations per component; still failing → halt & ask user. After PASS → write code.
5. **Phase gate:** `node specs/.sdd/scripts/oracle.cjs run --phase N` → 0 failed, 0 errored (browser-only phases: the frozen UI suite, `oracle-standard.md` §UI specs); `sdd.cjs verify` passes; tick the phase's boxes.
6. **Document & Run:** single-command start (`docker-compose up -d` for services; the documented command otherwise). DX Auditor verifies. Technical Writer updates `README.md`.

### Post-Implementation Reconciliation (CRITICAL)
After ALL phases complete & verified, Architect ! execute full reconciliation:

**⛔ GATE:** ! create tracking artifact `specs/dev-swarm-reconciliation.md`. Evaluate cross-refs sequentially, write findings ∀ bullet, check box only when proven. Rubber-stamping = process violation.

**What to check:** Re-read `specs/SPEC.md` and `specs/contracts/*`, cross-ref vs created/modified files:
- ∀ API endpoint field names, query params, headers match `specs/contracts/openapi.yaml`.
- ∀ DB migrations match `specs/contracts/schema.sql`.
- ∀ components in Frontend Hierarchy exist as actual files, with their `data-testid`s.
- ∀ env vars in SPEC §12 actually referenced in code.
- New runtime dependencies listed with justification.
- Full `oracle.cjs run` (no filters) passes; output pasted.

**Drift found:** code differs from spec → fix the CODE. The spec seems wrong or incomplete → SCR draft → Stage 00. ⊥ edit `SPEC.md` or any contract to match the code — that is the builder grading itself.

**⛔ GATE:** ⊥ proceed until reconciliation = ZERO ❌ drift entries.

### Handoff / Transitions
1. **Final evidence:** `node specs/.sdd/scripts/oracle.cjs run` (unfiltered) → 100% green; UI projects also write `specs/logs/ui-e2e.json` (see `oracle-standard.md` §UI specs).
2. **Update state:** `node specs/.sdd/scripts/sdd.cjs transition --completed 05` (refuses unless the lock is intact, the latest unfiltered oracle run against this lock is green, and reconciliation has zero ❌).
3. **Handoff:** UI project → prompt `06_visual_acceptance_testing`. Otherwise → `07_verification_before_completion` (the transition skips 06 automatically).

## Outputs
- Codebase files
- `specs/dev-swarm-reconciliation.md`
- `specs/logs/05-swarm.md`, `specs/logs/oracle/run-*.json`
- `specs/changes/SCR-*.md` drafts (if gaps were found)
- `README.md`
- `specs/.sdd/_config/sdd-state.json` (via `sdd.cjs transition`)
