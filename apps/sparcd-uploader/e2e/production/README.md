# Production offline checks (#498)

```sh
pnpm --filter sparcd-uploader exec playwright install chrome
pnpm --filter sparcd-uploader test:production:server
pnpm --filter sparcd-uploader test:production:offline
```

The last command builds both apps and generates their coordinated offline release
with `scripts/build-offline.mjs`. `PRODUCTION_TEST_PORT` selects an isolated port
(default 5335); an existing listener is never reused. Both unmodified production
builds are served at their deployed `/sparcd-exploration/uploader/` and `tagger/`
paths. The family-root worker is the generated production worker, not a test
substitute. Unknown assets and Admin/Explorer routes return 404. MIME types,
query parsing, HEAD and path traversal are checked independently. A test-only
HTML probe under the family scope checks unrelated controlled clients; it is
not an Admin or Explorer app substitute.

Tests use actual Google Chrome, fresh independent profiles, real offline network
blocking and persistent-profile browser-process restarts. HTTP responses use
`no-store`, so browser HTTP cache cannot substitute for the service worker.
Application HTML/scripts/fonts and worker requests are never fulfilled by test
routes. S3 uses the existing storage fixture, and folder selection uses the
existing synthetic OS-picker fixture with actual JPEG/MP4 bytes. App records are
created through the UI, not seeded for tests claiming offline readiness.

## Verified workflows

- Existing F1-2 warm-page first offline Inspect and production cross-tool flows.
- Explicit species preparation, collection/settings precedence, denied/malformed/
  empty failures, snapshot isolation from a changing shared account, legacy and
  unsupported snapshots, and current-vocabulary review at online Assign.
- A real inspected batch survives complete Chrome closure before any handoff.
  Chrome restarts with networking already blocked; Uploader loads offline,
  rejects a same-size changed original, recovers the unchanged folder and its
  Inspect state, tags locally, reloads local Tagger, and returns with tags intact.
- Actual Chrome PWA installation and `PWA.launch` after a process restart offline.
  The test chooses Chrome's real standalone-window user preference using CDP
  (CDP installation otherwise defaults to a browser window); it does not emulate
  the display-mode media query. The app window is asserted standalone, inspects
  its first offline batch, opens local Tagger in that window, tags/reloads and
  returns offline. The test app is uninstalled and the temporary profile removed.
- An update missing a required new asset cannot displace a previously usable
  release or pending Inspect work. A complete update waits for the active client
  to close; a separate family-scope document keeps it waiting until it too
  closes. Guidance names all SPARC’d tabs, windows and installed-app windows.
  Reopening activates it without deleting preparation data.
- Worker unit checks cover failed/corrupt installs, eviction/readiness, explicit
  repair, route isolation and bypassing authenticated/signed/S3 requests.
- Production fault injection verifies journal-quota failure/retry, blocked handoff,
  final Tagger-write failure with a retryable Done action, and evicted-asset repair.
- Simultaneous Uploader windows retain separate batch journals and vocabulary
  snapshots, including when files arrive after another window prepares a list.
  Saved-batch recovery offers both records. An unfinished collection picker
  choice cannot strand Tagging when files arrive; the accepted list remains bound.
- Delayed verification cannot resurrect files or inputs after Disconnect, account
  switching, replacement files, or Start over, for both journal and Flip recovery.
  Tagger return restores that batch’s inputs; legacy singleton migration retains
  the old record if replacement persistence fails.
- Journal/unit checks cover quota failure, keeping the previous committed value,
  retry, missing/changed originals, unsupported records, schema migration and
  source/provenance retention. Prepared v2 handoffs are not expired implicitly.

Lifecycle tests own separate traces for each browser lifetime, finalize them
before closure, and attach all traces if any later lifetime fails. CI retains
failure artifacts. Temporary profiles and installed test apps are cleaned up.

## Verification boundary

These are #498 implementation regressions, not completion of #497's independent
acceptance matrix. No real computer shutdown/restart is automated. Installed-app
results are platform-specific; Chrome CDP supports these tests on the tested
host, while other browsers/mobile operating systems need their own #497 results.
No uncached first-ever offline visit is promised. Assign, real upload, and
standalone collection Tagger still require a connection. Full BDD suites remain
separate from this production suite.
