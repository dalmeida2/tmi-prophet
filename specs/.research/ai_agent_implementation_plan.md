# AI Agent Implementation Plan

> **Status (2026-10-14): superseded.** Replaced by [tmi_dataset_and_prediction_plan.md](./tmi_dataset_and_prediction_plan.md) (two-part plan, local d1, Rust direction). Kept for its SQL sketches. See [README.md](./README.md).

> **Canonical data model:** [DATA_MODEL.md](./DATA_MODEL.md) — join keys, plan assertions, and verification commands.

## Overview

This document provides a technical implementation plan for an AI agent that explores decision-making based on aviation conditions in the FAA SIL POC's swimdb, with emphasis on traffic flow management and demand/capacity decisions.

---

## 1. Architecture

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

## 2. Data Sources

### 2.1 swimdb (PostgreSQL)

**Connection:** `swim-db:5432` / database `swim_data` / schema `swim` (use cluster credentials; do not commit passwords in code or docs)

**Key Tables (Verified 2026-10-14):**

| Table | Purpose | Record Count | Notes |
|-------|---------|--------------|-------|
| `flow_constraints` | TFMS flow information envelope | ~3.1k snapshot | Current state |
| `flow_constraint_flights` | Per-flight TMI impacts | ~4.5M snapshot | Append-only; 49 partitions |
| `tbfm_metering_assertions` | TBFM arrival metering | ~10⁵/hr | Partitioned assertions |
| `weather_alerts` | ITWS weather products | ~1.2k snapshot | Current/recent alerts |
| `v_active_flights` | Current flight positions | ~27k snapshot | View; active in last hour |
| `sfdps_lifecycle_events` | SFDPS lifecycle events | ~550k snapshot | Partitioned events |
| `tfms_flight_plan_assertions` | TFMS plan facts | millions | Primary plan/route/ETD source |
| `flight_plans` | TFMS plan rollup | 0 | Not populated — use assertions |

### 2.2 Neo4j Graph Database

**Connection:** `bolt://neo4j:7687` or `http://neo4j:7474`

**Key Queries:**
- AIRM ontology traversal
- Property relationship discovery
- Class hierarchy navigation

### 2.3 OpenMetadata

**API Endpoint:** `http://localhost:8585/api`

**Key Endpoints:**
- `/search/entity?q=flow` - Search flow constraints
- `/glossary` - List glossaries
- `/glossaryTerm` - List glossary terms

---

## 3. Decision Scope

### 3.1 High Confidence Decisions (Data-Driven)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| Flow constraint impact assessment | `flow_constraints`, `flow_constraint_flights`, `v_active_flights` | Calculate delay from `entry_time`/`exit_time` | Cannot determine fuel impact without aircraft performance data |
| Departure/arrival delay assessment | `sfdps_lifecycle_events`, `v_active_flights`, `v_departures`, plan assertions | Compare actual vs expected times | `flight_plans` rollup empty |
| Weather alert proximity | `weather_alerts`, `v_active_flights` | Calculate distance between alert and flight | Coordinates often NULL, limited spatial analysis |
| Flow constraint release recommendation | `flow_constraints`, `v_active_flow_constraints` | Monitor constraint age and duration | No visibility into upstream demand changes |

### 3.2 Medium Confidence Decisions (Requires Grouping)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| GDP response | `flow_constraints`, `flow_constraint_flights`, `v_active_flights` | Group flights by destination, calculate average delay | Cannot determine alternative airports |
| Arrival metering status | `tbfm_metering_assertions`, `v_active_flights` | Compare `eta_rwy` vs `sta_rwy` | STA/ETA fields often NULL, limited data |
| Departure/arrival sequence assessment | `v_departures`, `v_active_flights` | Calculate rate in time windows | Cannot determine sequence optimization |

### 3.3 Low Confidence Decisions (Requires External Data)

