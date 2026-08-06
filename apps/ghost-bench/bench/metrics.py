"""Scoring for a ghost detector.

A model returns a per-image `ghost_score` in [0, 1] (higher == more likely an
empty/ghost frame). We sweep the decision threshold rather than baking one in.

The asymmetry that matters: predicting Ghost on an image that actually has an
animal (a false positive) risks hiding a real detection — that's the costly
error. Predicting Not_Ghost on an empty frame just means a human still reviews
it. So we care most about a high-confidence operating point with *zero* animals
mislabeled as ghost.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np


@dataclass
class Point:
    threshold: float
    tp: int  # ghost called ghost
    fp: int  # animal called ghost  <-- the dangerous one
    fn: int  # ghost called animal (missed, but safe)
    tn: int  # animal called animal
    precision: float  # of images we call ghost, fraction truly ghost
    recall: float     # of true ghosts, fraction we catch

    def as_dict(self) -> dict:
        return asdict(self)


def _point(score: np.ndarray, truth: np.ndarray, thr: float) -> Point:
    pred = score >= thr
    tp = int((pred & truth).sum())
    fp = int((pred & ~truth).sum())
    fn = int((~pred & truth).sum())
    tn = int((~pred & ~truth).sum())
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    return Point(thr, tp, fp, fn, tn, precision, recall)


def auc(score: np.ndarray, truth: np.ndarray) -> float:
    """Ranking quality, threshold-independent (probability a random ghost
    scores above a random non-ghost). Mann-Whitney U form."""
    pos = score[truth]
    neg = score[~truth]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(len(order), dtype=float)
    ranks[order] = np.arange(1, len(order) + 1)
    # average ranks for ties
    vals = np.concatenate([pos, neg])
    for v in np.unique(vals):
        mask = vals == v
        if mask.sum() > 1:
            ranks[mask] = ranks[mask].mean()
    r_pos = ranks[: len(pos)].sum()
    return float((r_pos - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


CURVE_THRESHOLDS = (0.5, 0.7, 0.8, 0.9, 0.95, 0.99)


@dataclass
class Report:
    model: str
    n: int
    n_ghost: int
    n_animal: int
    auc: float
    best_f1: Point          # balanced operating point
    curve: list[Point]      # operating points at CURVE_THRESHOLDS

    def summary(self) -> str:
        L = [
            f"=== {self.model} ===",
            f"  {self.n} images  ({self.n_ghost} ghost / {self.n_animal} animal)",
            f"  AUC (ranking quality):      {self.auc:.3f}",
            f"  Best F1: precision {self.best_f1.precision:.1%}, recall {self.best_f1.recall:.1%} "
            f"(thr={self.best_f1.threshold:.2f})",
            "",
            "  Operating curve — suggest ghost when score >= thr:",
            "    thr   ghosts_cleared   animals_hidden   precision",
        ]
        for p in self.curve:
            L.append(f"    {p.threshold:>4.2f}   {p.tp:>3}/{self.n_ghost:<10} {p.fp:>10}      {p.precision:>7.1%}")
        return "\n".join(L)


def evaluate(model: str, score: np.ndarray, truth: np.ndarray) -> Report:
    thresholds = np.unique(np.concatenate([[0.0], score, [1.0001]]))
    pts = [_point(score, truth, t) for t in thresholds]

    def f1(p: Point) -> float:
        return 2 * p.precision * p.recall / (p.precision + p.recall) if (p.precision + p.recall) else 0.0

    best_f1 = max(pts, key=f1)
    curve = [_point(score, truth, t) for t in CURVE_THRESHOLDS]

    return Report(
        model=model,
        n=len(truth),
        n_ghost=int(truth.sum()),
        n_animal=int((~truth).sum()),
        auc=auc(score, truth),
        best_f1=best_f1,
        curve=curve,
    )
