# Data Availability Report - FAA SIL POC swimdb

> **Canonical data model:** See [DATA_MODEL.md](./DATA_MODEL.md) for how data is landed, processed, and which tables to query. Row counts below are **2026-10-14 snapshots** and drift with live ingestion—re-run the verification commands in `DATA_MODEL.md` §10 for current values.

**Generated:** 2026-10-14  
**Database:** swim_data (PostgreSQL)  
**Namespace:** faa-sil-poc-dev  
**Pod:** swim-db-0

---

## Executive Summary

This report documents the actual data available in the FAA SIL POC's swimdb as verified on 2026-10-14. The database contains structured aviation data from SWIM messages, with key tables for traffic flow management, arrival metering, weather alerts, and flight positions.

---

## 1. Table Record Counts

| Table / view | Snapshot count (2026-10-14) | Notes |
|--------------|----------------------------:|-------|
| `flow_constraints` | 3,145 | Current-state TFMS constraints (upserted) |
| `flow_constraint_flights` | ~4.5M | Append-only; **49** partitions on `received_at` |
| `tbfm_metering_assertions` | ~250k/hr | Assertion rate tracks TBFM ingest (~10⁵/hr), not ~10⁴/hr |
| `v_active_flights` | ~27k | View: resolved flights active in last hour |
| `sfdps_lifecycle_events` | ~550k | Append-only; 49 partitions |
| `weather_alerts` | ~1.2k | Current/recent ITWS alert state |
| `flight_plans` | 0 | **Rollup table empty** — plan facts live in `*_flight_plan_assertions` |
| `tfms_flight_plan_assertions` | ~5.5M | Primary TFMS plan/route/ETD source |
| `sfdps_flight_plan_assertions` | ~1.4M | SFDPS plan assertions |
| `flight_instances` | ~238k | Resolved flight identities |
| `flight_observations` | 0 | Schema present; not populated in this env |
| `flight_tracks` | 0 | Unused; position via `flight_instance_state` / views |

---

## 2. Traffic Flow Management Data

### 2.1 Flow Constraints (`flow_constraints`)

**Record Count:** 3,145

**TMI Types Observed (15 total):**
| TMI Type | Description | Status |
|----------|-------------|--------|
| APTC | Airport Terminal Change | Active |
| CMPR | Compression | Active |
| CTOP | Collaborative Traffic Management | Active |
| FADT | Final Arrival Departure Time | Active |
| FXA | Fix Arrival | Active |
| FXASF | Fix Arrival/Departure | Active |
| GADV | Ground Delay/Gap and Insertion | Active |
| GDP | Ground Delay Program | Active |
| GS | Ground Stop | Active |
| PARAM | Parameter Update | Active |
| RAPT | Runway Arrival Procedure | Active |
| REROUTE | Reroute | Active |
| RSTR | Restriction | Active |
| TMI_FLIGHT_LIST | Flight List | Active |
| TMI_UPDATE | TMI Update | Active |

**Sample Data (2026-10-14 16:00:54):**
```
tmi_type        | control_element | source_facility | first_seen_at           | last_updated_at
-----------------+-----------------+-----------------+-------------------------+-------------------------
TMI_FLIGHT_LIST | VP_Q818         | TFMS            | 2026-09-09 16:21:56+00  | 2026-10-14 16:00:54+00
RSTR            | 81936           | ZTL             | 2026-09-09 16:21:56+00  | 2026-10-14 16:00:54+00
RSTR            | 266241          | TPA             | 2026-09-09 16:22:02+00  | 2026-10-14 16:00:54+00
```

### 2.2 Flow Constraint Flights (`flow_constraint_flights`)

**Record Count:** 4,532,988

**Sample Data (2026-10-14 16:05:48):**
```
gufi         | callsign | departure_airport | destination_airport | entry_time            | exit_time             | tmi_fca_id
-------------+----------+-------------------+---------------------+-----------------------+-----------------------+--------------------------------
KC3614048Y   | EJA966   | PIT               | APF                 | 2026-10-14 16:05:48+00| 2026-10-14 16:05:48+00| fca.zjx.lxstn04.20260802170053
KL495134dD   | SWA4360  | LAS               | DCA                 | 2026-10-14 19:45:09+00| 2026-10-14 19:45:09+00| fca.zdc.lxstn21.20260927111326
```

