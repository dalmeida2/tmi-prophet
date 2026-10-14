# Research Log

Chronological record of the research phase that precedes SDD Stage 01. It captures what was done, what was found, and what was decided, so Stage 01 can turn the decisions into `specs/DECISION_LOG.md` entries without relying on chat history.

- **Pipeline state during this log:** Stage 00 (Project Initialization) complete, `projectType` unset, no lock. Nothing in the frozen set (`SPEC.md`, contracts, fixtures) exists yet.
- **Research decisions use ids `R###`**, not `DEC###`. Stage 01 re-records each one it adopts as a `DEC` entry (options, choice, rationale, where it is reflected), per `specs/.sdd/_config/decision-log-template.md`.
- **Markers:** ✓ verified against live data, vendor documentation, or a local measurement on the stated date.

---

## Session 1 — 2026-10-14

### 1. Workspace and data exploration

1. Initialized the SDD workspace (`/sdd init`).
2. Explored `swim_data` on the FAA SIL POC cluster (`faa-sil-poc-dev`, pod `swim-db-0`). Found `swim.flight_plans` has 0 rows ✓; it is an unpopulated rollup, and plan facts live in `tfms_flight_plan_assertions` / `sfdps_flight_plan_assertions` (millions of rows) ✓.
3. The user revised the research docs; `DATA_MODEL.md` became the canonical reference for table roles and query surfaces.

### 2. First concept: FAA-side decision support (superseded)

An "Air Traffic Decision Support System" recommending reroutes, GDP responses, and constraint releases from `flow_constraints`, `flow_constraint_flights`, `v_active_flights`, `weather_alerts`, and TBFM data. Captured in `research_document.md`, `ai_agent_decision_scope.md`, `ai_agent_implementation_plan.md`, `ai_agent_summary.md`. Superseded by §3.

### 3. Decision models (Liquid AI d1)

