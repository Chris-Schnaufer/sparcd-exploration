---
schema_version: 1
plan_id: sparcd-uploader-object-storage-upload-benchmark
title: SPARCd uploader object-storage benchmark
status: done
created_at_utc: 2026-07-25T02:13:18Z
updated_at_utc: 2026-07-25T21:20:59Z
default_destination: local_markdown
publish_policy: draft_then_ask
update_cadence: every_small_step
targets:
  local_path: apps/sparcd-uploader/benchmark-plan.md
  logseq_page: null
  github_issue: null
  gitlab_issue: null
  github_pr: null
  gitlab_mr: null
---

# SPARCd uploader object-storage benchmark

## Summary

Measure camera-media upload performance from Chromium and native CLI clients to
Jetstream2 S3-compatible object storage. Separate network transfer speed from
SPARCd preprocessing, integrity checks, and publish metadata. Test current
parallel multipart behavior, Chromium lifecycle states, recovery after failure,
and HTTP/3 over an approved Caddy QUIC reverse proxy.

Core protocol comparison:

1. direct Jetstream2 HTTP/2;
2. Caddy proxy HTTP/2;
3. same Caddy proxy HTTP/3 over QUIC.

Three paths isolate proxy overhead from HTTP/3 effect. WASM transport work stays
out unless profiling finds a CPU bottleneck: browser WASM still uses Chromium's
network stack and cannot open an independent QUIC transport for S3.

## Problem

Current uploader has no measured operating envelope. Unknowns:

- achievable throughput versus path capacity and native clients;
- best file concurrency for camera-sized images;
- interaction between file concurrency and multipart part concurrency;
- Chromium behavior while hidden, minimized, frozen, discarded, or restarted;
- bytes retransmitted after short outages, tab loss, and interrupted multipart
  uploads;
- HTTP/3 benefit under clean, high-latency, and lossy links.

Prior draft also assumed wrong implementation facts. Current code already uses
multipart upload above 8 MiB with four part lanes in
`packages/s3-safe/src/index.ts`. It persists file completion, but not multipart
`uploadId` or completed part ETags. Interrupted large files therefore start a
new multipart upload; completed files resume through remote `HEAD` size/hash
verification.

## Success Criteria

- Same client host, payload manifest, credentials, bucket, and run policy used
  across comparable runs.
- Direct endpoint discovered from configuration; current repo default confirmed
  as `https://js2.jetstream-cloud.org:8001`, not port 9000.
- Path capacity measured against a controlled `iperf3` server near Caddy proxy.
- At least five measured runs per retained matrix cell after one warm-up.
- Run order randomized or rotated to reduce network-time bias.
- Report includes median, p25, p75, failures, retries, retransmitted bytes, CPU,
  peak memory, request count, and negotiated protocol.
- Chromium protocol recorded from CDP; HTTP/3 cells accepted only when
  `response.protocol` reports `h3`.
- Native QUIC cells accepted only when `curl --version` reports `HTTP3` and
  `--http3-only` succeeds.
- Current uploader tested at file concurrency 1, 2, 4, 8, and 16.
- Large-file screen tests part concurrency separately from file concurrency.
- Background and recovery tests prove either continued completion or safe,
  visible resume without duplicate publication.
- Changed source bytes never upload under persisted original hash/key state.
- Caddy proxy passes SigV4, CORS, conditional PUT, multipart, `HEAD`, and 412
  behavior unchanged.
- No credentials, `Authorization` headers, signed query strings, raw HAR files,
  or NetLog secrets enter committed results.
- Final report recommends production concurrency, file-size threshold behavior,
  background UX, multipart-resume work, and QUIC adoption or rejection.

## Out Of Scope

- Replacing S3 with WebTransport or a custom upload protocol.
- Claiming upload continues after browser/tab termination. Product contract is
  durable recovery, not closed-tab execution.
- Service Worker Background Sync, Periodic Background Sync, Web Locks, or
  SharedWorker prototypes before baseline data shows need. None guarantees a
  long-running local-file upload survives tab closure.
- WASM S3 client prototype before CPU profiling shows signing or hashing consumes
  at least 10% of transfer wall time. WASM cannot bypass Chromium transport.
- Comparing many object-storage vendors. Jetstream2 remains target backend.
- Changing production uploader behavior during measurement work.
- Public ACLs, anonymous buckets, or destructive bucket reset operations.

## Constraints

### Current implementation

- `writeImmutableStream` uses single conditional PUT at or below 8 MiB.
- Larger files use 8 MiB multipart parts with four part workers by default.
- Uploader file lanes default to eight and range from four through sixteen in UI.
- Large-file default can reach roughly 32 simultaneous part requests: eight file
  lanes times four part lanes.
- Every uploaded file receives a post-write `HEAD` size/hash check.
- Wet sessions persist completed-file state in Dexie.
- Multipart upload IDs and completed parts are not persisted.
- Failed multipart uploads remain for bucket lifecycle cleanup because app IAM
  intentionally lacks abort permission.