| Decision | Data Required | Inference Logic | Limitations |
|----------|---------------|-----------------|-------------|
| Combined weather + flow constraint impact | `weather_alerts`, `flow_constraints`, `flow_constraint_flights` | Find overlap between weather and constraints | Cannot determine if weather caused constraint |
| Strategic planning inputs | Multiple tables + historical data | Aggregate patterns over time | Requires domain expertise and external data |
| Policy recommendations | Multiple tables + policy rules | Apply policy rules to data | Requires domain expertise |

### 3.4 Decision Types

| Type | Human Intervention | Examples |
|------|-------------------|----------|
| **Automated** | None | Alert notifications, monitoring recommendations, status updates |
| **Semi-Automated** | Approval required | Reroute recommendations, constraint release recommendations |
| **Advisory** | Human decision-maker | Strategic planning inputs, capacity adjustment recommendations |

---

## 4. Traffic Flow Data

### 4.1 Flow Constraints (`flow_constraints`)

**Purpose:** Current TFMS flow-information envelope state

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `tmi_type` | TEXT | TFMS flow message type (APTC, GADV, GDP, RAPT, REROUTE, RSTR, TMI_UPDATE, FXA, GS, AFP, CTOP, MIT) |
| `control_element` | TEXT | Flow-control identifier (airport, fix, FCA/FXA, advisory number, reroute name, restriction/MIT number, route, airway) |
| `source_facility` | TEXT | Facility that issued the TMI (ATCSCC or ARTCC) |
| `visibility` | TEXT | TMI visibility domain |
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

### 4.2 Flow Constraint Flights (`flow_constraint_flights`)

**Purpose:** Append-only per-flight TFMS TMI impacts

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `tmi_type` | TEXT | TFMS TMI message type |
| `control_element` | TEXT | FCA, airport, fix, or other controlled element |
| `gufi` | TEXT | TFMS per-flight flow-impact GUFI |
| `callsign` | TEXT | Aircraft callsign |
| `departure_airport` | TEXT | Departure airport |
| `destination_airport` | TEXT | Destination airport |
| `entry_time` | TIMESTAMP | Flight entry time into constrained element |
| `exit_time` | TIMESTAMP | Flight exit time from constrained element |
| `tmi_fca_id` | TEXT | Nested FCA identifier |
| `details` | JSONB | Compact lineage JSONB |

### 4.3 TBFM Metering Assertions (`tbfm_metering_assertions`)

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

---

## 5. Decision Engine Design

### 5.1 Decision Types

```python
class DecisionType(Enum):
    AUTOMATED = "automated"        # No human intervention
    SEMI_AUTOMATED = "semi_automated"  # Human approval required
    ADVISORY = "advisory"          # Human decision-maker
```

### 5.2 Decision Schema

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any

class Decision(BaseModel):
    id: str
    decision_type: DecisionType
    condition: str
    trigger: str
    data: Dict[str, Any]
    reasoning: str
    recommendation: str
    confidence: float
    created_at: datetime
    status: str  # pending, approved, rejected, executed
    approved_by: Optional[str] = None
    executed_at: Optional[datetime] = None
```

---

## 6. Condition Detection

### 6.1 Flow Constraint Detector

```python
class FlowConstraintDetector:
    def __init__(self, db_connection: str):
        self.db = connect_to_swimdb(db_connection)
    
    def get_active_flow_constraints(self, hours: int = 4):
        """Get active flow constraints from last N hours"""
        query = """
            SELECT * FROM swim.flow_constraints 
            WHERE last_updated_at > NOW() - INTERVAL %s hours
        """
        return self.db.query(query, (hours,))
    
    def get_flights_affected_by_constraint(self, control_element: str):
        """Get flights affected by a specific flow constraint"""
        query = """
            SELECT f.*, c.tmi_type, c.control_element
            FROM swim.flow_constraint_flights f
            JOIN swim.flow_constraints c
              ON f.tmi_type = c.tmi_type AND f.control_element = c.control_element
            WHERE f.control_element = %s
            AND f.received_at > NOW() - INTERVAL '4 hours'
        """
        return self.db.query(query, (control_element,))
    
    def get_delay_impact(self, entry_time, exit_time):
        """Calculate delay impact in minutes"""
        if entry_time and exit_time:
            return (exit_time - entry_time).total_seconds() / 60
        elif entry_time:
            return (datetime.utcnow() - entry_time).total_seconds() / 60
        return 0
    
    def get_gdp_flights(self, airport: str):
        """Get flights affected by GDP at specific airport"""
        query = """
            SELECT f.flight_instance_id, f.callsign, f.departure_airport,
                   f.destination_airport, f.entry_time, f.exit_time,
                   c.control_element
            FROM swim.flow_constraint_flights f
            JOIN swim.flow_constraints c
              ON f.tmi_type = c.tmi_type AND f.control_element = c.control_element
            WHERE c.tmi_type = 'GDP'
              AND (c.control_element = %s OR f.destination_airport = %s)
              AND f.received_at > NOW() - INTERVAL '4 hours'
        """
        return self.db.query(query, (airport, airport))
