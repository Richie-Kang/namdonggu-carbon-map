"""ai/convert_onnx.py — convert trained XGBoost model to ONNX for Node runtime."""
from __future__ import annotations

import sys
import json
import pickle
from pathlib import Path

import onnxmltools
import xgboost as xgb
from onnxmltools.convert.common.data_types import FloatTensorType as XgbFloatTensorType
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType as SklearnFloatTensorType

MODEL_DIR = Path(__file__).resolve().parent / "models"


def main() -> int:
    meta_src = MODEL_DIR / "population.meta.json"
    if not meta_src.exists():
        print("missing population.meta.json — run ai/train.py", file=sys.stderr)
        return 1
    meta = json.loads(meta_src.read_text(encoding="utf-8"))
    selected_model = meta.get("selected_model", "xgboost")
    feature_count = len(meta.get("feature_cols") or [])
    if feature_count <= 0:
        print("population.meta.json missing feature_cols", file=sys.stderr)
        return 2

    if selected_model == "xgboost":
        src = MODEL_DIR / "population.json"
        if not src.exists():
            print(f"missing {src}; run ai/train.py first", file=sys.stderr)
            return 3
        bst = xgb.Booster()
        bst.load_model(str(src))
        onnx_model = onnxmltools.convert_xgboost(
            bst,
            initial_types=[("input", XgbFloatTensorType([None, feature_count]))],
            target_opset=15,
        )
    else:
        src = MODEL_DIR / "population.pkl"
        if not src.exists():
            print(f"missing {src}; run ai/train.py first", file=sys.stderr)
            return 3
        model = pickle.loads(src.read_bytes())
        onnx_model = convert_sklearn(
            model,
            initial_types=[("input", SklearnFloatTensorType([None, feature_count]))],
            target_opset=15,
        )

    out = MODEL_DIR / "population.onnx"
    onnxmltools.utils.save_model(onnx_model, str(out))
    print(f"wrote {out} ({selected_model})")
    # also copy to web/public/models for static serving (P1 fix: include meta json)
    web_dir = MODEL_DIR.parents[1] / "web" / "public" / "models"
    web_dir.mkdir(parents=True, exist_ok=True)
    (web_dir / "population.onnx").write_bytes(out.read_bytes())
    (web_dir / "population.meta.json").write_text(
        meta_src.read_text(encoding="utf-8"), encoding="utf-8"
    )
    print(f"copied to {web_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
