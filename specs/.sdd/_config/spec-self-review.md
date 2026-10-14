# Spec Self-Review (Quantitative Completeness Gate)

<!-- CAVEMAN-ENCODED. DECODER: ! = must/required | ⊥ = forbidden/never | → = leads to/becomes | ∀ = for all | ∃ = exists | & = and | | = or -->

Shared checklist for SDD pipeline spec validation. Run by Stage 02 as exit criterion 4 (all 19 checks, after the final Red Team round). Stage 01 may run checks 1–11 informally; they are only enforced in Stage 02.

---

## Base Checks (1-11)

1. **Placeholder scan:** Any "TBD" | "TODO" | incomplete sections | vague requirements → fix.
2. **Internal consistency:** Sections contradict each other? Architecture matches feature descriptions?
3. **Scope check:** Focused enough for single implementation plan | needs decomposition?
4. **Ambiguity check:** Requirement interpretable two ways → pick one, make explicit.
5. **Quantification check:** Scan ∀ lines for vague parameters. ∀ numeric parameter ! be exact value | bounded range | formula. Flag & fix:
   - "e.g." | "for example" hedging parameter value
   - "approximately" | "around" | "about" before number
   - Adjectives as parameters: "fast" | "slow" | "large" | "small" | "many" | "few"
   - "periodically" | "occasionally" | "sometimes" without defined interval
   - "based on" without formula
6. **Decision log completeness:** Cross-ref `DECISION_LOG.md` vs conversation. ∀ Q&A reflected? Missing decisions?
7. **Config schema check:** Spec references config files (JSON, YAML, env vars) → ! include exact schema shape: field names, types, valid ranges. "A config file" ≠ specification.
8. **WCAG Contrast Check (UI):** ∀ text-on-background color pair ∈ DESIGN.md → calculate WCAG 2.1 contrast ratio. AA: ≥4.5:1 body text, ≥3:1 large text (≥18px | ≥14px bold). Flag & fix failing pairs.
9. **Design Token Completeness (UI):** DESIGN.md `components:` ! define ≥ `backgroundColor`, `textColor`, `rounded` ∀ component. Interactive components ! have `hover`, `focus`, `active`, `disabled` sub-objects.
10. **Cross-Artifact Check (UI):** Cross-ref DESIGN.md `components:` names vs SPEC.md Component Hierarchy. ∀ component ∈ one ! have kebab-case ↔ PascalCase counterpart ∈ other. Flag orphans. Layout-only containers exempt but ! be explicitly justified.
11. **Auxiliary UI State (UI):** ∃ frontend → check Component Hierarchy for missing auxiliary/edge-case screens: Splash/Title, Loading/Asset pre-loaders, Settings/Options, Auth gates, Error boundaries, Destructive action confirmation modals, Empty states. Hierarchy focused ONLY on happy path = incomplete architecture.

## SDD Extension Checks (12-14)

12. **Seeding & PRNG Determinism (Algorithmic/Procedural):** Spec relies on random generation → ! define deterministic PRNG algorithm (e.g., Mulberry32, LCG) & seed storage for reproducibility across runtimes/devices.
13. **Input/Event Throttling (UI/Interactive):** Fast real-time inputs (`pointermove`, `mousemove`, `scroll`) throttled to prevent frame-drops/CPU starvation?
14. **Hardware/Environment Block Resilience:** Spec defines fallback when hardware/browser policies block API access (audio context blocked, WebGL context loss, camera/sensor permission denied)?

## Equivalence Checks (15-19)

15. **Equivalence Boundary (SPEC §9):** every declared degree of freedom is listed, each one justified (server-generated, free text, opaque token). Anything observable that is not listed is pinned somewhere. The list matches what Stage 04 will put in `variablePaths`.
16. **Profile overrides:** every deviation from `references/systems-standards.md` appears in SPEC §11, `manifest.json#profileOverrides` and `DECISION_LOG.md` — all three, same rule ids.
17. **Copy table (UI):** every user-visible static string (labels, buttons, empty states, error messages) appears character-exact in SPEC §14 Copy table.
18. **Test-ID contract (UI):** every Component Hierarchy entry has a kebab-case name usable as `data-testid`; every UI State Matrix state has its `-empty|-loading|-error` id.
19. **Configurable time/count rules (ENV-3):** every TTL, expiry, rate limit, retention window and batch size is an env var in SPEC §12 with an exact default.

---

## Process Rules

- Fix issues inline → "Spec self-review passed: [N] checks clear, [M] issues fixed inline."
- Mass-approving without tracking artifact = process violation (rubber-stamping).