```

### 6.2 Arrival Metering Detector

```python
class ArrivalMeteringDetector:
    def __init__(self, db_connection: str):
        self.db = connect_to_swimdb(db_connection)
    
    def get_arrival_metering_status(self, airport: str, hours: int = 1):
        """Get arrival metering status for airport"""
        query = """
            SELECT t.tbfm_gufi, t.callsign, t.arrival_airport,
                   t.sta_rwy, t.eta_rwy, t.sta_frozen, t.etm,
                   t.ctm, t.trw, t.meter_fix
            FROM swim.tbfm_metering_assertions t
            WHERE t.arrival_airport = %s
              AND t.data_group IN ('sta', 'sch', 'mrp')
              AND t.received_at > NOW() - INTERVAL %s hours
            ORDER BY t.sta_rwy
        """
        return self.db.query(query, (airport, hours))
    
    def get_metering_delays(self, hours: int = 1):
        """Get all flights with metering delays"""
        query = """
            SELECT t.callsign, t.arrival_airport,
                   t.sta_rwy, t.eta_rwy,
                   EXTRACT(MINUTE FROM (t.eta_rwy - t.sta_rwy)) as delay_minutes,
                   t.sta_frozen
            FROM swim.tbfm_metering_assertions t
            WHERE t.data_group IN ('sta', 'sch', 'mrp')
              AND t.received_at > NOW() - INTERVAL %s hours
              AND t.eta_rwy IS NOT NULL
              AND t.sta_rwy IS NOT NULL
        """
        return self.db.query(query, (hours,))
```

### 6.3 Weather + Flow Constraint Detector

```python
class CombinedConditionDetector:
    def __init__(self, db_connection: str):
        self.db = connect_to_swimdb(db_connection)
    
    def get_weather_near_flow_constraints(self, radius_nm: float = 50):
        """Get weather alerts near active flow constraints"""
        query = """
            SELECT w.*, f.control_element, f.tmi_type, f.source_facility
            FROM swim.weather_alerts w
            CROSS JOIN swim.flow_constraints f
            WHERE w.last_updated_at > NOW() - INTERVAL '30 minutes'
              AND f.last_updated_at > NOW() - INTERVAL '4 hours'
              AND ST_Distance(
                    ST_Point(w.longitude, w.latitude),
                    ST_Point(f.longitude, f.latitude)
                  ) < %s
        """
        return self.db.query(query, (radius_nm,))
    
    def get_flights_in_weather_and_flow(self, weather_id: int, radius_nm: float = 50):
        """Get flights affected by both weather and flow constraints"""
        query = """
            SELECT DISTINCT f.flight_instance_id, f.callsign,
                   w.product_id, w.alert_type,
                   fc.control_element, fc.tmi_type
            FROM swim.v_active_flights f
            JOIN swim.weather_alerts w ON ST_Distance(
                ST_Point(f.longitude, f.latitude),
                ST_Point(w.longitude, w.latitude)
            ) < %s
            JOIN swim.flow_constraint_flights fc ON fc.flight_instance_id = f.flight_instance_id
            WHERE w.id = %s
              AND f.last_seen_at > NOW() - INTERVAL '1 hour'
        """
        return self.db.query(query, (radius_nm, weather_id))
