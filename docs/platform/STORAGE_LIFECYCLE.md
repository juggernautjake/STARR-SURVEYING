# Document Storage Lifecycle (Cloudflare R2)

> **Status:** Spec only — not applied. The buckets and lifecycle rules
> below are activated when Cloudflare R2 is provisioned for the project
> and `STORAGE_BACKEND=r2` is set on the worker. Until then, the worker
> writes to the local filesystem under `./storage/` (default
> `STORAGE_LOCAL_ROOT`).

## Bucket Layout

Two buckets, separated by retention class — one with lifecycle rules,
one without. Both are private (no public-read).

### `starr-recon-artifacts` — operational artifacts

Lifecycle-managed working set. Anything in here is recoverable from a
re-scrape, so we trade durability for cost.

| Key prefix                          | Contents                                          | Lifecycle rule                               |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| `documents/<jobId>/<filename>`      | Extracted PDFs (deeds, plats, surveys)            | **Retain forever** (downstream of share UI)  |
| `raw-html/<jobId>/<seq>.html.gz`    | Raw scraped HTML — kept for re-extraction         | Delete after **90 days**                     |
| `screenshots/<jobId>/<seq>.png`     | Adapter-debug screenshots                         | Delete after **30 days**                     |
| `captcha-evidence/<jobId>/<seq>.bin`| CAPTCHA challenge frames (compliance / disputes)  | Delete after **30 days**                     |
| `pipeline-artifacts/<jobId>/…`      | _Reserved for future migration of artifact-uploader.ts._ Today these still write to Supabase Storage. | n/a |

### `starr-recon-regression` — golden references

Used by the regression test suite. **No lifecycle rules** — everything
is permanent. Small enough that the cost is negligible.

| Key prefix                              | Contents                              |
| --------------------------------------- | ------------------------------------- |
| `regression/inputs/<county>/<seed>/…`   | Frozen scrape inputs                  |
| `regression/expected/<county>/<seed>/…` | Frozen expected outputs               |

## Cloudflare Lifecycle Rule JSON

Apply once via `wrangler r2 bucket lifecycle put` (or the dashboard).
Rules are evaluated daily by Cloudflare; deletions happen asynchronously.

```json
{
  "rules": [
    {
      "id": "raw-html-90d",
      "enabled": true,
      "conditions": { "prefix": "raw-html/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 7776000 } }
    },
    {
      "id": "screenshots-30d",
      "enabled": true,
      "conditions": { "prefix": "screenshots/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 2592000 } }
    },
    {
      "id": "captcha-evidence-30d",
      "enabled": true,
      "conditions": { "prefix": "captcha-evidence/" },
      "deleteObjectsTransition": { "condition": { "type": "Age", "maxAge": 2592000 } }
    }
  ]
}
```

`documents/` has no rule — those are the user-facing PDFs and must be
preserved indefinitely (until the user explicitly deletes a project).

## CORS Policy

Tickets and signed URLs are issued by the Next.js app at the same
origin, so cross-origin reads from the browser are not required for
the normal flow. However, if a future feature surfaces R2 URLs to the
browser directly:

```json
[
  {
    "AllowedOrigins": ["https://starr-surveying.com", "https://*.starr-surveying.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

## Operational Notes

- **Endpoint format**: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.
  R2 accepts the standard S3 SDK with `region: 'auto'`.
- **Egress is free** within Cloudflare. Pulling from a non-Cloudflare
  origin (DigitalOcean droplet today) is also free, which is one of the
  reasons we picked R2 over S3.
- **Multi-part uploads** are supported by the SDK if a single document
  exceeds 5 GiB, but no document type we ingest today approaches that
  threshold. Leaving multipart unimplemented in `storage.ts` until
  needed.

## Code Reference

The runtime side lives in [`worker/src/lib/storage.ts`](../../worker/src/lib/storage.ts).
The local backend writes to `./storage/` so dev and CI never need
network access.

## Activation Runbook

See
[`docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md`](../planning/in-progress/PHASE_A_INTEGRATION_PREP.md)
"R2 activation" section.
