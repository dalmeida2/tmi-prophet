# VAT Report Formats

Shared format templates for Visual Acceptance Testing reports. Used by Stage 06 (`06_visual_acceptance_testing`) to write `specs/VAT_REPORT.md`. The report ! end with a verdict line — `sdd.cjs transition --completed 06` reads it:

```markdown
**Verdict:** PASS
```

---

## Screen Walk Report

```markdown
## 🖥️ Screen Walk Report

| Screen | Component | Present? | Visible? | Has Content? | Test id / copy match? | Status |
|--------|-----------|----------|----------|--------------|-----------------------|--------|
| TitleScreen | Logo | ✅ | ✅ | ✅ "COFFEE RUSH" | ✅ `logo` | PASS |
| LevelComplete | StarAnimation | ✅ | ❌ | ❌ empty div | ✅ `star-animation` | FAIL |
| LevelComplete | Stats | ❌ | — | — | — | FAIL |
```

## Interaction Audit

```markdown
## 🎮 Interaction Audit

| Input | State | Expected Result | Actual Result | Status |
|-------|-------|-----------------|---------------|--------|
| Tap tray (match) | GAMEPLAY:IDLE | Cup flies to tray | Cup disappeared from belt, appeared in tray | PASS |
| Tap Retry | LEVEL_FAILED | Reload level | Screen froze, no transition | FAIL |
```

## Design Token Verification

```markdown
## 🎨 Design Token Verification

| Component | Property | DESIGN.md Token | Expected Value | Rendered Value | Status |
|-----------|----------|-----------------|----------------|----------------|--------|
| chat-card-user | borderLeft | colors.accent | #00D4FF | #00D4FF | PASS |
| send-button | backgroundColor | colors.accent | #00D4FF | #3B82F6 | FAIL |
```

## Debug Artifact Scan

```markdown
## 🔍 Debug Artifact Scan

| Element | Location | Issue | Severity |
|---------|----------|-------|----------|
| btn-win-mock | GameplayScreen | Dev button visible in production | 🔴 High |
| console.log | StateMachine.ts | Transition logs in console | 🟡 Low |
```
