# swimdb Data Model — Agent Reference

**Purpose:** Canonical description of how SWIM data is landed, processed, and queried in the FAA SIL POC. Use this document for **table roles and query surfaces**. Point-in-time row counts change continuously; verify counts with the commands below rather than copying numbers from research snapshots.

**Environment:** Database `swim_data`, schema `swim`, Kubernetes service `swim-db:5432`, namespace `faa-sil-poc-dev`, pod `swim-db-0`.

---

## 1. Processing pipeline

```text
SWIM JMS topics
    → swim.*_messages          Raw landing (partitioned by time; 9 child partitions per feed)
    → swim.*_assertions        Parsed / normalized facts (many partitioned by received_at)
    → swim.* state tables      Upserted “current picture” (constraints, alerts, flight state)
    → swim.v_* / swim.flights  Joins and filters for applications and agents
```

**Feeds and landing tables**

| Feed | Landing table | Typical structured outputs |
|------|----------------|----------------------------|
| TFMS | `tfms_messages` | `tfms_flight_plan_assertions`, `tfms_track_assertions`, `flow_constraints`, `flow_constraint_flights` |
| SFDPS | `sfdps_messages` | `sfdps_flight_plan_assertions`, `sfdps_tentative_plan_assertions`, `sfdps_track_assertions`, `sfdps_route_assertions`, `sfdps_supplemental_assertions`, `sfdps_lifecycle_events` |
| TBFM | `tbfm_messages` | `tbfm_metering_assertions`, `flight_events` |
| ITWS | `itws_messages` | `weather_alerts` |
| STDDS / NMS | `stdds_messages`, `nms_messages` | Contribute to flight reconciliation and related assertions |

**Retention (TimescaleDB hypertables, verified 2026-10-14):**

| Layer | `drop_after` | Hypertables |
|---|---|---|
| Raw landing `*_messages` | **8 h** | tfms, sfdps, tbfm, itws, stdds, nms |
| `flight_identity_evidence` | 24 h | — |
| Assertions and events | **48 h** | `flow_constraint_flights`, `tbfm_metering_assertions`, `tfms_*` / `sfdps_*` assertions, `sfdps_lifecycle_events`, `sfdps_coordination_events` |
| State tables (`flow_constraints`, `weather_alerts`, `flight_instance_state`, `airports`, …) | No drop; **upserted in place** | Latest value only — no history |

No multi-day history exists in swimdb. Any backtest, trend, or model-calibration work needs an app-owned archive. Full-table `min/max(received_at)` scans hit the statement timeout; read retention from `timescaledb_information.chunks` / `.jobs` instead (§10).

**Ingest rates (order of magnitude, verified 2026-10-14):** each of TFMS, SFDPS, and TBFM landing tables receives on the order of **10⁵ messages per hour** in this environment. TBFM structured assertions track message volume at roughly **10⁵ rows per hour** (not ~10⁴).

---

## 2. Schema inventory

| Kind | Count | Notes |
|------|------:|-------|
| Base tables | 38 | Includes landing, assertions, and state |
| Views | 24 | Agent-facing joins; no separate storage |
| **Total relations** | **62** | Often described informally as “62 tables” in summaries |

**Naming:** `swim_data` is the **database**; `swim` is the **schema** (not a single schema named `swim_data.swim`).

---

## 3. Flight identity and operational picture

**Resolution stack**

```text
flight_instances          Identity / GUFI resolution (one row per flight instance)
        +
flight_instance_state   Current unified operational fields (position, plan, timing, metering)
        ↓
v_resolved_flights      JOIN of instances + state
        ↓
v_active_flights        last_seen_at within 1 hour; excludes terminal statuses
flights                 Same resolved shape as v_resolved_flights (view)
v_departures            v_resolved_flights WHERE departure_time IS NOT NULL
```

**Query guidance**

| Need | Prefer |
|------|--------|
| Active traffic, position, ETD/ETA, EDCT | `v_active_flights` or `flight_instance_state` |
| Departures with runway/gate/time | `v_departures` |
| TFMS plan fields (route, ETD, ETA) at assertion granularity | `tfms_flight_plan_assertions` |
| SFDPS plan fields | `sfdps_flight_plan_assertions`, `v_sfdps_plan_details` |
| Lifecycle (e.g. departure DH) | `sfdps_lifecycle_events` |

### `flight_plans` vs plan assertions

| Object | Role | Typical row count |
|--------|------|-------------------|
| `flight_plans` | Materialized TFMS plan **rollup** | **0** in this env (table exists; rollup not populated) |
| `tfms_flight_plan_assertions` | Parsed TFMS plan facts | Millions (append-only / partitioned) |
| `sfdps_flight_plan_assertions` | Parsed SFDPS plan facts | Millions |

**Do not** interpret `flight_plans = 0` as “no flight plan data.” Prefer assertions and `flight_instance_state` / `v_active_flights` for timing and routes.

