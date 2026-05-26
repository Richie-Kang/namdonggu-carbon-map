"""ai/convert_onnx.py — convert trained XGBoost model to ONNX for Node runtime."""
from __future__ import annotations

import sys
from pathlib import Path

import onnxmltools
import xgboost as xgb
from onnxmltools.convert.common.data_types import FloatTensorType

MODEL_DIR = Path(__file__).resolve().parent / "models"


def main() -> int:
    src = MODEL_DIR / "population.json"
    if not src.exists():
        print(f"missing {src}; run ai/train.py first", file=sys.stderr)
        return 1
    bst = xgb.Booster()
    bst.load_model(str(src))
    initial_type = [("input", FloatTensorType([None, 11]))]
    onnx_model = onnxmltools.convert_xgboost(bst, initial_types=initial_type, target_opset=15)
    out = MODEL_DIR / "population.onnx"
    onnxmltools.utils.save_model(onnx_model, str(out))
    print(f"wrote {out}")
    # also copy to web/public/models for static serving
    web_dir = MODEL_DIR.parents[1] / "web" / "public" / "models"
    web_dir.mkdir(parents=True, exist_ok=True)
    (web_dir / "population.onnx").write_bytes(out.read_bytes())
    print(f"copied to {web_dir / 'population.onnx'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
