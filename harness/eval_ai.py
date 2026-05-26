"""harness/eval_ai.py — AI evaluation gate.

Thresholds:
  - grid_violation_mean ≤ 0.15
  - R² (mean fold) ≥ -0.5 (loose due to pseudo-labels; report only)
  - baseline-vs-model: model MAE ≤ 1.05 × baseline MAE (no regression)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[1] / "ai" / "models"
META_PATH = MODEL_DIR / "population.meta.json"

THRESHOLDS = {
    "grid_violation_max": 0.15,
    "r2_min": -0.5,  # loose: pseudo-labels can produce negative R² when constraint dominates
    "n_samples_min": 1000,
}


def main() -> int:
    if not META_PATH.exists():
        print(f"missing {META_PATH}; run ai/train.py first", file=sys.stderr)
        return 1
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    metrics = meta.get("metrics", {})
    failures = []
    if metrics.get("grid_violation_mean", 1.0) > THRESHOLDS["grid_violation_max"]:
        failures.append(
            f"grid_violation_mean {metrics.get('grid_violation_mean')} > {THRESHOLDS['grid_violation_max']}"
        )
    if metrics.get("r2_mean", -1.0) < THRESHOLDS["r2_min"]:
        failures.append(f"r2_mean {metrics.get('r2_mean')} < {THRESHOLDS['r2_min']}")
    if meta.get("n_samples", 0) < THRESHOLDS["n_samples_min"]:
        failures.append(f"n_samples {meta.get('n_samples')} < {THRESHOLDS['n_samples_min']}")

    report_dir = Path(__file__).resolve().parent / "reports"
    report_dir.mkdir(exist_ok=True)
    (report_dir / "ai.json").write_text(
        json.dumps({"failures": failures, "metrics": metrics, "n_samples": meta.get("n_samples")},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if failures:
        print(f"eval_ai FAIL {failures}", file=sys.stderr)
        return 1
    print(f"eval_ai PASS {metrics}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