### Empty or unused in this environment

| Object | Status |
|--------|--------|
| `flight_observations` | **0 rows** — unified observation store not populated here |
| `flight_tracks` | **0 rows** — latest-track table unused; position flows through reconciliation → `flight_instance_state` |

---

## 4. Traffic flow management (TFMS)

| Object | Storage pattern | Join keys |
|--------|-----------------|-----------|
| `flow_constraints` | Current state; unique on **`(tmi_type, control_element)`** | — |
| `flow_constraint_flights` | Append-only; **49** partitions on `received_at` | Join to constraints on **`tmi_type` + `control_element`** (add `source_facility` when matching facility-specific TMIs) |
| `v_active_flow_constraints` | View: `flow_constraints` with `last_updated_at` in last 4 hours | — |

**TMI types in data (15):** APTC, CMPR, CTOP, FADT, FXA, FXASF, GADV, GDP, GS, PARAM, RAPT, REROUTE, RSTR, TMI_FLIGHT_LIST, TMI_UPDATE.

Docs may list AFP/MIT as TFMS types; they are **not** present as `tmi_type` values in `flow_constraints` in this dataset. GDP constraints are a **small subset** of all constraints (on the order of tens of rows, not hundreds).

**`flow_constraints` holds only the latest message per key.** The `details` JSONB is the most recent TFMS flow-information message for that `(tmi_type, control_element)`; earlier advisories, revisions, and cancels are overwritten. `first_seen_at` is when the key was first ever seen (mostly 2026-09-09 when ingest started), **not** when the current TMI began.

**Message subtype** sits under `details->'ds:tfmDataService'->'ds:fiOutput'->'fi:fiMessage'`:

| `tmi_type` | `fi:*` subtype keys observed | Useful fields |
|---|---|---|
| GDP | `fi:gdpAdvisory`, `fi:gdpCancel` | `fcm:tmiStatus` (`PROPOSED` / `ACTUAL`), `fcm:avgDelay`, `fcm:maxDelay`, `fcm:programRateList`, `fcm:impactingCondition`, `fcm:advisoryValidPeriod`, `fcm:adlTime` |
| GS | `fi:gsAdvisory`, `fi:gsCancel` | `fcm:tmiStatus`, period, departure facilities |
| GADV | `fi:generalAdvisory` | `fcm:advisoryTitle`, `fcm:advisoryText`, `fcm:dateSent`, `fcm:effectivePeriod`. `control_element` is the **daily advisory number** (`0001`…), so each day overwrites the previous day's same number. Includes the ATCSCC **OPERATIONS PLAN** (~every 2 h), proposed GDPs, GS/GDP issuance and cancels (as text), airport arrival delay notices, and volcanic ash bulletins |
| APTC | `fi:airportConfigMessage` | `fcm:arrRate`, `fcm:depRate`, `fcm:stratAar`, `fcm:weather` (VMC/LVMC/IMC), `fcm:arrRunwayConf`, `fcm:depRunwayConf`, `fcm:aarAdjust`. `control_element` = FAA airport id; `arrRate` may be `0` under IMC |
| REROUTE | `fi:reroute` | — |
| CTOP | `fi:ctopDefinition`, `fi:ctopCancel` | — |

GS advisory text (in GADV) also carries `PROBABILITY OF EXTENSION` and `IMPACTING CONDITION`, which are not in the GS row itself. See [airspace_user_tmi_anticipation.md](./airspace_user_tmi_anticipation.md) for how these are used.

---

## 5. Arrival metering (TBFM)

**Table:** `tbfm_metering_assertions` — partitioned (**49** child partitions on `received_at`).

**`data_group` values:** `flt`, `eta`, `sta`, `sch`, `mrp`.

**Timing columns:** `etm`, `ctm`, `eta_rwy`, `sta_rwy`, `sta_frozen`, and `sta_*` milestone fields. **`metering_edct` is not a column on this table** — use `etm`/`ctm` here; use `metering_edct` on `flight_instance_state` / `v_active_flights`.

Runway STA/ETA fields are often NULL; filter expectations accordingly.

---

## 6. Weather (ITWS)

**Table:** `weather_alerts` — current/recent alert state.

- **`alert_type`:** many distinct values (~28 categories in sample data).
- **`product_id`:** ITWS product ids (e.g. 9832–9912 range observed).
- **Coordinates:** `latitude` / `longitude` are **decimal degrees** when present; many rows have NULL coordinates — prefer `airport_id` / `tracon_id` for filtering.
- **State, not history:** one row per airport/TRACON × `alert_type`, refreshed in place. `first_seen_at` dates from row creation (mid-September), so it cannot tell you when current weather began. `v_active_weather` is the recent-alert view.

### Airport context tables

