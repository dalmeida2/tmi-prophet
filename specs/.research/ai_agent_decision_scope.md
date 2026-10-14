# AI Agent Decision Scope - Data-Driven Analysis

> **Status (2026-10-14): superseded framing.** The decisions below are FAA-side recommendations; the project now forecasts FAA decisions for airspace users. Table-level inference logic remains useful. See [README.md](./README.md) and [RESEARCH_LOG.md](./RESEARCH_LOG.md).

> **Canonical data model:** [DATA_MODEL.md](./DATA_MODEL.md). Record counts in §1 are 2026-10-14 snapshots; use §10 there to refresh.

## Executive Summary

This document defines the decision scope for an AI agent based on **actual data available** in the FAA SIL POC's swimdb. The scope is constrained to what can be reliably inferred from the data, with clear definitions of what is possible vs. what requires external information or assumptions.

---

## 1. Data Availability Summary

### 1.1 Core Data Tables

| Table | Purpose | Key Fields | Record Count | Data Type |
|-------|---------|------------|--------------|-----------|
| `flow_constraints` | TFMS flow information envelope | `tmi_type`, `control_element`, `source_facility`, `first_seen_at`, `last_updated_at` | ~3.1k snapshot | Current state |
| `flow_constraint_flights` | Per-flight TMI impacts | `tmi_type`, `control_element`, `gufi`, `callsign`, `entry_time`, `exit_time` | ~4.5M snapshot | Append-only; join on `tmi_type` + `control_element` |
| `tbfm_metering_assertions` | TBFM arrival metering | `data_group`, `sta_rwy`, `eta_rwy`, `etm`, `ctm`, `sta_frozen` | ~10⁵/hr | Append-only assertions |
| `tfms_flight_plan_assertions` | TFMS plan facts | `route`, `etd`, `eta`, airports | millions | Primary plan source |
| `v_active_flights` | Resolved flights (last hour) | Position + timing + status | ~27k snapshot | View over `v_resolved_flights` |
| `sfdps_lifecycle_events` | SFDPS lifecycle/state events | `lifecycle_event_type`, `event_time`, `edct`, `flight_status` | ~550k snapshot | Event history |
| `weather_alerts` | ITWS weather products | `product_id`, `alert_type`, `latitude`, `longitude`, `num_detections` | ~1.2k snapshot | Current state |

### 1.2 Key Time-Based Fields

| Field | Description | Source Tables | Notes |
|-------|-------------|---------------|-------|
| `event_time` | When event occurred | `sfdps_lifecycle_events` | DH events for departures |
| `entry_time` | Flight entry into constrained element | `flow_constraint_flights` | May equal exit_time for instant constraints |
| `exit_time` | Flight exit from constrained element | `flow_constraint_flights` | NULL for active constraints |
| `etd` | Estimated Time of Departure | `v_active_flights`, `tfms_flight_plan_assertions`, `flight_instance_state` | `flight_plans` rollup empty |
| `eta` | Estimated Time of Arrival | `v_active_flights`, `tfms_flight_plan_assertions`, `flight_instance_state` | `flight_plans` rollup empty |
| `edct` | Expected Departure Clearance Time | `v_active_flights`, `sfdps_lifecycle_events` | May be NULL |
| `metering_edct` | TBFM EDCT relay | `flight_instance_state`, `v_active_flights` | Not on `tbfm_metering_assertions`; use `etm`/`ctm` there |
| `sta_rwy` | Scheduled Time of Arrival at runway | `tbfm_metering_assertions`, `v_active_flights` | MRE (Mandatory Reporting Element) |
| `eta_rwy` | Estimated Time of Arrival at runway | `tbfm_metering_assertions` | May be NULL |
| `departure_time` | Actual departure time | `v_departures`, `sfdps_lifecycle_events` | From DH events |

### 1.3 TMI Types Available

