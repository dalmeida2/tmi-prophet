# Two-Part Plan — ANSP Decision Dataset and TMI Prediction

> **Builds on:** [airspace_user_tmi_anticipation.md](./airspace_user_tmi_anticipation.md) (FAA intent horizons, 2026-10-14 case studies) and [DATA_MODEL.md](./DATA_MODEL.md) (tables, retention).
>
> **Status markers:** **✓** checked against live `swim_data` or vendor documentation on 2026-10-14. **◇** documented in the schema but not yet profiled (cluster session expired; queries in §11).

---

## 1. Product thesis

The FAA is the **ANSP**: it alone decides when an airport gets a ground stop (GS) or ground delay program (GDP). Airlines can't influence that decision; they can only react to it. The product **forecasts ANSP decisions before they are made and sells that foresight to airspace users** (airline operations centers, dispatchers, business aviation).

What the airline does with the forecast (hold at the gate, add fuel, depart early, swap aircraft) is the customer's decision. We don't need to learn it. The thing we must learn, predicting the FAA's next control decision from the observable picture, is exactly what the SWIM feed lets us verify after the fact.

**The value has to exceed what the FAA already publishes.** The ATCSCC Operations Plan, proposed-GDP advisories, and delay advisories reach every SWIM consumer for free ✓. A forecast is only worth paying for when it:

1. alerts **earlier** than the FAA's first published signal for that airport, or
2. covers decisions the FAA **never announced** (the 2026-10-14 New York ground stops were not in the 15:34Z plan ✓), or
3. attaches **calibrated probability and timing** to the FAA's vague "POSSIBLE" entries (the plan said AUS "after 2000Z"; the GS came at 16:57Z ✓).

### 1.1 Lead time is the metric

Lead time is what changes the airline's options. The same GS seen 90 minutes ahead allows gate holds, fuel, swaps, and pre-emptive cancellations; seen 4 minutes ahead (the New York case) it allows only airborne holding and diversions. The single headline metric is:

> **Lead time gained** = `received_at` of the FAA's first published signal for that decision − time our forecast first crossed the alert threshold, per FAA decision.

Measured with a guardrail: lead time alone is maximized by alerting all the time. Every lead-time figure is reported at a stated **false-alarm rate** (alerts not followed by a matching decision within the horizon), and decisions we never alerted on count as **misses** with zero lead time.

### 1.2 The forecast changes the system it predicts

Once airlines act on early warnings (holding at the gate instead of launching into a ground stop, pre-cancelling into a GDP), arrival demand at the constrained airport drops before the FAA decides. That can make the FAA's decision smaller, later, or unnecessary. For the FAA this is likely a benefit: demand shaped by users before the ANSP has to impose a program.

For the dataset it means FAA decisions stop being independent of our forecasts once forecasts are used. In the proof of concept nobody acts on them, so the effect is zero; the forecast log (§8) records every forecast so the effect can be separated later.

### 1.3 Stage of work

This is research and proof of concept: no customers or revenue. Commercial terms (SWIM redistribution, model license threshold) are recorded in §12 for later, not constraints now.

---

## 2. The two parts

| | Part 1 — ANSP decision dataset | Part 2 — TMI prediction |
|---|---|---|
| Goal | Durable archive of airport pictures and the FAA decisions that followed them, as leakage-safe start/end state pairs | Live forecasts of the next FAA control decision per airport, with impact visualization |
| Order | First: swimdb keeps 8 h raw and 48 h parsed data ✓; every unarchived day is lost | Second: evaluated on, and later tuned with, Part 1 data |
| Model | None (deterministic) | d1-3B running locally (§7); tuning deferred to a machine with a GPU |
| SDD project type | `backend-service` | `fullstack-app` |
| Oracle fit | Exact: recorded input messages → expected events, states, pairs | Rules layer exact; model probabilities declared free to vary (SPEC §9) |

Stage 01 asks that independent subsystems be specified as separate projects. Part 2 depends only on Part 1's frozen contracts (§8).

---

