# Upload benchmark datasets

`prepare_datasets.py` builds S1–S5 from a bounded Snapshot Serengeti season 3
sample. Real JPEGs use LILA BC's CDLA-Permissive release; larger JPEG and MP4
shapes are valid padded derivatives. S5 uses hard links, so preserve links when
moving it.

```bash
cd apps/sparcd-uploader/benchmark
uv run --with 'ijson>=3.3' python prepare_datasets.py all \
  --root /media/volume/magnum-video/sparcd-uploader-benchmark/v1
python prepare_datasets.py verify \
  --root /media/volume/magnum-video/sparcd-uploader-benchmark/v1
python -m unittest -v test_prepare_datasets.py
```

`source` only selects/downloads S1. `build` creates S2–S5 and manifests.
`verify` recomputes bytes and hashes, compares existing manifests without
rewriting them, and decodes every unique JPEG/MP4 inode.

Current dataset root:
`/media/volume/magnum-video/sparcd-uploader-benchmark/v1`.

Provenance and license: `PROVENANCE.md` in dataset root. Manifests and hashes:
`manifests/`. Generated media stays outside Git.

`run_native_baseline.py` runs rotated rclone/mc/AWS CLI uploads.
`run_browser_benchmark.mjs` drives the real uploader with sanitized CDP event
capture and exact-prefix cleanup. Invoke either only through
`~/.config/sparcd-quic-benchmark/with-ephemeral-ec2-credential.sh` so the
project-wide key is revoked and result artifacts are leak-scanned.
