<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∄ = does not exist | ∈ = in | § = section ref | & = and | | = or -->

# Stage 07: Verification Before Completion & Equivalence Certification

Use when about to claim work is complete, fixed, or passing — requires running verification commands and confirming output before making any success claims; evidence before assertions always. For SDD projects, "complete" means certified at the project's equivalence target.

Claiming work is complete without verification is dishonesty, not efficiency.

## Inputs
- Layer 4 (working): Source code / running build(s)
- Layer 4 (frozen): `specs/SPEC.md`, `specs/contracts/*`, `specs/fixtures/*`, `specs/spec.lock.json`
- Layer 4 (working): `specs/IMPLEMENTATION_PHASES.md`, `specs/dev-swarm-reconciliation.md`
- Layer 4 (working): `specs/vat-checklist.md`, `specs/VAT_REPORT.md` (? UI project)
- Layer 4 (working): `node specs/.sdd/scripts/sdd.cjs status`

## Process

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

### The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this stage, you cannot claim it passes. The transition gate enforces this: oracle and diff reports older than the start of Stage 07 are rejected.

### The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

### Equivalence Certification

Run in order; stop at the first failure and route it (Failure Routing).

**L1 — Oracle-conformant** (always required)
1. `node specs/.sdd/scripts/sdd.cjs verify` → frozen set intact.
2. `node specs/.sdd/scripts/sdd.cjs check` → contracts, fixtures, coverage clean.
3. Build + typecheck (`tsc --noEmit` for TypeScript) → exit 0.
4. `node specs/.sdd/scripts/oracle.cjs run` (unfiltered) → 100% passed, 0 errored.
5. UI projects: frozen UI specs → `specs/logs/ui-e2e.json` with 0 failed, 0 flaky; `VAT_REPORT.md` verdict PASS.
6. `IMPLEMENTATION_PHASES.md`: every task `[x]`; `dev-swarm-reconciliation.md`: zero ❌.

**L2 — Equivalence-verified** (required when `manifest.json#equivalenceTarget` = 2, the default)
1. `node specs/.sdd/scripts/sdd.cjs export ../<project>-eqb` — copies ONLY the frozen set (plus unchecked phases and regenerated entry files) into a fresh directory. If build B ran in lockstep (Stage 05 tip), run `sdd.cjs export ../<project>-eqb --update` instead to bring it to the current lock.
2. In a **fresh agent session** opened on that directory — no access to the first implementation, its git history or this conversation; a different model or seed when available — run Stage 05 to completion there.
3. Start both builds against separate, empty storage, each with the frozen build environment (`eval "$(node specs/.sdd/scripts/oracle.cjs env)"`). Set the env vars that `oracle.config.json` targets `a` and `b` reference (e.g. `ORACLE_A_URL`, `ORACLE_B_URL`, their database URLs).
4. HTTP / CLI / library interfaces: `node specs/.sdd/scripts/oracle.cjs diff --a a --b b --b-root ../<project>-eqb` → zero divergent cases, zero errored. Probes are included. `--b-root` binds the report to build B's frozen set: the gate refuses if B's lock differs from A's (e.g. B's session re-froze its own copy).
5. Browser interface: run the frozen UI suite against each build with `SDD_UI_OBS_FILE=specs/logs/ui-obs-a.jsonl` and `…-b.jsonl`, then `node specs/.sdd/scripts/oracle.cjs diff-ui --a specs/logs/ui-obs-a.jsonl --b specs/logs/ui-obs-b.jsonl --b-root ../<project>-eqb` → zero divergent observations.
6. Every divergence is an unconstrained degree of freedom: route it to Stage 00 as class C, even when both builds pass the oracle. A spec gap that builder B raises is handled the same way — in THIS workspace, never in B's copy — and B is re-exported afterwards. Re-certify after the SCR is applied and both builds are fixed.

Lowering the target to L1 requires a DECISION_LOG entry and setting `equivalenceTarget: 1` in the manifest (a frozen change → user-approved re-freeze).

### Equivalence Report