```

---

## 7. Reasoning Engine

### 7.1 Flow Constraint Reasoning

```python
class FlowConstraintReasoning:
    @staticmethod
    def calculate_delay_impact(entry_time, exit_time, etd):
        """Calculate delay impact and recommend action"""
        if entry_time and exit_time:
            delay = (exit_time - entry_time).total_seconds() / 60
        elif entry_time:
            delay = (datetime.utcnow() - entry_time).total_seconds() / 60
        else:
            return {"recommendation": "INSUFFICIENT_DATA", "confidence": 0.5}
        
        if delay > 30:
            return {"recommendation": "HIGH_PRIORITY_REROUTE", "confidence": 0.85, "delay_minutes": delay}
        elif delay > 15:
            return {"recommendation": "CONSIDER_REROUTE", "confidence": 0.75, "delay_minutes": delay}
        elif delay > 5:
            return {"recommendation": "MONITOR", "confidence": 0.9, "delay_minutes": delay}
        else:
            return {"recommendation": "NO_ACTION", "confidence": 0.95, "delay_minutes": delay}
    
    @staticmethod
    def evaluate_gdp_response(gdp_flights, threshold_minutes=15):
        """Evaluate GDP response strategy"""
        high_delay_flights = [f for f in gdp_flights if f.delay > threshold_minutes]
        
        if len(high_delay_flights) > len(gdp_flights) * 0.5:
            return {"recommendation": "AGGRESSIVE_REROUTE", "confidence": 0.8, "affected_count": len(high_delay_flights)}
        elif len(high_delay_flights) > 0:
            return {"recommendation": "SELECTIVE_REROUTE", "confidence": 0.75, "affected_count": len(high_delay_flights)}
        else:
            return {"recommendation": "ACCEPT_GDP", "confidence": 0.9, "affected_count": 0}
    
    @staticmethod
    def evaluate_constraint_release(constraint, historical_data):
        """Evaluate if flow constraint should be released"""
        age_hours = (datetime.utcnow() - constraint.first_seen_at).total_seconds() / 3600
        
        if age_hours > 4:
            return {"recommendation": "CONSIDER_RELEASE", "confidence": 0.7, "age_hours": age_hours}
        elif age_hours > 2:
            return {"recommendation": "MONITOR", "confidence": 0.85, "age_hours": age_hours}
        else:
            return {"recommendation": "MAINTAIN", "confidence": 0.95, "age_hours": age_hours}
```

### 7.2 Arrival Metering Reasoning

```python
class ArrivalMeteringReasoning:
    @staticmethod
    def evaluate_arrival_metering(sta_rwy, eta_rwy, sta_frozen):
        """Evaluate arrival metering status"""
        if sta_rwy and eta_rwy:
            delay = (eta_rwy - sta_rwy).total_seconds() / 60
            
            if delay > 10:
                if sta_frozen:
                    return {"recommendation": "METERING_REQUIRED", "confidence": 0.9, "delay_minutes": delay}
                else:
                    return {"recommendation": "REVIEW_STA", "confidence": 0.8, "delay_minutes": delay}
            elif delay > 5:
                return {"recommendation": "MONITOR", "confidence": 0.85, "delay_minutes": delay}
            else:
                return {"recommendation": "ON_SCHEDULE", "confidence": 0.95, "delay_minutes": delay}
        else:
            return {"recommendation": "INSUFFICIENT_DATA", "confidence": 0.5}
    
    @staticmethod
    def evaluate_metering_adjustment(metering_flights, threshold=15):
        """Evaluate if metering adjustment needed"""
        high_delay_flights = [f for f in metering_flights if f.delay > threshold]
        
        if len(high_delay_flights) > len(metering_flights) * 0.3:
            return {"recommendation": "ADJUST_METERING", "confidence": 0.8, "affected_count": len(high_delay_flights)}
        else:
            return {"recommendation": "MAINTAIN_METERING", "confidence": 0.85, "affected_count": len(high_delay_flights)}
