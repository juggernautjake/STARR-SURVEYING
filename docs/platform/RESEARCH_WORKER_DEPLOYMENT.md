# Research Worker — Which Machine, and How to Stand It Up

**Date:** 2026-08-02 · **Budget constraint:** ≤ $70/month, set by the owner · **Plan item:** R7 of
`docs/planning/in-progress/RESEARCH_PLATFORM_DEEP_BUILD_2026-08-02.md`

---

## 1. The recommendation

> ## ⚠ WHAT WAS ACTUALLY PROVISIONED IS IN **VIENNA**, NOT MANASSAS — found 2026-08-29
>
> The SCP reports `Site: Vienna`. Measured from the office, the server answers in **142 ms** while
> the Bell County records portal it exists to scrape answers in **56 ms** — a Manassas box would be
> 30–50 ms. That is a transatlantic round trip on every page load.
>
> **§1's own table predicted this**, and it is the reason a US location was specified in the first
> place: *"the worker's job is scraping Texas county portals and US paid-document platforms. A German
> IP invites geo-blocks, extra captchas and outright bans."* The requirement was written down, and
> the order did not carry it.
>
> **Latency is the smaller half.** The real exposure is that US county portals challenge or block
> non-US addresses, and a brand-new European datacentre IP is the exact profile that gets challenged.
>
> **Test before deciding, and before building:**
> ```bash
> curl -s -o /dev/null -w "%{http_code}\n" https://bell.tx.publicsearch.us/
> ```
> `200` means Vienna is slower but usable. `403`/`429`/timeout means it is not, and the build should
> wait.
>
> **A REINSTALL DOES NOT MOVE THE SERVER.** It wipes the OS on the same machine in the same
> datacentre. Relocating means a support ticket asking for Manassas (MNZ), or a new order — not the
> reinstall that looks like the obvious fix.
>
> If it is blocked, Browserbase is the answer already paid for: valid key, **zero sessions in four
> months**, and per-adapter routing exists precisely so US browser sessions can be used for the
> portals that object without becoming the global default.

> **netcup RS 4000 G12 — 12 dedicated AMD EPYC 9645 (Zen 5) cores, 32 GB DDR5 ECC, 1 TB NVMe,
> deployed in Manassas, Virginia (US).**
> **€33.55/mo net ≈ $38.5/mo** at €1 = $1.1465 (2 Aug 2026). Roughly **55% of the budget**, leaving
> ~$31/mo for CapSolver, Browserbase sessions on the handful of portals that need a residential IP,
> and paid documents.

If a run ever needs more headroom than that, the same family's **RS 8000 G12** — 16 cores, 64 GB,
2 TB — is €59.97/mo net ≈ **$68.75**, still inside the cap but with almost no room for FX movement
(the euro traded between 1.1356 and 1.2019 during 2026; at the top of that range it is $72 and over
budget). Start on the RS 4000; it is a resize, not a migration.

### Why this one

| Requirement from the owner's ask | What decides it |
|---|---|
| "many cores that are fast" | 12 **dedicated** Zen 5 cores. Not shared vCPU — a 25-minute run cannot absorb a noisy neighbour, and steal time on a shared box shows up as a Chromium timeout that looks like a broken county site. |
| "multiple lines of research" | 32 GB is ~11 concurrent Chromium runs by memory, 8 by CPU. The worker settles on 6 for a reason that is not the hardware (below). |
| "handle all of the requirements" | Playwright + Chromium, OCR, PDF and image decoding are RAM-hungry and bursty; ECC DDR5 and NVMe are exactly the right shape. |
| **US IP address** | Manassas, Virginia. This is the single most underrated line in the table: the worker's job is scraping *Texas county* portals and US paid-document platforms. A German IP invites geo-blocks, extra captchas and outright bans. Hetzner's cheap dedicated boxes are EU-only. |
| ≤ $70/month | $38.5. |

### What it was measured against

Prices are monthly, as of 2 August 2026, converted at €1 = $1.1465. Netcup's list prices include 19%
German VAT; a US business supplies its details and is invoiced **net**, so the net column is the real
one for this firm.

