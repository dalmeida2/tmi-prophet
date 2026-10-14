"""Behavioral test runs for d1 on airport pictures: full answer distributions plus three consistency experiments.

Pictures are hand-written approximations of 2026-10-14 situations (see d1_probe.py); results show model behavior,
not forecast accuracy.

Usage: D1_URL=http://127.0.0.1:9931 D1_MODEL=LiquidAI/d1-3B-GGUF:BF16 python3 d1_scenarios.py
"""
import json, os, time, urllib.request

from d1_probe import QUESTIONS, STATES

URL = os.environ.get("D1_URL", "http://127.0.0.1:8080") + "/v1/systemone"
MODEL = os.environ.get("D1_MODEL")


def ask(state, questions):
    payload = {"state": state, "questions": questions}
    if MODEL:
        payload["model"] = MODEL
    req = urllib.request.Request(URL, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=300) as r:
        out = json.load(r)
    return out["answers"], (time.perf_counter() - t) * 1000, out.get("usage", {}).get("input_tokens")


def bar(p, width=30):
    return "█" * round(p * width) + "·" * (width - round(p * width))


def gs_question(hours):
    return {
        "type": "noul",
        "instructions": f"Will the FAA issue a new ground stop, or propose or issue a new ground delay program, for this airport within the next {hours} hours? An already active program does not count unless a new one is added.",
    }


LGA_BASE = """Airport: LGA (New York LaGuardia, N90/ZNY). Time: {time}.
FAA Operations Plan (15:34Z): ZNY swap statement issued, no significant impacts anticipated. EN ROUTE CONSTRAINTS: ZBW/ZMP/ZAU/ZKC/ZFW/ZAB/ZDV TSTMS. No LGA terminal TMI planned.
Active TMIs at airport: none. Neighbor airports EWR, JFK, TEB: none controlled.
Airport configuration: arrival rate 40/hr, weather class VMC.
Arrival demand by hour vs rate 40: 16Z 30, 17Z 34, 18Z 29."""

LGA_EVIDENCE = [
    ("1  plan + demand only", LGA_BASE.format(time="15:45Z")),
    ("2  + ITWS storms within 5 NM", LGA_BASE.format(time="16:05Z")
     + "\nITWS: storm motion, precipitation and hazard products active within 5 NM of LGA."),
    ("3  + ATIS light rain", LGA_BASE.format(time="16:15Z")
     + "\nITWS: storm motion, precipitation and hazard products active within 5 NM of LGA."
     + "\nATIS: light rain, scattered 4800 ft, broken 11000 ft."),
    ("4  + FAA delay advisory", LGA_BASE.format(time="16:27Z")
     + "\nITWS: storm motion, precipitation and hazard products active within 5 NM of LGA."
     + "\nATIS: light rain, scattered 4800 ft, broken 11000 ft."
     + "\nFAA advisory 16:25Z: users can expect arrival delays / airborne holding into LGA of up to 30 minutes due to thunderstorms."),
]

AUS_NO_PLAN = STATES["AUS_1645Z"].replace(
    "FAA Operations Plan (15:34Z): TERMINAL PLANNED: AFTER 2000 - AUS GROUND STOP/DELAY PROGRAM POSSIBLE. EN ROUTE CONSTRAINTS: ZFW/ZAB TSTMS.",
    "FAA Operations Plan (15:34Z): no AUS terminal constraints or planned TMIs. EN ROUTE CONSTRAINTS: ZFW/ZAB TSTMS.",
)


def main():
    print(f"endpoint {URL}  model {MODEL or '(single-model server)'}\n")

    print("=" * 100)
    print("RUN 1 — full answers for each airport picture")
    print("=" * 100)
    for name, state in STATES.items():
        a, ms, tok = ask(state, QUESTIONS)
        p = a["gs_or_gdp_within_3h"]["noul"]
        print(f"\n{name}   ({ms:.0f} ms, {tok} input tokens)")
        print(f"  GS/GDP within 3 h   {bar(p)} {p:.3f}")
        nt = a["next_transition"]
        print(f"  next transition     → {nt['choice']}  (confidence {nt['confidence']:.2f})")
        for k, v in sorted(nt["probabilities"].items(), key=lambda x: -x[1]):
            print(f"      {k:16s} {bar(v, 20)} {v:.3f}")
        tm = a["timing"]
        print(f"  timing score        {tm['score']:.2f} of 4   (0 = not within 3 h … 4 = within 30 min)")
        for k, v in tm["probabilities"].items():
            print(f"      {k} {tm['legend'][k]:22s} {bar(v, 20)} {v:.3f}")

    print("\n" + "=" * 100)
    print("RUN 2 — LGA: does probability rise as storm evidence accumulates? (FAA ground stop came at 16:29Z)")
    print("=" * 100)
    for label, state in LGA_EVIDENCE:
        a, ms, _ = ask(state, {"gs_3h": gs_question(3)})
        p = a["gs_3h"]["noul"]
        print(f"  {label:32s} {bar(p)} {p:.3f}")

    print("\n" + "=" * 100)
    print("RUN 3 — horizon consistency: P(within 1 h) ≤ P(within 3 h) ≤ P(within 6 h) must hold")
    print("=" * 100)
    for name in ["AUS_1645Z", "DEN_1530Z", "LGA_1600Z", "ATL_1600Z"]:
        a, _, _ = ask(STATES[name], {"h1": gs_question(1), "h3": gs_question(3), "h6": gs_question(6)})
        ps = [a[k]["noul"] for k in ("h1", "h3", "h6")]
        ok = "consistent" if ps[0] <= ps[1] <= ps[2] else "INCONSISTENT"
        print(f"  {name:10s} 1 h {ps[0]:.3f}   3 h {ps[1]:.3f}   6 h {ps[2]:.3f}   {ok}")

    print("\n" + "=" * 100)
    print("RUN 4 — AUS: how much does the FAA Operations Plan 'POSSIBLE' line drive the answer?")
    print("=" * 100)
    for label, state in [("with plan line", STATES["AUS_1645Z"]), ("plan line removed", AUS_NO_PLAN)]:
        a, _, _ = ask(state, {"gs_3h": gs_question(3)})
        p = a["gs_3h"]["noul"]
        print(f"  {label:20s} {bar(p)} {p:.3f}")

    print("\n" + "=" * 100)
    print("RUN 5 — horizon as clock time instead of duration")
    print("=" * 100)
    for name, ends in {"AUS_1645Z": ["17:45Z", "19:45Z", "22:45Z"], "DEN_1530Z": ["16:30Z", "18:30Z", "21:30Z"]}.items():
        qs = {f"before_{e}": {
            "type": "noul",
            "instructions": f"Will the FAA issue a new ground stop, or propose or issue a new ground delay program, for this airport before {e}? An already active program does not count unless a new one is added.",
        } for e in ends}
        a, _, _ = ask(STATES[name], qs)
        print(f"  {name:10s} " + "   ".join(f"before {e}: {a['before_' + e]['noul']:.3f}" for e in ends))


if __name__ == "__main__":
    main()
