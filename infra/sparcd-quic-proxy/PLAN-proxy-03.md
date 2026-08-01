# Plan: migrate to sparcd-quic-proxy-03

Goal: replace proxy-02 with an instance whose name carries a fresh
Let's Encrypt budget, whose certificates survive rebuilds, and which we can
reconfigure without rebuilding at all. Public access is unchanged throughout:
HTTPS on 443/8443/8444/8445, HTTP/3 advertised, open to everyone. Tailscale
(if enabled) is an additional private interface for admin SSH only — it
cannot affect how uploaders reach the proxy.

## Why each piece

- **New name (proxy-03)**: LE limits 5 identical-hostname certs per rolling
  7 days; proxy-02's budget is spent until ~Aug 6. A new hostname starts fresh.
- **Cert volume**: `server rebuild` wipes the root disk but preserves attached
  volumes. Mounting a small volume at `/var/lib/caddy` means certificates are
  issued once and reused forever — rebuilds stop consuming LE budget.
- **Tailscale (optional)**: SSH from Ecuador residential/hotspot networks is
  defeated by CGNAT (per-flow egress IPs); Tailscale gives a stable private
  path for `systemctl reload caddy`-class changes. Requires a tailnet auth key
  supplied at deploy time via an untracked file — never committed.

## Steps

1. **Volume**: `openstack volume create --size 8 sparcd-quic-proxy-certs`.
2. **Cloud-init v3** (this directory): port-correct snippet Caddyfile (already
   written) with the proxy-03 hostname; `fs_setup` (ext4, `overwrite: false`)
   + mount of the volume at `/var/lib/caddy` before Caddy installs, chown
   `caddy:caddy` after; BBR enabled
   (`net.ipv4.tcp_congestion_control=bbr` + `net.core.default_qdisc=fq`);
   optionally Tailscale install + `tailscale up --authkey` templated from an
   untracked `tailscale.key` by a small `deploy.sh`.
3. **Instance**: `sparcd-quic-proxy-03`, m3.tiny, Featured-Minimal-Ubuntu24,
   keypair `sparcd-quic-proxy-02` (this Mac's key), security groups
   `sparcd-quic-proxy` + `sparcd-quic-proxy-02-ssh`, volume attached,
   the v3 user-data.
4. **Floating IP**: move `149.165.155.148` from proxy-02 to proxy-03 (no new
   quota; JS2 DNS auto-records follow the association). proxy-02 goes dark.
5. **Verify** (all before touching the app): four ports serve; signed
   stat on :443 AND :8443 (the Host/port fix's proof); h3 via aioquic without
   content-length (the request_buffers proof); CORS on GET and preflight.
6. **App side**: only the hostname changes — connection endpoint and Settings
   shard list swap `proxy-02` → `proxy-03` (+ ports :8443/:8444/:8445 now
   usable: 4 origins from one box, plus proxy-01 as a 5th if wanted).
7. **Cleanup**: after a green end-to-end upload, delete proxy-02 (its volume-
   less disk holds nothing) and update README/memory. proxy-01 stays (not ours).

## Options to decide

- **Tailscale**: include (needs an auth key from the user's tailnet) or skip
  (cert-volume alone already makes rebuilds cheap; SSH stays best-effort).
- **Mixed-protocol fleet**: while editing, optionally mark :8444/:8445 h2-only
  so future per-shard weighting can choose protocols empirically ("smart
  QUIC"). Zero cost now; defer the app-side weighting to the adaptive-v2 work.

## Rollback

proxy-02 keeps existing until step 7; moving the floating IP back restores it
in ~a minute. Nothing in this plan touches storage, credentials, or the app's
committed defaults.