| TMI Type | Description | Count | Notes |
|----------|-------------|-------|-------|
| APTC | Airport Terminal Change | Yes | Terminal changes |
| CMPR | Compression | Yes | Traffic compression |
| CTOP | Collaborative Traffic Management | Yes | Collaborative planning |
| FADT | Final Arrival Departure Time | Yes | Arrival/departure times |
| FXA | Fix Arrival | Yes | Fix-based arrivals |
| FXASF | Fix Arrival/Departure | Yes | Combined fix arrival/departure |
| GADV | Ground Delay/Gap and Insertion | Yes | Ground delay programs |
| GDP | Ground Delay Program | Yes | Standard GDP constraints |
| GS | Ground Stop | Yes | Complete ground stops |
| PARAM | Parameter Update | Yes | Parameter changes |
| RAPT | Runway Arrival Procedure | Yes | Runway-specific arrivals |
| REROUTE | Reroute | Yes | Route changes |
| RSTR | Restriction | Yes | Speed/altitude restrictions |
| TMI_FLIGHT_LIST | Flight List | Yes | Flight list updates |
| TMI_UPDATE | TMI Update | Yes | TMI updates |

---

## 2. Decision Scope by Category

### 2.1 Traffic Flow Management Decisions

#### Decision 2.1.1: Flow Constraint Impact Assessment
**Condition:** Flight affected by active flow constraint

**Data Required:**
- `flow_constraints` - constraint details (tmi_type, control_element, source_facility)
- `flow_constraint_flights` - per-flight impact (gufi, callsign, entry_time, exit_time)
- `v_active_flights` - current flight status (etd, eta, position)

**Inference Logic:**
1. Find flights in `flow_constraint_flights` with `control_element` matching active constraint
2. Calculate delay: `exit_time - entry_time` or `current_time - entry_time` (if exit_time is NULL)
3. Determine constraint type from `tmi_type` (GDP, GS, RSTR, etc.)
4. Calculate expected delay relative to flight's etd/eta

**Decision Output:**
- Constraint ID and type
- Flight ID and callsign
- Calculated delay in minutes
- Constraint source facility
- Recommendation: MONITOR, CONSIDER_REROUTE, HIGH_PRIORITY_REROUTE

**Limitations:**
- Cannot determine actual fuel impact without aircraft performance data
- Cannot determine alternative routes without route planning data
- Delay calculation assumes constraint is still active
- entry_time may equal exit_time for instant constraints (no delay)

---

#### Decision 2.1.2: Ground Delay Program (GDP) Response
**Condition:** GDP active at destination airport with significant delays

**Data Required:**
- `flow_constraints` where `tmi_type = 'GDP'`
- `flow_constraint_flights` for affected flights
- `v_active_flights` for flight status

**Inference Logic:**
1. Find active GDP constraints at destination airport
2. Get flights affected by GDP from `flow_constraint_flights`
3. Calculate delay: `entry_time - etd` or `exit_time - eta`
4. Group flights by destination airport
5. Calculate average delay per airport

**Decision Output:**
- GDP constraint ID and airport
- List of affected flights
- Average delay for group
- Recommendation: ACCEPT_GDP, SELECTIVE_REROUTE, AGGRESSIVE_REROUTE

**Limitations:**
- Cannot determine if alternative airports are available
- Cannot determine if flights can be combined for efficiency
- Delay calculation may be incomplete if flights haven't entered constraint yet
- GDP data may be sparse (only one TMI type)

---

#### Decision 2.1.3: Flow Constraint Release Recommendation
**Condition:** Flow constraint conditions may have improved

**Data Required:**
- `flow_constraints` - constraint status and age
- `v_active_flow_constraints` - active constraints view

**Inference Logic:**
1. Find constraints older than threshold (e.g., 2 hours)
2. Check if constraint has been updated recently
3. Calculate constraint duration: `last_updated_at - first_seen_at`
4. Compare to typical constraint duration for same constraint type

**Decision Output:**
- Constraint ID and type
- Constraint age in hours
- Last update time
- Recommendation: MAINTAIN, MONITOR, CONSIDER_RELEASE

**Limitations:**
- Cannot determine actual traffic conditions at constrained element
- Cannot determine if constraint should be expanded or modified
- No visibility into upstream demand changes
- No historical duration data for comparison

---

#### Decision 2.1.4: Arrival Metering Status Assessment
**Condition:** Arrival metering at busy airport

