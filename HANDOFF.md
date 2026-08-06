# Session hand-off — uploader performance & JS2 proxy work

Written 2026-08-01 (~01:45 local) at the end of a multi-day session. Assumes
zero prior context. Read `CLAUDE.md`, `infra/sparcd-quic-proxy/README.md`, and
the auto-memory file `project_wildcats_proxy_topology.md` (in
`~/.claude/projects/-Users-juliangonzalez-dev-sparcd-rewrite/memory/`) before
touching anything.

## Branch state

`feat/upload-telemetry`, based on origin/main (b7187bb), **not pushed**,
~19 commits ahead. All tests green (120 in apps/sparcd-uploader, 13 in
packages/s3-safe); `npx tsc --noEmit` clean in the uploader. Working tree has
only untracked leftovers (`apps/ghost-bench/`, `apps/sparcd-uploader/corpus/`,
`docs/user-stories.md`, this file).

What the branch contains (roughly in order): Assign-step perf fix (Intl
formatter cache + preview debounce), live speed/elapsed/ETA telemetry,
optional post-PUT HEAD verify + batched final review (one LIST per 1000
objects), refresh buttons with mono-glyph spinner, wizard-input persistence +
resumable-upload banner, resume handoff to the Upload step (double-click
latch), severity-filter counters on Inspect, adaptive concurrency (hill
climber, `src/lib/adaptiveConcurrency.ts`) with manual override in Settings,
skipped-bytes-excluded speed accounting, client-side write-scope pin
(`VITE_SPARCD_S3_WRITE_SCOPE`), `x-id` query-param strip in packages/s3-safe
(RGW 501s unknown query params), endpoint sharding (lanes stripe across
origins; Settings → Endpoint shards), and `infra/sparcd-quic-proxy/`.

Next step for the branch: push + PR to main. Consider a gpt-5.6-sol review
first (per user's global CLAUDE.md flow) — the branch never got a full
third-party pass, only per-feature reviews.

## Infrastructure (Jetstream2 project BIO260073, cloud `BIO260073_IU`)

- Credentials: OpenStack app credential in `~/Downloads/clouds.yaml`
  (restricted) and `~/Downloads/clouds-unrestricted.yaml` (unrestricted —
  user should delete the Horizon "sparcd-ec2-mint" app credential + this file
  once done). JS2 RGW S3 keys live in `apps/sparcd-uploader/.env` as
  `JS2_S3_ACCESS_KEY/JS2_S3_SECRET_KEY` (minted 2026-07-31, permanent).
- **sparcd-quic-proxy-03** — the live proxy. m3.tiny, IP 149.165.155.148,
  DNS sparcd-quic-proxy-03.bio260073.projects.jetstream-cloud.org, ports
  443/8443/8444/8445 all SigV4-valid, h3 on, BBR on, certs on volume
  `sparcd-quic-proxy-certs` (rebuilds are free — no LE budget burn).
  Reconfigure ONLY via
  `openstack server rebuild --image Featured-Minimal-Ubuntu24 --user-data
  infra/sparcd-quic-proxy/cloud-init.yaml sparcd-quic-proxy-03`
  (SSH from the user's networks is defeated by CGNAT). proxy-02 is deleted;
  proxy-01 (not ours, benchmark-era) still runs and fronts RGW too.
- **Test bucket `sparcd-jg-test`** on JS2 RGW (js2.jetstream-cloud.org:8001):
  seeded with Settings/locations.json (JGT01), Collections/jg-test/ +
  deployment seed, CORS for localhost:5199 + 127.0.0.1:4173. Holds ~4 full
  5000-file test uploads (~10 GB) — sweepable except the seed files.
  Awaiting a blessing from Chris (user asked him); also ask Chris for a
  bucket-scoped RGW credential.
- **DANGER — read-only territory**: every OTHER container in the JS2 object
  store (sparcd-*, sparcd, for-deletion, questionable-images…) is the
  **encrypted backup of production wildcats data** (rclone-crypt-style
  names). Never write/delete there. The uploader's write-scope pin
  (`VITE_SPARCD_S3_WRITE_SCOPE=sparcd-jg-test` in .env) guards the app;
  scripts must self-discipline.
- **wildcats.sparcd.arizona.edu** (UA campus, MinIO behind Caddy) is the
  production S3. Its Caddy routes by Host, so it cannot be transparently
  proxied until JP adds a site alias (asked, declined for now). One MinIO
  node has NTP drift (RequestTimeTooSkewed bursts — app retries handle it).
  Educational Test collection contains our seeds (AUG07 efren,
  JGT01 julian-gonzalez) and two partial julian-gonzalez upload folders from
  2026-07-29 testing (2026.07.29.21.38.57 + a later resume stamp) that could
  be swept via the efren key in `.env`. Bucket is versioned: prior deletes
  left noncurrent versions (~1.7 GB) only an admin purge can reclaim.

## Measured results (full table in infra/sparcd-quic-proxy/README.md)

wildcats direct ~0.15 MB/s → JS2 via proxy-03, 4 origins: h3 10 MB/s,
h2+32 lanes **15 MB/s (127 Mbps)** — 100×. Scaling shows a shared-path
asymptote (~18–25 MB/s from the user's home, est.); per-connection ~2.5 MB/s.
h2 beats h3 on this clean route; h3's case is lossy field networks (real
user population — camera-trap researchers on hotspots).

## Roadmap (agreed with user, not started)

1. **Adaptive controller v2**: slow-start doubling (8→16→32) + bisection +
   BBR-style hold-and-reprobe, byte-based windows (user's own design; replaces
   the ±2 hill climb in adaptiveConcurrency.ts).
2. **Per-shard throughput weighting** + mixed-protocol fleet (make :8444/:8445
   h2-only at next rebuild) = empirical protocol selection ("smart QUIC").
3. **8-origin asymptote measurement** (add ports at next rebuild).
4. Tailscale on the proxy when the user provides an auth key (cloud-init
   addition; rebuilds are free now).
5. Findings write-up for JP/Chris if requested.

## Local machine state

- Preview server may still be running (orphaned `vite preview --host
  127.0.0.1` on 4173, serving apps/sparcd-uploader/dist). Dev server: 5199.
- Test corpus: `~/Downloads/sparcd-test-5000-500kb/` (2.4 GB, deletable).
- App gate settings for testing: endpoint
  `https://sparcd-quic-proxy-03.bio260073.projects.jetstream-cloud.org`,
  keys from `.env`, collection "JS2 Test Collection (JG)", deployment
  "Julian G Test"; Settings → Endpoint shards takes the :8443/:8444/:8445
  URLs.

## User preferences observed this session

Sub-agents for sizable features (Opus implement, Codex review caught a real
controller bug); granular commits; everything tracked in-repo (hence
infra/); minimal cloud resources; extreme caution near production data;
positive framing in external comms (see memory: project-framing).
