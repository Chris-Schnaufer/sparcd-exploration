"""Model adapters. Each returns a ghost_score in [0, 1] per image (higher ==
more likely an empty/ghost frame), so the scorer can sweep thresholds.

Heavy deps (torch, tensorflow) are imported lazily inside each adapter, so the
core env benchmarks whatever is installed without forcing the other backend.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

LEGACY_MODEL_PATH = Path(
    os.environ.get("GHOST_LEGACY_MODEL", Path.home() / "dev" / "Image_model_tutorial" / "Full_model_4")
)


# MegaDetector v6 is a YOLOv9 checkpoint (classes: 0 animal, 1 person, 2 vehicle).
# We load it straight through ultralytics rather than the PytorchWildlife package,
# whose top-level import eagerly pulls a bioacoustics stack we don't need.
MDV6_URL = "https://zenodo.org/records/15398270/files/MDV6-yolov9-c.pt?download=1"
MDV6_WEIGHTS = Path(__file__).resolve().parent.parent / ".cache" / "weights" / "MDV6-yolov9-c.pt"


def _ensure_mdv6() -> Path:
    if not MDV6_WEIGHTS.exists():
        import urllib.request
        MDV6_WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
        print(f"  downloading MegaDetector v6 weights -> {MDV6_WEIGHTS}")
        urllib.request.urlretrieve(MDV6_URL, MDV6_WEIGHTS)
    return MDV6_WEIGHTS


def megadetector(paths: list[Path], device: str | None = None) -> np.ndarray:
    """Off-the-shelf camera-trap detector. ghost_score = 1 - top animal-detection
    confidence (no animal found -> score 1.0)."""
    import torch
    from ultralytics import YOLO

    if device is None:
        device = "mps" if torch.backends.mps.is_available() else "cpu"

    model = YOLO(_ensure_mdv6())
    scores = np.empty(len(paths), dtype=float)
    for i, p in enumerate(paths):
        res = model.predict(p, imgsz=1280, conf=0.05, device=device, verbose=False)[0]
        conf = res.boxes.conf.cpu().numpy()  # any class (animal/person/vehicle) == not ghost
        scores[i] = 1.0 - (float(conf.max()) if conf.size else 0.0)
    return scores


def legacy_resnet(paths: list[Path], model_path: Path = LEGACY_MODEL_PATH) -> np.ndarray:
    """The original student model (TF/Keras SavedModel). Class 0 == ghost per
    the source script; ghost_score = P(class 0)."""
    if not model_path.exists():
        raise FileNotFoundError(
            f"Legacy model not found at {model_path}.\n"
            f"Drop the `Full_model_4` SavedModel folder there "
            f"(or set GHOST_LEGACY_MODEL) — it's on the author's GitHub, not in the box export."
        )
    # 2023 SavedModel == Keras 2. Modern TF defaults to Keras 3, which can't load
    # it; tf-keras is the Keras-2 compat shim. Try it first, fall back to tf.keras.
    try:
        import tf_keras as keras
    except ImportError:
        from tensorflow import keras

    model = keras.models.load_model(model_path)
    scores = np.empty(len(paths), dtype=float)
    for i, p in enumerate(paths):
        img = Image.open(p).convert("RGB").resize((224, 224))
        arr = (np.asarray(img, dtype=np.float32) / 255.0)[None, ...]
        pred = np.asarray(model.predict(arr, verbose=0))[0]
        scores[i] = float(pred[0])  # class 0 == ghost
    return scores


REGISTRY = {
    "megadetector": megadetector,
    "legacy": legacy_resnet,
}
