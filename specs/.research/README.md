# Research Folder

Pre-Stage-01 research for an SDD project that forecasts FAA traffic management decisions for airspace users. Nothing here is part of the frozen set; Stage 01 turns the agreed parts into `specs/SPEC.md` and `specs/DECISION_LOG.md`.

## Read in this order

| # | File | What it is | Status |
|---|---|---|---|
| 1 | [RESEARCH_LOG.md](./RESEARCH_LOG.md) | Chronological record, research decisions `R001`–`R020`, open items, local environment changes | Current |
| 2 | [tmi_dataset_and_prediction_plan.md](./tmi_dataset_and_prediction_plan.md) | The plan: product thesis and lead-time metric, Part 1 dataset (state pairs, leakage rules), Part 2 prediction, local d1 configuration and measurements, impact visualization | Current |
| 3 | [airspace_user_tmi_anticipation.md](./airspace_user_tmi_anticipation.md) | Why the airspace-user perspective; FAA intent horizons; 2026-10-14 case studies (BOS, DEN, AUS, NY) | Current (its §8 MVP is refined by #2) |
| 4 | [DATA_MODEL.md](./DATA_MODEL.md) | Canonical swimdb reference: pipeline, retention, table roles, TFMS message subtypes, airport tables, verification commands | Current |
| 5 | [data_availability_report.md](./data_availability_report.md) | Row-count snapshots and data-quality notes from 2026-10-14 | Reference (counts drift) |
| 6 | [ai_agent_summary.md](./ai_agent_summary.md), [research_document.md](./research_document.md), [ai_agent_decision_scope.md](./ai_agent_decision_scope.md), [ai_agent_implementation_plan.md](./ai_agent_implementation_plan.md) | First concept: FAA-side decision support | Superseded framing; table-level query logic still useful |

## Probes (`probes/`)

Scripts for the local d1 decision model. They need a running `llama-server` with d1 loaded and use only the Python standard library.

| File | Purpose |
|---|---|
| `d1_probe.py` | Six airport pictures × three questions; prints latency and answers; writes a result JSON |
| `d1_compare.py` | Compares a result JSON with the BF16 reference; PASS needs the same top choices and max probability shift ≤ 0.01 |
| `d1_scenarios.py` | Behavioral runs: full answer distributions, evidence build-up, horizon consistency, Ops Plan dependence, clock-time horizons |
| `results/bf16_b11617_reference.json` | Reference result: BF16, llama.cpp b11617, Apple M3, 2026-10-14 |
| `results/f16_b11617.json`, `results/q8_0_b11617.json`, `results/bf16_llamaapp_b11630.json` | Comparison runs (all PASS) |
| `results/scenarios_bf16_llamaapp_b11630.txt` | Output of `d1_scenarios.py` |

The pictures are hand-written approximations of 2026-10-14 situations, not archive reconstructions: the probes measure runtime behavior and consistency, not forecast accuracy.

## Run d1 locally

```bash
# Reference server (pinned llama.cpp release; download the asset for your platform from
# https://github.com/ggml-org/llama.cpp/releases/tag/b11617)
llama-server -hf LiquidAI/d1-3B-GGUF:BF16 --no-mmproj -ngl 99 --ctx-size 8192 --host 127.0.0.1 --port 8080

# Check a machine against the reference
cd specs/.research/probes
python3 d1_probe.py mymachine                       # writes /tmp/d1_mymachine.json
python3 d1_compare.py /tmp/d1_mymachine.json

# Through Llama.app instead (router mode on port 9931; model name required)
D1_URL=http://127.0.0.1:9931 D1_MODEL=LiquidAI/d1-3B-GGUF:BF16 python3 d1_scenarios.py
```

Details and measurements: `tmi_dataset_and_prediction_plan.md` §7.
