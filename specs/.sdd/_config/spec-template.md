# SPEC.md Template

<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∈ = in | § = section ref | & = and | | = or -->

Canonical structure for `specs/SPEC.md` (filled-in reference: `examples/notes-service/specs/SPEC.md`). A fixed structure lets every stage — and every independent builder — find the same facts in the same place. Section numbers are stable: fixtures cite them in `derivedFrom`. Sections that do not apply stay, with one line: `N/A — <reason>`.

Machine contracts in `specs/contracts/` are authoritative for the details they express. SPEC states the rules and points to them; ⊥ restate contract content in prose (two copies drift).

```markdown
# <System name>

## 0. Meta
- Project type: <backend-service | fullstack-app | client-side-app | game | cli-tool | library>
- Interfaces: <http | cli | browser | library>   (must match specs/contracts/manifest.json)
- Equivalence target: <L2 equivalence-verified | L1 oracle-conformant + DECnnn justification>

## 1. Scope
- In scope: …
- Out of scope (explicit): …

## 2. Glossary
| Term | Definition | Code name |
|---|---|---|

## 3. Actors & Authorization
- Authentication: <mechanism, header, token TTL> | "none" + justification
- Permission matrix (role × resource × action → allow | deny). List denials explicitly.

## 4. Domain Model & Lifecycles
Entities, relationships, cardinalities. Lifecycles → `specs/contracts/statecharts.json` (cite machine ids).

## 5. Operations
One subsection per operation group. ∀ operation: purpose, actor, preconditions, effects, every possible outcome → `openapi.yaml` operationId | `cli.json` command.

## 6. Data & Persistence
Storage engine → `schema.sql` | `storage.schema.json`. Retention / purge policies, cascade rules.

## 7. Errors
Domain error codes → `errors.json`. Trigger condition per domain code.

## 8. Invariants (§V)
- **V1:** <rule that must never be violated, testable as stated>
- **V2:** …

## 9. Equivalence Boundary
- Observable surfaces: <HTTP responses, DB rows asserted by fixtures, CLI stdout/exit codes, rendered UI>
- Declared degrees of freedom (values that may differ between builds): <server-generated ids, server timestamps, error `detail`, pagination cursor values, CLI stderr text, …> → mirrored in `oracle.config.json#variablePaths`
- Internal freedoms (not observable, builder's choice): <language idioms, internal module layout, logging format, …>

## 10. Observable Environment
Runtime + major version, database engine + major version, collation, timezone (UTC), PRNG algorithm & seed (if any).

## 11. Equivalence Profile Overrides
| Rule | Override | Decision |
|---|---|---|
(empty if none; mirrored in manifest.json#profileOverrides)

## 12. Configuration
| Env var | Required | Format | Default | Meaning |
|---|---|---|---|---|
(every time/count-based rule is configurable here — profile ENV-3)

## 13. Limits & Non-Functional
Payload limits, batch limits, timeouts, rate limits — exact numbers.

## 14. UI (UI projects only)
- Component Hierarchy (PascalCase; ↔ DESIGN.md kebab-case keys ↔ `data-testid`)
- Screen flow
- Input & Interaction Contract (input × state → result & feedback)
- Copy table: every user-visible static string, character-exact
  | Key | Text |
  |---|---|
```