| Object | Snapshot (2026-10-14) | Content |
|---|---:|---|
| `airports` | 76 | ICAO id (`KLGA`), current ATIS code/text (wind, gusts, ceiling, visibility, runways in use, NOTAM excerpts) |
| `runway_conditions` | 507 | RVR (touchdown/midpoint/rollout), trend, lighting per runway |
| `v_airport_status` | 372 | Join of ATIS + runway conditions |
| `notams` / `v_active_notams` | 27,419 / 19,379 | NOTAM type, affected location, effective window, text |

Airport identifiers mix FAA (`BOS`) and ICAO (`KBOS`) forms across tables; normalize before joining.

---

## 7. Lifecycle events (SFDPS)

**Table:** `sfdps_lifecycle_events` — append-only, **49** partitions on `received_at`.

**Event types in data:** CL, DH, ET, HH, HV, NL, RH.

---

## 8. Neo4j (AIRM) — verified 2026-10-14

Graph stores AIRM ontology and catalog linkage (labels include `AirmConcept`, `AirmProperty`, plus OpenMetadata mirror nodes such as `Table`, `Topic`).

| Metric | Count |
|--------|------:|
| `AirmConcept` nodes | 6,660 |
| `AirmProperty` nodes | 6,942 |
| `rdfs__subClassOf` relationships | 3,671 |
| `rdfs__subPropertyOf` relationships | 6,790 |
| `rdfs__domain` / `rdfs__range` | 2,248 each |

Older research figures citing **2,560 classes** under-count current `AirmConcept` nodes; relationship-type totals above still match the graph.

*Neo4j MCP was unauthorized from the agent harness; counts were taken via in-cluster `cypher-shell`.*

---

## 9. OpenMetadata

**Role:** Catalog for swim tables, topics, glossaries (SWIM_* glossaries), and cross-links to Neo4j.

OpenMetadata **1.13.1** runs in-cluster (`openmetadata` service). Interactive catalog exploration uses the OM UI or a valid ingestion-bot JWT (`OPENMETADATA_JWT_TOKEN`). MCP authentication was not available in this local harness session; glossary and topic totals should be refreshed from the API or UI when documenting exact counts.

---

## 10. Verification commands

```bash
NS=faa-sil-poc-dev
POD=swim-db-0
psql() { kubectl exec -n "$NS" "$POD" -- psql -U swim -d swim_data -t -A -c "$1"; }

# Ingest health (last hour)
psql "SELECT 'tfms' AS feed, COUNT(*) FROM swim.tfms_messages WHERE received_at > NOW() - INTERVAL '1 hour'
      UNION ALL SELECT 'sfdps', COUNT(*) FROM swim.sfdps_messages WHERE received_at > NOW() - INTERVAL '1 hour'
      UNION ALL SELECT 'tbfm', COUNT(*) FROM swim.tbfm_messages WHERE received_at > NOW() - INTERVAL '1 hour'
      UNION ALL SELECT 'itws', COUNT(*) FROM swim.itws_messages WHERE received_at > NOW() - INTERVAL '1 hour';"

# Plan data vs empty rollup
psql "SELECT 'flight_plans' AS t, COUNT(*) FROM swim.flight_plans
      UNION ALL SELECT 'tfms_flight_plan_assertions', COUNT(*) FROM swim.tfms_flight_plan_assertions
      UNION ALL SELECT 'sfdps_flight_plan_assertions', COUNT(*) FROM swim.sfdps_flight_plan_assertions;"

# TBFM assertion rate (last hour)
psql "SELECT COUNT(*) FROM swim.tbfm_metering_assertions WHERE received_at > NOW() - INTERVAL '1 hour';"

# Active flights view
psql "SELECT COUNT(*) FROM swim.v_active_flights;"
```

---

## 11. Research documents in this folder

Start with `README.md` (reading order and status of every document) and `RESEARCH_LOG.md` (chronology, decisions, open items).

| File | Focus |
|------|--------|
| `README.md` | Index, reading order, how to run the d1 probes |
| `RESEARCH_LOG.md` | Chronological record, research decisions R001–R020, local environment changes |
| `probes/` | d1 probe, comparison and scenario scripts, plus reference results |
| `DATA_MODEL.md` (this file) | Pipeline, table roles, query map |
| `airspace_user_tmi_anticipation.md` | **Current product direction:** airline/dispatcher view, predicting FAA TMIs before issuance |
| `tmi_dataset_and_prediction_plan.md` | Two-part project: Part 1 ANSP decision dataset (start/end state pairs, leakage rules), Part 2 TMI prediction with local d1, stack and impact visualization |
| `data_availability_report.md` | Snapshot counts and data-quality notes |
| `research_document.md` | Broad system + use-case research |
| `ai_agent_decision_scope.md` | Decision logic tied to tables |
| `ai_agent_implementation_plan.md` | Implementation sketches |
| `ai_agent_summary.md` | Executive summary |

When narrative and this model disagree, **trust this model** and refresh snapshots with §10.