**Key Observations:**
- entry_time may equal exit_time for instant constraints (no delay)
- Append-only table with 49 child partitions
- Received timestamp used for time-based queries

---

## 3. Arrival Metering Data

### 3.1 TBFM Metering Assertions (`tbfm_metering_assertions`)

**Ingest rate:** on the order of **10⁵ assertions per hour** (partitioned by `received_at`; 49 child partitions)

**Data Groups Observed:**
| Data Group | Description | Status |
|------------|-------------|--------|
| eta | Estimated Time of Arrival | Active |
| flt | Flight | Active |
| mrp | Metering Report | Active |
| sch | Scheduled | Active |
| sta | Scheduled Time of Arrival | Active |

**Sample Data (2026-10-14 16:00:00):**
```
data_group | tbfm_gufi  | callsign | arrival_airport | etm | ctm | eta_rwy | sta_rwy | sta_frozen
-----------+------------+----------+----------------+-----+-----+---------+---------+------------
sta        | KG467514TI | UAL1292  | YVR            |     |     |         |         |
eta        | KB4755649m | N512CD   | ACK            |     |     | 2026-10-14 16:25:44+00 |     |
```

**Key Observations:**
- STA/ETA fields often NULL in current dataset
- etm (Expected Departure Clearance Time) often NULL
- ctm (Coordination Time) often NULL
- Partitioned by received_at (49 child partitions)

---

## 4. Flight Position Data

### 4.1 Active Flights (`v_active_flights`)

**Record Count:** 26,711

**Key Fields:**
- `flight_instance_id` - UUID
- `best_tfms_gufi`, `best_sfdps_gufi` - Flight identifiers
- `primary_callsign`, `primary_departure_airport`, `primary_destination_airport`
- `latitude`, `longitude`, `altitude` - Position
- `flight_status`, `operational_phase` - Status
- `etd`, `eta` - Estimated times
- `edct`, `metering_edct` - Departure clearance times
- `sta_rwy`, `sta_frozen` - Arrival scheduling
- `departure_time`, `departure_runway`, `departure_gate` - Departure info

**Key Observations:**
- Contains ETD/ETA for active resolved flights; TFMS plan ETD/ETA also in `tfms_flight_plan_assertions` (see `DATA_MODEL.md`)
- Position data from multiple sources (SFDPS, TFMS, STDDS)
- Unified operational picture for resolved flights

---

## 5. Lifecycle Event Data

### 5.1 SFDPS Lifecycle Events (`sfdps_lifecycle_events`)

**Record Count:** 559,534

**Event Types Observed (7 total):**
| Event Type | Description | Status |
|------------|-------------|--------|
| CL | Clearance | Active |
| DH | Departure | Active |
| ET | Estimated Time | Active |
| HH | Holding | Active |
| HV | Holding Verified | Active |
| NL | New Flight | Active |
| RH | Release | Active |

**Sample Departure Events (DH):**
```
lifecycle_event_type | event_time            | edct | flight_status
---------------------+-----------------------+------+---------------
DH                   | 2026-10-14 15:52:03+00|      | ACTIVE
DH                   | 2026-10-14 15:52:02+00|      | ACTIVE
```

**Key Observations:**
- DH events for departure times
- edct field often NULL
- Partitioned by received_at (49 child partitions)

---

## 6. Weather Alert Data

### 6.1 Weather Alerts (`weather_alerts`)

**Record Count:** 1,180

