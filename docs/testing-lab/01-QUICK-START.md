# Quick Start — Your First Test in 5 Minutes

## Prerequisites

1. **Account:** You must be logged in with an `admin` or `developer` role
2. **Worker:** The DigitalOcean worker must be running (you'll see a green dot in the Worker Status bar)
3. **Browser:** Chrome or Firefox recommended

## Step 1: Open the Testing Lab

Navigate to `/admin/research/testing` or click the **"Testing Lab"** button on the Research page (`/admin/research`).

## Step 2: Check the Worker Status

Look at the **Worker Status** bar near the top of the page.

- **Green dot** next to "Health" = Worker is running. You're good to go.
- **Red dot** = Worker is down. Contact your DevOps team before continuing.
- If you see "Not checked," click **Refresh** to check.

## Step 3: Load Test Data

In the **Property Context** bar:

1. Click the **Quick Load** dropdown
2. Select **"Residential — Belton (FM 436)"**
3. The fields auto-fill with a real Bell County address, lat/lon, and county name

## Step 4: Run a Scraper

1. You should be on the **Scrapers** tab (it's selected by default)
2. Click on the **"CAD Scraper"** card to expand it
3. The card shows: `Browser` badge, `5-15s` runtime estimate
4. Click the blue **Run** button

## Step 5: Watch It Work

While running:
- The card border turns **blue**
- An animated shimmer bar appears at the top
- The status dot **pulses**
- A timer counts elapsed time

## Step 6: See Your Results

When it finishes:
- **Green border** = success, **Red border** = error
- Click **Show Debugger** to see the full execution timeline
- The **Output Viewer** below shows the JSON data the scraper returned
- Any screenshots appear in the "Screenshots" tab of the Output Viewer

## Step 7: Try Another Scraper

Collapse the CAD Scraper card (click the header) and try:
- **FEMA Scraper** — checks flood zone (needs lat/lon, which the fixture provides)
- **GIS Scraper** — pulls parcel geometry (needs address)

## What's Next?

- **Want to understand the full UI?** Read [Interface Guide](./02-INTERFACE-GUIDE.md)
- **Want to edit code and test changes?** Read [Code Editing & Deployment](./06-CODE-AND-DEPLOY.md)
- **Want to learn the debugger?** Read [Debugger Guide](./05-DEBUGGER-GUIDE.md)
- **Building a new county adapter?** Read [County Adapter Development](./07-COUNTY-ADAPTERS.md)
