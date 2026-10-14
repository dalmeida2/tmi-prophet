# Airspace User Perspective — Anticipating FAA Traffic Management Initiatives

> **Canonical data model:** [DATA_MODEL.md](./DATA_MODEL.md). Evidence below was pulled live from `swim_data` on **2026-10-14 (~17:30Z)**. All times are UTC.
>
> **Supersedes the framing** of `ai_agent_decision_scope.md` / `ai_agent_summary.md` (FAA-side decision support). Those documents remain valid as a catalog of table-level inference logic.

---

## 1. Why the perspective changes

SWIM SCDS is a **one-way outflow** of FAA decisions and system state. We consume it; we cannot send anything back into it, and nothing we compute changes what the FAA does. An app that "recommends GDP releases" or "decides reroutes" from this data is giving advice to someone who isn't listening.

The data *is* valuable to the people on the receiving end of those decisions: **airspace users** — airline operations centers (AOC), dispatchers, business-aviation and charter operators. Their question is:

> *"What is the FAA likely to do at the airports and airspace my flights touch, and what should I do about it **before** it happens?"*

| | FAA-side framing (previous) | Airspace-user framing (this document) |
|---|---|---|
| Who acts on the output | Traffic managers (FAA) | Dispatchers / AOC (airline) |
| What we predict | Nothing — we restate active constraints | Whether a TMI will be issued, when, and how bad |
| Levers | Issue / modify / release TMIs (not ours) | Fuel, alternates, departure timing, gate holds, swaps, cancellations, route filing |
| Value | Low — FAA already has this picture | Lead time: acting minutes-to-hours before the TMI lands |

**Business model:** the FAA, as the ANSP, decides; airlines react. We forecast the ANSP's decisions and sell that foresight to airspace users. The forecast must beat what the FAA already publishes for free (Operations Plan, proposed GDPs, delay advisories), so the headline metric is lead time gained over the FAA's first published signal. See [tmi_dataset_and_prediction_plan.md](./tmi_dataset_and_prediction_plan.md) §1.

---

## 2. What SWIM tells a user about FAA intent — four horizons

The FAA does not only publish TMIs once they are in effect. It publishes **intent** at several horizons, and all of it arrives through TFMS flow information into `swim.flow_constraints`.

| Horizon | Signal | Where it lands | Typical lead time (observed 2026-10-14) |
|---|---|---|---|
| **H3 — Unannounced** | Precursors only: weather, capacity, demand | `weather_alerts`, `airports` (ATIS), `runway_conditions`, `notams`, `APTC` rows, `v_active_flights` | — (this is where prediction adds the most value) |
| **H2 — Planned / possible** | ATCSCC **Operations Plan** advisory: "TERMINAL PLANNED … GROUND STOP/DELAY PROGRAM POSSIBLE" | `flow_constraints` `tmi_type='GADV'`, title `OPERATIONS PLAN` | Hours; published roughly every 2 h |
| **H1 — Proposed / announced** | `gdpAdvisory` with `tmiStatus=PROPOSED`; "AIRPORT ARRIVAL DELAYS" advisories | `GDP` / `GADV` rows | 4–20 min before the actual TMI |
| **H0 — Actual** | `gdpAdvisory` (ACTUAL), `gsAdvisory`, reroutes, per-flight EDCTs | `GDP`, `GS`, `REROUTE` rows; `flow_constraint_flights` | 0 (reacting, not anticipating) |

The FAA also publishes its **own forecasts** inside TMIs:
- GS advisories carry `PROBABILITY OF EXTENSION: LOW | MEDIUM | HIGH`.
- GDP advisories carry anticipated average/maximum delay, program rate, and `IMPACTING CONDITION` (e.g. `WEATHER / THUNDERSTORMS`, `RWY-TAXI / CONSTRUCTION`, `LOW`, `WIND`).
- The Operations Plan lists terminal and en-route constraints, staffing triggers, runway/equipment outages, and planned reroutes (CDRs, swap, capping/tunneling).

**Implication:** the app is a **forecaster that fuses FAA-published intent (H1/H2) with precursor signals (H3)**. Where the FAA has already said what it plans, we parse it and push it to the dispatcher early. Where it hasn't, we estimate.

---

## 3. Case studies from today's feed (2026-10-14)

### 3.1 BOS — proposed GDP, six hours of lead time (H1)