## 3. The unit of learning: a start state and an observed end state

The dataset records **pairs**: the picture of an airport at a start time, and the FAA control state observed afterward. The pair is what matters. Time is attached to the pair as a property (how far apart, when the decision arrived) that we tune against, not the organizing axis.

### 3.1 Two kinds of state

**Control state `C(a, t)`** — what the FAA has decided for airport `a`, as known at time `t`. This is what we predict.

| Component | Values | Source |
|---|---|---|
| Ground stop | `NONE`, `ACTIVE(end time, probability of extension)` | GS messages ✓, GADV text ✓ |
| GDP | `NONE`, `PROPOSED(rate, window)`, `ACTIVE(rate, avg/max delay, window)` | GDP messages ✓ (`tmiStatus`) |
| Delay advisory | `NONE`, `ARRIVAL_DELAYS(up to N min)`, `SCHEDULING_DELAYS` | GADV titles ✓ |
| Ops Plan listing | `NONE`, `CONSTRAINT(text)`, `PLANNED_POSSIBLE(after time)`, `ACTIVE` | Operations Plan entries ✓ |

**Environment state `E(a, t)`** — the conditions that drive FAA decisions. These are inputs only.

| Group | Contents | Status |
|---|---|---|
| Capacity | APTC arrival/departure rate, weather class, runway configuration, AAR adjustment reason; runway closures (Ops Plan SIRs, NOTAMs); RVR | ✓ (RVR ◇) |
| Terminal weather | ITWS products for the airport/TRACON; ATIS wind, gust, ceiling, visibility, precipitation | ✓ presence, ◇ payload parsing |
| Arrival metering (TBFM) | Flights metered, frozen STAs, STA − ETA delay distribution | ◇ |
| Airborne holding | SFDPS hold events near the airport | ◇ |
| Surface | Departure queue / taxi-out counts | ◇ |
| Demand | Arrivals per hour vs arrival rate, 0–4 h | ✓ (lower bound) |
| Neighborhood | Control state of TRACON peers | ✓ |

The **picture** is `P(a, t) = (C(a, t), E(a, t))`.

### 3.2 The pair record

```text
start:      P(a, t0)                   full picture at the start time
end:        C(a, t1)                   control state observed at the end time
path:       transitions of C in (t0, t1], each with received_at
end_env:    E(a, t1)                   stored for analysis; not a prediction target at first
timing:     t1 − t0, time to first transition, FAA-stated start/end times
provenance: archive row ids for every input and every transition
```

**Why the path is required and the end state alone is not enough:** the LGA ground stop on 2026-10-14 was issued at 16:29Z and cancelled at 17:11Z ✓. A pair from 16:00Z to 19:00Z has end state `GS = NONE` at both ends, even though the decision we most needed to predict happened in between. Every pair therefore carries the ordered transitions inside its window, and the prediction target is defined over transitions, not only over the endpoint.

### 3.3 Transition vocabulary (closed set)

Derived from advisory titles and message subtypes observed on 2026-10-14 ✓:

| Transition | Evidence |
|---|---|
| `GS_ISSUED` | "CDM GROUND STOP", `fi:gsAdvisory` |
| `GS_REVISED` (end time or scope changed; extension is the case that matters) | Repeat "CDM GROUND STOP" for the same airport (LGA ADVZY 051 → 053 ✓) |
| `GS_CANCELLED` | "CDM GS CNX", `fi:gsCancel` |
| `GDP_PROPOSED` | "CDM PROPOSED GROUND DELAY PROGRAM", `tmiStatus=PROPOSED` |
| `GDP_ISSUED` | "CDM GROUND DELAY PROGRAM", `tmiStatus=ACTUAL` |
| `GDP_REVISED` | Repeat GDP advisory with changed rate/window |
| `GDP_CANCELLED` | "… GROUND DELAY PROGRAM CNX", `fi:gdpCancel` |
| `DELAY_ADVISORY_ISSUED` | "AIRPORT ARRIVAL DELAYS", "AIRPORT SCHEDULING DELAYS" |
| `OPS_PLAN_LISTED` / `OPS_PLAN_DELISTED` | Airport enters/leaves TERMINAL PLANNED or CONSTRAINTS between consecutive plans |