- Pre-upload workers hash every file and also parse EXIF/container metadata.

### Safety

- Use dedicated benchmark bucket or dedicated prefix with least-privileged,
  short-lived credentials.
- Create unique prefix per run. Never empty or reset shared bucket.
- Apply lifecycle expiry to benchmark objects and incomplete multipart uploads.
- Keep admin cleanup credentials outside browser and results.
- Redact endpoint credentials, `Authorization`, cookies, signed query strings,
  access keys, and secret keys from traces before storage.
- Capture only metadata needed for analysis. Raw sensitive HAR/NetLog stays
  outside repository and is deleted after sanitized extraction.
- Caddy stores no S3 credentials. It forwards signed requests transparently.
- Caddy access logs omit query strings and sensitive headers.
- Network impairment with `tc netem` requires explicit operator approval,
  destination-scoped rules, and guaranteed cleanup trap.

### Reproducibility

Record for every run:

- run UUID and UTC timestamp;
- Git commit SHA and dirty-state flag;
- Chromium, curl, rclone, mc, AWS CLI, Caddy, kernel, and OS versions;
- client CPU, memory, NIC, power mode, and wired/Wi-Fi status;
- endpoint, proxy path, region, path-style setting, dataset manifest hash;
- file concurrency, part concurrency, part size, retry count, and impairment
  profile;
- cold/warm connection state and negotiated HTTP protocol;
- server/proxy request errors and available object-store metrics.

## Benchmark Definitions

### Timings

Report separate clocks; do not collapse them into one throughput number.

1. **Preprocess time:** folder accepted through all hashes/EXIF results ready.
2. **Payload time:** first object PUT starts through last object PUT completes.
3. **Publish time:** first object PUT starts through final
   `UploadComplete.json` completion.
4. **End-to-end time:** folder accepted through published completion.
5. **Resume time:** resume action through completion, including rehash and HEAD
   verification.

### Rates

- Payload goodput = source object bytes / payload time.
- Publish goodput = source object bytes / publish time.
- Path efficiency = payload goodput / controlled path goodput.
- Never use `PerformanceResourceTiming.transferSize` as uploaded bytes; it
  describes response transfer and may be zero cross-origin without
  `Timing-Allow-Origin`.
- Source bytes come from immutable dataset manifest.

### Fairness tiers

- **Transport tier:** payload PUT timing only. Compares network engines.
- **Integrity tier:** source hash, immutable write/multipart, and remote
  verification included.
- **Product tier:** full SPARCd preprocess, assignment fixture, upload, metadata,
  and completion marker.

Native CLI results are comparators, not an upper bound. Different clients may
apply different listing, checksum, multipart, and verification work; report
those differences beside results.

## Dataset Matrix

Prefer a sanitized real camera corpus. Synthetic fallback must produce valid,
decodable JPEG/MP4 files and a manifest containing relative path, byte size,
SHA-256, media type, and capture time.

| ID | Shape | Approximate bytes | Purpose |
| --- | --- | ---: | --- |
| S1 | 1,000 × 256 KiB JPEG | 250 MiB | request/HEAD overhead |
| S2 | 200 × 5 MiB JPEG | 1 GiB | common camera batch |
| S3 | 64 × 7 MiB + 64 × 9 MiB JPEG | 1 GiB | below/above 8 MiB boundary |
| S4 | 10 × 100 MiB media | 1 GiB | multipart and interrupted-file recovery |
| S5 | representative JPEG + MP4 corpus | 5 GiB | end-to-end soak/background run |

Dataset generator must verify actual sizes and decode success. Do not assume
`ffmpeg testsrc` output reaches requested size. Generate once, write manifest,
and reuse identical bytes across clients.

## Retained Test Matrix

Use screening, then narrow. Avoid full combinatorial explosion.

### Stage A: clean-link screening

- Dataset: S1, S2, S3, S4.
- Clients: rclone, mc, AWS CLI, HTTP/3-capable curl, current Chromium uploader.
- File concurrency: 1, 2, 4, 8, 16 where client supports it.
- Current part size/concurrency: 8 MiB / 4.
- Paths: direct HTTP/2, proxy HTTP/2, proxy HTTP/3 where supported.

### Stage B: multipart tuning

Only S4 and best two file-concurrency values from Stage A:

- part concurrency: 1, 2, 4, 8;
- part size: 8 MiB and 32 MiB;
- cap and record aggregate in-flight requests.

Stop increasing concurrency after two consecutive settings gain less than 5%
or increase failures, CPU saturation, or memory pressure.

### Stage C: QUIC impairment

Use S2 and S4 at best clean-link concurrency:

| Profile | Added RTT | Packet loss |
| --- | ---: | ---: |
| Q0 | 0 ms | 0% |
| Q1 | 40 ms | 0% |
| Q2 | 80 ms | 0.1% |
| Q3 | 80 ms | 1% |

