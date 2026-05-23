# Blnq ⚡

**Blnq** is a minimal, fast, and secure file sharing application. It is designed to let users drag-and-drop or select any file, upload it anonymously, and instantly receive a shareable link.

The application is built on top of **Next.js App Router** (frontend) and **Cloudflare Workers + R2 Storage** (backend), providing zero-cold-start performance, high scalability, and extremely low storage and hosting costs.

---

## Features

- 📁 **Instant Drag-and-Drop / Browse Picker**: Easily upload any file format.
- 🔄 **Real-Time Progress Tracking**: Uses native connection hooks via `XMLHttpRequest` to show precise percentage-based upload progress.
- 🕵️ **Complete Privacy**: Original filenames are completely scrubbed. Links use a generated obfuscated slug of format `[adjective]-[noun]-[4-char-alphanumeric].[ext]` (e.g., `silent-harbor-k3x9.png`).
- 📚 **Sizable Word Pools**: Adjective and noun pools contain **500+ hand-picked words each**, yielding over **250,000+** base combination permutations before appending a 4-character suffix. Permutations are effectively infinite ($> 4.2 \times 10^11$).
- ⚙️ **Configurable Worker Endpoint**: Users can configure their deployed API URL directly in the web UI. Configs persist across sessions in local storage.
- 🎨 **Polished Dark Aesthetic**: Sleek dark mode design with modern subtle glow gradients, fluid transitions, and copy-to-clipboard functionality.

---

## Project Structure

```
blnq/
├── worker/               # Cloudflare Worker API
│   ├── src/
│   │   ├── index.ts      # Multipart parsing, R2 ingestion, and download routing
│   │   └── words.ts      # 500+ adjectives and 500+ nouns arrays
│   ├── tsconfig.json
│   ├── wrangler.toml     # Cloudflare wrangler config
│   └── package.json
└── frontend/             # Next.js App Router UI
    ├── src/app/
    │   ├── page.tsx      # Dropzone UI, settings panel, and upload progress hook
    │   ├── layout.tsx
    │   └── globals.css
    ├── package.json
    └── tailwind.config.ts
```

---

## 🛠️ Setup & Deployment Guide

### Part 1: Cloudflare Worker Backend & R2 Storage

#### 1. Setup Cloudflare R2 Bucket
Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/), navigate to **R2 Storage**, and click **Create bucket**:
- Bucket name: `blnq-storage`

#### 2. Install wrangler CLI & Log in
Navigate to the `worker/` directory and log in to Cloudflare from your terminal:
```bash
cd worker
npm install
npx wrangler login
```

#### 3. Update Configuration
Open `@/worker/wrangler.toml` and configure your R2 bucket bindings. Make sure it points to your created bucket name:
```toml
[[r2_buckets]]
binding = "BLNQ_BUCKET"
bucket_name = "blnq-storage"
```

Configure your base public domain (or Cloudflare Workers dev domain):
```toml
[vars]
PUBLIC_URL_PREFIX = "https://blnq.click"
ALLOWED_ORIGIN = "*" # Use your Next.js frontend URL in production for stricter security
```

#### 4. Deploy your Worker
Deploy the worker live onto Cloudflare's Edge Network:
```bash
npm run deploy  # Or npx wrangler deploy
```
Once deployed, take note of the returned endpoint URL (e.g., `https://blnq.click`).

---

### Part 2: Next.js Frontend App

#### 1. Configure the Frontend
Navigate to the `frontend/` directory and install the packages:
```bash
cd ../frontend
npm install
```

To set a default API URL that applies to all users out-of-the-box, create a `.env.local` file inside the `frontend/` directory:
```env
NEXT_PUBLIC_API_URL=https://blnq.click
```

*Note: Individual users can also update this endpoint in real-time inside the web app's Settings panel (persisted in local storage).*

#### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to see your Blnq application.

#### 3. Build & Deploy Frontend
Build the frontend for optimal production hosting (e.g., Vercel, Netlify, or Cloudflare Pages):
```bash
npm run build
```

### Part 3: Supabase (profiles, uploads, subscription tiers)