Part 1 must also recognize titles outside this set and record them as `UNCLASSIFIED`, never drop them; the set grows through a Stage 00 change, not by guesswork.

### 3.4 Two ways to choose pairs (both needed)

| Anchoring | How `t0`, `t1` are chosen | What it gives | Bias if used alone |
|---|---|---|---|
| **Decision-anchored** | For each FAA transition at `t_d` (its `received_at`): `t1 = t_d`, and `t0 ∈ {t_d − 15, 30, 60, 120, 180 min}` | Dense examples of the run-up to real decisions; teaches anticipation | Only positives: the model learns that a decision always follows |
| **Calendar-anchored** | `t0` on a 15-minute grid per airport, `t1 = t0 + h`, `h ∈ {1, 3, 6 h}` | True base rates, negatives, quiet periods | Positives are rare; little signal about run-ups |

Training and evaluation use calendar-anchored pairs for honest probabilities; decision-anchored pairs are additional training signal and the basis for lead-time analysis.

### 3.5 Questions the decision model answers on a pair

All are asked about `P(a, t0)` only:

| Name | Type | Target |
|---|---|---|
| `next_transition` | `choice` | First transition in `(t0, t0 + h]`, or `NO_CHANGE` |
| `gs_or_gdp_within_h` | `noul` | Any `GS_ISSUED`, `GDP_PROPOSED`, or `GDP_ISSUED` in the window |
| `timing` | `score` | Bucket of time to first transition: > h · 120–180 · 60–120 · 30–60 · 0–30 min |
| `driver` | `choice` | FAA impacting condition mapped to a closed set (convective, ceiling/visibility, wind, runway/construction, volume, staffing, other) |
| `gs_extended` | `noul` | (only when a GS is active at `t0`) a `GS_REVISED` extending the end time occurs before the GS ends |

Rewards for later RL come straight from the resolved answers: log score or Brier for `noul`, log-probability of the true label for `choice`, distance from the true bucket for `score`.

---

## 4. Leakage: how time-series data lies to you, and the rule for each case

| # | Leak | Example from this feed | Rule |
|---|---|---|---|
| L1 | **Future data in the start picture** | Querying swimdb's `flow_constraints` today to rebuild 16:00Z: the row now holds the 17:11Z cancel ✓ | `P(a, t0)` is rebuilt **only from the archive**, using rows with `received_at ≤ t0`. Live swimdb state tables are never read for historical pictures |
| L2 | **Backdated FAA times** | LGA GS issued 16:29Z with a stated start of 16:16Z ✓ | Transitions are timed by **our `received_at`**. FAA-stated times are stored as attributes, never used to place an event on the timeline |
| L3 | **Consequences of the decision used as causes** | Arrival-delay advisories, EDCTs in `flow_constraint_flights`, diversion recovery, TBFM ground holds all appear *because* a TMI exists | Each pair is flagged `already_signalled` with the earliest FAA signal received by `t0`. Metrics are reported separately for pairs with no prior signal, which is where the product earns its money (§1) |
| L4 | **Overlapping windows** | Grid pairs 15 min apart share 165 of 180 future minutes and usually the same label | Splits are **contiguous date blocks** with an **embargo ≥ the longest horizon (6 h)** between train and test; no random splits |
| L5 | **One weather event across many airports** | EWR, LGA, TEB stops in the same 15 minutes ✓ | Split by time only; all airports at the same moment go to the same split |
| L6 | **One decision across many pairs** | Five decision-anchored offsets point at the same GS | Pairs carry a `decision_id`; all pairs of a decision go to the same split |
| L7 | **Revised history** | A GDP's rate or window changes after `t1` | The end state is the version **received by `t1`**, never the final revision |
| L8 | **Repeat-key overwrite** | GADV advisory numbers restart daily; ADVZY 049 today overwrites yesterday's ✓ | Archive identity = (advisory number, `dateSent`), not the number alone |
| L9 | **Tuning on the test period** | Adjusting prompt wording or thresholds after seeing results | The final block of the archive is a sealed holdout, scored once per model version |
| L10 | **Train/serve skew** | Dataset packets rendered differently from live packets | One shared renderer turns a picture into model input for both the dataset and live forecasting (§9) |

