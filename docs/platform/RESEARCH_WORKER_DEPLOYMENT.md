# Research Worker — Which Machine, and How to Stand It Up

**Date:** 2026-08-02 · **Budget constraint:** ≤ $70/month, set by the owner · **Plan item:** R7 of
`docs/planning/in-progress/RESEARCH_PLATFORM_DEEP_BUILD_2026-08-02.md`

---

## 1. The recommendation

> ## THE MACHINE IS IN **VIENNA**, NOT MANASSAS — found 2026-08-29, and it turned out to be survivable
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
> **TESTED 2026-08-29, FROM THE SERVER ITSELF — `BELL: 200`. NOT BLOCKED.**
> ```bash
> curl -s -o /dev/null -w "%{http_code}\n" https://bell.tx.publicsearch.us/
> ```
> Vienna costs latency and nothing else, and the build proceeded on that basis.
>
> Worth being precise about what happened here: the geo-block fear was reasonable, well-founded in
> §1's own table, and **wrong about this portal**. A ten-second curl settled a question that was
> otherwise heading toward a support ticket and a relocation. Run it from the box before blaming a
> European IP for anything, and run it first on any future machine outside the US — it is the
> cheapest measurement on this page and it replaced an argument.
>
> It is also per-portal, not per-continent. Bell answering 200 does not promise the next county will.
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
> | Caddy is missing or ancient on Debian | Debian package index | **2.6.2**; `reverse_proxy` and `transport http` both exist at that version. ⚠ **This row checked that the DIRECTIVES exist, not that §3.3 nested them correctly — and it did not.** The config it vouched for made `transport` a sibling of `reverse_proxy` and used a one-line brace block, and 2.6.2 rejects both. A version check is not a config check. |
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

# Firewall: SSH, HTTP and HTTPS. The worker itself binds to 127.0.0.1 and is never exposed directly.
#
# PORT 80 IS NOT OPTIONAL, even though nothing is served on it. Caddy issues certificates with
# ACME's HTTP-01 challenge, which Let's Encrypt validates by connecting to port 80. It can fall
# back to TLS-ALPN-01 on 443, so a 443-only box eventually gets a certificate — after a failed
# challenge, a retry and a confusing minute in the logs. Port 80 also serves the HTTP->HTTPS
# redirect; blocked, an http:// URL hangs rather than redirecting.
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

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
```

**Then build `.env` by prompt rather than by editor.** Hand-editing this file in `nano` over SSH is
the fiddliest step on the page, and the two mistakes it invites are the two that cost the most (see
below). This asks for each value, writes them correctly, and never echoes them back:

```bash
cd /opt/starr/worker

# Strip the keys we are about to set, so there is exactly one definition of each.
grep -v -E '^#?\s*(WORKER_API_KEY|ANTHROPIC_API_KEY|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|STORAGE_BACKEND|R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_BUCKET)=' .env.example > .env

# EVERY read HAS `< /dev/tty`, AND THAT IS NOT DECORATION.
#
# Without it, pasting this block feeds the script its OWN REMAINING LINES into the prompts. `read`
# takes stdin, and stdin during a paste is the rest of the paste. The first run of this block on the
# live box wrote the literal text `read -r -p "R2_ACCOUNT_ID: " V5` into .env as a value, and
# `docker compose` then refused to start:
#
#     failed to read .env: line 229: unexpected character "\"" in variable name
#
# `< /dev/tty` forces each prompt to read the keyboard instead. Do not remove it to "simplify".
echo "Paste each value from Doppler prd, then Enter."
read -r -p "WORKER_API_KEY (copy EXACTLY from Doppler): " V1 < /dev/tty
read -r -p "ANTHROPIC_API_KEY: " V2 < /dev/tty
read -r -p "SUPABASE_URL: " V3 < /dev/tty
read -r -p "SUPABASE_SERVICE_ROLE_KEY: " V4 < /dev/tty
read -r -p "R2_ACCOUNT_ID: " V5 < /dev/tty
read -r -p "R2_ACCESS_KEY_ID: " V6 < /dev/tty
read -r -p "R2_SECRET_ACCESS_KEY: " V7 < /dev/tty

cat >> .env <<EOF

WORKER_API_KEY=$V1
ANTHROPIC_API_KEY=$V2
SUPABASE_URL=$V3
SUPABASE_SERVICE_ROLE_KEY=$V4
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=$V5
R2_ACCESS_KEY_ID=$V6
R2_SECRET_ACCESS_KEY=$V7
R2_BUCKET=starr-recon-artifacts
EOF