**Alert Types Observed (28 total):**
| Alert Type | Description | Status |
|------------|-------------|--------|
| ap_precipitation | Airport Precipitation | Active |
| ap_status | Airport Status | Active |
| configured_alerts | Configured Alerts | Active |
| forecast_accuracy | Forecast Accuracy | Active |
| forecast_contour | Forecast Contour | Active |
| forecast_image | Forecast Image | Active |
| gustfront | Gust Front | Active |
| gustfront_eti | Gust Front ETI | Active |
| hazard_5nm | Hazard (5NM) | Active |
| hazard_long_range | Hazard (Long Range) | Active |
| hazard_tracon | Hazard (TRACON) | Active |
| microburst | Microburst | Active |
| microburst_atis | Microburst ATIS | Active |
| precipitation_5nm | Precipitation (5NM) | Active |
| precipitation_long_range | Precipitation (Long Range) | Active |
| precipitation_tracon | Precipitation (TRACON) | Active |
| runway_config | Runway Configuration | Active |
| status_info | Status Information | Active |
| storm_motion_5nm | Storm Motion (5NM) | Active |
| storm_motion_long_range | Storm Motion (Long Range) | Active |
| storm_motion_tracon | Storm Motion (TRACON) | Active |
| terminal_text | Terminal Text | Active |
| terminal_text_special | Terminal Text Special | Active |
| terminal_weather_graphics | Terminal Weather Graphics | Active |
| tornado | Tornado | Active |
| tornado_alert | Tornado Alert | Active |
| wind_profile | Wind Profile | Active |
| wind_shear_atis | Wind Shear ATIS | Active |

**Sample Data (2026-10-14 16:00:00):**
```
product_id | alert_type           | airport_id | latitude  | longitude  | severity | num_detections
-----------+----------------------+------------+-----------+------------+----------+---------------
9912       | storm_motion_tracon  | MIA        |           |            |          |
9850       | precipitation_tracon | MIA        | 26.072583 | -80.15275  |          |
9839       | tornado_alert        | FNT        |           |            |          |
```

**Key Observations:**
- product_id ranges from 9832-9912
- latitude/longitude often NULL
- airport_id present for many alerts
- tracon_id present for many alerts

---

## 7. Flight Plans Data

### 7.1 Flight plan data

| Object | Snapshot | Role |
|--------|----------|------|
| `flight_plans` | 0 rows | Materialized TFMS plan rollup — **not populated** in this environment |
| `tfms_flight_plan_assertions` | ~5.5M | Parsed TFMS plans (route, ETD, ETA, airports) |
| `sfdps_flight_plan_assertions` | ~1.4M | Parsed SFDPS plans |
| `v_sfdps_plan_details` | ~1.4M | SFDPS plan detail view |

**Key observations:**
- Empty `flight_plans` does **not** mean plans are missing from swimdb
- Agents should use **assertions** + `flight_instance_state` / `v_active_flights` for timing and routes

---

## 8. Data Quality Assessment

### 8.1 Data Completeness

| Table | Completeness | Notes |
|-------|--------------|-------|
| `flow_constraints` | High | 3,145 records with full data |
| `flow_constraint_flights` | High | 4.5M records with timing data |
| `tbfm_metering_assertions` | Medium | STA/ETA often NULL |
| `v_active_flights` | High | 26K records with full data |
| `sfdps_lifecycle_events` | High | 559K records with event data |
| `weather_alerts` | Medium | Coordinates often NULL |
| `flight_plans` (rollup) | N/A | Empty; use plan **assertions** instead |

### 8.2 Data Timeliness

| Table | Update Frequency | Notes |
|-------|------------------|-------|
| `flow_constraints` | Real-time | TFMS message frequency |
| `flow_constraint_flights` | Real-time | TFMS message frequency |
| `tbfm_metering_assertions` | Real-time | TBFM message frequency |
| `v_active_flights` | Real-time | Aggregated from sources |
| `sfdps_lifecycle_events` | Real-time | SFDPS message frequency |
| `weather_alerts` | Real-time | ITWS message frequency |

### 8.3 Data Accuracy

| Table | Accuracy | Notes |
|-------|----------|-------|
| `flow_constraints` | High | TFMS authoritative source |
| `flow_constraint_flights` | High | TFMS authoritative source |
| `tbfm_metering_assertions` | High | TBFM authoritative source |
| `v_active_flights` | Medium | Aggregated from multiple sources |
| `sfdps_lifecycle_events` | High | SFDPS authoritative source |
| `weather_alerts` | High | ITWS authoritative source |

---

## 9. Decision-Making Data Summary

### 9.1 High Confidence Data

