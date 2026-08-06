"""Labeled benchmark set: the 200 images + ground-truth ghost/not labels.

The ground-truth pickle is a (200,) array of 'Ghost' / 'Not_Ghost', ordered to
match the *sorted* filenames in the image dir (Keras `flow_from_directory` sorts
alphabetically, which is how the labels were originally produced).
"""

from __future__ import annotations

import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np

DEFAULT_ROOT = Path.home() / "dev" / "Image_model_tutorial"
DEFAULT_IMAGES = DEFAULT_ROOT / "images" / "metadata_labeled"
DEFAULT_LABELS = DEFAULT_ROOT / "img_correct_id_array.p"


@dataclass(frozen=True)
class LabeledSet:
    paths: list[Path]      # absolute image paths, sorted
    is_ghost: np.ndarray   # bool, True == ground-truth Ghost, aligned to paths

    def __len__(self) -> int:
        return len(self.paths)

    @property
    def n_ghost(self) -> int:
        return int(self.is_ghost.sum())

    @property
    def n_not_ghost(self) -> int:
        return int((~self.is_ghost).sum())


def load(images_dir: Path = DEFAULT_IMAGES, labels_pickle: Path = DEFAULT_LABELS) -> LabeledSet:
    paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    labels = pickle.load(open(labels_pickle, "rb"))
    if len(labels) != len(paths):
        raise ValueError(f"{len(labels)} labels but {len(paths)} images — ordering would be wrong")
    is_ghost = np.array([str(x).strip().lower() == "ghost" for x in labels], dtype=bool)
    return LabeledSet(paths=paths, is_ghost=is_ghost)