```

---

## 8. Implementation Examples

### 8.1 Flow Constraint Impact Agent

```python
class FlowConstraintImpactAgent:
    def __init__(self, db_connection: str):
        self.detector = FlowConstraintDetector(db_connection)
        self.reasoning = FlowConstraintReasoning()
    
    def run_cycle(self):
        """Execute one decision cycle"""
        # Get active flow constraints
        constraints = self.detector.get_active_flow_constraints(hours=4)
        
        for constraint in constraints:
            # Get flights affected by this constraint
            affected_flights = self.detector.get_flights_affected_by_constraint(constraint.control_element)
            
            for flight in affected_flights:
                # Calculate delay impact
                delay = self.detector.get_delay_impact(flight.entry_time, flight.exit_time)
                
                # Evaluate response
                decision = self.reasoning.calculate_delay_impact(
                    flight.entry_time, flight.exit_time, flight.etd
                )
                
                if decision['recommendation'] != 'NO_ACTION':
                    self.create_decision({
                        'type': 'flow_constraint_impact',
                        'flight_id': flight.flight_instance_id,
                        'constraint_id': constraint.id,
                        'tmi_type': constraint.tmi_type,
                        'control_element': constraint.control_element,
                        'delay_minutes': delay,
                        **decision
                    })
    
    def create_decision(self, decision_data):
        """Create and store a decision"""
        decision = Decision(
            id=uuid.uuid4().hex,
            decision_type=DecisionType.SEMI_AUTOMATED,
            condition=f"Flow constraint {decision_data['constraint_id']} affecting flight",
            trigger=f"Delay of {decision_data['delay_minutes']} minutes",
            data=decision_data,
            reasoning=self.generate_reasoning(decision_data),
            recommendation=decision_data['recommendation'],
            confidence=decision_data['confidence'],
            created_at=datetime.utcnow(),
            status='pending'
        )
        
        self.store_decision(decision)
        
        # Send notification if high confidence
        if decision.confidence > 0.85:
            self.notify_authorities(decision)
```

### 8.2 Arrival Metering Agent

```python
class ArrivalMeteringAgent:
    def __init__(self, db_connection: str):
        self.detector = ArrivalMeteringDetector(db_connection)
        self.reasoning = ArrivalMeteringReasoning()
    
    def run_cycle(self, airport: str):
        """Execute one decision cycle for specific airport"""
        # Get arrival metering status
        metering = self.detector.get_arrival_metering_status(airport, hours=1)
        
        for flight in metering:
            # Evaluate arrival metering
            decision = self.reasoning.evaluate_arrival_metering(
                flight.sta_rwy, flight.eta_rwy, flight.sta_frozen
            )
            
            if decision['recommendation'] != 'ON_SCHEDULE':
                self.create_decision({
                    'type': 'arrival_metering',
                    'flight_id': flight.tbfm_gufi,
                    'callsign': flight.callsign,
                    'arrival_airport': airport,
                    'sta_rwy': flight.sta_rwy,
                    'eta_rwy': flight.eta_rwy,
                    'sta_frozen': flight.sta_frozen,
                    'delay_minutes': decision.get('delay_minutes', 0),
                    **decision
                })