---

## 5. Part 1 — capture, curation, dataset

### 5.1 Layers

```text
swimdb (8 h raw / 48 h parsed / latest-only state)
   │  continuous cursor-based extraction (by id / received_at over landing tables)
   ▼
Raw capture   immutable copies of selected messages, hourly partitions
   ▼
Event logs    TMI transitions, advisories, Ops Plan entries, airport config,
              ATIS, ITWS changes, departures, metering/holding/surface/demand aggregates
   ▼
Pictures      P(a, t) rebuilt from event logs for any t (point-in-time)
   ▼
Pairs         decision-anchored + calendar-anchored, with path, labels, provenance
   ▼
Exports       versioned dataset files, blocked splits with embargo
```

Polling `flow_constraints` is not acceptable: two updates between polls lose one (LGA GS 16:29Z and its 16:38Z revision ✓). Extraction reads the landing tables with a cursor and records **gaps** (periods the cursor fell outside the 8 h window) explicitly; pairs whose window overlaps a gap are marked, never silently filled.

### 5.2 Event logs

| Log | One row per | Key fields | Source |
|---|---|---|---|
| `tmi_transition` | FAA control transition | airport, transition (§3.3), FAA attributes (rate, delays, window, impacting condition, probability of extension), advisory id, `received_at` | GDP/GS messages ✓, GADV ✓ |
| `advisory` | ATCSCC advisory | (number, dateSent), title, classified kind, full text | GADV ✓ |
| `ops_plan_entry` | Line in an Operations Plan | plan id, section, facility/airport, time qualifier, text | GADV OPERATIONS PLAN ✓ |
| `airport_config` | APTC change | rates, strategic AAR, weather class, runways, AAR adjustment | APTC ✓ |
| `atis` | New ATIS letter | parsed wind/gust, visibility, ceiling, phenomena, runways; raw text | `airports` ✓ |
| `itws_change` | Product appearance/clearance/update | airport/TRACON, product, alert type, severity, detections | ITWS messages ✓ (payload ◇) |
| `departure` | Departure event | flight, origin, destination, departure time, `received_at` | `v_departures` ✓ / SFDPS DH ✓ |
| `metering_agg` | (arrival airport, 15 min) | flights metered, frozen STAs, STA − ETA distribution | TBFM ◇ |
| `holding_agg` | (airport, 15 min) | hold entries / exits | SFDPS HH/HV ◇ |
| `surface_agg` | (airport, 15 min) | departure queue, taxi-out | STDDS ◇ |
| `demand_snapshot` | (airport, t, hour) | arrivals by ETA hour, EDCT-controlled count | `v_active_flights` ✓ |

`departure` is needed for impact measurement (§10), not prediction.

### 5.3 Scope defaults (to confirm in Stage 01)

- **Airports:** FAA Core 30 → 30 × 96 grid pictures/day ≈ 86k calendar pairs per horizon per month.
- **Horizons:** 1, 3, 6 h.
- **Seasonality:** collection starting in October under-represents summer convection; meaningful tuning needs months, including at least one convective season.

---

## 6. Part 2 — TMI prediction

Terminal GS/GDP first. Reroutes, CTOPs, and airspace flow programs come later (2 CTOP rows and no active AFPs on 2026-10-14 ✓).

| Step | Forecaster | Role |
|---|---|---|
| A | Baselines: Ops Plan listing only; persistence (same hour yesterday); demand/capacity + weather rule | The bar the model must clear, especially on lead time |
| B | d1-3B zero-shot on the rendered picture with the §3.5 questions | First model, runs locally |
| C | d1-3B tuned on Part 1 pairs (supervised, then RL with scoring-rule rewards) | Later, on GPU hardware |