| Option | Cores | RAM | Disk | US location | Price/mo | Verdict |
|---|---|---|---|---|---|---|
| **netcup RS 4000 G12** | **12 dedicated** | **32 GB ECC** | 1 TB NVMe | **Yes — Manassas VA** | **~$38.5** | **Chosen.** Best cores-per-dollar with a US IP. |
| netcup RS 8000 G12 | 16 dedicated | 64 GB ECC | 2 TB NVMe | Yes | ~$68.75 | Fits, barely. The upgrade path, not the start. |
| netcup RS 2000 G12 | 8 dedicated | 16 GB ECC | 512 GB | Yes | ~$20.7 | Viable if budget tightens; 16 GB caps concurrency at ~4. |
| Hetzner CCX23 (cloud, dedicated vCPU) | 4 | 16 GB | 160 GB | Yes (Ashburn/Hillsboro) | ~$98 | **Over budget.** Hetzner's June 2026 increase raised CCX/CPX by 113–176%. |
| Hetzner CPX42 (cloud, shared vCPU) | 8 shared | 16 GB | 320 GB | Yes | ~$80 | Over budget *and* shared cores. |
| Hetzner AX41 (bare metal) | 6c/12t Ryzen | 64 GB | 2×512 GB NVMe | **No — EU only** | ~$59 | Great hardware, wrong continent for this workload. |
| Contabo Cloud VPS L | up to 64 shared | large | large | Yes | ~$24–68 | Cheapest headline numbers; **shared** CPU with a long-standing reputation for oversubscription and slow I/O. Wrong risk for a 25-minute run. |
| OVHcloud Rise-1 (US bare metal) | varies | varies | varies | Yes | ~$62–66 | Inside budget but fewer cores per dollar, and setup fees are common. |
| OVHcloud Advance-2 2026 | 8c/16t EPYC | — | — | Yes | ~$173 | Far over budget. |
| DigitalOcean (current droplet) | 2–4 shared | 4–8 GB | — | Yes | ~$48–63 | What is deployed today, unreachable as of this writing, and poor value at this price. |

**The two things that eliminated most of the field:** Hetzner's June 2026 price increase took its
dedicated-vCPU cloud line out of contention entirely, and the US-IP requirement took its excellent
bare-metal line out with it. Netcup's G12 root servers happen to sit exactly on the intersection —
dedicated cores, ECC memory, US datacentre, EU pricing.

### GPU: deliberately not rented

Nothing in this pipeline benefits. Vision and extraction are Claude API calls — the inference runs on
Anthropic's hardware, not ours. OCR is per-adapter today and moving to a shared service (plan R18);
Tesseract is CPU-bound and fine on 12 cores. A GPU would be the single most expensive line item on
the bill and would idle through every run. Revisit only if we ever self-host a vision model, which
this plan does not propose.

---

## 2. Sizing: why the worker admits 6 runs and not 11

`worker/src/infra/capacity.ts` computes the limit at boot from what the machine actually reports, and
`/healthz` publishes both the answer and the reason. On the recommended box:

```
12 cores, 32 GB → max 6 concurrent research run(s);
limited by ceiling (cpu→8, memory→11, ceiling→6)
```

- **memory → 11** — 4 GB reserved for the OS, Redis and the worker's baseline; 2.5 GB budgeted per
  run (Chromium with several tabs is 0.5–1.0 GB RSS, plus page images and PDF buffers in flight).
- **cpu → 8** — 1.5 cores per run. Rendering and decoding spike; waiting on a county's server does
  not.
- **ceiling → 6** — *not a hardware number.* These are small government servers, and the fastest way
  to lose access to a county portal is to look like a load test. Per-host politeness is enforced
  separately (plan R12); this is the second wall behind it.

A run the box cannot hold is refused with a `503 … retryable: true` rather than accepted. Refusing is
recoverable; accepting and OOM-killing a neighbour at minute 22 destroys work that has already been
paid for.

---

## 3. Standing it up

**The live machine runs Ubuntu 24.04.4 LTS (noble) minimal, as this section always assumed.** It
arrived as Debian 13 on 2026-08-28 and was reinstalled to Ubuntu on 2026-08-29 — for an unrelated
reason, recorded below because the reason is the useful part.