```

### 8.3 Combined Weather + Flow Agent

```python
class CombinedConditionAgent:
    def __init__(self, db_connection: str):
        self.detector = CombinedConditionDetector(db_connection)
        self.reasoning = FlowConstraintReasoning()
    
    def run_cycle(self):
        """Execute one decision cycle"""
        # Get weather near flow constraints
        combined = self.detector.get_weather_near_flow_constraints(radius_nm=50)
        
        for event in combined:
            # Evaluate combined impact
            decision = self.evaluate_combined_impact(event)
            
            if decision['recommendation'] != 'NO_ACTION':
                self.create_decision({
                    'type': 'combined_condition',
                    'weather_id': event.id,
                    'weather_alert': event.alert_type,
                    'constraint_id': event.control_element,
                    'tmi_type': event.tmi_type,
                    **decision
                })
    
    def evaluate_combined_impact(self, event):
        """Evaluate combined weather and flow constraint impact"""
        # Weather events near flow constraints are higher priority
        if event.alert_type in ['microburst', 'tornado', 'lightning']:
            return {
                'recommendation': 'ESCALATE_PRIORITY',
                'confidence': 0.9,
                'reason': 'Severe weather near flow constraint'
            }
        elif event.alert_type in ['gustfront', 'wind_shear']:
            return {
                'recommendation': 'MONITOR_CLOSELY',
                'confidence': 0.85,
                'reason': 'Moderate weather near flow constraint'
            }
        else:
            return {
                'recommendation': 'NORMAL_MONITORING',
                'confidence': 0.8,
                'reason': 'Weather near flow constraint'
            }
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```python
def test_flow_constraint_impact():
    """Test flow constraint impact calculation"""
    agent = FlowConstraintImpactAgent(db_connection)
    
    # Test high delay scenario
    entry_time = datetime.utcnow() - timedelta(hours=1)
    exit_time = datetime.utcnow()
    
    decision = agent.reasoning.calculate_delay_impact(entry_time, exit_time, None)
    assert decision['recommendation'] == 'HIGH_PRIORITY_REROUTE'
    assert decision['confidence'] > 0.8
    
    # Test low delay scenario
    entry_time = datetime.utcnow() - timedelta(minutes=2)
    exit_time = datetime.utcnow()
    
    decision = agent.reasoning.calculate_delay_impact(entry_time, exit_time, None)
    assert decision['recommendation'] == 'NO_ACTION'
```

### 9.2 Integration Tests

```python
def test_end_to_end_flow_decision():
    """Test complete flow constraint decision flow"""
    # Setup test data
    insert_test_flow_constraint()
    insert_test_flights()
    
    # Run agent
    agent = FlowConstraintImpactAgent(db_connection)
    agent.run_cycle()
    
    # Verify decisions created
    decisions = decision_store.get_pending_decisions()
    assert len(decisions) > 0
    
    # Verify decision types
    for d in decisions:
        assert d.decision_type == DecisionType.SEMI_AUTOMATED
        assert d.status == 'pending'
```

---

## 10. Deployment

### 10.1 Environment Variables

```bash
# swimdb
SWIM_DB_HOST=swim-db
SWIM_DB_PORT=5432
SWIM_DB_NAME=swim_data
SWIM_DB_USER=swim
SWIM_DB_PASSWORD=***

# Neo4j
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=***

# OpenMetadata
OPENMETADATA_API=http://localhost:8585/api
OPENMETADATA_JWT_TOKEN=***

# Agent configuration
AGENT_POLL_INTERVAL=60  # seconds
AGENT_DELAY_THRESHOLD=15  # minutes
AGENT_CONFIDENCE_THRESHOLD=0.8
```

### 10.2 Docker Compose

```yaml
version: '3.8'
services:
  ai-agent:
    build: .
    environment:
      - SWIM_DB_HOST=swim-db
      - NEO4J_URI=bolt://neo4j:7687
      - OPENMETADATA_API=http://localhost:8585/api
    depends_on:
      - swim-db
      - neo4j
    volumes:
      - ./decisions:/app/decisions
    ports:
      - "8000:8000"
```

---

## 11. Monitoring

### 10.1 Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Flow constraints/minute | Constraint generation rate | > 100 |
| Delay impact | Average delay per flight | > 30 minutes |
| Pending decisions | Unprocessed decisions | > 1000 |
| Decision latency | Time from trigger to decision | > 30s |

### 10.2 Logging

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('ai-agent')

logger.info('Decision created', extra={
    'decision_id': decision.id,
    'type': decision.decision_type.value,
    'confidence': decision.confidence
})
```

---

## 12. Next Steps

1. **Prototype** - Implement single use case (flow constraint impact)
2. **Test** - Validate with historical data
3. **Deploy** - Staging environment with monitoring
4. **Iterate** - Add more decision types based on feedback

---

*Implementation plan generated: 2026-10-14*