| Decision Type | Data Source | Record Count | Notes |
|---------------|-------------|--------------|-------|
| Flow constraint impact | `flow_constraints` + `flow_constraint_flights` | 3,145 + 4.5M | Complete timing data |
| Departure delay | `sfdps_lifecycle_events` (DH events) | 559K | DH events with event_time |
| Weather proximity | `weather_alerts` | 1,180 | Limited by NULL coordinates |

### 9.2 Medium Confidence Data

| Decision Type | Data Source | Record Count | Notes |
|---------------|-------------|--------------|-------|
| GDP response | `flow_constraints` (GDP type) | ~tens of GDP rows | GDP is one of 15 TMI types |
| Arrival metering | `tbfm_metering_assertions` | ~10⁵/hr | STA/ETA runway fields often NULL |
| Sequence assessment | `v_departures` + `v_active_flights` | 26K | Limited historical data |

### 9.3 Low Confidence Data

| Decision Type | Data Source | Record Count | Notes |
|---------------|-------------|--------------|-------|
| Weather + flow overlap | `weather_alerts` + `flow_constraints` | 1,180 + 3,145 | Limited by NULL coordinates |
| Strategic planning | Multiple tables | Varies | Requires historical data |
| Policy recommendations | Multiple tables | Varies | Requires domain expertise |

---

## 10. Recommendations for AI Agent

### 10.1 Immediate Actions

1. **Use `v_active_flights` and plan assertion tables for timing** — `flight_plans` rollup is empty; see `DATA_MODEL.md` §3
2. **Filter weather alerts by airport_id** - coordinates often NULL
3. **Group flow constraints by TMI type** - focus on GDP, GS, RSTR for high-impact decisions
4. **Monitor constraint age** - use `last_updated_at` for release recommendations

### 10.2 Data Access Patterns

```sql
-- Flow constraints (active in last 4 hours)
SELECT * FROM swim.flow_constraints 
WHERE last_updated_at > NOW() - INTERVAL '4 hours';

-- Flights affected by constraints
SELECT f.*, c.control_element, c.tmi_type
FROM swim.flow_constraint_flights f
JOIN swim.flow_constraints c
  ON f.tmi_type = c.tmi_type AND f.control_element = c.control_element
WHERE f.received_at > NOW() - INTERVAL '4 hours';

-- Weather alerts with coordinates
SELECT * FROM swim.weather_alerts 
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND last_updated_at > NOW() - INTERVAL '1 hour';

-- Departure events (DH)
SELECT * FROM swim.sfdps_lifecycle_events 
WHERE lifecycle_event_type = 'DH'
  AND received_at > NOW() - INTERVAL '1 hour';
```

### 10.3 Decision Thresholds

| Decision Type | Threshold | Recommendation |
|---------------|-----------|----------------|
| Flow constraint delay | > 30 min | HIGH_PRIORITY_REROUTE |
| Flow constraint delay | > 15 min | CONSIDER_REROUTE |
| Flow constraint delay | > 5 min | MONITOR |
| GDP delay | > 20 min | SELECTIVE_REROUTE |
| GDP delay | > 45 min | AGGRESSIVE_REROUTE |
| Constraint age | > 2 hours | CONSIDER_RELEASE |

---

## 11. Conclusion

The FAA SIL POC swimdb provides substantial data for AI-driven decision-making in aviation operations. The key findings are:

1. **Traffic flow management data is comprehensive** - 3,145 flow constraints with 4.5M per-flight impacts
2. **Flight position data is current** - 26,711 active flights with full operational picture
3. **Weather alert data is available** - 1,180 alerts but limited by NULL coordinates
4. **Arrival metering data is limited** - STA/ETA fields often NULL
5. **`flight_plans` rollup is empty** — use `tfms_flight_plan_assertions` / `v_active_flights` for plan and timing fields

The AI agent should focus on high-confidence decisions based on flow constraints and lifecycle events, with medium-confidence decisions for GDP response and sequence assessment. Low-confidence decisions require additional data sources or external information.

---

*Data availability report generated: 2026-10-14*  
*Verified database schema and record counts on 2026-10-14*  
*For use in AI Agent Decision-Making research*
