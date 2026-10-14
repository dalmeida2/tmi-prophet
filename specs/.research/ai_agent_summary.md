# AI Agent for Aviation Decision-Making - Summary

> **Canonical data model:** [DATA_MODEL.md](./DATA_MODEL.md). This summary keeps narrative and use cases; table roles and ingest rates are defined there.
>
> **Direction update (2026-10-14):** SWIM SCDS is a one-way outflow of FAA decisions, so the product focus has moved from FAA-side decision support to the **airspace user / dispatcher** perspective: anticipating TMIs before the FAA issues them. See [airspace_user_tmi_anticipation.md](./airspace_user_tmi_anticipation.md).

## What We've Researched

This research explores how an AI agent can leverage the FAA SIL POC's data infrastructure to enable intelligent, condition-based decision-making for aviation operations, with emphasis on **traffic flow management** and **demand/capacity** decisions.

---

## Key Findings

### 1. Data Infrastructure

**swimdb (PostgreSQL)**
- Database `swim_data`, schema `swim` — **38 tables + 24 views** (62 relations)
- Pipeline: `*_messages` → `*_assertions` → state tables → `v_*` views — see [DATA_MODEL.md](./DATA_MODEL.md)
- Key surfaces: flow constraints, plan assertions, metering assertions, weather alerts, resolved flights

**Neo4j Graph Database**
- AIRM ontology (`AirmConcept` / `AirmProperty`) plus catalog mirror nodes
- Verified 2026-10-14: 6,660 concepts, 6,942 properties; `rdfs__*` relationship counts in DATA_MODEL §8
- Purpose: Aeronautical information model reference and OM linkage

**OpenMetadata**
- In-cluster OM 1.13.1; SWIM glossaries and table/topic catalog
- Refresh glossary/topic counts via OM UI or API (JWT); not re-queried during 2026-10-14 doc refresh

### 2. Traffic Flow Management Data

**Primary Tables (Verified 2026-10-14):**

| Table | Purpose | Record Count | Notes |
|-------|---------|--------------|-------|
| `flow_constraints` | TFMS flow information envelope | 3,145 | Active and historical constraints |
| `flow_constraint_flights` | Per-flight TMI impacts | ~4.5M (snapshot) | Append-only, partitioned |
| `tbfm_metering_assertions` | TBFM arrival metering | ~10⁵/hr | Partitioned assertions |
| `v_active_flights` | Current flight positions | ~27k (snapshot) | Active in last hour |

**Key TMI Types (15 observed):**
- **APTC** - Airport Terminal Change
- **CMPR** - Compression
- **CTOP** - Collaborative Traffic Management
- **FADT** - Final Arrival Departure Time
- **FXA** - Fix Arrival
- **FXASF** - Fix Arrival/Departure
- **GADV** - Ground Delay/Gap and Insertion
- **GDP** - Ground Delay Program
- **GS** - Ground Stop
- **PARAM** - Parameter Update
- **RAPT** - Runway Arrival Procedure
- **REROUTE** - Reroute
- **RSTR** - Restriction
- **TMI_FLIGHT_LIST** - Flight List
- **TMI_UPDATE** - TMI Update

### 3. Flight Data

**Key Tables:**
- `v_active_flights` - Current flight positions (active in last hour; count drifts)
- `flight_instances` - Resolved flight identity
- `tfms_flight_plan_assertions` / `sfdps_flight_plan_assertions` - parsed plan data (millions of rows)
- `flight_plans` - TFMS plan **rollup** - **0 rows** (use assertions + views instead)
- `flight_events` - Flight lifecycle events
- `flight_tracks` - Latest position from various sources

**Key Fields:**
- `flight_instance_id` - Unique flight identifier
- `latitude`, `longitude`, `altitude` - Position
- `flight_status` - Current status (ACTIVE, COMPLETED, etc.)
- `operational_phase` - Flight phase (EN_ROUTE, APPROACH, etc.)
- `edct` - National assigned departure slot
- `metering_edct` - TBFM EDCT relay
- `sta_rwy` - Scheduled time of arrival at runway threshold