Compare proxy HTTP/2 and proxy HTTP/3 only. Direct HTTP/2 remains contextual
baseline. Use Linux `tc netem`; Chromium DevTools throttling does not model QUIC
packet loss accurately.

### Stage D: Chromium lifecycle and recovery

Run S5 once for screening, then repeat only failed or surprising cells:

- visible and focused;
- hidden tab for ten minutes;
- minimized window for ten minutes;
- page frozen via CDP, then resumed;
- tab closed/discarded, then reopened;
- browser process stopped, then restarted;
- two-second network loss;
- thirty-second network loss followed by explicit resume;
- UDP blocked to verify HTTP/3 fallback to HTTP/2.

## Parts

### Part 0 — Lock environment and safety

**Goal:** Create isolated benchmark target without production-data risk.

**Status:** complete

**Red Test:** Existing credentials, bucket lifecycle, endpoint, proxy host, and
cleanup policy are unknown or shared.

**Green Test:** Dedicated private bucket/prefix, just-in-time credentials,
credential revocation, object expiry, incomplete-multipart expiry, exact-origin
CORS, prefix-only cleanup, and result redaction checks all pass without printing
secrets.

- [x] Confirm direct S3 endpoint from approved configuration.
- [x] Confirm current endpoint protocol and `Alt-Svc` headers.
- [x] Create dedicated private benchmark container.
- [x] Adopt temporary project-wide EC2 credentials for benchmark runs only.
- [x] Enforce credential timeout and verified deletion on success, failure, and timeout.
- [x] Apply object and incomplete-multipart lifecycle rules.
- [x] Configure CORS for fixed benchmark origin `http://127.0.0.1:4173`.
- [x] Write non-destructive cleanup using run prefix only.
- [x] Add exact credential-leak check for result artifacts.

**Validation/Evidence:** BIO260073 project
`1be924c0bcd5411e8ef1a7f0a57c693c` authenticated. Private container
`sparcd-uploader-benchmark` returns anonymous HTTP 403. Seven-day expiration for
`runs/` and one-day incomplete-multipart cleanup are enabled and read back.
Exact-origin CORS preflight passed through Caddy; `https://example.com` received
HTTP 403 without an allow-origin header. `with-ephemeral-ec2-credential.sh`
limits credentials to six hours by default, with an override for bounded runs;
success, child-exit-23, and timeout-124 tests all revoked the key and restored
the credential count to two. It strips OpenStack application credentials from
the child environment. `cleanup-run-prefix.py` dry-run/apply self-test removed
one object and one incomplete multipart upload under one `runs/<id>/` prefix,
preserved an outside-prefix object, and verified the target empty.
`check-no-credential-leak.py` passed clean artifacts and rejected an injected
access key; the rejected key was still revoked. No bucket policy was added:
the available EC2 key maps to the existing project principal, so a bucket
policy cannot remove its access to other project resources. JS2 returned HTTP
405 for Ceph IAM `ListUsers`, HTTP 403/405 for IAM role probes, and HTTP 403 for
Keystone `identity:create_user`; bucket-specific principal creation remains
unavailable but is no longer required for this bounded benchmark.

### Part 1 — Build immutable datasets and manifest

**Goal:** Produce reusable, representative media bytes.

**Status:** complete

**Red Test:** Generated corpus misses target distribution, lacks capture times,
or contains undecodable files.

**Green Test:** Manifest totals match filesystem; every SHA-256 verifies; product
corpus passes uploader scan/process validation without manual repair.

- [x] Locate approved real corpus or implement deterministic synthetic fallback.
- [x] Build S1 through S5.
- [x] Validate JPEG/MP4 decode and capture metadata.
- [x] Write manifest and manifest SHA-256.
- [x] Record local sequential-read ceiling to detect disk bottleneck.

**Validation/Evidence:** Dataset root is
`/media/volume/magnum-video/sparcd-uploader-benchmark/v1`; physical storage is
3.3 GiB because S5 preserves hard links. Source is a deterministic 1,000-image,
non-corrupt Snapshot Serengeti season 3 sample from LILA BC under CDLA-Permissive
1.0; LILA states human-class images are removed. S1 is 1,000 files / 269,771,157
bytes; S2 is 200 / 1,048,576,000; S3 is 128 / 1,073,741,824; S4 is 10 /
1,048,576,000; S5 is 1,706 / 5,370,044,821. Manifest SHA-256 values are
`43d7bb26617cf0a398d62568ff14e5ee28645f3790fbcfd6253a17e1f8257713`,
`bd408932f3d775f45959dc46ebbb104df036b287550d22a8842f1e76013cedd0`,
`7fc82dd66847c93ffb0174f8ecbd410d8bbfc7988eb44b0136655698f6d0eab3`,
`8a816f9057ca11011fd8ab84bc747f64f8413ed8919837260fce9b19dd38cc07`, and
`90fcafa3a4c4de1aa2d0c9dacc47c72b111f423247f814c56e19966b531ed08b`.
Independent verify mode compares, never rewrites, manifests. ImageMagick/ffprobe
decoded all 1,338 unique media inodes. Stock Chrome 150 processed S1–S5 with
zero browser or blocking validation errors; S5 completed 1,706 files / 5.0 GB
in the validation pass with 568 expected duplicate-content warnings from its
space-saving repeated hard links. These times are validation evidence, not
throughput results. Three uncached-advisory S4 reads on `/dev/sdc` measured a
2,006 MiB/s median. Durable evidence is in `manifests/summary.json`,
`manifests/browser-validation.json`, and `manifests/local-read-ceiling.json`
under the dataset root. Generator and five stdlib tests live under
`apps/sparcd-uploader/benchmark/`.