FAA facts present at `t0` (an active or proposed TMI) override model output for the components they cover.

---

## 7. Running d1 locally

Everything runs locally. d1-3B is open-weight ✓ (3.1B parameters, built on LFM2.5-VL-3B); fine-tuning is deferred to GPU hardware.

### 7.1 Reference configuration (measured 2026-10-14 on Apple M3 MacBook Air, 24 GB) ✓

| Item | Pinned value | Why |
|---|---|---|
| Server | llama.cpp `llama-server` **build b11617** (commit `14310190c`), official release binary from github.com/ggml-org/llama.cpp | d1 support arrived in llama.cpp PR #30110 (merged 2026-10-07), after the current stable release 0.6.0 (build 11429). Build 11429 **fails to load d1** (`unsupported decision model type: lfm2-d1`), whether from Homebrew or Llama.app ✓ |
| Model | `LiquidAI/d1-3B-GGUF`, revision `bb1e436ea78eb96a3f1acb6da865f70c2fbeb563`, file `d1-3B-BF16.gguf` (5.40 GB, sha256 `a03fdd5b…ff2af6`) | BF16 is the checkpoint's native format: bit-exact weights, and the same precision later PyTorch fine-tunes produce, so zero-shot and tuned results are directly comparable |
| Vision projector | not loaded (`--no-mmproj`) | Text-only states; saves 0.86 GB |
| Flags | `-ngl 99 --ctx-size 8192 --host 127.0.0.1 --port 8080` | All layers on GPU; context room for full Operations Plan text |
| Endpoint | `POST /v1/systemone` | Same request shape as Liquid's cloud API and the llama.cpp decision-model docs |

```bash
llama-server -hf LiquidAI/d1-3B-GGUF:BF16 --no-mmproj -ngl 99 --ctx-size 8192 --host 127.0.0.1 --port 8080
```

**Two equivalent ways to run it on a Mac** (both are the ggml-org llama.cpp project; neither is Ollama):

| | Pinned release binary | Llama.app (ggml-org/Llama-macOS) |
|---|---|---|
| What it is | `llama-b11617-bin-macos-arm64.tar.gz` from the llama.cpp GitHub releases, unpacked to `~/.local/opt/llama-b11617/` | macOS front end, v0.44.0 here; downloads llama.cpp to `~/.llama-app/llama` and runs it in router mode |
| d1 support | Yes (b11617) | Only after updating its llama.cpp: the copy it first downloaded was build 11429 and failed with `unsupported decision model type: lfm2-d1` ✓. `~/.llama-app/llama update` installed build 11630, which works ✓ |
| Endpoint | `http://127.0.0.1:8080/v1/systemone` | `http://127.0.0.1:9931/v1/systemone`; requests must include `"model": "LiquidAI/d1-3B-GGUF:BF16"` |
| Context | `--ctx-size 8192` | 4096 by default; override in `~/.config/llama/models.user.ini` for Ops-Plan-sized states |
| Reproducible | Yes: build is fixed | No: `llama update` takes the newest build; check with the probe after every update |
| Result vs reference | Reference | Identical: max probability difference 0.000000 over 72 values ✓ |

The pinned binary is the reference for results and for other machines. Llama.app is fine for day-to-day use on the Mac as long as the probe still matches after each update.

### 7.2 Build comparison on this machine ✓

Six airport pictures × three questions (one `noul`, one six-option `choice`, one five-level `score`) = 72 probabilities per build, using [`probes/d1_probe.py`](./probes/d1_probe.py). The pictures are hand-written approximations of 2026-10-14 situations; this measures runtime behavior, **not accuracy**.

