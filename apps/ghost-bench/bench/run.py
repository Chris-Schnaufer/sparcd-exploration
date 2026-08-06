"""Benchmark ghost detectors against the 200-image labeled set.

    uv run -m bench.run megadetector
    uv run -m bench.run legacy megadetector

Caches raw per-image scores under .cache/ so re-scoring is instant; pass
--fresh to recompute. Writes a predictions CSV per model and prints a summary
framed around the costly error (a real animal mislabeled as ghost).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from . import data, metrics
from .models import REGISTRY

CACHE = Path(__file__).resolve().parent.parent / ".cache"
OUT = Path(__file__).resolve().parent.parent / "results"


def _scores(name: str, ds: data.LabeledSet, fresh: bool) -> np.ndarray:
    cache_file = CACHE / f"{name}.npy"
    if cache_file.exists() and not fresh:
        cached = np.load(cache_file)
        if len(cached) == len(ds):
            print(f"[{name}] using cached scores ({cache_file})")
            return cached
    print(f"[{name}] scoring {len(ds)} images...")
    scores = REGISTRY[name](ds.paths)
    CACHE.mkdir(exist_ok=True)
    np.save(cache_file, scores)
    return scores


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="+", choices=list(REGISTRY))
    ap.add_argument("--fresh", action="store_true", help="recompute, ignore cache")
    args = ap.parse_args(argv)

    ds = data.load()
    print(f"loaded {len(ds)} images: {ds.n_ghost} ghost / {ds.n_not_ghost} animal\n")
    OUT.mkdir(exist_ok=True)

    reports = []
    for name in args.models:
        try:
            score = _scores(name, ds, args.fresh)
        except (ImportError, FileNotFoundError) as e:
            print(f"[{name}] skipped: {e}\n", file=sys.stderr)
            continue

        oriented = score
        rep = metrics.evaluate(name, oriented, ds.is_ghost)
        if rep.auc < 0.5:  # score direction inverted — flip and re-evaluate
            print(f"[{name}] AUC {rep.auc:.3f} < 0.5, flipping score direction")
            oriented = 1.0 - score
            rep = metrics.evaluate(name, oriented, ds.is_ghost)

        pd.DataFrame({
            "image": [p.name for p in ds.paths],
            "truth": np.where(ds.is_ghost, "Ghost", "Not_Ghost"),
            "ghost_score": oriented,
        }).to_csv(OUT / f"{name}_predictions.csv", index=False)

        reports.append(rep)
        print("\n" + rep.summary() + "\n")

    if len(reports) > 1:
        print("=== head-to-head ===")
        for r in sorted(reports, key=lambda r: r.auc, reverse=True):
            print(f"  {r.model:14s} AUC {r.auc:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
