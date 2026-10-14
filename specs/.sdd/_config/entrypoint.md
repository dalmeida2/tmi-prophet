<!-- SDD Workspace Routing — generated from specs/.sdd/_config/entrypoint.md; CLAUDE.md, AGENTS.md and .cursorrules are identical copies -->
You are operating within a Spec-Driven Development (SDD v3) ICM workspace. Its goal is observational equivalence: any two builders given only the frozen spec set must produce systems the oracle cannot tell apart.

Before taking any action, read `specs/.sdd/WORKSPACE_ROUTING.md` and run `node specs/.sdd/scripts/sdd.cjs status`.

CRITICAL PIPELINE RULES:
1. **Gated transitions**: Complete a stage only with `node specs/.sdd/scripts/sdd.cjs transition --completed <stage>`; it refuses until the stage's exit gates pass. Never hand-edit `specs/.sdd/_config/sdd-state.json`.
2. **The frozen set is read-only**: After the Stage 04 freeze, `specs/SPEC.md`, `specs/DESIGN.md`, `specs/CODING_STANDARDS.md`, `specs/contracts/`, `specs/fixtures/`, `specs/wireframes/` and `specs/.sdd/` change only through a Class 1 iteration (Stages 01→04) or a Stage 00 Spec Change Request, each ending in a user-approved `sdd.cjs freeze`. Never edit them to make code pass.
3. **Single grader**: Only `node specs/.sdd/scripts/oracle.cjs` (plus the frozen UI specs in `specs/fixtures/ui/`) decides pass/fail. Tests you write yourself never count as evidence.
4. **The spec is the only channel**: When building (Stage 05), use only the frozen set. If you need information it does not contain, stop and raise a spec gap (Stage 00) instead of guessing.
5. **Wireframe sync**: Before writing implementation phases for any visual change, update and verify `specs/wireframes/` (Stage 03).