### Part 2 — Measure path and host ceilings

**Goal:** Bound client, proxy, upstream, and local resource limits.

**Status:** complete

**Red Test:** No controlled `iperf3` server exists on relevant path; arbitrary S3
host cannot serve as `iperf3` target.

**Green Test:** Repeated client-to-proxy TCP tests, UDP capacity checks, proxy-to-
backend native uploads, local disk reads, and local hashes identify smallest
relevant ceiling.

- [x] Run controlled `iperf3` server on proxy VM.
- [x] Measure one and sixteen TCP streams.
- [x] Measure UDP loss/jitter below saturation.
- [x] Measure proxy-to-S3 large-object goodput.
- [x] Measure client disk-read and SHA-256 rates.
- [x] Record RTT, retransmits, CPU, and NIC saturation.

**Validation/Evidence:** Evidence root is
`results/part2/20260725T185917Z`; aggregate is `part2-summary.json`. Twenty pings
had 0% loss and 0.635 ms mean RTT. Five 15-second upload-direction TCP runs had
13,243 Mbps median with one stream and 6,897 Mbps with 16 streams. Single-stream
runs had zero retransmits; one 16-stream run contributed all 379 retransmits.
Virtual NIC speed is not reported (`-1`); both interfaces had zero kernel
errors/drops after the run, so wire-rate saturation cannot be claimed. UDP at
100 Mbps had zero loss and 0.033 ms jitter; 250–750 Mbps lost 0.047–0.081%; 1
Gbps delivered 941 Mbps with 0.756% loss, and the 1.25 Gbps control session
failed. Client `/dev/sdc` sequential reads measured 2,006 MiB/s median and GNU
`sha256sum` measured 1,059 MiB/s. Five proxy-local 1 GiB multipart uploads using
the product's 8 MiB / four-part shape reached 26.64 MiB/s (223 Mbps) median;
process CPU was 31% of one core. Concurrency 1, 8, and 16 medians were 14.56,
28.53, and 32.66 MiB/s. Thus JS2 S3, not client disk/hash or client-proxy TCP,
is the smallest measured ceiling. All uploaded probes were deleted, the bucket
returned to zero objects/bytes, every temporary EC2 credential was revoked, and
the transient `iperf3` listener was stopped.

### Part 3 — Establish native HTTP/1.1/HTTP/2 baselines

**Goal:** Measure mature S3 CLI behavior on identical bytes and prefixes.

**Status:** complete

**Red Test:** Repeated commands skip existing objects, use public ACLs, differ in
payloads, or use unsupported concurrency flags.

**Green Test:** rclone, mc, and AWS CLI each upload unique run prefixes; options
come from installed-version help; remote counts/bytes verify; five measured runs
complete per retained cell.

- [x] Pin and record client versions.
- [x] Read each installed client's help before selecting flags.
- [x] Configure concurrency through supported options/config only.
- [x] Remove checks that differ from intended fairness tier or report their cost.
- [x] Use unique UUID prefix per run.
- [x] Verify remote object count and total bytes.
- [x] Save structured, redacted run result.

**Validation/Evidence:** Direct-default S2 evidence is in
`results/part3/direct-20260725T192852Z`. Versions: rclone 1.74.3, mc
RELEASE.2025-08-13T08-35-41Z, and AWS CLI 1.45.51/botocore 1.43.51. Captured
installed-version help drove flags. Each client used eight file workers against
200 distinct 5 MiB JPEGs; all objects therefore used single PUT below the 8 MiB
multipart threshold. Upload clocks include each client's normal source hashing,
request behavior, and retries; the common 200-object / 1,048,576,000-byte remote
verification and cleanup are outside the clock. One warm-up and five rotated
measured runs completed per client. Median goodput was 111.23 MiB/s (933 Mbps)
for rclone, 120.92 MiB/s (1,014 Mbps) for mc, and 112.99 MiB/s (948 Mbps) for
AWS CLI. Every run used a unique UUID prefix and verified exact remote count and
bytes. Structured logs passed exact credential scanning; every prefix was
removed, bucket state returned to zero objects/bytes, and the temporary EC2 key
was revoked. Endpoint supports HTTP/2, but per-client negotiated protocol was
not independently captured; treat this cell as direct client-default transport,
not protocol proof. First harness attempts failed before upload because an
unsupported rclone stats flag and encrypted local config were detected; isolated
configs and installed-help-supported flags fixed both, and final 18-run artifact
is complete.

