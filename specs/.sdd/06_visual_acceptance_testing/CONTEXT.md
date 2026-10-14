<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | ∄ = does not exist | ∈ = in | § = section ref | & = and | | = or -->

# Stage 06: Visual Acceptance Testing (VAT)

Browser-based visual acceptance testing for UI projects. Walks every screen in the spec's Component Hierarchy, screenshots each, verifies element presence and visibility, tests interactions, and flags debug artifacts.

**Why:** Unit tests verify logic. TypeScript verifies types. Neither verifies button visible, screen has content, animation plays. This stage does — and it checks that the rendered UI matches the frozen visual contract (tokens, wireframes, test ids, copy), which is what makes two UI builds look and behave alike.

## Inputs
- Layer 4 (working): Source code / Deployed application
- Layer 4 (working): `specs/SPEC.md`
- Layer 4 (working): `specs/DESIGN.md` (if UI project)
- Layer 4 (working): `specs/wireframes/*.html` (? exists)
- Layer 4 (frozen): `specs/fixtures/ui/*.spec.ts` (black-box UI specs)
- Layer 3 (reference): `../_config/vat-report-format.md`
- Layer 3 (reference): `../_config/references/systems-standards.md` §11 (UI-1…UI-4)

## Process

**MANDATORY** ∀ UI project types (`fullstack-app`, `client-side-app`, `game`). Non-UI projects skip this stage (`sdd.cjs transition --completed 05` skips it automatically).

#### Step 0: Frozen UI Specs
Run the black-box UI specs and keep the report as evidence:
```bash
ORACLE_UI_URL=<build url> PLAYWRIGHT_JSON_OUTPUT_FILE=specs/logs/ui-e2e.json npx playwright test --config specs/fixtures/ui/playwright.config.ts --reporter=json
```
Any failed or flaky test = VAT FAIL. ⊥ edit the specs to make them pass (frozen set).

### VAT Protocol

**⛔ GATE:** ! create tracking artifact `specs/vat-checklist.md`. ! document evaluation ∀ screen/interaction sequentially, check boxes only when proven by browser screenshot | computed style extraction. Mass-approving without tracker = severe process violation (rubber-stamping).

#### Step 1: Identify Screen Map
Read spec's **Component Hierarchy**. Extract ∀ screens & child components → checklist:

```markdown
## VAT Checklist
- [ ] TitleScreen: Logo, PlayButton, SettingsButton
- [ ] LevelSelectScreen: BackButton, LevelGrid > LevelTile[]
```

#### Step 2: Screen Walk (Visual Presence Audit)
∀ screen ∈ checklist, use the agent's browser tool (or a Puppeteer/Playwright script if none is available):

1. **Navigate** to screen
2. **Screenshot** the screen
3. **Verify** ∀ child component:
   - Present ∈ DOM
   - Visually visible (not `display: none`, not 0-height, not transparent)
   - Non-empty
   - Carries its pinned `data-testid` (UI-1) and copy-table text (UI-2)
4. **Record** PASS/FAIL per component

#### Step 3: Interaction Contract Audit
Read spec's **Input & Interaction Contract**. ∀ interaction:

1. Navigate to correct state
2. Perform input (tap, click)
3. Verify expected result occurs & expected feedback

#### Step 3.5: Design Token Verification (∃ `DESIGN.md` only)
∃ `specs/DESIGN.md` → verify rendered UI uses design tokens. 

∀ major component ∈ DESIGN.md `components:` section:
1. Inspect computed styles
2. Compare rendered `background-color`, `color`, `font-family`, `font-size`, `border-radius` vs DESIGN.md tokens
3. Flag mismatch

#### Step 4: Debug Artifact Scan
Search visible DOM for elements ⊥ be exposed ∈ production:
1. IDs | classes containing: `mock`, `debug`, `test`, `dev`, `tmp`, `TODO`
2. `console.log` ∈ browser console
3. Commented-out UI elements partially visible
4. Placeholder text

#### Step 5: Screenshot Evidence Archive
Save ∀ screenshots taken during Screen Walk → `specs/logs/vat/<screen>.png` (in the repo, so Stage 07 can cite them).

### Verdict Rules

- **PASS:** Frozen UI specs green (0 failed, 0 flaky). ∀ screen walk components present + visible + has content + correct test ids and copy. ∀ tested interactions produce expected result. Zero token mismatches. Zero high-severity debug artifacts.
- **FAIL:** Any of the above fails.

**⛔ GATE:** VAT FAIL → ⊥ transition. Return to Stage 05 with the VAT report as the defect list: fix the code, re-run Stage 05's final evidence and reconciliation, then re-run this stage from Step 0. A failure the frozen visual contract cannot explain (two acceptable renderings, missing copy, undefined state) = spec gap → Stage 00.

## Outputs
- `specs/vat-checklist.md`
- `specs/VAT_REPORT.md` (format: `vat-report-format.md`, ending in a `**Verdict:** PASS | FAIL` line)
- `specs/logs/ui-e2e.json`, `specs/logs/vat/*.png`
- `specs/.sdd/_config/sdd-state.json` (via `sdd.cjs transition`)

### Handoff / Transitions
1. **Update state:** `node specs/.sdd/scripts/sdd.cjs transition --completed 06` (refuses unless `vat-checklist.md` exists and `VAT_REPORT.md` says `**Verdict:** PASS`).
2. **Handoff:** Prompt user to proceed `07_verification_before_completion`.
