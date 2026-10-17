# Production offline test infrastructure (#498)

Run from the repository root:

```sh
pnpm --filter sparcd-uploader exec playwright install chrome
pnpm --filter sparcd-uploader test:production:server
pnpm --filter sparcd-uploader test:production:offline
```

`PRODUCTION_TEST_PORT` selects the isolated server port (default 5335). The server
refuses reuse of an existing listener and serves both unmodified `dist` builds at
`/sparcd-exploration/uploader/` and `/sparcd-exploration/tagger/`. Query strings do
not change asset lookup. Missing assets and unrelated app routes return 404,
never another app's HTML. No Vite development server, module endpoints, synthetic
service worker, or application-asset route fulfillment is used. Test-only probe
responses and static assets use `no-store` to avoid HTTP cache masking missing
offline support. Later service-worker caching remains independent of this header.

The suite reuses the existing @offline Inspect scenario and two @cross-tool
handoff scenarios, now against production builds. S3 remains the existing test
mock; folder input remains the existing synthetic OS-picker fixture. Application
assets and worker requests go through the real server. The offline Inspect case
uses Chrome's real network blocking, not a mocked `navigator.onLine` value.

A separate infrastructure test launches real Google Chrome with a fresh temporary
persistent profile. It commits a harness-owned IndexedDB record/Blob, blocks the
network, closes the entire test browser, then launches another process against
the same profile with offline mode enabled before navigation. It verifies a real
uncached request fails offline, reconnects, verifies that page memory is gone and
IndexedDB survived, then deletes the profile. No user windows or profiles are
reused. The record is deliberately **not** an application batch or vocabulary.

## What a green run means

- Built app routes and script MIME types work at one deployed origin.
- Existing warm-page offline Inspect behavior and online local handoff/return
  remain functional on production builds.
- Chrome restart, profile preservation, IndexedDB Blob retention, network blocking
  and reconnection are available as infrastructure for subsequent #498 tests.

It does **not** establish cold offline app reopening, durable application-batch
recovery, prepared species readiness, offline local handoff, installed-PWA support,
or a real operating-system shutdown/restart. Those #497/#498 acceptance cases
remain unverified until their implementation and assertions land. This suite
neither enables service-worker support nor changes product behavior.

## Adding the remaining matrix

Build on this server and profile lifecycle for prepared assets/vocabulary,
restart with an actual inspected/tagged batch, file reselection, update failures,
and reconnect. Block requests before the offline app navigation. Do not seed app
records or fulfill app HTML/chunks in a test claiming production offline readiness.
Keep ordinary-browser automation, installed-PWA launch evidence, and manual OS
restart results separate. Keep Assign and standalone Tagger online-only.

CI runs both builds, the server routing checks, and this Chrome suite. The
persistent-context test explicitly records separate before/after-restart traces,
finalizes each before closing its browser process, and attaches all completed
traces on failure (including the first lifetime if the second fails). Successful
runs delete these traces. Failure traces are retained as workflow artifacts.
Full application BDD suites are separate.