| Build | File | Server memory | Latency per picture (3 questions, 547–796 input tokens) | Max / mean probability shift vs BF16 | Same top answers |
|---|---|---|---|---|---|
| **BF16** (reference) | 5.40 GB | 5.46 GB | 0.72–0.89 s | — | — |
| F16 | 5.40 GB | 5.35 GB | 0.72–0.89 s | 0.0000 / 0.0000 (4 decimals) | 6/6 |
| Q8_0 | 2.87 GB | 3.05 GB | 0.73–0.91 s | 0.0082 / 0.0017 | 6/6 |
| Q4_K_M | 1.67 GB | not run | — | not run; Liquid's 4-bit MLX check shows up to 0.21 shift | — |

Findings:
- Latency is the same across builds: processing the input text dominates, not weight precision. There is no speed reason to quantize on this machine.
- **FP8:** GGUF has no FP8 type; Q8_0 is the 8-bit option and is the choice for machines with < 8 GB free memory.
- **F16** gives the same answers as BF16 and is the fallback on hardware with weak BF16 support (some Vulkan and older CPU paths).

### 7.3 Portability

| Platform | Same pinned build b11617 asset | Model file |
|---|---|---|
| macOS Apple Silicon | `llama-b11617-bin-macos-arm64.tar.gz` (Metal) ✓ measured | BF16 |
| macOS Intel | `…-macos-x64.tar.gz` | BF16 or F16 |
| Linux x64 / arm64 (CPU) | `…-ubuntu-x64.tar.gz`, `…-ubuntu-arm64.tar.gz` | F16 or Q8_0 |
| Linux NVIDIA | `…-ubuntu-cuda-12.8-x64.tar.gz`, `…-ubuntu-cuda-13.4-{x64,arm64}.tar.gz` | BF16 |
| Linux AMD | `…-ubuntu-rocm-10.0-x64.tar.gz` | BF16 or F16 |
| Linux/Windows Vulkan | `…-ubuntu-vulkan-*.tar.gz`, `…-win-vulkan-*.zip` | F16 |
| Windows CPU / CUDA | `…-win-cpu-*.zip`, `…-win-cuda-*.zip` | F16 / BF16 |

Only the Apple Silicon row is measured. Every other machine must pass the same check before its results are trusted: run `probes/d1_probe.py`, then `probes/d1_compare.py` against `probes/results/bf16_b11617_reference.json` (PASS = same top answers and max shift ≤ 0.01). The F16, Q8_0, and Llama.app b11630 runs in `probes/results/` all pass ✓. Docker on macOS gets no Metal GPU, so containers are for Linux and cluster use only.

### 7.4 Throughput budget

Measured ~0.8 s per picture for three questions on ~700 tokens. Full Operations Plan text adds ~2–3k tokens per picture; latency for those states still has to be measured.

| Job | Volume | Sequential time at 0.8 s |
|---|---|---|
| Live forecasting | 30 airports every 15 min | 24 s per cycle |
| Backtest, one month of calendar pairs, one horizon | ~86k pictures | ~19 h |

Backtests are overnight jobs on this machine; llama-server parallel slots (`--parallel`) are untested and may shorten them.

### 7.5 First observations from the zero-shot probe (not evaluation)

- The yes/no question ranked the pictures sensibly: AUS 0.76 and DEN 0.72 (both listed as possible in the Ops Plan) above BOS 0.24, LGA 0.15, SFO 0.06, ATL 0.05.
- The unannounced New York case (LGA) got 0.15: zero-shot d1 did not anticipate the decision the FAA never announced, the case that matters most commercially.
- Questions are answered independently and can disagree: AUS was 0.76 likely on the yes/no question while `NO_CHANGE` still led the six-option question at 0.42. The headline probability must come from one designated question, calibrated on Part 1 data.

### 7.6 Behavioral experiments ([`probes/d1_scenarios.py`](./probes/d1_scenarios.py), BF16, 2026-10-14) ✓