**Data Required:**
- `tbfm_metering_assertions` where `data_group IN ('sta', 'sch', 'mrp')`
- `v_active_flights` for current flight status

**Inference Logic:**
1. Find flights approaching arrival airport with STA/ETA data
2. Compare `eta_rwy` vs `sta_rwy` to calculate delay
3. Check `sta_frozen` flag for committed vs advisory STA
4. Group by arrival airport and time window

**Decision Output:**
- Flight ID and callsign
- Arrival airport
- Scheduled arrival (sta_rwy)
- Estimated arrival (eta_rwy)
- Delay in minutes
- STA status (frozen/advisory)
- Recommendation: ON_SCHEDULE, MONITOR, REVIEW_STA, METERING_REQUIRED

**Limitations:**
- Cannot determine runway configuration changes
- Cannot determine if metering fix is congested
- No visibility into approach sequence changes
- STA/ETA fields often NULL in current data

---

### 2.2 Departure Management Decisions

#### Decision 2.2.1: Departure Delay Assessment
**Condition:** Flight departure delayed beyond expected

**Data Required:**
- `sfdps_lifecycle_events` where `lifecycle_event_type = 'DH'` (departure)
- `v_active_flights` for original ETD
- `v_departures` for actual departure time

**Inference Logic:**
1. Find departure event (DH) for flight
2. Compare `event_time` (actual departure) vs `etd` (expected departure)
3. Calculate delay: `event_time - etd`

**Decision Output:**
- Flight ID and callsign
- Expected departure time
- Actual departure time
- Delay in minutes
- Departure airport and runway
- Recommendation: ON_TIME, MINOR_DELAY, MAJOR_DELAY, SIGNIFICANT_DELAY

**Limitations:**
- Cannot determine cause of delay (gate, taxi, ATC, weather)
- Cannot determine if delay affects connecting flights
- No visibility into gate availability
- ETD may be missing on a given flight in views; TFMS plan assertions often carry ETD

---

#### Decision 2.2.2: Departure Sequence Assessment
**Condition:** Departure sequence at airport

**Data Required:**
- `v_departures` - recent departures
- `sfdps_lifecycle_events` - departure events (DH)

**Inference Logic:**
1. Get departures from last N minutes
2. Calculate departure rate: count / time window
3. Compare to historical departure rate for airport

**Decision Output:**
- Airport ID
- Departure count in time window
- Calculated departure rate (flights/hour)
- Historical departure rate
- Recommendation: NORMAL, MODERATE_DELAY, HEAVY_DELAY

**Limitations:**
- Cannot determine cause of delay (runway, gate, ATC)
- Cannot determine if sequence can be optimized
- No visibility into arrival traffic impact
- Historical rates not available in current schema

---

### 2.3 Arrival Management Decisions

#### Decision 2.3.1: Arrival Delay Assessment
**Condition:** Flight arrival delayed beyond expected

**Data Required:**
- `v_active_flights` - current ETA
- `v_flight_history` - arrival events

**Inference Logic:**
1. Get current ETA from `v_active_flights`
2. Compare to original ETA (if available)
3. Calculate delay: `current_eta - original_eta`

**Decision Output:**
- Flight ID and callsign
- Original ETA
- Current ETA
- Delay in minutes
- Destination airport
- Recommendation: ON_TIME, MINOR_DELAY, MAJOR_DELAY, SIGNIFICANT_DELAY

**Limitations:**
- Cannot determine cause of delay (weather, traffic, ATC)
- Cannot determine if delay affects ground operations
- No visibility into approach sequence
- Original ETA may not be available

---

#### Decision 2.3.2: Arrival Sequence Assessment
**Condition:** Arrival sequence at airport

**Data Required:**
- `v_active_flights` - approaching flights
- `v_flight_history` - arrival events

**Inference Logic:**
1. Get flights approaching destination airport
2. Group by estimated arrival time windows
3. Calculate arrival rate in each window

**Decision Output:**
- Airport ID
- Arrival count in time window
- Calculated arrival rate (flights/hour)
- Estimated sequence order
- Recommendation: NORMAL, MODERATE_DELAY, HEAVY_DELAY