| Time | Event | Source |
|---|---|---|
| 09:58 | APTC: BOS arrival rate 38, VMC | `APTC` row |
| 11:12 | ADVZY 028 **CDM PROPOSED GROUND DELAY PROGRAM**: rate 38, anticipated avg 62 / max 159 min, cause `RWY-TAXI / CONSTRUCTION`, "user updates must be received by 11:45Z" | `GADV` 0028, `GDP` BOS (`PROPOSED`) |
| 11:32 | ADVZY 030 **GDP** issued: avg 65.5 / max 167 min, program 17:30Z–03:59Z | `GDP` BOS (`ACTUAL`) |
| 15:34 | Ops Plan: "UNTIL 0359 – BOS GROUND DELAY PROGRAM", terminal constraint "BOS – LOW CIGS" | `GADV` 0047 |

A dispatcher watching the proposal had **33 minutes to submit CDM updates** and **six hours** before the program window opened. This is the easy case: no prediction needed, only fast parsing and fleet impact.

### 3.2 DEN — proposed GDP, then "additional GDP" flagged in the plan (H1 + H2)

| Time | Event |
|---|---|
| 13:03 | ADVZY 038 proposed GDP |
| 13:12 | ADVZY 039 GDP issued |
| 15:34 | Ops Plan: "DEN ANTICIPATES ADDITIONAL GDP TO MANAGE THE 2200Z HOUR"; "AFTER 1900 – DEN GROUND STOP/DELAY PROGRAM POSSIBLE"; constraint "DEN – SHRA/LOW VIS" |
| 17:14 | ADVZY 067 GDP cancelled |
| ~17:24 | APTC: DEN IMC, arrival rate reported 0 |

The Ops Plan announced the **next** program before the current one ended. Arrival demand from `v_active_flights` shows 62 flights in the 18Z hour and 54 in the 20Z hour against a degraded IMC airport.

### 3.3 AUS — planned "possible", then a ground stop earlier than planned (H2 → H0)

| Time | Event |
|---|---|
| 15:34 | Ops Plan: "AFTER 2000 – AUS GROUND STOP/DELAY PROGRAM POSSIBLE" |
| 16:53 | AUS ATIS: wind 190/15 gusting 23, BKN031 |
| 16:57 | ADVZY 058 **CDM GROUND STOP** AUS |
| 17:01–17:02 | AUS arrival delays and scheduling delays advisories |
| ~17:14 | APTC: AUS arrival rate 28, LVMC |

The plan was right about the airport but **three hours late on timing**. Arrival demand in the 20Z hour (27) sits at the arrival rate (28). This is a case where precursors (gusts, marginal VMC, demand/capacity ≈ 1) would have pulled the forecast earlier.

### 3.4 NY metro — unannounced ground stops (H3 only)

| Time | Event |
|---|---|
| 15:34 | Ops Plan: "ZNY ISSUED A SWAP STATEMENT, THEY DO NOT ANTICIPATE SIGNIFICANT IMPACTS"; en-route TSTMs in ZBW and the Midwest; **no NY terminal TMI planned** |
| 16:25 | ADVZY 049 LGA arrival delays / airborne holding up to 30 min "DUE TO THUNDERSTORMS" |
| 16:29 | ADVZY 051 **LGA ground stop**, period 16:16Z–17:30Z (start time is *retroactive*), probability of extension MEDIUM |
| 16:30–16:41 | EWR and TEB ground stops; revisions |
| 16:51–17:00 | NY metro / EWR / EWR-satellite diversion recovery activated |
| 16:51 | LGA ATIS: light rain, SCT048 BKN110 |
| 17:11 | ADVZY 064/065 EWR and LGA ground stops cancelled |

FAA intent arrived **four minutes** before the first ground stop, and the GS was backdated. This is the case the user described: a TMI that "hasn't happened yet" and wasn't planned. Only ITWS (storm motion / precipitation / hazard products at N90), en-route TSTM mentions in the Ops Plan, and ATIS weather could have anticipated it.

---

## 4. Data constraints that shape the product

### 4.1 Retention: there is no TMI history to learn from (yet)

