# Ghost detection — first benchmark

**Date:** 2026-06-26
**Set:** the original 200-image labeled set (`Image_model_tutorial`), balanced
100 ghost / 100 animal.
**Model:** MegaDetector v6 (YOLOv9-c), off the shelf, **no training**, run on a
MacBook Air (MPS).

## Headline

| Metric | Value |
|---|---|
| AUC (ranking quality) | **0.964** |
| Best F1 | precision 89.2%, recall 99.0% |

Operating curve (suggest "ghost" when score ≥ thr):

| thr | ghosts cleared | animals hidden | precision |
|----:|:--------------:|:--------------:|:---------:|
| 0.50 | 97/100 | 12 | 89.0% |
| 0.70 | 90/100 | 8 | 91.8% |
| 0.80 | 78/100 | 4 | 95.1% |
| 0.90 | 59/100 | 3 | 95.2% |
| 0.95 | 41/100 | 3 | 93.2% |

## Read

- Out of the box, with zero training, MegaDetector ranks empty-vs-animal frames
  at **AUC 0.964** on this set. That is already a strong pre-tagging signal.
- The residual error is dominated by **~3 frames labeled `Not_Ghost` that look
  empty to a human reviewer** (e.g. `2012 04 27 15 56 16.JPG`,
  `2012 04 28 01 40 22.JPG` — rocks/brush, no visible animal). These sit at the
  top of the ghost ranking and cap precision. They are almost certainly **label
  noise**, not model misses — so the real ceiling is higher than the table shows.
- A conservative threshold (~0.8) auto-clears **78% of empty frames** while
  touching only a handful of animal frames, most of which are the questionable
  labels above. In the tagger these are *suggestions a human confirms*, so a
  mislabel costs one click, not a lost detection.

## Caveats

- 200 images, one camera/site, 2012. Small and not representative of the full
  collection. Numbers will move on a larger, current, multi-site set.
- `ghost_score = 1 − top detection confidence` over all MD classes; we sweep the
  threshold rather than baking one in.

## Next

1. Build a larger, current labeled set from S3 (we have far more ghost/animal
   labels now) and re-run — this is the number that should drive the decision.
2. Benchmark the legacy student model (`Full_model_4`) head-to-head once we can
   load it (TF SavedModel; easier on the GPU box than on Apple Silicon).
3. If MegaDetector holds up, it likely removes the need to train a bespoke model
   at all — wrap it in the inference service and feed suggestions to the tagger.