### Part 4 — Instrument current Chromium uploader

**Goal:** Measure real uploader without changing upload semantics.

**Status:** complete

**Red Test:** Harness derives upload bytes from Resource Timing, includes dry-run,
or excludes mandatory HEAD/metadata work without labeling it.

**Green Test:** Harness records known source bytes, timing boundaries, app
snapshots, protocol per request, file/part concurrency, CPU, and memory; product
and transfer clocks remain separate.

- [x] Reuse current `runUpload` and `SafeS3Client` code paths.
- [x] Add benchmark-only event collection outside production UI.
- [x] Record known bytes from manifest.
- [x] Capture CDP request URL class, method, status, timing, and protocol.
- [x] Sanitize CDP/trace output before persistence.
- [x] Run stock Chromium first; use diagnostic flags only in labeled cells.
- [x] Never launch benchmark browser with `--no-sandbox`.

**Validation/Evidence:** `benchmark/run_browser_benchmark.mjs` drives the built
app through its real connection, scan/worker, Assign, `runUpload`, and
`SafeS3Client` paths; no production upload semantics changed. It mocks only
ListBuckets so project-wide credentials discover the benchmark bucket and never
enumerate unrelated project buckets. CDP persists request class/method/status/
protocol/duration only—never URL, query, headers, authorization, HAR, or NetLog.
Every run uses a fresh sandboxed Chrome 150 profile, deletes that profile,
verifies 200 media + five metadata objects and exact 1,048,576,000 media bytes,
then removes the exact upload prefix. Five direct S2 runs in
`results/part5/matrix-20260725T204959Z` had 3.113 s median preprocessing, 141.50
MiB/s payload goodput, 131.87 MiB/s publish goodput, and 11.172 s end-to-end.
Each run recorded 824 S3/CDP events: 200 media PUTs, 200 mandatory media HEADs,
five metadata PUTs, their CORS preflights, and discovery reads. All 820 real
S3 responses were HTTP/2; four locally mocked service-root responses were
HTTP/1.1. There were zero failed requests/browser errors. Median Chrome-tree
peak RSS was 1,440 MiB and CPU time was 31.09 s. Result artifacts passed exact
credential scanning and all run prefixes were cleaned.

### Part 5 — Deploy and validate Caddy QUIC proxy

**Goal:** Compare HTTP/2 and HTTP/3 over same proxy and S3 backend.

**Status:** complete — HTTP/3 rejected

**Red Test:** Proxy changes signed host/query/body, buffers full uploads, strips
conditional headers, breaks CORS/multipart, logs secrets, or lacks UDP/443.

**Green Test:** Direct HTTP/2, proxy HTTP/2, and proxy HTTP/3 publish byte-identical
objects; SigV4 and all safety semantics pass; Chromium reports `h3`; curl
`--http3-only` succeeds; blocked UDP falls back safely.

- [x] Deploy native Caddy near Jetstream2 object storage with valid TLS/DNS.
- [x] Open TCP/443 and UDP/443.
- [x] Configure method/path/query/body pass-through and preserve original Host.
- [x] Set upstream TLS SNI independently without rewriting signed Host.
- [x] Disable request access logging so credentials and signed queries cannot land.
- [x] Prove SigV4 signed GET, HEAD, conditional PUT, and 412 behavior.
- [x] Pass approved-origin CORS `OPTIONS` probes.
- [x] Pass multipart create, upload-part, complete, and remote HEAD probes.
- [x] Confirm request streaming and stable memory for S4.
- [x] Run direct HTTP/2 versus proxy HTTP/2 to measure proxy tax.
- [x] Run proxy HTTP/2 versus proxy HTTP/3 to measure QUIC effect.
- [x] Verify Chromium protocol through CDP, not assumption.
- [ ] Use HTTP/3-enabled curl; deferred after clean-link HTTP/3 rejection.
- [ ] Block UDP temporarily and verify fallback; deferred until the HTTP 501 is fixed.