| Data | Retention in this environment | Consequence |
|---|---|---|
| Raw feeds (`tfms_messages`, `itws_messages`, …) | **8 hours** (TimescaleDB `drop_after`) | Cannot replay yesterday's messages |
| Parsed assertions (`flow_constraint_flights`, `tbfm_metering_assertions`, `*_flight_plan_assertions`, …) | **48 hours** | ~2 days of per-flight context |
| `flow_constraints` | Latest message per `(tmi_type, control_element)` | GDP/GS rows hold only the latest advisory **or** cancel; onset/revision history is overwritten |
| `GADV` advisories | Keyed by daily advisory number (`0001`…) | Today's ADVZY 049 overwrites yesterday's ADVZY 049 |
| `weather_alerts` | One row per airport/TRACON × alert type; `first_seen_at` is when the row was first created (September), **not** when the current weather began | No alert onset history |

**Prerequisite for any prediction work:** an **event archive** we own. It should capture every TMI lifecycle message (proposed → actual → revised → cancelled), every Operations Plan, and periodic snapshots of the precursor features (§5) per airport. Without it we can't backtest, calibrate, or show that the forecasts beat the Ops Plan baseline. A few weeks of archive (including convective days) is the minimum before claiming accuracy.

### 4.2 Demand is a lower bound

`v_active_flights` only holds flights seen in the last hour (airborne or filed). Arrival counts 2–4 hours out are undercounts because many flights haven't filed yet (e.g. ATL shows 69/hr against an arrival rate of 100). Use demand/capacity **trends** and near-term hours (0–2 h) with confidence; treat later hours as partial. Airline-side schedule data would close this gap (see §7).

### 4.3 Other quirks

- `APTC` arrival rate may be `0` (DEN, IMC); treat as "unknown / severely degraded", not literal zero.
- Airport identifiers mix FAA (`BOS`) and ICAO (`KBOS`) forms across tables (`airports.airport_id` is ICAO); normalize.
- ITWS coordinates are often NULL; key on `airport_id` / `tracon_id`.
- Ops Plan text is semi-structured (fixed section headers, line-oriented entries) — parseable deterministically, with a decision model for the fuzzy cases.

---

## 5. Input state: per-airport, per-time-window situation packet

The unit of prediction is an **(airport, look-ahead window)** pair, e.g. `(LGA, next 0–3 h)`. Each packet is assembled deterministically from SQL:

| Feature group | Fields | Source |
|---|---|---|
| FAA intent (H2) | Is the airport listed in Ops Plan "TERMINAL PLANNED"? with what time and wording; listed terminal constraint text (e.g. "LOW CIGS", "VCTS") | `GADV` OPERATIONS PLAN |
| FAA intent (H1) | Proposed GDP present; "arrival delays" / "scheduling delays" advisory present; minutes since issued | `GDP` (`PROPOSED`), `GADV` titles |
| Active TMIs | Active GDP/GS at airport or at neighbors in the same TRACON; GS probability of extension | `GDP`, `GS` rows |
| Capacity | Arrival/departure rate, strategic AAR, weather class (VMC/LVMC/IMC), runway config, AAR adjustment reason | `APTC` (`airportConfigMessage`) |
| Capacity events | Runway closures, equipment outages | Ops Plan SIR section, `v_active_notams`, `runway_conditions` |
| Weather | ATIS wind/gust, ceiling, visibility, precipitation; ITWS hazard/storm-motion/precip products present for airport or TRACON | `airports.atis_text`, `weather_alerts` / `v_active_weather` |
| En-route weather | Ops Plan "EN ROUTE CONSTRAINTS" mentioning the airport's ARTCC | `GADV` OPERATIONS PLAN |
| Demand | Arrivals per hour for 0–4 h vs arrival rate; ratio and trend | `v_active_flights` + `APTC` |
| Context | Neighbor airports already in GS/GDP; diversion recovery active | `GS`, `GDP`, `GADV` |

The packet is rendered as compact text or JSON and sent to the decision model as `state`.

---

## 6. Decision model fit (Liquid d1 / Jev contract)

