# AI Agent for Aviation Decision-Making Research

> **Status (2026-10-14): superseded framing.** This document describes FAA-side decision support. The project now takes the airspace-user perspective and forecasts FAA decisions; see [README.md](./README.md) and [RESEARCH_LOG.md](./RESEARCH_LOG.md). System and table research here remains valid.

> **Canonical data model:** [DATA_MODEL.md](./DATA_MODEL.md) — pipeline layers, plan assertions vs `flight_plans`, and verification commands. Neo4j/OpenMetadata figures in §1 were re-checked 2026-10-14 where noted.

## Executive Summary

This document explores how an AI agent can leverage the FAA SIL POC's swimdb (PostgreSQL) and Neo4j graph database to enable intelligent decision-making based on aviation conditions. The research identifies key data sources, relationships, and potential use cases for condition-based decision automation.

---

## 1. System Overview

### 1.1 swimdb (PostgreSQL)
**Kubernetes service:** `swim-db:5432` (namespace: `faa-sil-poc-dev`, pod `swim-db-0`)  
**Database / schema:** `swim_data` / `swim` (38 base tables + 24 views = 62 relations)  
**Purpose:** JMS consumer landing database for SWIM messages with JSONB payloads, assertion tables, state tables, and agent views — see [DATA_MODEL.md](./DATA_MODEL.md)

### 1.2 Neo4j Graph Database
**Purpose:** AIRM ontology and catalog mirror (labels include `AirmConcept`, `AirmProperty`, plus OpenMetadata-linked `Table` / `Topic` nodes).

**Verified 2026-10-14 (in-cluster cypher-shell):**
- `AirmConcept` nodes: **6,660**
- `AirmProperty` nodes: **6,942**
- `rdfs__subClassOf`: **3,671** | `rdfs__subPropertyOf`: **6,790**
- `rdfs__domain` / `rdfs__range`: **2,248** each

*(Earlier drafts cited ~2,560 “classes”; current graph has more `AirmConcept` nodes.)*

### 1.3 OpenMetadata
**Purpose:** Metadata catalog for swimdb tables, Neo4j AIRM ontology, and glossary terms (SWIM_* glossaries, messaging topics).

**In-cluster version:** OpenMetadata **1.13.1** (`openmetadata` service). Exact glossary/topic counts change with ingestion—refresh via OM UI or API with a valid ingestion-bot JWT (`OPENMETADATA_JWT_TOKEN`). OpenMetadata MCP was not authenticated from the local agent harness during the 2026-10-14 doc refresh.

---

## 2. Aviation Data in swimdb

### 2.1 Traffic Flow Management Data