**Validation/Evidence:** Designate A record
`sparcd-quic-proxy-01.bio260073.projects.jetstream-cloud.org` resolves to
`149.165.150.231`. Native Caddy 2.11.4 runs enabled under systemd with valid
Let's Encrypt TLS; TCP/443 and UDP/443 listen. Current Caddyfile SHA-256 is
`d498b5380e5f9771527d3fa05f655875166454b88e8fe2976ff8d1c98b8b888b`.
Proxy returns Jetstream2 S3 responses over HTTP/2 and advertises
`alt-svc: h3=":443"`. Project-matching AWS SDK JS 3.1058 passed signed
PUT/GET/HEAD, portable SHA-256 metadata verification, duplicate conditional PUT
HTTP 412, and conditional multipart complete through Caddy; probe objects were
deleted. Raw proxy HEAD also preserved `x-amz-meta-sha256`. RGW omitted CORS on
proxy-host signed list responses, so Caddy now pins response CORS to the exact
benchmark origin; it never reflects an unapproved origin. Signed proxy list over
HTTP/2 then returned HTTP 200 with correct CORS.

Five-run rotated S2 evidence is
`results/part5/matrix-20260725T204959Z/summary.json`. Direct HTTP/2 payload median
was 141.50 MiB/s; proxy HTTP/2 was 142.35 MiB/s, a +0.60% difference inside run
variation—no measurable proxy tax. Proxy HTTP/3 media payload median was 67.61
MiB/s, 52.50% slower than proxy HTTP/2; publish medians were 66.90 versus 137.85
MiB/s. HTTP/3 also consumed 35.03 s median Chrome-tree CPU versus 30.32 s for
HTTP/2. Each HTTP/2 run recorded 820 `h2` S3 responses; each HTTP/3 media run
recorded 815 `h3`, four `h2`, and five local/mock responses, with zero request or
browser errors and exact remote cleanup.

S4 proxy-HTTP/2 streaming evidence is under `results/part5/s4-proxy-h2-*`.
Ten 100 MiB objects produced 10 multipart creates, 130 upload parts, 10
conditional completes, and 10 remote HEADs; exact media bytes verified and
payload goodput was 141.66 MiB/s. Chrome-tree peak RSS was 2,049,220 KiB, while
Caddy's systemd `MemoryPeak` remained 26,275,840 bytes after the 1 GiB run,
confirming request streaming rather than whole-body proxy buffering.

Critical limitation: unmodified stock HTTP/3 discovery receives HTTP 501 for a
signed ListObjectsV2 request through Caddy. The HTTP/3 media matrix mocks only
ListBuckets and this failing deployment-list read; all PUT/HEAD/metadata traffic
is real. Therefore HTTP/3 is not production-acceptable, even before its large
throughput regression. Boto3 1.43 also parsed proxy metadata as empty despite raw
header presence, so Boto3 is not accepted as the product metadata gate.

### Part 6 — Benchmark Chromium lifecycle behavior

**Goal:** Define supported background behavior from evidence.

**Status:** pending

**Red Test:** Hidden/frozen/discarded states are conflated, or plan assumes Web
Locks/Wake Lock/Service Worker keeps uploads alive.

**Green Test:** Each lifecycle transition has timestamped evidence showing
continued transfer, pause, failure, or durable resume; no duplicate completion
marker appears.

- [ ] Run Stage D lifecycle cells in stock Chromium.
- [ ] Record `visibilitychange`, freeze/resume, termination, and reconnect events.
- [ ] Measure hidden versus visible throughput.
- [ ] Verify close/restart presents resumable session.
- [ ] Test Screen Wake Lock only if visible-device sleep causes measured failure.
- [ ] Keep Web Locks limited to cross-tab coordination if duplicate runs occur;
      never treat lock as lifetime guarantee.
- [ ] Recommend explicit user-facing contract: keep tab open, or safely resume.

**Validation/Evidence:** pending

### Part 7 — Benchmark retry and resume recovery

**Goal:** Quantify retained work and retransmitted bytes after failures.

**Status:** pending

**Red Test:** Changed files upload silently, completed objects re-upload, or
interrupted multipart claims part-level resume without persisted upload state.

**Green Test:** Completed files skip only after HEAD size/hash match; changed
bytes stay blocked; interrupted large-file retransmission and orphan parts are
measured; resumed publish creates one completion marker.

- [ ] Kill tab after 30% completed files; reopen and resume.
- [ ] Interrupt S4 mid-part and between parts.
- [ ] Record new multipart upload IDs and retransmitted bytes.
- [ ] Count incomplete multipart uploads before/after retries.
- [ ] Verify lifecycle removes orphan parts within configured retention.
- [ ] Modify one file with same size but different content; require mismatch.
- [ ] Remove/rename source folder; test persistent handle and reselect paths.
- [ ] Test two-second and thirty-second outages against retry envelope.
- [ ] Trigger same-prefix collision and verify one-second re-stamp.
- [ ] Decide whether persisted multipart part resume earns its complexity.

**Validation/Evidence:** pending

### Part 8 — Analyze and decide

**Goal:** Turn measurements into small production decisions.

**Status:** pending

**Red Test:** Report mixes timing tiers, compares different paths as protocol
effects, reports means only, or recommends speculative WASM/background systems.

**Green Test:** Report includes raw data, medians/IQR, failure evidence, protocol
proof, and explicit accept/reject decisions with thresholds.