| Experiment | Result | Implication |
|---|---|---|
| **Ops Plan dependence:** AUS with vs without the "AUS GS/DP POSSIBLE" line | 0.755 → **0.114** | Zero-shot d1 mostly reads the FAA's own announcement; gusts, LVMC, and demand at capacity alone give 0.11. Zero-shot is close to the "Ops Plan only" baseline, so value beyond it has to come from tuning on Part 1 data |
| **Evidence build-up:** LGA, adding signals in the order they arrived before the 16:29Z GS | plan + demand 0.070 → + ITWS storms 0.205 → + ATIS light rain 0.141 → + FAA arrival-delay advisory 0.248 | Moves the right way on storms but not monotonically, and stays low even with the FAA's own delay advisory two minutes before the stop. The unannounced case is where zero-shot is weakest |
| **Horizon phrased as duration** ("within 1 / 3 / 6 hours") | AUS 0.738 / 0.756 / 0.756; DEN 0.701 / 0.721 / 0.732; ATL flat at ~0.05 | The model nearly ignores durations: it answers "is this airport at risk", not "when" |
| **Horizon phrased as clock time** ("before 17:45Z / 19:45Z / 22:45Z") | AUS 0.440 / 0.702 / 0.718; DEN (before 16:30Z / 18:30Z / 21:30Z) 0.168 / 0.404 / 0.741 | Timing-sensitive, and DEN rises toward the plan's "after 1900" and "2200Z hour" entries. **Rule: every horizon question states an absolute UTC time, in the same format as the times in the picture** |

Latency: first request after the app's idle unload took 11.1 s (model load); warm requests 0.75–0.95 s.

---

## 8. Contracts between the parts

```text
Part 1 ──▶ picture schema (C and E components)        ┐
       ──▶ pair schema (start, end, path, labels)      ├─ frozen in Part 1's spec;
       ──▶ transition vocabulary (§3.3)                │  Part 2 builds only on these
       ──▶ picture renderer (picture → model input)    ┘
Part 2 ──▶ forecast log (pair id or live t0, model id + version, runtime, precision,
           answers) → written back to the archive and scored when labels resolve
```

Writing every live forecast back makes the scoreboard (§10) automatic: baselines, d1 zero-shot, and later tuned versions are scored on the same resolved pairs.

---

## 9. Technology direction (to decide in Stage 01)

| Concern | Direction | Reason |
|---|---|---|
| Part 1 services and Part 2 backend | **Rust**, one shared domain library | The domain is message parsers and control-state machines. Enums with exhaustive `match` turn an unhandled transition into a compile error. `sqlx` checks SQL against the schema at compile time. The shared library holds the picture types and **the one renderer** used for dataset and live inference (leak L10) |
| Alternative | Go | Faster to write, single binary, excellent Postgres driver; no exhaustive enum checking, so state-machine gaps surface at runtime instead |
| d1 inference | Pinned `llama-server` b11617 + BF16 GGUF over HTTP (§7.1) | No Python in the product path; same binary family on every platform |
| Python | Offline only: probes and later fine-tuning | Training tooling is Python-only in practice |
| UI | Small static TypeScript front end served by the backend; D3 / Observable Plot for charts, MapLibre for the map | Light and fast. Visual theme is chosen in Stage 01's theme step; the SDD process forbids picking styling before that |

---

## 10. Showing the impact of a correct prediction

The impact view has to answer "what did the airline get by knowing earlier?" without claiming outcomes we can't observe.

**Hero view — decision replay (per airport, per FAA decision):**

```text
P(GS/GDP within 3 h)  ▁▁▂▃▅▆▇████▇▅▂▁
                              ▲ our alert (crossed threshold)
FAA signals                            ◆ arrival-delay advisory     ■ GS issued      □ GS cancelled
                              ├────────┤ lead time gained
Departures toward airport   ·  · ·  ·· · ·  ·   (each dot = one flight that departed toward the airport)
                              └ flights that departed inside the lead window: the airline could have acted on these
```

**Metrics shown beside it:**

| Metric | Definition | Data |
|---|---|---|
| **Lead time gained** (headline, §1.1) | FAA first-signal `received_at` − our alert time, per decision; misses count as 0; always shown with the false-alarm rate at the same threshold | `tmi_transition`, `advisory`, forecast log |
| Flights exposed in the lead window | Flights to the airport that departed between our alert and the TMI issuance | `departure` log |
| Holding absorbed by exposed flights | Hold minutes for those flights after arrival at the terminal area | `holding_agg` ◇ |
| Missed decisions / false alarms | At the operating threshold | Pairs + forecast log |
| Calibration | Reliability diagram per horizon | Pairs + forecast log |
| vs Ops Plan baseline | Same metrics for "airport listed in TERMINAL PLANNED" | `ops_plan_entry` |