**Important Notes:**
- `flight_plans` rollup is empty — use plan assertions and `v_active_flights` for ETD/ETA
- `tbfm_metering_assertions` has STA/ETA fields but often NULL

### 4. Weather Data

**Primary Table:** `weather_alerts`
- ITWS (Integrated Terminal Weather System) products
- 13+ product types (9832-9912 range)
- Key fields: `product_id`, `alert_type`, `latitude`, `longitude`, `num_detections`
- Coverage: Microbursts, gust fronts, tornadoes, lightning, wind shear

---

## AI Agent Decision Scope

### High Confidence Decisions (Data-Driven)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| Flow constraint impact assessment | `flow_constraints`, `flow_constraint_flights`, `v_active_flights` | Calculate delay from `entry_time`/`exit_time` | Cannot determine fuel impact without aircraft performance data |
| Departure/arrival delay assessment | `sfdps_lifecycle_events`, `v_active_flights`, `v_departures`, plan assertions | Compare actual vs expected times | `flight_plans` rollup empty |
| Weather alert proximity | `weather_alerts`, `v_active_flights` | Calculate distance between alert and flight | Coordinates often NULL, limited spatial analysis |
| Flow constraint release recommendation | `flow_constraints`, `v_active_flow_constraints` | Monitor constraint age and duration | No visibility into upstream demand changes |

### Medium Confidence Decisions (Requires Grouping)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| GDP response | `flow_constraints`, `flow_constraint_flights`, `v_active_flights` | Group flights by destination, calculate average delay | Cannot determine alternative airports |
| Arrival metering status | `tbfm_metering_assertions`, `v_active_flights` | Compare `eta_rwy` vs `sta_rwy` | STA/ETA fields often NULL, limited data |
| Departure/arrival sequence assessment | `v_departures`, `v_active_flights` | Calculate rate in time windows | Cannot determine sequence optimization |

### Low Confidence Decisions (Requires External Data)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| Combined weather + flow constraint impact | `weather_alerts`, `flow_constraints`, `flow_constraint_flights` | Find overlap between weather and constraints | Cannot determine if weather caused constraint |
| Strategic planning inputs | Multiple tables + historical data | Aggregate patterns over time | Requires domain expertise and external data |
| Policy recommendations | Multiple tables + policy rules | Apply policy rules to data | Requires domain expertise |

### Decision Types

| Type | Human Intervention | Examples |
|------|-------------------|----------|
| **Automated** | None | Alert notifications, monitoring recommendations, status updates |
| **Semi-Automated** | Approval required | Reroute recommendations, constraint release recommendations |
| **Advisory** | Human decision-maker | Strategic planning inputs, capacity adjustment recommendations |

---

## AI Agent Use Cases

### Use Case 1: Flow Constraint Impact Analysis

**Condition:** Flight affected by active flow constraint

**Data Sources:**
- `flow_constraints` (active constraints) - 3,145 records
- `flow_constraint_flights` (per-flight impacts) - 4.5M records
- `v_active_flights` (current flight positions)

**Decision Logic:**
1. Identify active flow constraints (APTC, GDP, GS, etc.)
2. Find flights affected by each constraint
3. Calculate delay impact: `exit_time - entry_time` or `current_time - entry_time`
4. If delay exceeds threshold, recommend rerouting or alternative action

**Output:** Decision with recommendation, confidence score, and reasoning

**Important Notes:**
- entry_time may equal exit_time for instant constraints (no delay)
- Use v_active_flights and plan assertions for ETD/ETA

---

### Use Case 2: Ground Delay Program (GDP) Response

**Condition:** GDP active at destination airport with significant delays

**Data Sources:**
- `flow_constraints` where `tmi_type = 'GDP'` (tens of rows; not all 3k+ constraints are GDP)
- `flow_constraint_flights` (affected flights) - 4.5M records
- `v_active_flights` (flight status)