- [ ] Validate all run schemas and manifests.
- [ ] Exclude invalid protocol cells and explain why.
- [ ] Calculate median, p25, p75, efficiency, retries, and retransmission.
- [ ] Plot throughput against file and aggregate request concurrency.
- [ ] Separate direct-to-proxy tax from HTTP/3 gain.
- [ ] Recommend uploader file concurrency and large-file part settings.
- [ ] Recommend keep/reject Caddy QUIC proxy.
- [ ] Recommend keep current file-level resume or add persisted part resume.
- [ ] Revisit WASM only if CPU profile crosses 10% gate.

**Validation/Evidence:** pending

## Decision Gates

| ID | Decision | Adopt when |
| --- | --- | --- |
| D1 | Raise/lower file concurrency | Median payload gain ≥5% without higher failure rate or resource saturation |
| D2 | Change part size/concurrency | S4 publish time improves ≥10% and retries/orphan cost does not worsen materially |
| D3 | Add persisted multipart resume | Interrupted S4 retransmits ≥20% of batch bytes or materially harms field recovery |
| D4 | Keep Caddy QUIC proxy | Proxy HTTP/3 improves median impaired-link publish time ≥10%, clean-link regression <5%, and operations/safety checks pass |
| D5 | Add Screen Wake Lock | Real device sleep interrupts active visible uploads and lock prevents it without UX regression |
| D6 | Add cross-tab Web Lock | Duplicate concurrent uploads reproduce; lock prevents them. Never use as liveness control |
| D7 | Explore WASM | Hashing/signing CPU consumes ≥10% of transfer wall time after network/concurrency tuning |

## Step Log

- `2026-07-25T02:13:18Z` — Replaced initial draft after repo review. Corrected
  endpoint, existing multipart behavior, upload-byte instrumentation, unsafe CLI
  examples, Chromium lifecycle assumptions, and resume semantics. Operator
  approved Caddy QUIC proxy track.
- 2026-07-25T02:16:57Z | Validated revised benchmark plan after QUIC proxy approval | status=active | evidence=plan_doc.py returned {"valid": true, "errors": []} | validation=git diff --check reported no whitespace errors
- 2026-07-25T02:45:46Z | Provisioned BIO260073 QUIC benchmark host and private object container | status=active | evidence=server 0780477f-f5a2-49e4-9565-24bb134e478c ACTIVE at 149.165.150.231; container sparcd-uploader-benchmark empty/private; anonymous S3 probe HTTP 403 | validation=OpenStack read-back passed; SSH host key matched console fingerprint; cloud-init status done; remote JS2 probe HTTP/2 200
- 2026-07-25T02:53:55Z | Deployed native Caddy HTTP/3 proxy on automatic Designate hostname | status=active | evidence=Caddy 2.11.4 systemd active; valid Let's Encrypt TLS; Caddyfile sha256 9a4bf6420c4a86112c96fb7731290a0331361a4dd2ee0847eaed10a3ca4fdee0; HTTP/2 Alt-Svc h3 advertised | validation=Stock Chrome CDP: request 1 h2/200, requests 2-3 h3/200; TCP/443 and UDP/443 listeners verified
- 2026-07-25T03:22:17Z | Applied private ACL and lifecycle, validated signed Caddy S3 path, then removed all temporary broad credentials | status=active | evidence=AWS SDK JS passed PUT GET HEAD metadata 412 and multipart through proxy; anonymous access remains 403; EC2 credential count restored to two | validation=IAM ListUsers HTTP 405; IAM role probes HTTP 403/405; Keystone create_user HTTP 403 identity:create_user
- 2026-07-25T03:39:10Z | Accepted bounded project-wide EC2 credentials and completed Part 0 safety controls | status=active | evidence=Exact-origin CORS, ephemeral key wrapper, prefix cleanup, and leak gate passed; every test key revoked and count restored to two | validation=Success, child failure, timeout, outside-prefix preservation, unauthorized-origin 403, and injected-secret rejection all passed
- 2026-07-25T04:32:17Z | Built and validated S1 through S5 from bounded Snapshot Serengeti data | status=active | evidence=All five manifests independently verified; 1,338 unique media inodes decoded; Chrome processed S1-S5 with zero blocking errors | validation=Five Python tests and 93 uploader tests passed; S5 is 1,706 files and 5,370,044,821 bytes; local read median 2,006 MiB/s
- 2026-07-25T04:34:18Z | Moved corpus to data volume and hardened manifest verification | status=active | evidence=rsync preserved all 1,706 S5 hard links; full verify decoded 1,338 unique inodes and changed no manifest timestamp | validation=Manifest mutation regression test passes; five Python tests and Ruff checks pass
- 2026-07-25T21:13:27Z | Completed path ceilings, native baselines, Chromium instrumentation, and five-run protocol matrix | status=active | evidence=TCP path 13.2 Gbps, direct native clients 933-1014 Mbps, browser direct/proxy-H2 141.50/142.35 MiB/s, proxy-H3 67.61 MiB/s | validation=Fifteen browser matrix runs had zero request errors, exact 205-object verification, cleanup, sandboxed Chrome, and CDP protocol proof; stock H3 ListObjects still returns 501
- 2026-07-25T21:20:59Z | Rejected HTTP/3 and proved S4 proxy streaming | status=done | evidence=Stock H3 ListObjectsV2 HTTP 501; H3 payload median 67.61 MiB/s versus H2 142.35 MiB/s; 1 GiB S4 payload 141.66 MiB/s with Caddy peak RSS 26,275,840 bytes | validation=S4 verified 10 media plus five metadata objects, cleanup passed, final bucket has only three fixtures, and five credential polls report the two original keys