**Limitations:**
- Cannot determine runway configuration
- Cannot determine if sequence can be optimized
- No visibility into departure traffic impact
- No historical rates available

---

### 2.4 Weather Impact Decisions

#### Decision 2.4.1: Weather Alert Proximity
**Condition:** Weather alert near active flight

**Data Required:**
- `weather_alerts` - weather alerts with coordinates
- `v_active_flights` - flight positions

**Inference Logic:**
1. Calculate distance between weather alert and flight position
2. Check if flight is in affected phase (approach, departure, en-route)
3. Determine weather type severity from alert_type

**Decision Output:**
- Weather alert ID and type
- Flight ID and callsign
- Distance in nautical miles
- Flight operational phase
- Recommendation: NO_ACTION, MONITOR, CONSIDER_REROUTE, IMMEDIATE_REROUTE

**Limitations:**
- Cannot determine actual weather conditions at flight position
- Cannot determine if reroute is feasible
- No visibility into weather evolution
- Weather alert coordinates may be NULL

---

#### Decision 2.4.2: Weather + Flow Constraint Overlap
**Condition:** Weather alert coincides with flow constraint

**Data Required:**
- `weather_alerts` - weather alerts
- `flow_constraints` - flow constraints
- `flow_constraint_flights` - affected flights

**Inference Logic:**
1. Find weather alerts near flow constraint areas
2. Check if constrained flights are in weather-affected zone
3. Calculate combined impact

**Decision Output:**
- Weather alert ID and type
- Flow constraint ID and type
- Affected flights
- Combined delay estimate
- Recommendation: NORMAL_MONITORING, MONITOR_CLOSELY, ESCALATE_PRIORITY

**Limitations:**
- Cannot determine if weather caused constraint
- Cannot determine if constraint should be modified
- No visibility into weather evolution
- Spatial analysis requires coordinate data

---

## 3. Decision Types

### 3.1 Automated Decisions (No Human Intervention)
- Alert notifications
- Monitoring recommendations
- Status updates

### 3.2 Semi-Automated Decisions (Human Approval Required)
- Reroute recommendations
- Constraint release recommendations
- Delay response recommendations

### 3.3 Advisory Decisions (Human Decision-Maker)
- Strategic planning inputs
- Capacity adjustment recommendations
- Policy recommendations

---

## 4. Data Gaps and Limitations

### 4.1 Missing Data
- Aircraft performance data (fuel burn, speed profiles)
- Airport gate and runway configuration
- Weather evolution forecasts
- Pilot intentions and capabilities
- Airline operational preferences
- Historical throughput data for rate comparisons

### 4.2 Data Latency
- Flow constraint updates: depends on TFMS message frequency
- Flight position updates: depends on producer message frequency
- Weather alerts: ITWS update frequency

### 4.3 Data Quality
- Flight identity resolution may have multiple candidates
- Position accuracy varies by source (SFDPS vs TFMS vs STDDS)
- Timing fields may be estimated or actual
- Many timing fields (etd, eta, sta_rwy, eta_rwy) often NULL

---

## 5. Decision Scope Summary

### 5.1 High Confidence Decisions
1. Flow constraint impact assessment (delay calculation)
2. Departure/arrival delay assessment (if timing data available)
3. Weather alert proximity (if coordinates available)
4. Flow constraint release recommendation (based on age)

### 5.2 Medium Confidence Decisions
1. GDP response (requires flight grouping)
2. Arrival metering status (requires STA comparison)
3. Departure/arrival sequence assessment (requires rate calculation)

### 5.3 Low Confidence Decisions
1. Combined weather + flow constraint impact (requires complex analysis)
2. Strategic planning inputs (requires external data)
3. Policy recommendations (requires domain expertise)

---

## 6. Next Steps

1. **Define decision thresholds** - What delay values trigger which recommendations?
2. **Design decision schema** - How will decisions be represented and stored?
3. **Build prototype** - Start with one high-confidence use case
4. **Test with historical data** - Validate decision logic
5. **Human-in-the-loop testing** - Get feedback on decision quality

---

*Decision scope document generated: 2026-10-14*  
*Based on actual data available in FAA SIL POC swimdb*  
*Verified database schema and record counts on 2026-10-14*