> ### It was reinstalled because the ROOT PASSWORD was lost, not because Debian was wrong
>
> Two days went to a password: netcup's initial one, then a changed one that was not written down,
> then a reset. **The fix that ended it was not remembering a password — it was ceasing to use one.**
> The reinstall attached an SSH key from SCP and set *SSH password authentication* to **off**, so the
> root password is now break-glass for the browser console only.
>
> Do that on day one next time. The install form takes a key, and the whole class of problem
> disappears with it.
>
> **Two things worth knowing about that form**, both of which cost a round trip to discover:
>
> - Its **timezone list is Europe-only** — there is no `America/Chicago` to pick. Set it in the
>   **Custom Script** box instead, which runs as root at the end of installation. Same for the
>   locale.
> - That Custom Script box will run the **whole of 3.1**. Pasting host prep there means the server
>   comes up with Docker, ufw, swap and the right clock already done, and the first SSH login is a
>   verification rather than a work session. It is the single biggest time saver on this page.
>
> Verify it actually ran before believing it: `timedatectl | grep "Time zone"` should say
> `America/Chicago`. If it still says Berlin, the script did not fire and 3.1 must be pasted by hand.

> ### The Debian delta, kept because the next machine may arrive as Debian too
>
> While the box ran Debian 13, the obvious move was to reinstall to match this runbook. Three worries
> were checked instead of assumed, and all three came back fine:
>
> | Worry | Checked | Result |
> |---|---|---|
> | Docker has no `trixie` repo yet | `download.docker.com/linux/debian/dists/trixie/Release` | **HTTP 200** — published |
> | Caddy is missing or ancient on Debian | Debian package index | **2.6.2** in trixie; `reverse_proxy` + `transport http { read_timeout }` both fine |
> | Playwright's browser libraries are Ubuntu-only | `worker/Dockerfile` | **Irrelevant** — the runtime stage is `mcr.microsoft.com/playwright:v1.58.2-jammy`, so Playwright brings its own Ubuntu userland inside the container |
>
> That last row is the one that settles it. **The host never runs Playwright**, so the host
> distribution barely matters: it needs Docker, ufw, Caddy, swap and a timezone. On Debian the only
> change is `linux/debian` instead of `linux/ubuntu` in the Docker apt source.
>
> The generalisable bit: when the environment differs from the runbook, check which of the runbook's
> assumptions the difference actually touches, rather than forcing the environment back to match the
> document. The reinstall that eventually happened was for the password, not the distribution.

**Also leave the `netcup Mail Block` firewall policy in place.** netcup's provisioning email explains
how to delete it, because most customers want to send mail. This worker never sends SMTP — outbound
email is Resend, from Vercel — so deleting it opens outbound SMTP on a research box for no reason.

Ordered in the **Manassas (MNZ)** location.

### 3.1 Host preparation

```bash
# As root, on the fresh server.
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw fail2ban

# Docker Engine + compose plugin
#
# THE ONE LINE THAT DIFFERS BY DISTRIBUTION. The live box is Ubuntu, so this reads linux/ubuntu; on
# Debian it is linux/debian and nothing else changes — `$VERSION_CODENAME` resolves itself (noble /
# trixie). See the Debian note at the top of §3.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Firewall: SSH and HTTPS only. The worker itself binds to 127.0.0.1 and is never exposed directly.
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 443/tcp && ufw --force enable

# Swap as a safety net, not a strategy. If the worker is swapping regularly the concurrency is
# wrong — fix that, don't add swap.
fallocate -l 8G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf

timedatectl set-timezone America/Chicago   # the firm's clock, so logs read the way people speak
```

### 3.2 The worker

```bash
git clone https://github.com/juggernautjake/STARR-SURVEYING.git /opt/starr
cd /opt/starr/worker
cp .env.example .env && $EDITOR .env      # fill the four REQUIRED values at minimum

BUILD_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
docker compose ps                          # worker should reach (healthy) within ~90s
curl -s localhost:3100/healthz | jq
```

