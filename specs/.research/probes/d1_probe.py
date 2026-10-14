"""Smoke test for a local d1 llama-server: response shape, latency, and probability drift between builds.

The airport pictures are hand-written approximations of 2026-10-14 situations, not point-in-time archive
reconstructions, so the answers are not an accuracy measurement.

Usage: python3 d1_probe.py <tag>   ->  writes $D1_OUT_DIR/d1_<tag>.json (default /tmp)
"""
import json, os, sys, time, urllib.request

URL = os.environ.get("D1_URL", "http://127.0.0.1:8080") + "/v1/systemone"
OUT_DIR = os.environ.get("D1_OUT_DIR", "/tmp")
MODEL = os.environ.get("D1_MODEL")  # required by llama-server router mode (e.g. Llama.app): LiquidAI/d1-3B-GGUF:BF16

STATES = {
    "AUS_1645Z": """Airport: AUS (Austin, ZHU). Time: 16:45Z.
FAA Operations Plan (15:34Z): TERMINAL PLANNED: AFTER 2000 - AUS GROUND STOP/DELAY PROGRAM POSSIBLE. EN ROUTE CONSTRAINTS: ZFW/ZAB TSTMS.
Active TMIs at airport: none. Neighbor airports: none controlled.
Airport configuration: arrival rate 28/hr, weather class LVMC, arrivals ILS 18L, departures 18R.
ATIS: wind 190 at 15 gusting 23 kt, visibility 10 SM, broken 3100 ft, broken 4500 ft.
Arrival demand by hour vs rate 28: 17Z 9, 18Z 18, 19Z 22, 20Z 27.""",
    "LGA_1600Z": """Airport: LGA (New York LaGuardia, N90/ZNY). Time: 16:00Z.
FAA Operations Plan (15:34Z): ZNY swap statement issued, no significant impacts anticipated. EN ROUTE CONSTRAINTS: ZBW/ZMP/ZAU/ZKC/ZFW/ZAB/ZDV TSTMS. No LGA terminal TMI planned.
Active TMIs at airport: none. Neighbor airports EWR, JFK, TEB: none controlled.
Airport configuration: arrival rate 40/hr, weather class VMC.
ITWS: storm motion, precipitation and hazard products active within 5 NM of LGA.
ATIS: light rain, scattered 4800 ft, broken 11000 ft.
Arrival demand by hour vs rate 40: 16Z 30, 17Z 34, 18Z 29.""",
    "BOS_1100Z": """Airport: BOS (Boston, ZBW). Time: 11:00Z.
FAA Operations Plan: TERMINAL CONSTRAINTS: BOS - LOW CIGS. Runway 09/27 and 15R/33L limited operations (construction).
Active TMIs at airport: none. Previous BOS GDP cancelled 00:47Z.
Airport configuration: arrival rate 38/hr, arrivals 22L, departures 22R.
Arrival demand by hour vs rate 38: 17Z 41, 18Z 44, 19Z 40.""",
    "DEN_1530Z": """Airport: DEN (Denver, ZDV). Time: 15:30Z.
FAA Operations Plan (15:34Z): TERMINAL ACTIVE: UNTIL 1859 DEN GROUND DELAY PROGRAM. DEN ANTICIPATES ADDITIONAL GDP TO MANAGE THE 2200Z HOUR. AFTER 1900 DEN GROUND STOP/DELAY PROGRAM POSSIBLE. Constraint: DEN SHRA/LOW VIS. Runway 16R/34L closed.
Active TMIs at airport: GDP active until 18:59Z.
Airport configuration: weather class IMC.
Arrival demand by hour: 18Z 62, 20Z 54, 22Z 60.""",
    "ATL_1600Z": """Airport: ATL (Atlanta, A80/ZTL). Time: 16:00Z.
FAA Operations Plan: no ATL terminal constraints or planned TMIs.
Active TMIs at airport: none.
Airport configuration: arrival rate 100/hr, weather class VMC.
ATIS: wind 270 at 8 kt, visibility 10 SM, few clouds 5000 ft.
Arrival demand by hour vs rate 100: 17Z 70, 18Z 69, 19Z 69.""",
    "SFO_1600Z": """Airport: SFO (San Francisco, NCT/ZOA). Time: 16:00Z.
FAA Operations Plan: no SFO terminal constraints or planned TMIs. Runway 01R/19L construction until 11/15.
Active TMIs at airport: none.
Airport configuration: arrival rate 45/hr, weather class VMC.
Arrival demand by hour vs rate 45: 17Z 17, 18Z 17, 19Z 22.""",
}

QUESTIONS = {
    "gs_or_gdp_within_3h": {
        "type": "noul",
        "instructions": "Will the FAA issue a new ground stop, or propose or issue a new ground delay program, for this airport within the next 3 hours? An already active program does not count unless a new one is added.",
    },
    "next_transition": {
        "type": "choice",
        "instructions": "What is the first FAA traffic management change for this airport in the next 3 hours?",
        "criteria": {
            "NO_CHANGE": "No new ground stop, ground delay program, revision or cancellation",
            "GS_ISSUED": "A ground stop is issued",
            "GDP_PROPOSED": "A ground delay program is proposed",
            "GDP_ISSUED": "A ground delay program is issued",
            "GDP_CANCELLED": "An active ground delay program is cancelled",
            "DELAY_ADVISORY": "An arrival or scheduling delay advisory without a program",
        },
    },
    "timing": {
        "type": "score",
        "instructions": "How soon will the first FAA traffic management change for this airport occur?",
        "criteria": [
            "Not within 3 hours",
            "In 2 to 3 hours",
            "In 1 to 2 hours",
            "In 30 to 60 minutes",
            "Within 30 minutes",
        ],
    },
}


def call(state):
    payload = {"state": state, "questions": QUESTIONS}
    if MODEL:
        payload["model"] = MODEL
    body = json.dumps(payload).encode()
    req = urllib.request.Request(URL, body, {"Content-Type": "application/json"})
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=300) as r:
        out = json.load(r)
    return out, (time.perf_counter() - t) * 1000


def main(tag):
    call(STATES["ATL_1600Z"])  # warm-up
    results = {}
    for name, state in STATES.items():
        out, ms = call(state)
        results[name] = {"ms": round(ms), "answers": out["answers"], "usage": out.get("usage")}
        a = out["answers"]
        nt = a["next_transition"]
        print(f"{name:10s} {ms:6.0f} ms  p(gs/gdp 3h)={a['gs_or_gdp_within_3h'].get('noul', a['gs_or_gdp_within_3h']):.3f}  "
              f"next={nt.get('choice')} ({nt.get('confidence', 0):.2f})  timing={a['timing'].get('score', 0):.2f}  tokens={out.get('usage', {}).get('input_tokens')}")
    json.dump(results, open(os.path.join(OUT_DIR, f"d1_{tag}.json"), "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