**Decision Logic:**
1. Identify GDP constraints at destination airport
2. Get delay information from `entry_time`
3. For flights with delay > threshold:
   - Check if alternative airports available
   - Recommend holding or rerouting
   - Calculate fuel impact of delay

**Output:** Advisory decision for human review

**Important Notes:**
- GDP is one of 15 TMI types observed in flow_constraints
- Use v_active_flights and plan assertions for ETD/ETA

---

### Use Case 3: Flow Constraint Release Decision

**Condition:** Flow constraint conditions improve

**Data Sources:**
- `flow_constraints` (constraint status)
- `v_active_flow_constraints` (active constraints)
- Historical constraint duration data

**Decision Logic:**
1. Monitor constraint age and duration
2. Check if constraint conditions have improved
3. If delay reduction > threshold, recommend constraint release
4. Calculate capacity increase from release

**Output:** Semi-automated decision requiring human approval

---

### Use Case 4: Arrival Metering Decision Support

**Condition:** Arrival metering needed at busy airport

**Data Sources:**
- `tbfm_metering_assertions` (arrival STA) - ~10⁵/hr
- `v_active_flights` (current flight positions)

**Decision Logic:**
1. Identify flights approaching arrival airport
2. Check `sta_rwy` (scheduled arrival time)
3. Compare `eta_rwy` (estimated arrival) vs `sta_rwy`
4. If estimated arrival > scheduled, recommend metering adjustment

**Output:** Automated decision with monitoring

**Important Notes:**
- STA/ETA fields in tbfm_metering_assertions are often NULL
- Limited data available for arrival metering decisions

---

### Use Case 5: Combined Weather + Flow Constraint Analysis

**Condition:** Weather alert coincides with flow constraint

**Data Sources:**
- `weather_alerts` (weather conditions)
- `flow_constraints` (flow constraints)
- `v_active_flights` (flight positions)

**Decision Logic:**
1. Identify weather alerts near constrained areas
2. Check if constrained flights are in affected zone
3. If overlap detected, escalate to higher priority
4. Recommend combined weather/flow response

**Output:** Escalated decision with higher priority

---

### Use Case 6: Airport Capacity Monitoring

**Condition:** Airport demand approaching capacity

**Data Sources:**
- `v_active_flights` (active traffic)
- `flow_constraints` (arrival/departure constraints)
- Historical throughput data

**Decision Logic:**
1. Count active flights at airport (arrival + departure)
2. Compare to historical capacity metrics
3. If demand > 80% capacity, trigger monitoring
4. If demand > 95% capacity, recommend flow constraints

**Output:** Advisory decision for human review

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Decision     │  │ Condition    │  │ Reasoning    │          │
│  │ Engine       │  │ Detector     │  │ Engine       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼───────┐  ┌────────▼────────┐  ┌─────▼───────┐
│   swimdb      │  │   Neo4j         │  │ OpenMetadata│
│   (PostgreSQL)│  │   (Graph)       │  │   (Catalog) │
└───────────────┘  └─────────────────┘  └───────────────┘
```

---

## Implementation Approach

### 1. Data Access Layer

```python
# Connect to swimdb
db = connect_to_swimdb("postgresql://swim:***@swim-db:5432/swim_data")

# Query flow constraints
constraints = db.query("""
    SELECT * FROM swim.flow_constraints 
    WHERE last_updated_at > NOW() - INTERVAL '4 hours'
""")

# Query flights affected by constraints
affected_flights = db.query("""
    SELECT f.*, c.control_element, c.tmi_type
    FROM swim.flow_constraint_flights f
    JOIN swim.flow_constraints c
      ON f.tmi_type = c.tmi_type AND f.control_element = c.control_element
    WHERE f.received_at > NOW() - INTERVAL '4 hours'
""")

