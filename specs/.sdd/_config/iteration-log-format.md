# Iteration Log Format

Shared format templates for adversarial swarm and development swarm iteration logs. Used by:
- Stage 02 — appended to `specs/logs/02-swarm.md`
- Stage 05 — appended to `specs/logs/05-swarm.md`

Logs are persisted to those files (the audit trail); the chat shows a summary. Logs are working files, never builder inputs: a Stage 05 builder ⊥ reads `02-swarm.md` (spec-only rule).

---

## Adversarial Swarm Iteration Log

```markdown
## 🔄 Iteration N

### Blue Team Draft Changes
[What was added or modified in this pass]

### Red Team Findings
| Finding # | Attacking Persona | Section Attacked | Flaw/Ambiguity | Severity |
|-----------|-------------------|------------------|----------------|----------|
| ...       | ...               | ...              | ...            | ...      |

### Resolution Actions
| Finding # | Kind (Technical / Policy) | Resolution | Escalation Required? |
|-----------|---------------------------|------------|----------------------|
| ...       | ...                       | ...        | Yes → user question (DECnnn) / No |

### Machine Validation
[Paste `node specs/.sdd/scripts/sdd.cjs check --contracts` output]

### Verdict: PASS / FAIL (N findings remaining)
```

The final iteration additionally contains the **Outcome Table** consumed by Stage 04:

```markdown
### Outcome Table
| Operation / command | Outcome | Status / exit | Error code | Trigger |
|---------------------|---------|---------------|------------|---------|
| createOrder | created | 201 | — | valid body, new Idempotency-Key |
| createOrder | invalid body | 422 | VALIDATION_ERROR | qty < 1 |
```

## Development Swarm Iteration Log

```markdown
## 🔄 Development Iteration N for [Filename]

### Blue Team Draft/Fix
[Summary of the code written]

### Red Team Findings
| Line/Function | Attacking Persona | Vulnerability / Bug / Flaw |
|---------------|-------------------|----------------------------|
| ...           | ...               | ...                        |

### Verification Evidence
[Paste output of `node specs/.sdd/scripts/oracle.cjs run --phase N` (and build/typecheck output)]

### Verdict: PASS / FAIL
```

## Reconciliation Report

```markdown
## 🔁 Post-Implementation Reconciliation Report

| Spec Section | Spec Says | Code Actually Does | Drift? |
|--------------|-----------|-------------------|--------|
| ...          | ...       | ...               | ✅ / ❌ |
```

## Swarm Completion Report

```markdown
## Swarm Log
| File | Attacking Persona | Vulnerability Prevented | Severity | Blue Team Fix |
|------|-------------------|-------------------------|----------|---------------|
| ...  | ...               | ...                     | ...      | ...           |
```

---

## Rules

- Every iteration MUST be written in full, in the format above, to the stage's log file (`specs/logs/02-swarm.md` | `specs/logs/05-swarm.md`); the chat shows a summary. You are FORBIDDEN from claiming you "internally looped."
- You MUST use Markdown Tables for findings, not bullet points.
- If any iteration log is missing or summarized as "resolved internally," the entire swarm run is invalid.