# NOTE THE CHARACTER CLASS: [A-Za-z_][A-Za-z0-9_]* , WITH DIGITS.
#
# The first version of this line used [A-Za-z_]+ and silently failed on every key containing a digit
# — R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. Those fell into the "not a key=value
# line" branch and were printed unconditionally, so WORKER_API_KEY deduped and the R2 keys did not.
# Half a dedupe looks exactly like a whole one until you count per key.
# Keep the FIRST definition of each key and drop the rest. Running this block twice — which is easy
# to do when a paste does not take the first time — otherwise leaves two sets of values in the file.
# Compose reads the last one, so it still works, and that is exactly what makes it worth removing:
# a secrets file with two answers is a question nobody wants to be asking in six months.
awk -F= '!/^[A-Za-z_][A-Za-z0-9_]*=/ { print; next } !seen[$1]++ { print }' .env > .env.tmp && mv .env.tmp .env

# Drop anything that is not a comment, a blank line, or KEY=value. The dedupe above passes unknown
# lines through untouched, so stray script text survives it — as it did on the live box.
grep -E '^[[:space:]]*(#|$)|^[A-Za-z_][A-Za-z0-9_]*=' .env > .env.tmp && mv .env.tmp .env

# Must print 0. Anything else means a line survived that Compose will choke on.
grep -cvE '^[[:space:]]*(#|$)|^[A-Za-z_][A-Za-z0-9_]*=' .env

# THE CHECK THAT ACTUALLY SETTLES IT: every key exactly once. Every number must be 1.
#
# Three weaker checks preceded this one and each missed a real duplicate — eyeballing a masked list,
# then counting a single key, then counting malformed lines. A file can have zero malformed lines and
# still define R2_ACCOUNT_ID twice. Count what you care about, per key, and read the numbers.
for k in WORKER_API_KEY ANTHROPIC_API_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY \
         STORAGE_BACKEND R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  printf "%-28s %s\n" "$k" "$(grep -cE "^$k=" .env)"
done

chmod 600 .env

# Confirm they landed WITHOUT printing them: first six characters only.
grep -E '^(WORKER_API_KEY|ANTHROPIC_API_KEY|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|STORAGE_BACKEND|R2_)' .env | sed -E 's/=(.{0,6}).*/=\1…/'

# Nine lines, not eighteen. If a key appears twice the dedupe did not run.
test "$(grep -cE '^WORKER_API_KEY=' .env)" = "1" && echo "OK: one definition per key" || echo "DUPLICATES — rerun the awk line above"
```

> **The two that bite, and they fail in opposite directions.**
>
> **`WORKER_API_KEY` must be COPIED from Doppler, never generated.** Generate a fresh one and the
> worker runs perfectly while the app reports it unreachable — a failure that looks like a network
> problem and is not. `configWarnings()` flags it at boot now, but matching the value avoids the
> question.
>
> **`STORAGE_BACKEND` must be `r2`, not the default `local`.** `local` writes research artifacts to
> the worker's own disk, and that disk is precisely what was destroyed with the DigitalOcean droplet.
> Rebuilding on `local` sets the identical trap knowingly. The script above hard-codes `r2` for that
> reason.
>
> The masked `grep` at the end exists because "I pasted it" and "it is in the file" are different
> claims, and only one of them is checkable.

```bash
BUILD_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
docker compose ps                          # worker should reach (healthy) within ~90s
curl -s localhost:3100/healthz | jq
```

The build pulls `mcr.microsoft.com/playwright` and takes several minutes the first time.

A healthy response looks like:

```json
{ "status": "ok", "buildSha": "48a6067", "browser": { "backend": "local", "ok": true, "durationMs": 640 },
  "queue": { "activePipelines": 0, "maxConcurrentPipelines": 6, "limitedBy": "ceiling" }, "warnings": [] }
