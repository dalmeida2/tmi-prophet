# DECISION_LOG.md Template & Rules

This file defines the canonical template for `specs/DECISION_LOG.md`. It is used by:
- Stage 01 (`01_brainstorming`) and Stage 01b (`01b_adoption`) — create and extend it
- Stage 02 — records policy escalations and Equivalence Profile overrides
- `sdd.cjs check` — verifies every `manifest.json#profileOverrides[].decision` id exists here

`DECISION_LOG.md` is a working file (not frozen): it explains *why*. Every decision it records must also be reflected in the frozen set (SPEC, contracts, oracle) — a decision that lives only here is invisible to a builder and therefore not a decision at all.

---

## Template

```markdown
# Decision Log

| # | Decision | Options Considered | Choice | Rationale | Reflected in |
|---|----------|-------------------|--------|-----------|--------------|
| DEC001 | Example: Data storage | PostgreSQL, SQLite, localStorage | localStorage | Client-only app, no server required — user confirmed | SPEC §6, `storage.schema.json` |
| DEC002 | Example: Profile override PAGE-1 | clamp vs 422 | clamp `limit` to 100 | Legacy clients send 500 — user confirmed | `manifest.json#profileOverrides`, case ORD-031 |
```

## Rules

- Every decision made during brainstorming MUST appear in this table — even ones that felt obvious.
- If a decision was made by the user selecting from options, list all options considered.
- If a decision was made by the AI recommending and the user approving, note that in the Rationale.
- If a decision involves a numeric parameter, the Choice column MUST contain the exact value or range — not vague language.
- Ids are `DEC` + a zero-padded number (`DEC001`), never reused. Append new entries; never rewrite old ones — a reversed decision gets a new entry that references the old id.
- "Reflected in" names the SPEC section, contract or oracle case that makes the decision observable to a builder.