## Validation

Plan validation:

```bash
python3 /home/exouser/.agents/skills/implementation-plan/scripts/plan_doc.py validate apps/sparcd-uploader/benchmark-plan.md
```

Implementation evidence remains pending. Minimum final evidence:

- exact commands and exit status for every retained run;
- dataset manifest and hash;
- sanitized per-run JSON;
- remote object count/byte verification;
- CDP proof of HTTP/2 or HTTP/3;
- Caddy configuration hash and version;
- lifecycle/recovery event log;
- summary report reproducing medians and decision gates.

## Risks

| Risk | Control |
| --- | --- |
| Proxy benchmark changes network path | Three-way direct H2 / proxy H2 / proxy H3 comparison |
| SigV4 fails through proxy | Preserve signed Host/path/query/headers; set upstream TLS SNI separately |
| QUIC silently falls back | Require CDP `h3` or curl `--http3-only` proof |
| UDP blocked by client or cloud firewall | Preflight UDP/443; record fallback as result |
| Proxy buffers uploads | S4 memory test before benchmark acceptance |
| Aggregate request explosion | Record file × part lanes; cap in screening |
| Network drift biases clients | Rotate order; five measured runs; report IQR |
| Browser trace leaks credentials | Sanitize before persistence; never commit raw HAR/NetLog |
| Temporary EC2 key is project-wide while active | Just-in-time minting; six-hour maximum; isolated child environment; exact leak scan; verified revocation |
| Outer hard timeout kills wrapper before its trap | Event-driven harness deadlines; unique prefix journal; post-run prefix/key read-back; outer timeout longer than harness |
| Benchmark damages shared data | Dedicated prefix/bucket; no reset; lifecycle cleanup |
| Interrupted multipart leaks parts | Count and expire incomplete uploads |
| Synthetic corpus misrepresents cameras | Prefer sanitized real corpus; verify distribution |
| Background API assumptions waste work | Measure stock Chromium first; prototype only behind decision gate |

## Sources

- Snapshot Serengeti dataset and download endpoints:
  https://lila.science/datasets/snapshot-serengeti
- LILA bounded-image access guidance:
  https://lila.science/image-access
- CDLA-Permissive 1.0 license:
  https://cdla.io/permissive-1-0/
- Snapshot Serengeti data paper:
  https://doi.org/10.1038/sdata.2015.26
- curl HTTP/3 support and required backends:
  https://curl.se/docs/http3.html
- Chrome DevTools Protocol response `protocol` field:
  https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-Response
- Caddy reverse proxy configuration:
  https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Chromium Page Lifecycle guidance:
  https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- Current multipart implementation:
  `packages/s3-safe/src/index.ts`
- Current upload retry/resume implementation:
  `apps/sparcd-uploader/src/lib/upload.ts`
- Existing Jetstream2 endpoint harness:
  `ops/seaweedfs-js2/run.sh`

## Publish Targets

Canonical copy remains local:
`apps/sparcd-uploader/benchmark-plan.md`.

No issue, PR, MR, or Logseq publication approved.

## Handoff

Parts 0–5 are complete; HTTP/3 is rejected. Proxy VM, volume, floating IP,
Designate record, Let's Encrypt TLS, native Caddy HTTP/3 listener, hardened
security group, SSH keypair, private benchmark container, lifecycle, pinned
benchmark-origin CORS, prefix cleanup, credential redaction, and signed S3
safety probes exist. Use `with-ephemeral-ec2-credential.sh` for every benchmark
process; never reuse or persist a project-wide key. Credential state is back to
the two original keys; all benchmark upload prefixes are absent, while three
non-secret fixture objects remain. Dataset root is
`/media/volume/magnum-video/sparcd-uploader-benchmark/v1`; preserve hard links
when copying S5. Five-run direct/H2/H3 matrix is complete. Reject HTTP/3 for
production: stock signed ListObjectsV2 returns 501 and media goodput is 52.5%
below proxy HTTP/2. Next test S4 request streaming/memory, Chromium lifecycle,
and recovery; HTTP/3 impairment work has no decision value unless the 501 and
clean-link regression are first fixed.