1. Open the Supabase SQL editor for your project and run [`supabase-schema.sql`](./supabase-schema.sql). This creates/updates the `profiles`, `uploads`, `bundles`, and supporting tables plus the new subscription metadata columns (`stripe_customer_id`, `subscription_status`, `plan_expires_at`, etc.).
2. Expose `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the frontend along with the corresponding service key in the Worker environment (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
3. Billing state is stored per-profile; the Worker now exposes `/api/plans` using the shared `TIER_LIMITS`, `TIER_FEATURES`, and public Stripe plan definitions for the UI. Keep these constants in sync if you change pricing.

### Part 4: Worker-tier enforcement & quotas

The Cloudflare Worker uses the shared tier config (`worker/src/tiers.ts`) to gate uploads before they hit Supabase:

1. **Guest quotas (KV):** `RATE_LIMIT` now tracks `guest:ip:*` and `guest:fp:*` keys. Guests are capped at **3 uploads per 24h**, using `CF-Connecting-IP` plus an optional `x-fp-hash` header (sha256 of your fingerprint). If you provide the header from the frontend the Worker will shadow-block fingerprints that rotate IPs.
2. **Authenticated rate limits (Supabase):** Every upload (direct, bundle member, remote) counts toward `uploadsPerHour` for the current tier. Free users stop at 20/hr, Pro at 100/hr, Ultimate at 500/hr. The Worker queries Supabase with `Prefer: count=exact` so make sure `increment_profile_usage` exists.
3. **Feature gating:** Bundles, PINs, and custom expiry are enforced server-side. Guests/free uploads auto-expire after 72h even if the UI requests “no expiry”. Attempts to set a PIN/expiry/bundle without the right plan return HTTP 403.
4. **Storage enforcement:** `profiles.storage_used` and `bytes_uploaded_total` are incremented through the `increment_profile_usage` RPC and decremented on delete. Free plans have a hard 5 GB ceiling, so keep that RPC deployed whenever you run the schema migrations.
5. **Remote fetch ceiling:** Remote uploads automatically clamp to the lesser of `REMOTE_FETCH_MAX_SIZE_BYTES` and the tier’s `maxFileSize`. Upgrade plans to unlock the 2 GB / 5 GB ceilings.

---

## 🛡️ CORS and Custom Domain (Optional but Recommended)

By default, Cloudflare Workers do not require custom domains to operate and handle CORS. However, if you are downloading or viewing rich media, utilizing a **Custom Domain** mapped to your Worker is recommended because it bypasses Cloudflare Workers' default 100MB body limit constraints and standard browser media restrictions.

1. Under your Cloudflare Worker dashboard, go to **Triggers** -> **Custom Domains** -> **Add Custom Domain** (e.g., `api.yourdomain.com`).
2. Update your `wrangler.toml` `PUBLIC_URL_PREFIX` to point to `https://blnq.click` (or your own custom domain).
3. Re-deploy the worker using `npx wrangler deploy`.

### Automating R2 Bucket CORS Rules

Direct-to-R2 uploads require the bucket itself to allow browser `PUT`/`GET`/`HEAD`/`OPTIONS` requests from your frontend origins. Run the helper script to configure the CORS policy through Cloudflare's API:

```bash
node scripts/set-r2-cors.mjs
```

The script reads credentials from `.env` (or environment variables) and expects:

- `CLOUDFLARE_API_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`

By default it enables origins `http://localhost:3000` and `https://blnq.click`, allows `GET,HEAD,PUT,OPTIONS`, permits all headers, and exposes `etag`, `content-length`, `content-type`, and `x-amz-request-id`. You can override these defaults via the following optional variables:

- `R2_CORS_ALLOWED_ORIGINS` – comma-separated list of origins
- `R2_CORS_ALLOWED_METHODS` – comma-separated methods (e.g., `GET,PUT`)
- `R2_CORS_ALLOWED_HEADERS` – comma-separated headers or `*`
- `R2_CORS_MAX_AGE` – integer seconds (default `86400`)

After running, the script also fetches the applied configuration so you can confirm the rule set without leaving the terminal.

### Worker Secrets for Presigned Uploads

The Worker signs R2 URLs using AWS SigV4, so it must know your access keys. Set the following once per environment (and redeploy afterwards):

```
cd worker
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_ACCOUNT_ID   # optional if already in wrangler.toml vars
```

> **Note:** Do not leave placeholders like `${CLOUDFLARE_ACCESS_KEY_ID}` in production. The Worker will refuse to issue presigned URLs if it detects unresolved placeholders or missing secrets.

When editing the CORS policy manually through the Cloudflare dashboard, ensure the rule includes `OPTIONS` in `AllowedMethods`; without it, browsers will fail the preflight request before the upload even begins.

### Remote URL Uploads

The Worker now supports server-side fetching of remote files via `POST /api/remote-upload`. Configure an optional size cap to guard against giant downloads:

```
wrangler secret put REMOTE_FETCH_MAX_SIZE_BYTES   # defaults to 104857600 bytes (100MB)
```

Requests should include a JSON body:

```jsonc
{
  "url": "https://example.com/cat.png",
  "user_id": "<optional supabase user id>",
  "filename": "cat.png",            // optional override
  "pin": "1234",                    // optional PIN just like direct uploads
  "expires_in": "24h"               // matches the existing 1h/24h/7d options
}
```

The Worker rejects private-network hosts, MIME types outside the existing allowlist, and any file that exceeds the configured byte limit. Successful responses mirror `/api/complete-upload` and include the finalized slug + share URL so the frontend can reuse its existing success UI.