# Query active flights
flights = db.query("""
    SELECT flight_instance_id, latitude, longitude, 
           operational_phase, flight_status, edct, eta
    FROM swim.v_active_flights
    WHERE flight_status = 'ACTIVE'
""")
```

### 2. Condition Detection

```python
def detect_flow_constraints():
    constraints = get_active_flow_constraints(hours=4)
    for constraint in constraints:
        affected = get_flights_affected_by_constraint(constraint.control_element)
        for flight in affected:
            delay = calculate_delay(flight.entry_time, flight.exit_time)
            if delay > threshold:
                yield create_decision(constraint, flight, delay)
```

### 3. Decision Engine

```python
def make_decision(condition, data):
    if condition == 'flow_constraint_impact':
        if data['delay'] > 30:
            return {'recommendation': 'HIGH_PRIORITY_REROUTE', 'confidence': 0.85}
        elif data['delay'] > 15:
            return {'recommendation': 'CONSIDER_REROUTE', 'confidence': 0.75}
    return {'recommendation': 'NO_ACTION', 'confidence': 0.9}
```

### 4. Storage

```python
# Proposed application table (not present in swim schema today)
db.execute("""
    CREATE TABLE decision_log (
        id TEXT PRIMARY KEY,
        decision_type TEXT,
        condition TEXT,
        recommendation TEXT,
        confidence FLOAT,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
    )
""")
```

---

## Decision Types

| Type | Human Intervention | Examples |
|------|-------------------|----------|
| **Automated** | None | Alert notifications, queue management |
| **Semi-Automated** | Approval required | Route changes, flow constraint release |
| **Advisory** | Human decision | Strategic planning, capacity adjustments |

---

## Next Steps

### Immediate (Week 1-2)
1. Define specific decision scope
2. Design decision schema and storage
3. Build prototype data access layer

### Short-term (Week 3-4)
1. Implement condition detection
2. Build decision rules engine
3. Test with historical data

### Medium-term (Month 2)
1. Deploy to staging environment
2. Human-in-the-loop testing
3. Performance optimization

### Long-term (Month 3+)
1. Production deployment
2. Continuous monitoring
3. Expand to additional use cases

---

## Technical Considerations

### Performance
- **Polling interval:** 30-60 seconds for near real-time
- **Caching:** Cache active flow constraints and flights
- **Indexing:** Ensure proper indexes on spatial queries

### Safety
- **Fail-safe defaults:** When in doubt, recommend caution
- **Decision traceability:** Log all inputs and reasoning
- **Human override:** Always allow human override
- **Redundancy:** Multiple data sources for critical decisions

### Monitoring
- **Metrics:** Decision rate, confidence scores, latency
- **Alerts:** High-latency decisions, low-confidence decisions
- **Logging:** Complete decision history with full context

---

## Conclusion

The FAA SIL POC has a rich data infrastructure suitable for AI-driven decision-making. The swimdb provides structured aviation data including:

1. **Traffic flow management** - 3,145 flow constraints with 15 TMI types, 4.5M per-flight impacts
2. **Arrival metering** - ~10⁵ TBFM metering assertions per hour (runway STA/ETA often NULL)
3. **Weather alerts** - 1,180 ITWS products with geolocation (coordinates often NULL)
4. **Flight positions** - tens of thousands of active flights in the last hour (`v_active_flights`)

**Important Data Limitations:**
- `flight_plans` rollup is empty — use plan assertions and `v_active_flights` for ETD/ETA
- `tbfm_metering_assertions` STA/ETA fields often NULL - limited metering data
- `weather_alerts` coordinates often NULL - limited spatial analysis

An AI agent can leverage this infrastructure to:
1. **Detect conditions** - Identify flow constraints, metering needs, weather impacts
2. **Make decisions** - Apply rules and generate recommendations
3. **Store outcomes** - Log decisions for audit and learning
4. **Enable automation** - Trigger actions based on decisions

The research documents provide detailed technical guidance for implementation, including:
- Data access patterns for flow constraints and metering
- Decision engine design for traffic flow management
- Testing strategies for condition detection
- Deployment considerations for production use

---

*Summary generated: 2026-10-14*  
*Research for: AI Agent Decision-Making in FAA SIL POC*  
*Verified database schema and record counts on 2026-10-14*