"Flights exposed" is the honest claim: those flights *could* have been held, fuelled, or rerouted. It is not a claim of delay avoided, since SWIM never shows the counterfactual.

**Other views:** live risk board (map of watched airports with probability, likely transition, and the evidence behind it), and the FAA intent feed with countdowns to CDM user-update deadlines.

---

## 11. Signals still to profile (◇)

Run after `oc login`:

```bash
NS=faa-sil-poc-dev; POD=swim-db-0
q() { kubectl exec -n "$NS" "$POD" -- psql -U swim -d swim_data -P pager=off -c "$1"; }

# TBFM: population of runway STA/ETA and metering delay per arrival airport (last hour)
q "SELECT arrival_airport, count(*) n,
          count(*) FILTER (WHERE sta_rwy IS NOT NULL AND eta_rwy IS NOT NULL) both_times,
          count(*) FILTER (WHERE sta_frozen IS NOT NULL) frozen,
          round(avg(EXTRACT(EPOCH FROM sta_rwy - eta_rwy) / 60)::numeric, 1) avg_sta_minus_eta_min
   FROM swim.tbfm_metering_assertions
   WHERE received_at > now() - interval '1 hour'
   GROUP BY 1 ORDER BY n DESC LIMIT 30;"

# SFDPS holding: columns and recent event counts
q "SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'swim' AND table_name = 'sfdps_lifecycle_events' ORDER BY ordinal_position;"
q "SELECT lifecycle_event_type, count(*) FROM swim.sfdps_lifecycle_events
   WHERE received_at > now() - interval '1 hour' GROUP BY 1;"

# Surface and flight events
q "SELECT 'surface_positions', count(*) FROM swim.surface_positions
   UNION ALL SELECT 'flight_events', count(*) FROM swim.flight_events;"
q "SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'swim' AND table_name IN ('surface_positions', 'v_airport_surface', 'flight_events', 'v_departures')
   GROUP BY 1;"

# ITWS payload shape for terminal products
q "SELECT alert_type, jsonb_pretty(details) FROM swim.weather_alerts
   WHERE tracon_id = 'N90' AND alert_type IN ('forecast_contour', 'storm_motion_5nm', 'hazard_5nm') LIMIT 3;"
```

---

## 12. Open questions for Stage 01 (Part 1)

1. **Archive location:** everything runs locally first, so the archive lives on this machine. Local Postgres, or files (Parquet / DuckDB)?
2. **Source access:** cursor over the cluster's swimdb landing tables (8 h window), or a direct subscription to the upstream SWIM topics?
2a. **Collection uptime (local-first risk):** the extractor must reach swimdb at least every 8 h or raw TFMS/ITWS messages are lost for good. Two failure modes seen or implied today: the laptop sleeping overnight, and the OpenShift user token expiring (it expired within an hour on 2026-10-14 ✓). Options: keep the machine awake while collecting, use a long-lived service-account credential, or run only the extractor in the cluster while everything else stays local.
3. **Watched airports:** Core 30, or every airport with APTC messages?
4. **Horizons and grid:** 1/3/6 h on a 15-minute grid, and decision-anchored offsets of 15–180 min, as proposed?
5. **Transition targets:** does `GDP_PROPOSED` count as a positive for `gs_or_gdp_within_h`, or only `GDP_ISSUED`?
6. **Language:** Rust (recommended) or Go?
7. **Alert threshold policy:** which false-alarm rate is acceptable when reporting lead time (§1.1)?
8. **Later, not now (research stage):** SWIM terms for redistributing derived forecasts; the LFM Open License v1.0 is free for research and for commercial use under USD 10M company revenue ✓.
