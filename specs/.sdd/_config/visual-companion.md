# Visual Companion Guide

<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | & = and | | = or -->

Browser-based visual brainstorming companion for mockups, diagrams, options.

## When to Use

Decide per-question, not per-session. Test: **would user understand better by seeing it than reading it?**

**Use browser** when content itself = visual:
- UI mockups — wireframes, layouts, nav structures, component designs
- Architecture diagrams — system components, data flow, relationship maps
- Side-by-side visual comparisons — two layouts, color schemes, design directions
- Design polish — look/feel, spacing, visual hierarchy
- Spatial relationships — state machines, flowcharts, ERDs

**Use terminal** when content = text | tabular:
- Requirements/scope questions
- Conceptual A/B/C choices (approaches described in words)
- Tradeoff lists, comparison tables
- Technical decisions — API design, data modeling, architectural approach
- Clarifying questions (answer = words, not visual preference)

Question *about* UI topic ≠ automatically visual. "What kind of wizard?" = conceptual → terminal. "Which wizard layout?" = visual → browser.

## How It Works

Server watches directory for HTML files, serves newest to browser. Write HTML → `screen_dir`, user sees ∈ browser, clicks to select. Selections recorded → `state_dir/events`, read on next turn.

**Fragments vs full documents:** HTML starting with `<!DOCTYPE` | `<html>` → served as-is (helper script injected). Otherwise → server wraps ∈ frame template (header, CSS theme, selection indicator, interactive infrastructure). **Write fragments by default.** Full documents only when needing complete page control.

## Starting Session

```bash
# Start server with persistence (mockups saved to project)
specs/.sdd/scripts/start-server.sh --project-dir /path/to/project

# Returns: {"type":"server-started","port":52341,"url":"http://localhost:52341",
#           "screen_dir":"/path/to/project/specs/brainstorming/12345-1706000000/content",
#           "state_dir":"/path/to/project/specs/brainstorming/12345-1706000000/state"}
```

Save `screen_dir` & `state_dir`. Tell user to open URL.

**Connection info:** Server writes startup JSON → `$STATE_DIR/server-info`. If launched ∈ background without capturing stdout, read that file. With `--project-dir`, check `<project>/specs/brainstorming/` for session directory.

**Note:** Pass project root as `--project-dir` → mockups persist ∈ `specs/brainstorming/` (ignored by the shipped `specs/.gitignore`). Without → `/tmp`, gets cleaned up.

**Wireframes (Stage 03):** with `--project-dir`, the server also serves `specs/wireframes/<screen>.html` at `<url>/wireframes/<screen>.html` and reloads the page whenever that file is saved. Edit wireframes in place there; `screen_dir` is for throwaway option pages.

**Security:** the server only serves files inside the session directory and `specs/`, and accepts browser events only from its own pages.

**Platform launch:**

**Claude Code (macOS/Linux):**
```bash
specs/.sdd/scripts/start-server.sh --project-dir /path/to/project
```

**Claude Code (Windows):**
```bash
# Windows auto-detects foreground mode (blocks tool call).
# Set run_in_background: true. Read $STATE_DIR/server-info next turn.
specs/.sdd/scripts/start-server.sh --project-dir /path/to/project
```

**Codex:**
```bash
# Codex reaps background processes. Script auto-detects CODEX_CI → foreground mode.
specs/.sdd/scripts/start-server.sh --project-dir /path/to/project
```

**Gemini CLI:**
```bash
# Use --foreground + is_background: true on shell tool
specs/.sdd/scripts/start-server.sh --project-dir /path/to/project --foreground
```

**Other environments:** Server ! keep running across turns. Environment reaps detached processes → use `--foreground` + platform's background mechanism.

Unreachable URL (remote/containerized):
```bash
specs/.sdd/scripts/start-server.sh \
  --project-dir /path/to/project \
  --host 0.0.0.0 \
  --url-host localhost
```

`--url-host` controls hostname ∈ returned URL JSON.

## The Loop

1. **Check server alive → write HTML** to new file ∈ `screen_dir`:
   - Before each write, check `$STATE_DIR/server-info` ∃. ∄ (or `server-stopped` ∃) → restart via `specs/.sdd/scripts/start-server.sh`. Server auto-exits after 30min inactivity.
   - Semantic filenames: `platform.html`, `visual-style.html`, `layout.html`
   - ⊥ reuse filenames — each screen = fresh file
   - Use the editor's file-write tool — ⊥ cat/heredoc (dumps noise into terminal)
   - Server auto-serves newest file