- Decision models take a `state` plus typed questions and return calibrated probabilities in one forward pass, generating no tokens ✓ ([Liquid AI d1](https://www.liquid.ai/blog/d1-decision-model)).
- Question types ✓: `noul` (probability of yes), `choice` (one label from a set, with per-label probabilities and confidence), `score` (position on an ordered rubric, levels zero-based).
- A `noul` near 0.5 means uncertainty, not intensity; use `score` for degree ✓.

### 4. Reframe: the airspace user's view

**User direction:** SWIM SCDS is a one-way outflow of FAA events, so we can't influence decisions; instead, take the airspace user / dispatcher's view and predict what the FAA will do before it happens.

Live findings (2026-10-14, ~17:30Z) ✓:

| Finding | Detail |
|---|---|
| FAA intent is published at four horizons | Unannounced (precursors only) → Operations Plan "POSSIBLE" (hours) → proposed GDP / delay advisory (4–20 min) → actual TMI |
| BOS | GDP proposed 11:12Z, issued 11:32Z, program window from 17:30Z: ~6 h of notice |
| DEN | Proposed 13:03Z, issued 13:12Z; 15:34Z plan announced an *additional* GDP for the 2200Z hour |
| AUS | 15:34Z plan: "AFTER 2000 AUS GS/DP POSSIBLE"; GS issued 16:57Z, three hours earlier than stated |
| NY metro | Not in the 15:34Z plan; LGA arrival-delay advisory 16:25Z; LGA GS 16:29Z (stated start 16:16Z, backdated); EWR and TEB GS minutes later; cancelled 17:11Z |
| Retention | Raw `*_messages` dropped after **8 h**; parsed assertions after **48 h**; no multi-day history exists |
| State tables overwrite | `flow_constraints` keeps only the latest message per `(tmi_type, control_element)`; GADV advisories are keyed by daily number (overwritten next day); `weather_alerts.first_seen_at` is row creation, not weather onset |
| Undocumented useful tables | `airports` (ATIS text), `runway_conditions` (RVR), `notams` / `v_active_notams`, APTC airport configuration messages (arrival rate, weather class, runway config) |
| Demand undercount | `v_active_flights` covers flights seen in the last hour; arrivals more than ~2 h out are a lower bound |

Recorded in `airspace_user_tmi_anticipation.md` and `DATA_MODEL.md` (retention, message subtypes, airport tables).

### 5. Two-part project, then refinements

**User direction:** split into (1) data extraction, curation, and dataset creation aimed at future RL tuning, and (2) TMI prediction, focused on TMIs first but also using TBFM metering and terminal information.

**User refinements, then AI analysis:**
- The FAA is the ANSP; the product forecasts ANSP decisions ahead of time and sells that foresight to airlines.
- Time-series leakage is a central risk. The learning unit is a pair: the current picture (start state) and the observed end state. Timing is a property to tune against.
- d1 runs locally; fine-tuning comes later on other hardware.
- Prefer Go or Rust; Python possibly only around the model. Apps should be quick and light, with strong visualization of the impact of a correct prediction.
- Lead time is what drives the airline's next decision. Airlines acting early would also affect the FAA, likely helpfully.
- Everything runs locally first, and must stay portable to other machines. This is research and proof of concept, with no business yet.

Recorded in `tmi_dataset_and_prediction_plan.md`.

### 6. Local d1 setup and measurements

| Step | Result |
|---|---|
| Homebrew llama.cpp 0.6.0 (build 11429) | Loads the file, then fails: `unsupported decision model type: lfm2-d1` ✓ |
| Cause | d1-3B support merged in llama.cpp PR #30110 on 2026-10-07, after the 0.6.0 release of 2026-10-05 ✓ |
| Pinned build | Release b11617 (commit `14310190c`, 134 commits after the d1 merge) from github.com/ggml-org/llama.cpp ✓ |
| Model | `LiquidAI/d1-3B-GGUF` revision `bb1e436ea78eb96a3f1acb6da865f70c2fbeb563`; BF16 file sha256 `a03fdd5b13a93e0c5340ffdded985fbf59fb8d8f1b59ecc367986bb9a8ff2af6`, matched after download ✓ |
| Builds compared (M3 MacBook Air, 24 GB) | BF16 5.46 GB memory; F16 identical results; Q8_0 3.05 GB, max probability shift 0.0082; same latency 0.72–0.91 s per picture for three questions ✓ |
| Llama.app 0.44.0 | ggml-org's macOS front end (ggml-org/Llama-macOS), not Ollama. Its downloaded llama.cpp was build 11429 and failed the same way; `~/.llama-app/llama update` installed build 11630, which gives results identical to the reference (max shift 0.000000 over 72 values) ✓ |

### 7. Behavioral test runs (hand-written pictures; behavior, not accuracy) ✓

| Run | Result |
|---|---|
| Ranking | P(GS/GDP within 3 h): AUS 0.755, DEN 0.722, BOS 0.238, LGA 0.149, SFO 0.064, ATL 0.052 |
| Six-option question | Picked `NO_CHANGE` for every airport, even AUS at 0.755 on the yes/no question |
| Ops Plan dependence | AUS 0.755 with the "POSSIBLE" line, 0.114 without it |
| LGA evidence build-up | 0.070 → 0.205 (ITWS storms) → 0.141 (ATIS light rain) → 0.248 (FAA delay advisory, 2 min before GS) |
| Duration horizons | Nearly flat: AUS 0.738 / 0.756 / 0.756 for 1 / 3 / 6 h |
| Clock-time horizons | Timing-sensitive: AUS 0.440 / 0.702 / 0.718 before 17:45Z / 19:45Z / 22:45Z; DEN 0.168 / 0.404 / 0.741 before 16:30Z / 18:30Z / 21:30Z |
| Latency | Warm 0.75–0.95 s; 11.1 s on the first request after Llama.app's idle unload |

Interpretation: zero-shot d1 behaves close to the "Operations Plan only" baseline and is weakest on unannounced decisions, so the value beyond that baseline must come from tuning on Part 1 data.

---

## Research decisions

| Id | Topic | Options considered | Choice | Decided by | Status |
|---|---|---|---|---|---|
| R001 | Perspective | FAA-side decision support; airspace-user perspective | Airspace user / dispatcher | User | Agreed |
| R002 | Product thesis | Recommend FAA actions; forecast FAA actions for airspace users | Forecast ANSP (FAA) decisions before issuance; foresight is the product | User | Agreed |
| R003 | Project structure | One project; two projects | Two: Part 1 ANSP decision dataset, Part 2 TMI prediction | User | Agreed |
| R004 | Order and SDD types | — | Part 1 first (`backend-service`), Part 2 second (`fullstack-app`) depending only on Part 1's frozen contracts | AI recommended | To confirm in Stage 01 |
| R005 | Part 2 initial scope | All TMI types; terminal GS/GDP | Terminal GS and GDP first; reroutes, CTOP, AFP later | User (TMI first); AI narrowed to GS/GDP | To confirm |
| R006 | Signal families | TFMS only; multi-feed | Multi-feed: TFMS flow info, Ops Plan, APTC, ITWS, ATIS, RVR, NOTAMs, TBFM metering, SFDPS holding, STDDS surface, demand, neighbors | User | Agreed; TBFM/holding/surface not yet profiled |
| R007 | Learning unit | Time-indexed labels; state pairs | Pair of start picture `P(a, t0)` and observed control state `C(a, t1)`, **plus the ordered transitions inside the window** | User (pairs); AI added the path (the LGA GS started and ended inside a 3 h window) | Agreed |
| R008 | Pair sampling | Decision-anchored only; calendar-anchored only; both | Both: decision-anchored offsets 15/30/60/120/180 min; calendar grid every 15 min with horizons 1/3/6 h | AI recommended | To confirm |
| R009 | Leakage controls | — | Rules L1–L10 in `tmi_dataset_and_prediction_plan.md` §4 (archive-only reconstruction, `received_at` timing, `already_signalled` flag, blocked splits with ≥ 6 h embargo, split by time across airports, `decision_id` grouping, versions as of `t1`, (number, dateSent) advisory identity, sealed holdout, one shared renderer) | AI recommended, from cases in this feed | To review in Stage 01 |
| R010 | Headline metric | Accuracy; lead time | **Lead time gained** = FAA first-signal `received_at` − our first threshold crossing, per decision; misses count 0; always reported with the false-alarm rate | User (lead time); AI added the guardrails | Agreed; threshold policy open |
| R011 | RL scope | Dispatcher-action RL; FAA-decision forecasting RL | RL on forecasting FAA decisions with scoring-rule rewards; dispatcher actions are the customer's decision and out of scope (no counterfactuals in SWIM) | AI analysis; user confirmed as important | Agreed |
| R012 | Deployment | Cluster; local | Everything local first, portable to other machines | User | Agreed |
| R013 | Inference runtime | Liquid cloud API; mlx-vlm; llama.cpp | llama.cpp `llama-server` release **b11617**, `/v1/systemone`; Llama.app acceptable for daily use if the probe passes after each update | User (local); AI measured | Agreed |
| R014 | Model precision | BF16, F16, Q8_0, Q4 | **BF16** (`d1-3B-BF16.gguf`, rev `bb1e436`); F16 fallback where BF16 is weak; Q8_0 for < 8 GB free; Q4 excluded (Liquid reports up to 0.21 shift for 4-bit); no FP8 GGUF type exists | User asked for BF16 or FP8; AI measured | Agreed |
| R015 | Portability check | — | Any new machine/build must pass `probes/d1_compare.py` against `results/bf16_b11617_reference.json`: same top choices, max shift ≤ 0.01 | AI recommended | To confirm |
| R016 | Question phrasing | Duration horizons; clock-time horizons | Every horizon stated as an absolute UTC time in the picture's time format | Measured (§7) | Agreed in research |
| R017 | Languages | Rust; Go; Python | Rust recommended for Part 1 and the Part 2 backend (shared domain library and renderer); Go is the alternative; Python only for probes and future training | User (Go or Rust); AI recommended Rust | Open |
| R018 | Fine-tuning | Now; later | Later, on GPU hardware; Part 1 curates for it | User | Agreed |
| R019 | Commercial terms | — | Deferred: research stage, no business (LFM Open License v1.0 free for research and under USD 10M revenue ✓) | User | Agreed |
| R020 | Impact visualization | — | Decision replay per FAA decision: probability curve, FAA signal markers, lead-time band, flights that departed toward the airport in that band; no claims of delay avoided | AI recommended | To design in Stage 01 (theme step first) |

---

## Open items

| Item | Blocker / next step |
|---|---|
| Profile TBFM metering, SFDPS holding, STDDS surface, ITWS payloads | Cluster login expired; queries in `tmi_dataset_and_prediction_plan.md` §11 |
| Rebuild the test pictures from live data | Same login |
| Archive location (local Postgres vs Parquet/DuckDB) | Stage 01 question |
| Collection uptime: 8 h raw window vs laptop sleep and OpenShift token expiry (the token expired within an hour ✓) | Stage 01 question |
| Source access: cursor over swimdb landing tables vs direct SWIM subscription | Stage 01 question |
| `GDP_PROPOSED` as a positive label or not | Stage 01 question |
| Alert threshold / acceptable false-alarm rate | Stage 01 question |
| Full Ops Plan states (2–3k extra tokens): latency, and Llama.app's 4096-token default context | Measure; override in `~/.config/llama/models.user.ini` if needed |
| llama-server `--parallel` for backtests | Untested |

---

## Local environment changes (this machine)

| Change | Location | State |
|---|---|---|
| llama.cpp release b11617 (macOS arm64; release asset sha256 `051bb0b55b3e5e72081aa819131ba30c74d910acc915b28bab298757472e39d9`) | `~/.local/opt/llama-b11617/llama-b11617/` | Installed; not on PATH |
| d1-3B GGUF BF16, F16, Q8_0 (5.40 + 5.40 + 2.87 GB) | `~/.cache/huggingface/hub/models--LiquidAI--d1-3B-GGUF/` | Downloaded; shared with Llama.app |
| Homebrew llama.cpp 0.6.0 with dependencies | — | Installed, then uninstalled (could not load d1) |
| Homebrew `openssl@3` link | `/opt/homebrew/bin/openssl` | Unlinked as a side effect of the llama.cpp install; **relinked** (OpenSSL 3.6.5) |
| Llama.app's llama.cpp | `~/.llama-app/llama` | Updated from build 11429 to 11630 by running `llama update` (unintended: `--help` was ignored) |
| Scratch files | `/tmp/d1_*.json`, `/tmp/d1_probe.py`, `/tmp/d1-*.log` | Results copied to `probes/results/`; scratch can be deleted |
