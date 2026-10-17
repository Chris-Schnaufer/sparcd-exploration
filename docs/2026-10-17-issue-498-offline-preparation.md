# Prepared offline Uploader and local Tagger (#498)

Uploader now has two explicit preparation actions. Choose the intended collection
and prepare its species online; separately prepare both applications' offline
files. Readiness requires verified complete application caches and a valid
prepared species snapshot. Selecting a folder and Inspect remain available
without species preparation; local tagging does not silently substitute defaults.

## Species and assignment

The shared production loader uses non-empty collection species first and falls
back to settings only for missing/empty collection files. Invalid or denied
sources remain errors. The existing source-aware local key-profile reconciliation
runs before accepting a snapshot. The snapshot records account/endpoint,
collection, source, semantic SHA-256, preparation time, entries and key overrides;
it contains no secret or signed credentials. Once bound to a batch, it is not
replaced by a new shared session or another preparation.

Local Tagger reads only that batch's snapshot, including when another app is
connected. Online Assign independently fetches the actual destination's current
list. Changes require explicit acceptance; identifications no longer allowed by
that list block continuation without deleting tags. Existing requested-species
behavior is retained. Preparation does not assign a collection or location.

## Persistence and originals

The shared `sparcd-flip` database upgrades add vocabulary and pre-upload
preparation stores while preserving legacy records. New handoffs use record v2;
old readers cannot mistake them for a bundled-default batch. The preparation
journal stores stable identity, Inspect metadata, thumbnails, timestamps,
relevant wizard inputs and handoff state. Accepted changes are serialized into
IndexedDB; handoff waits for outstanding writes and records its ID before
navigation. Failed writes retain the previous committed snapshot and expose a
retry. Unsupported records are kept and explained rather than guessed at.

Original media files and credentials are not copied into the journal. Recovery
reopens a retained directory handle when permission permits, or asks for folder
reselection, then verifies path, size and content hash. Missing/changed originals
block adoption with filenames and reasons; saved metadata and tags are retained.
A file's original modified time is preserved for timestamp estimation. Recovery
reads the latest Flip tags, not an older pre-handoff journal copy. Local Tagger
labels thumbnails when originals are unavailable and verifies reopened originals
in bounded-memory SHA-256 passes. Failed final writes leave Done retryable.
Prepared v2 handoffs do not expire merely because they have been carried offline.
Real publication, explicit reset and existing disconnect cleanup retain their
established roles; journal writes are drained before Settings clears storage.

## Application delivery and updates

The installable manifest uses the Uploader identity/start URL and family scope
so a local Tagger handoff can remain in the installed app window. A single worker
at `/sparcd-exploration/offline-worker.js` owns coordinated Uploader/Tagger assets.
The release generator requires both builds, inventories every built public
asset (including embedded worker/WASM code, fonts and icons), hashes file bytes,
and includes worker code in the release identity. Pages deploys this worker at
the family root. Both apps self-host their existing font families.

Only exact public release assets and the two app entry routes are served from
application caches. Navigation query parameters remain usable without becoming
cache keys. S3, authenticated/signed requests, unknown assets, Admin and Explorer
receive no application-shell fallback. Standalone Tagger and Assign remain
online-only; only the Uploader's prepared local batch can be tagged offline.

Installation verifies every required asset before success. Failed installations
remove their incomplete cache and leave the old release intact. Reopening
rechecks completeness. Explicit online preparation repairs evicted current
assets only if their bytes match the pinned release. New workers never force
activation or reload: an accessible notification asks users to finish work,
close all Uploader/Tagger windows and reopen. Activation occurs after the old
clients close; the immediately preceding cache is also retained. Collection of
older unused application caches never deletes IndexedDB work.

## Checks and remaining acceptance boundary

The production Chrome harness tests cold ordinary-browser reopening and actual
installed-PWA launch after complete process restarts with offline networking from
launch. It exercises Inspect, verified reselection, local tags, reload/return,
reconnection, absent prerequisites, failed updates and staged activation with
pending work. It uses actual app assets and UI-created records; only storage
responses and the OS file picker are fixtures. See
`apps/sparcd-uploader/e2e/production/README.md` for commands and trace handling.

These are #498's implementation regressions. Issue #497 remains separate and
blocked pending delivery of this prerequisite; its full platform acceptance
matrix and manual real-computer shutdown/restart are not claimed complete.

The restart checks also close the complete browser process with saved local
Tagger edits, then reopen that exact batch URL offline before returning it.
This is tested separately in an ordinary browser and a real standalone PWA.

## Local verification (2026-10-17)

- Uploader 338, Tagger 294, Flip 31 and s3-safe 23 unit tests passed (686 total).
- Both applications' TypeScript checks and production builds passed, as did
  Flip and s3-safe TypeScript checks and the frozen-lockfile check.
- All 170 Uploader BDD scenarios were verified: 164 passed in the broad run;
  six affected scenarios passed after rerunning with fixed preparation/status
  setup and without development-server source reloads during the run.
- The 96-case Tagger species/navigation/viewing subset passed, plus all nine
  local-batch scenarios (two overlap the subset).
- The canonical production command passed all 20 then-discovered cases. The
  subsequently added final-return-write retry case also passed (21 production
  cases verified). This includes actual installed-PWA and ordinary Chrome
  process restarts while local Tagger holds saved edits.
- Four production routing/worker unit checks and whitespace checks passed.

No #497 issue closure, full cross-platform acceptance, or real OS shutdown test
is implied by these results. Browser tests owned their Chrome profiles/windows;
the user's running Tagger and Admin instances were not reused or stopped.
