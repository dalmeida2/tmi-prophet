<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∄ = does not exist | ∈ = in | § = section ref | & = and | | = or -->

# Stage 00: Backprop — Trace Defects to the Spec

The only door into the frozen set. A defect means either the code broke the spec, or the spec allowed more than one behavior. Backprop decides which, fixes the *source* (spec, contracts, oracle, or pipeline), and re-freezes. It never patches code; Stage 05 does that against the corrected oracle.

*Edit-Source Principle: repeatedly fixing the same kind of error → trace the root cause to its source (spec, CONTEXT.md, or reference) and fix it there.*

## When to Use This Stage

- A Stage 05 builder believes an oracle case is wrong, or needs information the frozen set does not contain (spec gap).
- `oracle.cjs diff` reports divergences between two independent builds.
- Stage 07 verification fails, or a defect escapes to production.
- The user asks to trace a bug back to its source.

## Inputs
- Layer 4 (working): Failing oracle output (`specs/logs/oracle/*.json`), diff report, bug report, or post-mortem
- Layer 4 (working): The frozen set (`specs/SPEC.md`, `specs/contracts/*`, `specs/fixtures/*`) and `specs/spec.lock.json`
- Layer 4 (working): `node specs/.sdd/scripts/sdd.cjs status`
- Layer 3 (reference): `../_config/references/oracle-standard.md`, `../_config/references/systems-standards.md`
- Layer 3 (reference): The `CONTEXT.md` of the stage that should have caught the defect

## Process

### 1. Reproduce as observation
Express the defect as an oracle observation: request → observed vs expected (or build A vs build B). ∄ reproducible observation → it is not yet a defect; gather evidence first. Draft the reproducing case in `specs/changes/SCR-NNN/cases.json` (outside the frozen set).

### 2. Classify the root cause (exactly one)

| Class | Meaning | Fix target |
|---|---|---|
| **A — Implementation defect** | Spec and oracle are correct; the oracle already catches it | No frozen change. Route to Stage 05. (Skip the SCR.) |
| **A′ — Oracle gap** | Spec is correct, but no case catches the defect | Add case(s) to `specs/fixtures/` |
| **B — Oracle defect** | A case contradicts the spec | Correct the case |
| **C — Spec gap** | The spec admits more than one behavior: builder had to guess, or two builds diverged | Pin the behavior in SPEC + contracts; add case(s) that distinguish the alternatives |
| **D — Spec error** | The spec pins behavior the user does not want | Class 1 change: the user decides the new policy (route via Stage 01 if the policy needs discussion) |
| **E — Pipeline defect** | A stage contract let the gap through | Propose a `CONTEXT.md` / `_config` change (in addition to the A′–D fix) |

### 3. Write the Spec Change Request
Create `specs/changes/SCR-NNN.md`:

```markdown
# SCR-NNN: <one-line title>

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Trigger | oracle failure / diff divergence / bug report — link to evidence |
| Observation | request → A vs B (or observed vs expected) |
| Class | A′ / B / C / D / E |
| Root cause | one sentence |
| Stage that should have caught it | e.g. 02 (Fork Test missed whitespace handling) |
| Proposed frozen-set edits | exact diffs per file (SPEC §, contract, fixture) |
| New / changed cases | ids + what each one distinguishes |
| New invariant | `- **Vn:** …` (if applicable) |
| Pipeline change | CONTEXT.md / _config edit (class E only) |
```

### 4. ⛔ GATE: user approval
Present the SCR to the user. ⊥ edit any frozen file until the user explicitly approves this SCR. An SCR raised by a builder is never approved by that builder. A class E pipeline change needs its own separate approval.

### 5. Apply
Edit exactly the approved files. Then:
- **Discrimination check (A′ and C):** run the new case(s) against the current build — `node specs/.sdd/scripts/oracle.cjs run --case <ids>`. They ! FAIL on the build that exhibits the defect (for divergences: on at least one of the two builds). A case that passes against the defective build does not catch the defect; rewrite it.
- `node specs/.sdd/scripts/sdd.cjs check` → ! pass (coverage includes any new invariant).
- `node specs/.sdd/scripts/sdd.cjs freeze --reason "SCR-NNN: <title>" --approved-by "<user>"`.

### 6. Log
Append to `specs/backprop-log.md` (create if ∄):

```markdown
## SCR-NNN — YYYY-MM-DD
| Bug | Class | Root cause | Source fix | Invariant | Lock |
|-----|-------|------------|------------|-----------|------|
| … | C | … | SPEC §5.2 + ORD-014 | V7 | v3 (ab12cd34ef56) |
```

⊥ write or edit implementation code in this stage. The code fix is Stage 05's job, graded by the corrected oracle.

## Verify
- `sdd.cjs verify` passes against the new lock.
- New cases failed against the defective build before the fix (discrimination check).
- ⊥ duplicate gaps: search the other stage contracts for the same blind spot (class E).

## Outputs
- `specs/changes/SCR-NNN.md` (+ `specs/changes/SCR-NNN/cases.json` drafts)
- Approved edits to the frozen set + new `specs/spec.lock.json` version
- `specs/backprop-log.md`
- `specs/.sdd/_config/sdd-state.json` (via `sdd.cjs transition`)

### Handoff / Transitions
1. **Update state:** `node specs/.sdd/scripts/sdd.cjs transition --completed 00 --resume <stage>`:
   - `--resume 05` — oracle/spec patched; Stage 05 fixes the code (most common).
   - `--resume 04` — new behavior needs new implementation phases.
   - `--resume 02` — the spec change touched contracts enough to need re-hardening.
   - `--resume 01` — class D: the user must make a policy decision first (`--resume 01b` for adopted projects whose characterization must be re-recorded).
2. **Handoff:** Tell the user where the pipeline resumes and why.