A healthy response looks like:

```json
{ "status": "ok", "buildSha": "48a6067", "browser": { "backend": "local", "ok": true, "durationMs": 640 },
  "queue": { "activePipelines": 0, "maxConcurrentPipelines": 6, "limitedBy": "ceiling" }, "warnings": [] }
```

If `status` is `degraded`, read `browser.lastError` — it is Playwright's own message, and it is
almost always a missing system library or an image/driver version mismatch.

### 3.3 TLS and the public edge

The worker binds to `127.0.0.1:3100`. Put Caddy in front so Vercel can reach it over HTTPS with a
real certificate:

```bash
apt install -y caddy
cat > /etc/caddy/Caddyfile <<'CADDY'
worker.starr-surveying.com {
    reverse_proxy 127.0.0.1:3100
    # A research run streams for 20–30 minutes; the default 100s proxy timeout would sever it.
    transport http { read_timeout 45m }
}
CADDY
systemctl reload caddy
```

Then point an `A` record at the server and set, in the Vercel project:

```
WORKER_URL=https://worker.starr-surveying.com
WORKER_API_KEY=<the same value as in worker/.env>
```

The app verifies this itself: `/admin/research` shows a banner naming the exact problem —
unreachable, credentials disagree, or running-but-cannot-open-a-browser — and stays quiet when the
worker is healthy.

### 3.4 Prove it survives a reboot — before you need it to

**Do not skip this, and do not reason about it.** The previous worker's defining failure was not a
crash: it was being *silently absent*. Unreachable since 2026-08-02, noticed weeks later, and
consistent with a stack that never came back after a host restart. Nothing in this runbook up to
this point actually demonstrates that it would.

`restart: unless-stopped` in `docker-compose.yml` only helps if the Docker daemon itself starts at
boot. Docker's Ubuntu packages normally enable it — *normally* is the operative word, and this is
cheap to confirm and expensive to assume:

```bash
systemctl is-enabled docker        # must print: enabled
systemctl enable docker            # if it did not

reboot
```

Then, from **your own machine** rather than the server:

```bash
curl -m 10 https://worker.starr-surveying.com/health
```

That single command tests the whole chain the app depends on — DNS, the firewall, Caddy, the
certificate, the container, and the daemon that had to start it. Checking `docker ps` over SSH
proves only that the container is up, which is the part that was never in doubt.

> One caveat worth knowing: `unless-stopped` means exactly that. A container you stopped by hand
> before rebooting stays stopped, deliberately. If you stop the worker to debug something, start it
> again rather than rebooting and expecting Docker to.

### 3.5 Updating

```bash
cd /opt/starr && git pull
cd worker && BUILD_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

`buildSha` on `/healthz` confirms which commit is actually serving — the point of stamping it.

---

## 4. Running cost, all in

| Line | Monthly |
|---|---|
| netcup RS 4000 G12 (Manassas) | ~$38.50 |
| Domain / DNS (existing) | $0 |
| Redis, Caddy, TLS | $0 — same box, Let's Encrypt |
| **Fixed subtotal** | **~$38.50** |
| Headroom inside the $70 cap | **~$31.50** |

That headroom is deliberately left for the variable costs a run actually incurs — Claude calls,
paid document pages, CapSolver solves, occasional Browserbase sessions. **None of it is measured
yet**: `research_usage_events` has 0 rows and nothing writes to it (plan §2.3). Plan R4 is what turns
this table from a budget into a fact, and R5 enforces per-run ceilings against it.

---

## 5. What is deliberately not decided here

- **Whether to keep the DigitalOcean droplet.** It is unreachable as of 2026-08-02. Nothing in this
  document depends on it; migrating is a fresh install plus a DNS change.
- **Browserbase, per adapter.** Kept as an escape hatch for portals that block datacentre IPs. It is
  billed per session, so it belongs in the variable column and behind
  `BROWSERBASE_ENABLED_ADAPTERS`, never as the default backend.
- **Captcha solving policy.** Some counties forbid automated access in their terms. Which counties
  we are willing to automate is an owner decision (plan §4.3), not a configuration default.