Decision models take a `state` plus typed questions and return calibrated probabilities in ~200–300 ms with no generated text (see [Liquid AI d1](https://www.liquid.ai/blog/d1-decision-model)). They suit this problem because the outputs are **structured judgments over a situation**, there are many airports × windows to evaluate frequently, and the answers carry probabilities we can threshold on.

### 6.1 Prediction questions (per airport packet)

| Name | Type | Question / options |
|---|---|---|
| `tmi_next_3h` | `noul` | Will the FAA issue a ground stop or ground delay program for this airport within the next 3 hours? |
| `most_likely_tmi` | `choice` | `NONE`, `GROUND_STOP`, `GDP`, `GS_THEN_GDP`, `ARRIVAL_ROUTES_OR_CDRS`, `AIRBORNE_HOLDING_ONLY` |
| `expected_severity` | `score` | 0 no impact · 1 delays < 15 min · 2 delays 15–45 min · 3 delays 45–90 min · 4 > 90 min or GS |
| `driver` | `choice` | `CONVECTIVE_WX`, `LOW_CEILING_VIS`, `WIND`, `RUNWAY_CONSTRUCTION`, `DEMAND_VOLUME`, `STAFFING`, `OTHER` |
| `extension_likely` | `noul` | (only if GS active) Will the active ground stop be extended past its current end time? |

`driver` mirrors the FAA's own `IMPACTING CONDITION`, so once the TMI is issued the label for evaluation comes for free.

### 6.2 Dispatcher decision questions (per flight or flight group bound to that airport)

| Name | Type | Options |
|---|---|---|
| `dispatch_action` | `choice` | `DEPART_AS_PLANNED`, `DEPART_EARLY_TO_BEAT_STOP`, `HOLD_AT_GATE`, `ADD_HOLDING_FUEL`, `ADD_OR_CHANGE_ALTERNATE`, `REFILE_ROUTE`, `CANDIDATE_FOR_SUBSTITUTION_OR_CANCEL` |
| `fuel_buffer` | `score` | 0 none · 1 +10 min · 2 +20 min · 3 +30 min · 4 +45 min or more |
| `notify_duty_manager` | `noul` | Should the AOC duty manager be alerted now? |

### 6.3 Division of labor

| Layer | Responsibility |
|---|---|
| SQL / parsers (deterministic) | Build packets; parse Ops Plan sections, TMI fields, ATIS; detect H0/H1 facts exactly |
| Rules (deterministic) | If an H0/H1 fact exists, it **overrides** the forecast (a proposed GDP is a fact, not a probability) |
| Decision model | H2/H3 judgment: likelihood, timing, severity, driver; dispatcher action ranking |
| Human (dispatcher) | Final action; feedback recorded for calibration |

### 6.4 Baselines the model must beat

1. **Ops Plan only:** P(TMI) = 1 if the airport is in "TERMINAL PLANNED", else 0.
2. **Persistence:** whatever TMI state the airport had in the same hour yesterday.
3. **Demand/capacity rule:** alert when 0–2 h arrival demand / arrival rate > 0.9 and weather class ≠ VMC.

Metrics: Brier score / calibration of `tmi_next_3h`; **lead time gained** over the first FAA signal (H1 or H2); precision at the alert threshold (false alarms cost dispatcher trust).

---

## 7. Outputs the dispatcher sees

1. **Airport TMI risk board:** each watched airport × next 1/3/6 h, showing probability, likely TMI type, driver, and the FAA evidence that supports it ("Ops Plan 15:34: AUS GS/DP possible after 20Z", "ITWS storm motion at N90").
2. **My-flights impact list:** flights bound to at-risk airports, ranked by exposure, with the recommended `dispatch_action` and fuel buffer.
3. **FAA intent feed:** proposed GDPs, Ops Plan changes, and GS extension probabilities, surfaced the moment they arrive, with countdowns to CDM deadlines ("user updates must be received by 11:45Z").

**"My flights" in this POC:** SWIM has no airline schedule, crew, or passenger data. A carrier can be simulated by filtering `v_active_flights` on a callsign prefix (e.g. `SWA`, `UAL`, `JBU`). A real deployment would join the airline's own schedule, which would also fix the demand undercount in §4.2.

---

## 8. Suggested MVP: "TMI Watch"

> **Refined:** this MVP is now split into two projects (dataset first, prediction second). See [tmi_dataset_and_prediction_plan.md](./tmi_dataset_and_prediction_plan.md).

| Step | Deliverable |
|---|---|
| 1 | **Event archiver** — persists every GDP/GS/GADV/APTC message and Ops Plan (lifecycle, not just latest) plus 15-minute precursor snapshots per watched airport. Starts producing training/evaluation data on day one. |
| 2 | **Packet builder** — §5 features for ~10 core airports (e.g. ATL, ORD, DFW, DEN, LGA, EWR, JFK, BOS, SFO, AUS). |
| 3 | **Ops Plan parser** — deterministic sections → structured rows (terminal planned/active, en-route planned, SIRs). |
| 4 | **Forecaster** — d1 questions in §6.1 on each packet every 15 min; H0/H1 override rules. |
| 5 | **Board UI** — §7.1 and §7.3; §7.2 with a carrier-prefix filter. |
| 6 | **Evaluation job** — after the archive has a few weeks of data, score forecasts against actual TMIs and the three baselines in §6.4. |

Scope cut for v1: terminal TMIs only (GS, GDP). Airspace flow programs, CTOPs, and reroutes are later (only 2 CTOP rows and no active AFPs in today's data).

---

## 9. Open questions for Stage 01 brainstorming

1. **Persona:** large carrier AOC, regional, or business aviation / Part 135? This changes the levers (substitutions only matter to scheduled carriers in CDM).
2. **Airports and horizon:** which airports to watch, and whether 0–3 h (tactical) or 3–12 h (pre-departure planning) matters more.
3. **Retention:** extend TimescaleDB retention on the FAA SIL POC cluster, or keep an app-owned archive (preferred: no dependency on platform settings)?
4. **Data terms:** resolved for inference: d1-3B is open-weight and runs locally (see `tmi_dataset_and_prediction_plan.md` §7), so SWIM data doesn't leave our machines. Still open: SWIM terms for selling derived forecasts, and the LFM license revenue threshold.
5. **Ground truth:** is "a GS or GDP was issued for the airport within the window" the right label, or should severity/delay also be scored?
6. **Airline data:** is a schedule feed available, or do we commit to the carrier-prefix simulation for the POC?

---

## 10. Verification queries

```bash
NS=faa-sil-poc-dev; POD=swim-db-0
q() { kubectl exec -n "$NS" "$POD" -- psql -U swim -d swim_data -P pager=off -c "$1"; }

# Today's ATCSCC advisory titles (Ops Plans, proposed GDPs, ground stops)
q "SELECT control_element,
          details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:generalAdvisory,fcm:dateSent}' AS sent,
          details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:generalAdvisory,fcm:advisoryTitle}' AS title
   FROM swim.flow_constraints
   WHERE tmi_type = 'GADV'
     AND details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:generalAdvisory,fcm:dateSent}' >= to_char(now(), 'YYYY-MM-DD')
   ORDER BY sent;"

# Full text of one advisory (e.g. latest Operations Plan number from the list above)
q "SELECT details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:generalAdvisory,fcm:advisoryText}'
   FROM swim.flow_constraints WHERE tmi_type = 'GADV' AND control_element = '0047';"

# GDP status per airport (PROPOSED vs ACTUAL vs cancelled)
q "SELECT control_element, last_updated_at,
          (SELECT string_agg(k, ',') FROM jsonb_object_keys(details->'ds:tfmDataService'->'ds:fiOutput'->'fi:fiMessage') k WHERE k LIKE 'fi:%') AS subtype,
          details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:gdpAdvisory,fcm:tmiStatus}' AS status,
          details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:gdpAdvisory,fcm:impactingCondition}' AS cause
   FROM swim.flow_constraints WHERE tmi_type = 'GDP' ORDER BY last_updated_at DESC;"

# Arrival demand (0-4 h) vs APTC arrival rate
q "WITH rates AS (
     SELECT control_element AS apt,
            (details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:airportConfigMessage,fcm:arrRate}')::int AS aar,
            details#>>'{ds:tfmDataService,ds:fiOutput,fi:fiMessage,fi:airportConfigMessage,fcm:weather}' AS wx
     FROM swim.flow_constraints WHERE tmi_type = 'APTC'),
   dem AS (
     SELECT regexp_replace(primary_destination_airport, '^K', '') AS apt, date_trunc('hour', eta) AS hr, count(*) AS n
     FROM swim.v_active_flights WHERE eta BETWEEN now() AND now() + interval '4 hours' GROUP BY 1, 2)
   SELECT d.apt, d.hr, d.n AS demand, r.aar, r.wx FROM dem d JOIN rates r USING (apt) ORDER BY 1, 2;"

# Retention policies
q "SELECT hypertable_name, config->>'drop_after' AS drop_after
   FROM timescaledb_information.jobs WHERE proc_name LIKE '%retention%' ORDER BY 1;"
```
