# Uploader performance guard

This benchmark sends a fixed 362-file corpus through the production uploader build in Chromium to a local MinIO. Localhost transfer time is small, so the clocks mostly cover code we can change: worker hashing, EXIF and thumbnail work, upload scheduling, each blob's PUT and HEAD verification, and the serial metadata publish.

The four clocks are:

- `preprocessMs`: folder selection through completion of Inspect.
- `payloadMs`: first media upload request through the final media HEAD response.
- `publishMs`: first media upload request through the `UploadComplete.json` response.
- `endToEndMs`: folder selection through the uploader's done state.

Run it from the repository root with Docker Desktop running:

```sh
pnpm --filter sparcd-uploader bench
```

The runner executes three fresh uploads and reports the minimum value for each clock — the minimum approximates the machine's capability, since noise only inflates. Gating is two-tier, because shared CI runners cannot resolve small timing regressions:

- **Blocking (exact, hardware-independent):** the uploaded object count and byte totals, the request profile (360 PUTs, 4 multipart parts, 362 HEAD verifies, 5 metadata PUTs — asserted in `bench.spec.ts`), and the catastrophic backstop ceilings in `budget.json` (roughly 10–30× the local M-series minimums of preprocess 277 ms / payload 1289 ms / publish 1326 ms / end-to-end 11.8 s). A backstop breach means a hang or a multi-x regression, not runner noise.
- **Non-blocking (timing trend):** `report.mjs` compares each run's minimums against a rolling baseline of the last 10 main-branch runs (kept in the Actions cache), posts the table to the job summary and a sticky PR comment, and emits a warning annotation when a clock is more than 25% worse. Informational — a real slow creep shows up as a trend across PRs.

`endToEndMs` is dominated by fixed Playwright UI-driving time — the three sub-clocks are the sharper signals.

The sibling `benchmark/` directory is a separate one-off Jetstream2 measurement campaign. This CI guard does not use or change it.
