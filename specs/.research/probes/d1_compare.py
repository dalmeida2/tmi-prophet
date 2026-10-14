"""Compare a d1_probe.py result file against the BF16 reference recorded on 2026-10-14.

Pass criteria for trusting a new machine or build: same top choice on every picture and max probability shift <= 0.01.

Usage: python3 d1_compare.py <result.json> [reference.json]
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REF = os.path.join(HERE, "results", "bf16_b11617_reference.json")
MAX_SHIFT = 0.01


def flatten(results):
    values = {}
    for picture, run in results.items():
        for question, answer in run["answers"].items():
            if "noul" in answer:
                values[(picture, question, "yes")] = answer["noul"]
            for option, p in (answer.get("probabilities") or {}).items():
                values[(picture, question, option)] = p
    return values


def main(candidate_path, reference_path=DEFAULT_REF):
    candidate, reference = json.load(open(candidate_path)), json.load(open(reference_path))
    cv, rv = flatten(candidate), flatten(reference)
    missing = sorted(set(rv) - set(cv))
    shifts = [abs(cv[k] - rv[k]) for k in rv if k in cv]
    top_mismatch = [p for p in reference
                    if candidate.get(p, {}).get("answers", {}).get("next_transition", {}).get("choice")
                    != reference[p]["answers"]["next_transition"]["choice"]]
    max_shift = max(shifts) if shifts else float("nan")
    print(f"values compared: {len(shifts)}   missing: {len(missing)}")
    print(f"max shift: {max_shift:.4f}   mean shift: {sum(shifts) / len(shifts):.5f}")
    print(f"top-choice mismatches: {top_mismatch or 'none'}")
    ok = not missing and not top_mismatch and max_shift <= MAX_SHIFT
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