Write `specs/EQUIVALENCE_REPORT.md`:

```markdown
# Equivalence Report — <system> — YYYY-MM-DD

| Item | Evidence |
|------|----------|
| Lock | v<N> <hash12> — `sdd.cjs verify` ✓ |
| Coverage | <coverage line from `sdd.cjs check`> |
| Oracle (build A) | <passed>/<total> — `specs/logs/oracle/run-default.json` @ <finishedAt> |
| UI specs | <expected> passed, 0 failed, 0 flaky — `specs/logs/ui-e2e.json` (UI only) |
| VAT | PASS — `specs/VAT_REPORT.md` (UI only) |
| Dual build | build B from `sdd.cjs export` @ <commit/dir>, model/session: <…> |
| Diff A vs B | <totalCases> cases, 0 divergent — `specs/logs/oracle/diff-a-b.json` @ <finishedAt>, B lock <hash12> |
| UI diff A vs B | <n> observations, 0 divergent — `specs/logs/oracle/uidiff-a-b.json` (UI only) |
| Declared degrees of freedom | <variablePaths + variable matchers summary> |
| Certified level | L2 Equivalence-verified / L1 Oracle-conformant (DECnnn) |
```

### Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Requirements met | Line-by-line checklist | Tests passing |
| UI looks correct | Stage 06 VAT screenshot evidence | Code inspection, "CSS looks right" |
| Reconciliation complete | `specs/dev-swarm-reconciliation.md` verified zero drift | claim zero drift without file read |
| Oracle-conformant (L1) | Fresh unfiltered `oracle.cjs run` against the current lock + `sdd.cjs verify` | A filtered run, a run against an older lock, builder-written tests |
| Equivalence-verified (L2) | Fresh `oracle.cjs diff` between two independently built implementations: 0 divergences | Both builds passing the oracle separately; one build "looking like" the spec |

### Failure Routing

- Oracle / UI spec failure, VAT failure, reconciliation drift → Stage 05 (code defect, class A), unless the builder disputes the case → Stage 00.
- `sdd.cjs verify` fails → STOP. Someone changed the frozen set outside change control: restore it (`git checkout`), or route the change through Stage 00 for approval.
- `oracle diff` divergence → Stage 00, class C (spec gap).
- ⊥ patch code or fixtures directly in this stage.

### Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to claim completion without verification
- Relying on partial verification (`--phase`, `--case`, `--suite` runs are not evidence)
- Thinking "just this once"
- **ANY wording implying success without having run verification**

### Key Patterns

**Tests:**
```
✅ [Run oracle.cjs run] [See: 34/34 passed] "All oracle cases pass against lock v3"
❌ "Should pass now" / "Looks correct"
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**TypeScript Compilation:**
```
✅ [Run `npx tsc --noEmit`] [See: exit code 0] "No TypeScript errors"
❌ "Build passes" (if the build tool like Vite skips typechecking)
```

**Equivalence:**
```
✅ [Run oracle.cjs diff] [See: 41 cases, 0 divergent] "Builds A and B are equivalent under the oracle"
❌ "Both builds pass the oracle, so they're equivalent"
```

**Reconciliation:**
```
✅ read `specs/dev-swarm-reconciliation.md` → verify zero drift
❌ claim zero drift from memory
```

## Outputs
- Terminal output of verification commands
- `specs/EQUIVALENCE_REPORT.md`
- `specs/logs/oracle/run-*.json`, `specs/logs/oracle/diff-*.json`
- `specs/.sdd/_config/sdd-state.json` (via `sdd.cjs transition`)

### Handoff / Transitions
1. **Update state:** `node specs/.sdd/scripts/sdd.cjs transition --completed 07` (refuses unless the lock is intact, a fresh unfiltered oracle run is green, `EQUIVALENCE_REPORT.md` exists and — for target L2 — a fresh diff shows zero divergences).
2. **Handoff:** Report the certified level with its evidence. Present walkthrough. Next change: Class 0 → Stage 05, Class 1 → Stage 01, Class 2 → Stage 00.