```

If `status` is `degraded`, read `browser.lastError` — it is Playwright's own message, and it is
almost always a missing system library or an image/driver version mismatch.

### 3.3 TLS and the public edge

The worker binds to `127.0.0.1:3100`. Put Caddy in front so Vercel can reach it over HTTPS with a
real certificate.

> **DO THE DNS RECORD FIRST.** Caddy requests a certificate the moment it loads a config naming a
> host, and Let's Encrypt validates that request by connecting to whatever `worker.starr-surveying.com`
> resolves to. Point the `A` record at the server, wait for it to resolve, *then* write the
> Caddyfile. Out of order it is not fatal — Caddy retries with backoff and succeeds once DNS
> catches up — but the first minutes produce certificate errors that look like a broken config,
> and the obvious response to those is to start changing the config that was right.
>
> ```bash
> dig +short worker.starr-surveying.com    # must print the server IP before you continue
> ```
>
> As of 2026-08-29 that record still points at `104.131.20.240` — the destroyed DigitalOcean
> droplet. It must become `152.53.48.240`.

```bash
apt install -y caddy
cat > /etc/caddy/Caddyfile <<'CADDY'
worker.starr-surveying.com {
	# NESTING MATTERS. `transport` is a SUBdirective of `reverse_proxy`, not a site-level one, and
	# Caddy 2.6.2 (what Ubuntu 24.04 ships) rejects the one-line `{ ... }` brace form outright:
	#
	#     Error during parsing: Unexpected next token after '{' on same line
	#
	# The first version of this runbook had them as siblings AND on one line. Both wrong, and the
	# service refuses to start rather than starting with a default timeout — which is the good
	# failure, but only because Caddy validates its whole config at load.
	reverse_proxy 127.0.0.1:3100 {
		# A research run streams for 20–30 minutes; the default 100s proxy timeout would sever it
		# mid-run, and the app would see a truncated response rather than an error.
		transport http {
			read_timeout 45m
		}
	}
}
CADDY
# `reload` on a unit that has never started fails. `enable --now` is idempotent and covers both
# the fresh install and the re-edit.
# Validate BEFORE restarting: this parses the config without touching the running service, so a
# typo is a message instead of a failed unit you then have to read journalctl to understand.
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy && systemctl restart caddy

# Watch the certificate actually arrive rather than assuming it did — this is where DNS problems
# surface, and they surface as ACME errors naming the host.
journalctl -u caddy -n 30 --no-pager
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

### 3.5 Verify the AUTHENTICATED surface — the half /healthz cannot see

`/healthz` is unauthenticated on purpose: it is what a laptop holding no secret can ask, and it is
what the reboot check and the hourly watchdog use. That is also its limit. It cannot tell you:

- whether the app's `WORKER_API_KEY` and the worker's are **the same string**, or
- whether a vendor credential that is *present* actually **works**.

Both are "configured" as far as `/healthz` is concerned, and both break a run twenty minutes in.

**None of the commands below buys anything.** They read state.

```bash
cd /opt/starr/worker
KEY=$(grep '^WORKER_API_KEY=' .env | cut -d= -f2-)

# Do the keys agree? 200 = yes. 403 = the app and the worker hold different keys.
# 401 would mean no header arrived, which is a problem with the command, not the deployment.
curl -sS -o /dev/null -w "auth: HTTP %{http_code}\n" \
  -H "Authorization: Bearer $KEY" localhost:3100/research/active

# Which document platforms does the worker believe it can buy from?
# This is where a funded TexasFile account shows up as usable rather than credential-less.
curl -sS -H "Authorization: Bearer $KEY" localhost:3100/research/purchase/platforms/status | head -c 2000; echo

# The routing view: which access platforms are reachable per county.
curl -sS -H "Authorization: Bearer $KEY" localhost:3100/research/access/platforms | head -c 2000; echo

# Per-vendor site health.
curl -sS -H "Authorization: Bearer $KEY" localhost:3100/admin/health/sites | head -c 2000; echo
```

From a laptop, with the real environment, the same key question in one command:

```bash
doppler run --config prd -- npm run verify:worker
```

That runs the `/healthz` verdict AND the key check, and exits non-zero if the worker cannot take a
deep run or if the key is rejected. Without `WORKER_API_KEY` it says the key check was SKIPPED
rather than passing quietly — a laptop run must not be mistakable for a credential check.

> **PRESENCE IS NOT FUNCTION, and this section exists because the distinction keeps costing time.**
> The worker warns when `TEXASFILE_USERNAME` is absent. It cannot warn when the login is wrong, the
> password has changed, or the account balance is spent — all of which produce a run that works
> perfectly until it reaches a paywall. The same is true of `WS_TICKET_SECRET`: the app and the
> worker can both have one and still not have the *same* one, and the symptom is a WebSocket that
> closes immediately with no useful error.
>
> The only complete test of the purchase path is a research run against a real property, and that
> spends money — roughly \$1–3 per document plus Anthropic tokens. Run it deliberately, once, after
> funding the account, rather than discovering the answer during a job.

### 3.6 Updating

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