#### Flow Constraints (`flow_constraints` table)
**Purpose:** Current TFMS flow-information envelope state (Phase C: `flow_constraint_assertions`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `tmi_type` | TEXT | TFMS flow message type (APTC, GADV, GDP, RAPT, REROUTE, RSTR, TMI_UPDATE, FXA, GS, AFP, CTOP, MIT) |
| `control_element` | TEXT | Flow-control identifier (airport, fix, FCA/FXA, advisory number, reroute name, restriction/MIT number, route, airway) |
| `source_facility` | TEXT | Facility that issued the TMI (ATCSCC or ARTCC) |
| `visibility` | TEXT | TMI visibility domain (who can see this constraint) |
| `first_seen_at` | TIMESTAMP | When constraint was first received |
| `last_updated_at` | TIMESTAMP | Last update timestamp |
| `details` | JSONB | Full TMI payload |

**Key TMI Types:**
- **APTC** - Airport Terminal Change
- **GADV** - Ground Delay/Gap and Insertion
- **GDP** - Ground Delay Program
- **RAPT** - Runway Arrival Procedure
- **REROUTE** - Reroute
- **RSTR** - Restriction
- **FXA** - Fix Arrival
- **GS** - Ground Stop
- **AFP** - Arrival Flow Program
- **CTOP** - Collaborative Traffic Management
- **MIT** - Mile-in-Trail

#### Flow Constraint Flights (`flow_constraint_flights` table)
**Purpose:** Append-only per-flight TFMS TMI impacts (Phase C: `flow_constraint_flight_impacts`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `tmi_type` | TEXT | TFMS TMI message type |
| `control_element` | TEXT | FCA, airport, fix, or other controlled element |
| `source_facility` | TEXT | Issuing facility |
| `gufi` | TEXT | TFMS per-flight flow-impact GUFI |
| `callsign` | TEXT | Aircraft callsign |
| `departure_airport` | TEXT | Departure airport |
| `destination_airport` | TEXT | Destination airport |
| `entry_time` | TIMESTAMP | Flight entry time into constrained element |
| `exit_time` | TIMESTAMP | Flight exit time from constrained element |
| `tmi_fca_id` | TEXT | Nested FCA identifier from per-flight TMI payload |
| `details` | JSONB | Compact lineage JSONB for landing message |

#### TBFM Metering Assertions (`tbfm_metering_assertions` table)
**Purpose:** TBFM MIS air metering assertions (W5.1)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `data_group` | TEXT | JMS DATA_GROUP (flt, eta, sta, sch, mrp) |
| `tbfm_gufi` | TEXT | TBFM flight identifier |
| `callsign` | TEXT | Aircraft callsign |
| `arrival_airport` | TEXT | Arrival airport |
| `departure_airport` | TEXT | Departure airport |
| `trw` | TEXT | TRACON-assigned runway |
| `meter_fix` | TEXT | Meter fix name |
| `etm` | TIMESTAMP | Expected Departure Clearance Time (EDCT) from Host/TFMS |
| `ctm` | TIMESTAMP | Coordination time from upstream Center |
| `eta_rwy` | TIMESTAMP | Estimated time of arrival at runway threshold |
| `sta_rwy` | TIMESTAMP | Scheduled time of arrival at runway threshold (MRE) |
| `sta_frozen` | BOOLEAN | STA is frozen/committed (YES/NO) |

#### Flight Instance State (`flight_instance_state` table)
**Purpose:** Current unified operational picture for resolved flight instances

| Column | Type | Description |
|--------|------|-------------|
| `flight_instance_id` | TEXT | Unique flight instance identifier |
| `callsign` | TEXT | Aircraft callsign |
| `departure_airport` | TEXT | Departure airport |
| `destination_airport` | TEXT | Destination airport |
| `latitude`, `longitude`, `altitude` | DOUBLE | Current position |
| `flight_status` | TEXT | Current status (ACTIVE, COMPLETED, etc.) |
| `operational_phase` | TEXT | Flight phase (EN_ROUTE, APPROACH, etc.) |
| `etd` | TIMESTAMP | Estimated time of departure |
| `eta` | TIMESTAMP | Estimated time of arrival |
| `edct` | TIMESTAMP | National assigned departure slot |
| `metering_edct` | TIMESTAMP | TBFM EDCT relay (not arrival STA) |
| `sta_o4a`, `sta_o3a`, `sta_ooa`, `sta_oma`, `sta_dfx`, `sta_sfx`, `sta_rwy` | TIMESTAMP | Scheduled times at various points |
| `sta_frozen` | BOOLEAN | STA is frozen/committed |

### 2.2 Weather Alert Data (`weather_alerts` table)

| Column | Type | Description |
|--------|------|-------------|
| `product_id` | TEXT | ITWS product identifier (9832-9912 range) |
| `tracon_id` | TEXT | TRACON facility ID |
| `airport_id` | TEXT | FAA 3-letter site identifier |
| `alert_type` | TEXT | Weather category (microburst, gustfront, etc.) |
| `latitude` | DOUBLE | Weather event origin (decimal degrees when present) |
| `longitude` | DOUBLE | Weather event origin (decimal degrees when present) |
| `num_detections` | INT | Number of individual detections |
| `first_seen_at` | TIMESTAMP | When alert was first received |
| `last_updated_at` | TIMESTAMP | Last update timestamp |
| `details` | JSONB | Full ITWS payload |

**Key Weather Product IDs:**
- 9832: Microburst TRACON Map
- 9833: Gust Front TRACON Map
- 9834: Gust Front ETI (Estimated Time of Impact)
- 9837: Wind Profile
- 9838: Tornado Detections
- 9839: Tornado Alert
- 9840: Configured Alerts (MBA-WSA)
- 9843: Terminal Weather Graphics
- 9844: Terminal Text Normal
- 9845: Airport Lightning Warning
- 9894: Wind Shear ATIS
- 9895: Terminal Text Special
- 9902: Forecast Accuracy
- 9911/9912: Storm Motion products

### 2.3 Flight Data Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `flight_instances` | Resolved flight identity (table) | `flight_instance_id`, `best_tfms_gufi`, `best_sfdps_gufi`, `lifecycle_status` |
| `flight_instance_state` | Current unified operational picture (table) | `callsign`, position, `flight_status`, `etd`, `eta`, `edct`, `metering_edct`, `sta_*` |
| `v_resolved_flights` | JOIN instances + state (view) | Base for agent flight views |
| `flights` / `v_active_flights` | Resolved flights; active = last 1h (views) | Filtered operational picture |
| `tfms_flight_plan_assertions` | TFMS plan facts (table) | `route`, `etd`, `eta`, airports — **primary plan source** |
| `sfdps_flight_plan_assertions` | SFDPS plan facts (table) | Plan fields from SFDPS |
| `flight_plans` | TFMS plan rollup (table) | **Empty in this env** — do not use as primary plan source |
| `flight_events` | TBFM/TDES lifecycle facts (table) | `event_type`, `event_time`, `airport_id` |
| `flight_tracks` | Latest track table | **Unused (0 rows)** — position via `flight_instance_state` |
| `v_flight_history` | Chronological event log per flight (view) | `event_type`, `event_time` |

### 2.4 Reference Data

| Table | Purpose |
|-------|---------|
| `airport_locations` | US airport coordinates for proximity queries |
| `airports` | Current DATIS/airport operational context |

---

## 2.5 Data Availability Verification (2026-10-14)

This section documents the actual data available in swimdb as verified on 2026-10-14.

### 2.5.1 Table Record Counts

| Table | Record Count | Notes |
|-------|--------------|-------|
| `flow_constraints` | ~3.1k | Current-state constraints (snapshot) |
| `flow_constraint_flights` | ~4.5M | Append-only; 49 partitions on `received_at` |
| `tbfm_metering_assertions` | ~10⁵/hr | Assertion rate; 49 partitions |
| `v_active_flights` | ~27k | Active in last hour (view) |
| `sfdps_lifecycle_events` | ~550k | Lifecycle events (partitioned) |
| `weather_alerts` | ~1.2k | Current/recent alerts |
| `flight_plans` | 0 | Rollup empty — use `*_flight_plan_assertions` |

### 2.5.2 TMI Types Observed

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

### 2.5.3 Key Field Observations

| Field | Observation | Impact on Decisions |
|-------|-------------|---------------------|
| `flight_plans` rollup | 0 rows | Use `tfms_flight_plan_assertions` + `v_active_flights` for ETD/ETA |
| `etd` / `eta` in `v_active_flights` | Available | Departure/arrival estimates for active resolved flights |
| `etd` / `eta` in `tfms_flight_plan_assertions` | High fill in recent windows | TFMS plan-level timing |
| `sta_rwy` in `tbfm_metering_assertions` | Often NULL | Limited arrival metering data |
| `eta_rwy` in `tbfm_metering_assertions` | Often NULL | Limited arrival metering data |
| `weather_alerts.latitude/longitude` | Often NULL | Limited spatial analysis capability |
| `entry_time` in `flow_constraint_flights` | May equal exit_time | Instant constraints may indicate no delay |

### 2.5.4 Lifecycle Event Types

| Event Type | Description | Count |
|------------|-------------|-------|
| CL | Clearance | Active |
| DH | Departure | Active |
| ET | Estimated Time | Active |
| HH | Holding | Active |
| HV | Holding Verified | Active |
| NL | New Flight | Active |
| RH | Release | Active |

---

## 3. Neo4j Graph Structure

### 3.1 AIRM Ontology Coverage

The Neo4j database stores the AIRM (Aeronautical Information Model Reference) ontology with:

**Core Classes:**
- `https://w3id.org/airm-o/ontology#Flight` - Flight entity
- `https://w3id.org/airm-o/ontology#WeatherCondition` - Weather conditions
- `https://w3id.org/airm-o/ontology#Aerodrome` - Airport/airfield
- `https://w3id.org/airm-o/ontology#Airspace` - Defined airspace
- `https://w3id.org/airm-o/ontology#NavigationAid` - NAVAID
- `https://w3id.org/airm-o/ontology#Route` - Air route

**Key Properties:**
- `rdfs__label` - Human-readable name
- `rdfs__comment` - Description
- `uri` - Unique identifier (AIRM concept URI)

### 3.2 Graph Relationships

| Relationship Type | Count | Purpose |
|-------------------|-------|---------|
| `rdfs__subClassOf` | 3,671 | Class hierarchy |
| `rdfs__domain` | 2,248 | Property domain definition |
| `rdfs__range` | 2,248 | Property range definition |
| `rdfs__subPropertyOf` | 6,790 | Property hierarchy |
| `AIRM_RELATION` | 2,248 | AIRM-specific relationships |

---

## 4. Glossary Terms (OpenMetadata)

### 4.1 Traffic Flow Management Glossary Terms

| Term | FQN | Description |
|------|-----|-------------|
| Expected Departure Clearance Time | `SWIM_Global_Glossary.edct` | Expected Departure Clearance Time assigned to regulate departure demand |
| metering_edct | `SWIM_SFDPS+TFMS+STDDS_Fields_Glossary.term_swim_sfdps_tfms_stdds_field_metering_edct` | TBFM EDCT relay through TBFM; not arrival STA |
| sta_rwy | `SWIM_TBFM_Fields_Glossary.term_swim_tbfm_field_sta_rwy` | Scheduled time of arrival at runway threshold MRE (canonical runway STA) |
| entry_time | `SWIM_TFMS_Fields_Glossary.term_swim_tfms_field_entry_time` | Flight entry time into constrained element |
| exit_time | `SWIM_TFMS_Fields_Glossary.term_swim_tfms_field_exit_time` | Flight exit time from constrained element |
| departure_airport | `SWIM_TBFM_Fields_Glossary.term_swim_tbfm_field_departure_airport` | TBFM departure airport |
| arrival_airport | `SWIM_TBFM_Fields_Glossary.term_swim_tbfm_field_arrival_airport` | TBFM arrival airport |

### 4.2 Weather-Related Glossary Terms

| Term | FQN | Description |
|------|-----|-------------|
| Wind Shear ATIS | `SWIM_ITWS_Glossary.term_swim_itws_message_type_9894` | Wind shear advisories broadcast via ATIS |
| Gust Front TRACON Map | `SWIM_ITWS_Glossary.term_swim_itws_message_type_9833` | Gust front detection and prediction |
| Airport Lightning Warning | `SWIM_ITWS_Glossary.term_swim_itws_message_type_9845` | Lightning proximity warnings |
| Flight Rules | `SWIM_Global_Glossary.flight_rules` | IFR/VFR flight rule categories |
| wakeTurbulence | `SWIM_SFDPS_Fields_Glossary.term_evidence_data_dictionary_sfdps_data_dictionary_group_flight_aircraftDescription_wakeTurbulence` | Aircraft wake turbulence classification |

---

## 5. AI Agent Use Cases

### 5.1 Traffic Flow-Based Decision Making

#### Use Case 1: Flow Constraint Impact Analysis
**Condition:** Flight affected by active flow constraint  
**Data Sources:**
- `flow_constraints` (active constraints)
- `flow_constraint_flights` (per-flight impacts)
- `v_active_flights` (current flight positions)

**Decision Logic:**
1. Identify active flow constraints (APTC, GDP, GS, etc.)
2. Find flights affected by each constraint
3. Calculate delay impact: `entry_time - etd` or `exit_time - eta`
4. If delay exceeds threshold, recommend rerouting or alternative action

#### Use Case 2: Ground Delay Program (GDP) Response
**Condition:** GDP active at destination airport with significant delays  
**Data Sources:**
- `flow_constraints` (GDP type)
- `flow_constraint_flights` (affected flights)
- `flight_instance_state` (flight status)

**Decision Logic:**
1. Identify GDP constraints at destination airport
2. Get delay information from `entry_time`
3. For flights with delay > threshold:
   - Check if alternative airports available
   - Recommend holding or rerouting
   - Calculate fuel impact of delay

#### Use Case 3: Flow Constraint Release Decision
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

#### Use Case 4: Arrival Metering Decision Support
**Condition:** Arrival metering needed at busy airport  
**Data Sources:**
- `tbfm_metering_assertions` (arrival STA)
- `flight_instance_state` (current flight positions)
- `v_active_flights` (arrival traffic)

**Decision Logic:**
1. Identify flights approaching arrival airport
2. Check `sta_rwy` (scheduled arrival time)
3. Compare `eta_rwy` (estimated arrival) vs `sta_rwy`
4. If estimated arrival > scheduled, recommend metering adjustment

### 5.2 Weather-Based Decision Making (Expanded)

#### Use Case 5: Weather + Flow Constraint Combined Analysis
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

### 5.3 Demand/Capacity Balancing

#### Use Case 6: Airport Capacity Monitoring
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

#### Use Case 7: Flow Constraint Optimization
**Condition:** Flow constraint efficiency analysis  
**Data Sources:**
- `flow_constraints` (constraint details)
- `flow_constraint_flights` (per-flight impact)
- Historical constraint data

**Decision Logic:**
1. Calculate constraint delay per flight
2. Identify constraints with high delay/low impact
3. Recommend constraint adjustment or release
4. Suggest alternative constraint parameters

---

## 6. Data Integration Architecture

### 6.1 Data Flow

```
SWIM JMS Messages
    ↓ (landing: itws_messages, sfdps_messages, tfms_messages, tbfm_messages, …)
swimdb (PostgreSQL)
    ↓ (assertions + state: *_assertions, flow_constraints, weather_alerts, flight_instance_state)
    ↓ (views: v_resolved_flights, v_active_flights, flights, …)
OpenMetadata (catalog)
    ↓ (glossary terms, classifications)
Neo4j (AIRM ontology)
    ↓
AI Agent (decision engine)
```

### 6.2 AI Agent Data Access Pattern

```python
# 1. Query swimdb for flow constraints
flow_constraints = query_swimdb("""
    SELECT * FROM swim.flow_constraints 
    WHERE last_updated_at > NOW() - INTERVAL '4 hours'
""")

# 2. Query for flights affected by constraints
affected_flights = query_swimdb("""
    SELECT f.*, fc.control_element, fc.tmi_type
    FROM swim.flow_constraint_flights f
    JOIN swim.flow_constraints fc
      ON f.tmi_type = fc.tmi_type AND f.control_element = fc.control_element
    WHERE f.received_at > NOW() - INTERVAL '4 hours'
""")

# 3. Query for active flights
active_flights = query_swimdb("""
    SELECT flight_instance_id, latitude, longitude, 
           operational_phase, flight_status, edct, eta
    FROM swim.v_active_flights
    WHERE flight_status = 'ACTIVE'
""")

# 4. Calculate delay and trigger decisions
for constraint in flow_constraints:
    for flight in affected_flights:
        delay = calculate_delay(flight.entry_time, flight.exit_time)
        if delay > threshold:
            trigger_decision("flow_constraint_impact", {
                "flight_id": flight.flight_instance_id,
                "constraint_id": constraint.id,
                "delay_minutes": delay
            })
```

---

## 7. Implementation Considerations

### 7.1 Decision Engine Requirements

| Requirement | Implementation Approach |
|-------------|------------------------|
| Real-time processing | Stream processing (Kafka/Flux) or frequent polling |
| Historical analysis | Time-series queries on swimdb |
| Graph reasoning | Neo4j Cypher queries |
| Decision logging | Application-owned table (not in `swim` schema today); persist outside swimdb or add migration |
| Human review | Decision queue with approval workflow |

### 7.2 Decision Types

1. **Automated Decisions** - No human intervention required
   - Alert notifications
   - Automatic reroute suggestions
   - Queue management

2. **Semi-Automated Decisions** - Human approval required
   - Flow constraint release recommendations
   - Major route changes
   - Capacity adjustments

3. **Advisory Decisions** - Human decision-maker
   - Strategic planning inputs
   - Resource allocation suggestions
   - Policy recommendations

### 7.3 Safety Considerations

- **Fail-safe defaults:** When in doubt, recommend caution
- **Decision traceability:** Log all inputs and reasoning
- **Human override:** Always allow human override
- **Redundancy:** Multiple data sources for critical decisions
- **Testing:** Extensive testing with historical data before production

---

## 8. Decision Scope

### 8.1 High Confidence Decisions (Data-Driven)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| Flow constraint impact assessment | `flow_constraints`, `flow_constraint_flights`, `v_active_flights` | Calculate delay from `entry_time`/`exit_time` | Cannot determine fuel impact without aircraft performance data |
| Departure/arrival delay assessment | `sfdps_lifecycle_events`, `v_departures`, `v_active_flights`, plan assertions | Compare actual vs expected times | Cannot determine cause of delay |
| Weather alert proximity | `weather_alerts`, `v_active_flights` | Calculate distance between alert and flight | Cannot determine actual weather conditions at flight position |
| Flow constraint release recommendation | `flow_constraints`, `v_active_flow_constraints` | Monitor constraint age and duration | No visibility into upstream demand changes |

### 8.2 Medium Confidence Decisions (Requires Grouping)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| GDP response | `flow_constraints`, `flow_constraint_flights`, `v_active_flights` | Group flights by destination, calculate average delay | Cannot determine alternative airports |
| Arrival metering status | `tbfm_metering_assertions`, `v_active_flights` | Compare `eta_rwy` vs `sta_rwy` | No visibility into runway configuration changes |
| Departure/arrival sequence assessment | `v_departures`, `v_active_flights` | Calculate rate in time windows | Cannot determine sequence optimization |

### 8.3 Low Confidence Decisions (Requires External Data)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| Combined weather + flow constraint impact | `weather_alerts`, `flow_constraints`, `flow_constraint_flights` | Find overlap between weather and constraints | Cannot determine if weather caused constraint |
| Strategic planning inputs | Multiple tables + historical data | Aggregate patterns over time | Requires domain expertise and external data |
| Policy recommendations | Multiple tables + policy rules | Apply policy rules to data | Requires domain expertise |

### 8.4 Decision Types

| Type | Human Intervention | Examples |
|------|-------------------|----------|
| **Automated** | None | Alert notifications, monitoring recommendations, status updates |
| **Semi-Automated** | Approval required | Reroute recommendations, constraint release recommendations |
| **Advisory** | Human decision-maker | Strategic planning inputs, capacity adjustment recommendations |

---

## 9. Next Steps

### 9.1 Immediate Actions

1. **Define decision scope** - Which specific decisions need automation?
2. **Identify decision triggers** - What conditions trigger each decision?
3. **Design decision schema** - How will decisions be represented and stored?
4. **Build prototype** - Start with one use case (e.g., flow constraint impact)

### 9.2 Development Phases

**Phase 1: Data Integration**
- [ ] Connect AI agent to swimdb
- [ ] Connect AI agent to Neo4j
- [ ] Implement data caching layer

**Phase 2: Decision Logic**
- [ ] Implement condition detection
- [ ] Implement decision rules
- [ ] Implement decision logging

**Phase 3: Testing**
- [ ] Unit tests for each decision type
- [ ] Integration tests with historical data
- [ ] Human-in-the-loop testing

**Phase 4: Deployment**
- [ ] Staging environment
- [ ] Production deployment with monitoring
- [ ] Continuous improvement

---

## 10. References

### 10.1 Documentation
- `docs/openmetadata-integration.md` - OpenMetadata integration guide
- `docs/swimdb-f0b-provisional-reconciliation-design.md` - Flight reconciliation design
- `specs/SPEC.md` - Project specification

### 10.2 Code References
- `ingestion/swim_ingestion/governance_bootstrap.py` - Governance bootstrap
- `ingestion/swim_ingestion/pipeline.py` - SWIM ingestion pipeline
- `ingestion/om_fqn_helpers.py` - FQN construction helpers

### 10.3 AIRM Ontology
- Base URI: `https://w3id.org/airm-o/ontology#`
- Classes: 2,560
- Object Properties: 4,595
- Datatype Properties: 2,248

---

## Appendix A: Query Examples

### A.1 Active Flow Constraints
```sql
SELECT tmi_type, control_element, source_facility, 
       first_seen_at, last_updated_at
FROM swim.flow_constraints
WHERE last_updated_at > NOW() - INTERVAL '4 hours'
ORDER BY last_updated_at DESC;
```

### A.2 Flights Affected by GDP
```sql
SELECT f.flight_instance_id, f.callsign, f.departure_airport, 
       f.destination_airport, f.entry_time, f.exit_time,
       c.control_element, c.tmi_type
FROM swim.flow_constraint_flights f
JOIN swim.flow_constraints c
  ON f.tmi_type = c.tmi_type AND f.control_element = c.control_element
WHERE c.tmi_type = 'GDP'
  AND f.received_at > NOW() - INTERVAL '4 hours';
```

### A.3 Arrival Metering Status
```sql
SELECT t.tbfm_gufi, t.callsign, t.arrival_airport,
       t.sta_rwy, t.eta_rwy, t.sta_frozen,
       t.etm as edct
FROM swim.tbfm_metering_assertions t
WHERE t.data_group IN ('sta', 'sch', 'mrp')
  AND t.received_at > NOW() - INTERVAL '1 hour'
ORDER BY t.sta_rwy;
```

### A.4 Weather + Flow Constraint Overlap
```sql
SELECT w.product_id, w.alert_type, w.latitude, w.longitude,
       f.flight_instance_id, f.callsign, f.control_element, f.tmi_type,
       ST_Distance(
         ST_Point(w.longitude, w.latitude),
         ST_Point(f.latitude, f.longitude)
       ) as distance_nm
FROM swim.weather_alerts w
CROSS JOIN swim.v_active_flights f
WHERE w.last_updated_at > NOW() - INTERVAL '30 minutes'
  AND f.last_seen_at > NOW() - INTERVAL '1 hour'
  AND ST_Distance(
        ST_Point(w.longitude, w.latitude),
        ST_Point(f.longitude, f.latitude)
      ) < 50;  -- 50NM
```

---

*Decision scope document generated: 2026-10-14*  
*Based on actual data available in FAA SIL POC swimdb*

