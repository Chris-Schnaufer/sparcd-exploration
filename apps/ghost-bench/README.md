# ghost-bench

A focused tool for one question: **which model best flags "ghost" (empty)
camera-trap frames** for pre-tagging in the tagger?

It scores candidate detectors against a fixed labeled set (the 200 images +
`Ghost`/`Not_Ghost` labels from the original ghost-tagging tutorial) and reports
accuracy framed around the error that actually matters.

## The error that matters

Calling a frame **ghost when it really has an animal** risks hiding a real
detection. Calling an empty frame **not-ghost** just means a human still reviews
it. So the report leads with two operating points:

- **Best-F1** — the balanced point.
- **Safe** — the highest-confidence point that hides **zero** real animals, and
  how many ghosts it still catches there. This is the number that decides
  whether pre-tagging is worth shipping.

## Run

```bash
uv sync --extra megadetector        # pulls torch + PytorchWildlife
uv run -m bench.run megadetector
uv run -m bench.run legacy megadetector   # head-to-head, if the old model is present
```

Raw per-image scores are cached under `.cache/`; pass `--fresh` to recompute.
Per-image predictions land in `results/<model>_predictions.csv`.

## Models

- **megadetector** — off-the-shelf camera-trap detector (MegaDetector v6, a
  YOLOv9 checkpoint loaded straight through `ultralytics`).
  `ghost_score = 1 − top detection confidence` (any class — animal, person, or
  vehicle counts as not-ghost). Runs on Apple Silicon (MPS) or CPU; no training
  needed. Weights download once from Zenodo into `.cache/weights/`.
- **legacy** — the original student ResNet50 (`Full_model_4`, TF SavedModel).
  Not in the box export — drop the folder at
  `~/dev/Image_model_tutorial/Full_model_4` or set `GHOST_LEGACY_MODEL`. On
  Apple Silicon this needs `tensorflow-macos`; if it won't load locally we
  benchmark it on the GPU box instead.

The runner auto-flips a model whose score direction is inverted (AUC < 0.5), so
class-index conventions don't matter.