2. **Tell user what to expect, end turn:**
   - Remind URL (every step)
   - Brief text summary of what's on screen
   - "Take a look and let me know. Click to select an option if you'd like."

3. **Next turn** — after user responds:
   - Read `$STATE_DIR/events` if ∃ → user's browser interactions (clicks, selections) as JSON lines
   - Merge with terminal text → full picture
   - Terminal = primary feedback; events = structured interaction data

4. **Iterate | advance** — feedback changes current screen → write new file (e.g., `layout-v2.html`). Move to next question only when current step validated.

5. **Unload when returning to terminal** — push waiting screen:
   ```html
   <!-- filename: waiting.html (or waiting-2.html, etc.) -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">Continuing in terminal...</p>
   </div>
   ```
   Prevents user staring at resolved choice while conversation moved on.

6. Repeat until done.

## Writing Content Fragments

Write just content inside page. Server wraps ∈ frame template.

**Minimal example:**
```html
<h2>Which layout works better?</h2>
<p class="subtitle">Consider readability and visual hierarchy</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Single Column</h3>
      <p>Clean, focused reading experience</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Two Column</h3>
      <p>Sidebar navigation with main content</p>
    </div>
  </div>
</div>
```

No `<html>`, no CSS, no `<script>` needed. Server provides all.

## CSS Classes Available

Frame template provides these classes:

### Options (A/B/C choices)
```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Title</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

**Multi-select:** Add `data-multiselect` → users select multiple. Each click toggles. Indicator bar shows count.
```html
<div class="options" data-multiselect>
  <!-- same markup — select/deselect multiple -->
</div>
```

### Cards (visual designs)
```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup content --></div>
    <div class="card-body">
      <h3>Name</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

### Mockup container
```html
<div class="mockup">
  <div class="mockup-header">Preview: Dashboard Layout</div>
  <div class="mockup-body"><!-- your mockup HTML --></div>
</div>
```

### Split view (side-by-side)
```html
<div class="split">
  <div class="mockup"><!-- left --></div>
  <div class="mockup"><!-- right --></div>
</div>
```

### Pros/Cons
```html
<div class="pros-cons">
  <div class="pros"><h4>Pros</h4><ul><li>Benefit</li></ul></div>
  <div class="cons"><h4>Cons</h4><ul><li>Drawback</li></ul></div>
</div>
```

### Mock elements (wireframe building blocks)
```html
<div class="mock-nav">Logo | Home | About | Contact</div>
<div style="display: flex;">
  <div class="mock-sidebar">Navigation</div>
  <div class="mock-content">Main content area</div>
</div>
<button class="mock-button">Action Button</button>
<input class="mock-input" placeholder="Input field">
<div class="placeholder">Placeholder area</div>
```

### Typography & sections
- `h2` — page title
- `h3` — section heading
- `.subtitle` — secondary text below title
- `.section` — content block with bottom margin
- `.label` — small uppercase label text

## Browser Events Format

User clicks ∈ browser → interactions recorded to `$STATE_DIR/events` (one JSON per line). File cleared when new screen pushed.

```jsonl
{"type":"click","choice":"a","text":"Option A - Simple Layout","timestamp":1706000101}
{"type":"click","choice":"c","text":"Option C - Complex Grid","timestamp":1706000108}
{"type":"click","choice":"b","text":"Option B - Hybrid","timestamp":1706000115}
```

Full event stream shows exploration path — may click multiple before settling. Last `choice` = typically final selection, but click pattern reveals hesitation/preferences worth asking about.

`$STATE_DIR/events` ∄ → user didn't interact with browser — use terminal text only.

## Design Tips

- **Scale fidelity to question** — wireframes for layout, polish for polish questions
- **Explain question on each page** — "Which layout feels more professional?" not just "Pick one"
- **Iterate before advancing** — feedback changes screen → new version
- **2-4 options max** per screen
- **Real content when it matters** — photography portfolio → actual images (Unsplash). Placeholder content obscures design issues.
- **Keep mockups simple** — layout & structure, not pixel-perfect

## File Naming

- Semantic names: `platform.html`, `visual-style.html`, `layout.html`
- ⊥ reuse filenames — each screen = new file
- Iterations: `layout-v2.html`, `layout-v3.html`
- Server serves newest by modification time

## Cleaning Up

```bash
specs/.sdd/scripts/stop-server.sh $SESSION_DIR
```

With `--project-dir` → mockup files persist ∈ `specs/brainstorming/`. `/tmp` sessions deleted on stop.

## Reference

- Frame template (CSS reference): `specs/.sdd/scripts/frame-template.html`
- Helper script (client-side): `specs/.sdd/scripts/helper.js`
