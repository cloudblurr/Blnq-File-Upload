blnq v3


Domo:
Here's your full feature prompt:

---

File Host — Full Feature Set

> Add the following features to the existing Next.js 15 + Supabase + Cloudflare Workers + R2 file host. Do not modify any existing upload, auth, storage, or security logic. Only add to it.
>
> ---
>
> 1. Expiring Links with Custom Messages
> On upload, add optional fields: expires_after_views (integer, 1–100) and expiry_message (string, max 200 chars). Store both on the uploads row. On every file access, increment a view_count column. If view_count >= expires_after_views, mark the file as expired and render the expiry_message instead of the file. If no custom message is set, show a default: *"This file is no longer available."* Also support date-based expiry (expires_at) as already implemented — whichever condition is hit first triggers expiry.
>
> ---
>
> 2. QR Code Generation
> On every successful upload (single or bundle), generate a QR code for the share URL using the qrcode npm package. Store the QR as a small PNG in R2 under qr/[slug].png. On the result page and dashboard, display the QR with a one-click download button. Also expose it at /api/qr/[slug] so it can be embedded anywhere.
>
> ---
>
> 3. Upload via URL (Remote Fetch)
> Add a second upload mode on the frontend: a URL input field alongside the file picker. When a URL is submitted, the Worker fetches the remote file server-side, validates its MIME type and size against the user's tier limits, runs it through the full security pipeline (magic bytes, malware scan, hash blocklist), then stores it in R2 as if it were a direct upload. Return the same slug/share URL. Reject URLs that resolve to private IP ranges (10.x, 172.16.x, 192.168.x, 127.x) to prevent SSRF attacks.
>
> ---
>
> 4. Drag-to-Reorder Bundles
> On the bundle management page in the dashboard, add drag-to-reorder for files within a bundle using @dnd-kit/core. Persist the order as a position integer column on the uploads table. The /b/[slug] gallery page renders files in position order ascending.
>
> ---
>
> 5. View Counter
> Track view counts on both uploads and bundles. Add view_count bigint default 0 to both tables. Increment on every access via a Supabase RPC call to avoid race conditions:
>
> create or replace function increment_views(row_id uuid, table_name text)
> returns void as $$
> begin
>   execute format('update %I set view_count = view_count + 1 where id = $1', table_name)
>   using row_id;
> end;
> $$ language plpgsql;
> 
> Show view counts in the dashboard per file and bundle. Optionally show publicly on the file page as a small subtle counter.
>
> ---
>
> 6. Reactions on Bundles
> Add an emoji reaction bar to bundle pages: 👍 ❤️ 🔥 😮 😂. Store reactions in a bundle_reactions table: bundle_id, emoji, ip_hash, created_at. One reaction per IP per bundle (upsert on change). Display live counts next to each emoji. No account required to react. Update counts optimistically on the frontend and confirm via a POST /api/react/[slug] endpoint.
>
> ---
>
> 7. Comments on Bundles
> Add optional threaded comments to bundle pages. Schema:
>
> bundle_comments
>   id, bundle_id, user_id (nullable for guests),
>   guest_name (nullable), parent_id (nullable for threading),
>   body text, created_at, is_flagged boolean default false
> 
> Guest comments require a name field and Turnstile verification. Authenticated comments use the account display name. Add a "flag comment" button that sets is_flagged = true and surfaces it in the admin reports queue. Bundle owners can delete comments on their own bundles.
>
> ---
>
> 8. Embed Codes
> On every file and bundle result page, add an "Embed" button that opens a modal with auto-generated embed codes:
> - Direct URL — raw file URL
> - Markdown — `

![filename](url)

for images, [filename](url) for others
> - **BBCode** — [img]url[/img] for images, [url=url]filename[/url] for others
> - **HTML** — <img src="url"> for images, <video src="url" controls> for video, <a href="url"> for others
> - **iFrame** — <iframe src="/f/[slug]"> for embeddable content
> Each has a one-click copy button. Auto-select the most relevant format based on MIME type.
>
> ---
>
> **9. Storage Quota UI**
> In the dashboard, render a storage usage bar for free users:
> ``
> [████████░░] 4.1GB / 5GB used
> Upgrade to Pro for unlimited storage →
> `
> Compute from `sum(file_size)` on the uploads table filtered by `user_id`. Show per-file size in the uploads list. For Pro/Ultimate users show total uploaded without a cap. Add a subtle upsell banner when free users exceed 80% of their quo10. Paste from Clipboardfrom Clipboard**
> On the upload page, add a global `paste` event listener. When the user pastes an image from their clipboard (e.g. a screenshot), auto-populate the file input and show a preview. Trigger upload on confirmation. Works on both guest and authenticated flo11. Text / Code Snippet Supportnippet Support**
> Add a third upload mode: a textarea for raw text or code. On submit, store as a `.txt` or language-specific file in R2. On the file page, render with syntax highlighting using `shiki` (supports 100+ languages, zero client-side JS). Auto-detect language or let the user select from a dropdown. Shareable and embeddable like any other fi12. ZIP Download for Bundlesad for Bundles**
> Add a "Download all" button on bundle pages. On click, call `GET /api/bundle/[slug]/zip`. The Worker streams all files from R2, compresses them using the `fflate` library (WASM-compatible, works in Workers), and returns a ZIP named `[bundle-slug].zip`. For large bundles, generate the ZIP asynchronously and store in R2 temporarily, returning a download link when rea13. Vanity URLs (Ultimate tier only)ate tier only)**
> Allow Ultimate users to set a custom alias for any upload or bundle: `yourhost.com/v/[vanity]`. Store in a `vanity_urls` table: `alias text unique, target_slug text, user_id, created_at`. On `/v/[alias]`, look up the target slug and redirect. Validate aliases: lowercase alphanumeric + hyphens only, 3–30 chars, no reserved words (api, admin, dashboard, f, b, v, qr). One vanity URL per file/bundle, unlimited vanity URLs per Ultimate accou14. API Access with Keys (Ultimate tier only)ate tier only)**
> Add an API key management page under `/dashboard/api`. Generate keys in the format `fh_live_[32-char base58]`, store a SHA-256 hash in Supabase (never the raw key). Keys are shown once on creation. Each key has a label, `last_used_at`, and `is_active` toggle. Authenticate Worker requests via `Authorization: Bearer fh_live_...` header — hash the incoming key and compare to stored hashes. Rate limit API key requests to 500/hr via KV. Document the following endpoints for API users:
> - `POST /api/upload` — upload a file
> - `DELETE /api/file/[slug]` — delete a file
> - `GET /api/file/[slug]/info` — get file metadata
> - `POST /api/bundle` — create a bundle
> - `GET /api/bundle/[slug]/info` — get bundle metad15. Scheduled Deletion (Pro + Ultimate)ro + Ultimate)**
> Add a date/time picker on the upload form (and in the dashboard per file) for scheduling deletion at a specific timestamp. Store as `scheduled_delete_at timestamptz`. Add a Cloudflare Worker cron trigger (`0 * * * *` — runs hourly) that queries Supabase for rows where `scheduled_delete_at <= now()` and `deleted_at is null`, deletes the R2 objects, and marks rows as deleted. Notify the uploader via email (Resend) when a scheduled deletion fir16. DMCA Takedown Flow Takedown Flow**
> Add a public `/dmca` page with a form: `{ complainant_name, complainant_email, file_url, description, signature }`. On submit, insert into a `dmca_requests` Supabase table and send an email notification to your admin address via Resend.

Add a /admin/dmca dashboard (admin-only, gated by a is_admin boolean on the users table) to review requests. Actioning a request: one-click removes the R2 object, marks the upload row dmca_removed: true, and renders a 451 Unavailable For Legal Reasons page at the file URL. Send a confirmation email to the complainant.
>
> ---
>
> 17. Dark/Light Mode
> Add a theme toggle (sun/moon icon) in the site header. Persist preference in localStorage and respect prefers-color-scheme as the default. Implement via a data-theme attribute on the <html> element with CSS variables for all colors. No full page reload on toggle. Apply to all public-facing pages and the dashboard.
>
> ---
>
> **18. Admin Dashboard (/admin)**
> Gated by is_admin: true on the users table. Sections:
Reports queueue** — flagged files, comments, abuse reports. One-click remove + ban actions.
DMCA queueue** — as above
Quarantine queueue** — files pending malware review
User listst** — search by email, view storage used, tier, upload count. Actions: ban, change tier, delete all uploads
Platform statsts** — total files, total storage used, signups today/week/month, uploads today/week/month. Rendered as simple line charts using recharts.
>
> ---
>
> Do not modify any existing upload, auth, storage, abuse prevention, or malware scanning logic. Only add these features on top of what already exists.

---

That covers the full feature surface for a competitive file host. Want me to now generate the full combined prompt — security layer + all features together in one paste?

Here's the security-focused starter prompt:

---

File Host — Abuse Prevention, Rate Limiting & Malware Scanning

> Add the following security and abuse prevention layer to the existing Next.js 15 + Supabase + Cloudflare Workers + R2 file host.
>
> ---
>
> 1. Cloudflare Turnstile (Bot Protection)
> Add Turnstile to the upload form on the frontend. On every upload request (guest or logged in), verify the Turnstile token in the Worker before processing anything:
>
> const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
>   method: 'POST',
>   body: JSON.stringify({
>     secret: env.TURNSTILE_SECRET,
>     response: formData.get('cf-turnstile-response'),
>     remoteip: request.headers.get('CF-Connecting-IP')
>   })
> });
> const { success } = await verify.json();
> if (!success) return new Response('Bot detected', { status: 403 });
> 
>
> ---
>
> 2. Guest Rate Limiting (Cloudflare KV)
> For unauthenticated uploads, track by IP in KV with a 24hr TTL:
> - Max 3 uploads per day per IP
> - Max 400MB per file
> - Block with a 429 and message: *"Daily limit reached. Create a free account to continue."*
>
> Also generate a browser fingerprint on the frontend using @fingerprintjs/fingerprintjs (free tier). Hash it and send as a header x-fp-hash. Store alongside the upload row. If the same fingerprint hits the limit across multiple IPs, shadow-block it (accept the request but silently discard).
>
>
> const ip = request.headers.get('CF-Connecting-IP');
> const fp = request.headers.get('x-fp-hash') ?? 'unknown';
> const ipKey = `rl:ip:${ip}`;
> const fpKey = `rl:fp:${fp}`;
>
> const [ipRecord, fpRecord] = await Promise.all([
>   kv.get(ipKey, 'json'),
>   kv.get(fpKey, 'json')
> ]);
>
> if (ipRecord?.count >= 3 || fpRecord?.shadowBlock) {
>   return new Response(JSON.stringify({ error: 'Daily limit reached.' }), { status: 429 });
> }
> 
>
> ---
>
> 3. Authenticated Rate Limiting (Supabase)
> For logged-in users, enforce per-hour upload rate in Supabase:
>
> select count(*) from uploads
> where user_id = $user_id
> and created_at > now() - interval '1 hour';
> 
> - Free tier: max 20 uploads/hr
> - Pro/Ultimate: max 100 uploads/hr
> - Return 429 if exceeded
>
> Also track cumulative bytes uploaded (not just current storage) in a bytes_uploaded_total column on the users table. Free users capped at 5GB total stored. Update on every upload and delete.
>
> ---
>
> 4. File Type Validation
> Never trust the Content-Type header — validate the actual file signature (magic bytes) in the Worker before writing to R2:
>
> const buffer = await file.arrayBuffer();
> const bytes = new Uint8Array(buffer).slice(0, 12);
>
> const signatures: Record<string, number[][]> = {
>   'image/jpeg': [[0xFF, 0xD8, 0xFF]],
>   'image/png': [[0x89, 0x50, 0x4E, 0x47]],
>   'image/gif': [[0x47, 0x49, 0x46, 0x38]],
>   'image/webp': [[0x52, 0x49, 0x46, 0x46]],
>   'video/mp4': [[0x00, 0x00, 0x00, 0x18], [0x00, 0x00, 0x00, 0x20]],
>   'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
>   'application/zip': [[0x50, 0x4B, 0x03, 0x04]],
> };
>
> // Reject if declared MIME doesn't match actual bytes
> // Reject .exe, .sh, .bat, .ps1, .msi outright regardless of declared type
> 
> Maintain a blocklist of prohibited extensions: .exe .dll .sh .bat .ps1 .msi .vbs .cmd .scr .jar. Return 400 if matched.
>
> ---
>
> 5. Malware Scanning
> Scan every uploaded file before writing to R2 using one of the following (choose based on budget):
>
> Option A — ClamAV on a sidecar worker (self-hosted, free)
> Deploy a small Hetzner VPS running ClamAV with a REST wrapper. After receiving the upload in the Worker, forward the file bytes to the scanner endpoint before storing:

>
> const scanResult = await fetch('https://scanner.yourhost.com/scan', {
>   method: 'POST',
>   body: buffer,
>   headers: { 'Authorization': `Bearer ${env.SCANNER_SECRET}` }
> });
> const { clean } = await scanResult.json();
> if (!clean) return new Response('File failed malware scan', { status: 422 });
> 
> This adds ~200–500ms latency on uploads but catches known malware signatures.
>
> Option B — VirusTotal API (managed, free tier)
> Hash the file with SHA-256, check VirusTotal's database first (instant, no latency). If unknown, submit for async scanning and quarantine the file in a separate R2 bucket until clean:
>
> const hash = await crypto.subtle.digest('SHA-256', buffer);
> const hexHash = Array.from(new Uint8Array(hash))
>   .map(b => b.toString(16).padStart(2, '0')).join('');
>
> const vtCheck = await fetch(`https://www.virustotal.com/api/v3/files/${hexHash}`, {
>   headers: { 'x-apikey': env.VT_API_KEY }
> });
>
> if (vtCheck.status === 200) {
>   const report = await vtCheck.json();
>   const malicious = report.data.attributes.last_analysis_stats.malicious;
>   if (malicious > 0) return new Response('File flagged as malicious', { status: 422 });
> }
> // If 404 (unknown hash), store in quarantine bucket and submit for async scan
> 
>
> Recommendation: Use VirusTotal for known-hash lookups (free, instant) and ClamAV as a fallback for unknown files.
>
> ---
>
> 6. SHA-256 Hash Blocklist
> Maintain a KV store of known-bad file hashes. Check on every upload before scanning:
>
> const hexHash = // ... computed above
> const blocked = await kv.get(`blocklist:${hexHash}`);
> if (blocked) return new Response('File is blocked', { status: 422 });
> 
> Add to the blocklist when VirusTotal or ClamAV flags a file. Hashes are permanent — even if the file is deleted, the hash stays blocked.
>
> ---
>
> 7. Quarantine Flow
> Files that fail scanning are never written to the public R2 bucket. Instead:
> - Write to a private quarantine R2 bucket
> - Insert a row into a quarantine_log Supabase table: hash, ip, fingerprint, user_id, mime_type, flagged_at, reason
> - If the same IP or fingerprint submits 3+ quarantined files, auto-ban: set a banned: true flag in KV with a 7-day TTL
> - Send yourself an email notification via Resend or Postmark on every quarantine event
>
> ---
>
> 8. Content Moderation (CSAM)
> This is non-negotiable for any public file host. Integrate one of:
> - Amazon Rekognition — DetectModerationLabels API, flags explicit/suggestive content
> - Google Cloud Vision SafeSearch — similar, slightly cheaper at scale
>
> Run on every image/video upload asynchronously after storing in quarantine. If flagged at the highest severity, delete immediately, log the hash permanently, and report via NCMEC's CyberTipline API if CSAM is detected. This is a legal requirement in the US.
>
> ---
>
> 9. Abuse Reporting
> Add a report endpoint and a small "Report this file" link on every public file/bundle page:
> - POST /api/report accepts { slug, reason, contact? }
> - Inserts into a reports Supabase table
> - After 3 reports on the same slug, auto-quarantine and notify you
> - Add a /admin/reports dashboard route (admin-only) to review and action
>
> ---
>
> Do not modify any existing upload, auth, or storage logic. Only add these layers on top.

---

## Why Each Layer Matters

| Threat | Defense |
|---|---|
| Bots bulk uploading | Turnstile |
| VPN/IP cycling abuse | Fingerprinting + shadow block |
| Malware distribution | Magic byte validation + ClamAV + VirusTotal |
| Known bad files re-uploaded | SHA-256 blocklist in KV |
| CSAM | Rekognition/Vision + NCMEC reporting |
| Executable disguised as image | Magic byte check overrides declared MIME |
| Repeat offenders | Auto-ban on 3+ quarantine hits |
| Community-reported content | Abuse report flow + auto-quarantine threshold |

The ClamAV sidecar on Hetzner fits your existing infrastructure perfectly — you already have Hetzner in your stack so it's one more small VPS rather than a new vendor.

Subscription Model

Free
Pro
Ultimate
Price
$0
$5/mo or $40/yr
$9.99/mo or $84/yr
Max file size
400MB
2GB
5GB
Total storage
5GB
Unlimited
Unlimited
File expiry
72hr max
Permanent
Permanent
Bundles
❌
✅ 20 files
✅ 20 files
PIN protection
❌
✅
✅
Custom expiry
❌
✅
✅
Scheduled deletion
❌
✅
✅
Dashboard
❌
✅
✅
View counts
❌
✅
✅
Upload presets
❌
✅
✅
Bulk actions
❌
✅
✅
Folder organization
❌
✅
✅
Duplicate detection
❌
✅
✅
Tags + search
❌
✅
✅
Email notifications
❌
✅
✅
File versioning
❌
❌
✅
Recycle bin (30d)
❌
❌
✅
Vanity URLs
❌
❌
✅
API access
❌
❌
✅
Webhook support
❌
❌
✅
Public profile page
❌
❌
✅
Shareable upload page
❌
❌
✅
CLI + browser ext
❌
❌
✅
Priority support
❌
❌
✅
QR codes
✅
✅
✅
Embed codes
✅
✅
✅
Paste from clipboard
✅
✅
✅
Dark/light mode
✅
✅
✅
Reactions
✅
✅
✅
Upload via URL
✅
✅
✅
Text/code snippets
✅
✅
✅
Pricing Notes
Annual discount saves users ~33% and gives you upfront cash flow — worth prominently featuring on the pricing page.
Guest uploads stay permanently free with no account, capped at 3 files/day and 72hr expiry. This is your top-of-funnel.

Here it is:

---

File Host — Complete Platform Prompt

> Build and extend a full-stack file hosting platform on the following stack: Next.js 15 App Router, Supabase Auth + Postgres (RLS), Cloudflare Workers, Cloudflare R2, Cloudflare KV, Cloudflare D1, Stripe for payments. TypeScript throughout. Do not modify any existing upload, auth, or storage logic unless explicitly stated. Only add to it.
>
> ---
>
> ## Database Schema
>
> `sql
> -- users (extends Supabase auth.users)
> create table profiles (
>   id uuid references auth.users primary key,
>   username text unique,
>   display_name text,
>   email text,
>   tier text default 'free', -- free | pro | ultimate
>   is_admin boolean default false,
>   storage_used bigint default 0,
>   bytes_uploaded_total bigint default 0,
>   stripe_customer_id text,
>   stripe_subscription_id text,
>   referred_by uuid references profiles,
>   referral_code text unique,
>   created_at timestamptz default now()
> );
>
> -- uploads
> create table uploads (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   bundle_id uuid references bundles,
>   slug text unique not null,
>   r2_key text not null,
>   mime_type text,
>   file_size bigint,
>   original_name text,
>   password_hash text,
>   expires_at timestamptz,
>   expires_after_views int,
>   expiry_message text,
>   view_count bigint default 0,
>   scheduled_delete_at timestamptz,
>   deleted_at timestamptz,
>   dmca_removed boolean default false,
>   is_nsfw boolean default false,
>   position int default 0,
>   tags text[],
>   version int default 1,
>   parent_slug text,
>   created_at timestamptz default now()
> );
>
> -- bundles
> create table bundles (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   slug text unique not null,
>   title text,
>   password_hash text,
>   view_count bigint default 0,
>   is_nsfw boolean default false,
>   tags text[],
>   thumbnail_r2_key text,
>   created_at timestamptz default now()
> );
>
> -- vanity_urls
> create table vanity_urls (
>   alias text primary key,
>   target_slug text not null,
>   user_id uuid references profiles,
>   created_at timestamptz default now()
> );
>
> -- api_keys
> create table api_keys (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   label text,
>   key_hash text unique not null,
>   last_used_at timestamptz,
>   is_active boolean default true,
>   created_at timestamptz default now()
> );
>
> -- bundle_reactions
> create table bundle_reactions (
>   id uuid primary key default gen_random_uuid(),
>   bundle_id uuid references bundles,
>   emoji text not null,
>   ip_hash text not null,
>   created_at timestamptz default now(),
>   unique(bundle_id, ip_hash)
> );
>
> -- bundle_comments
> create table bundle_comments (
>   id uuid primary key default gen_random_uuid(),
>   bundle_id uuid references bundles,
>   user_id uuid references profiles,
>   guest_name text,
>   parent_id uuid references bundle_comments,
>   body text not null,
>   is_flagged boolean default false,
>   created_at timestamptz default now()
> );
>
> -- reports
> create table reports (
>   id uuid primary key default gen_random_uuid(),
>   slug text,
>   reason text,
>   contact text,
>   resolved boolean default false,
>   created_at timestamptz default now()
> );
>
> -- dmca_requests
> create table dmca_requests (
>   id uuid primary key default gen_random_uuid(),
>   complainant_name text,
>   complainant_email text,
>   file_url text,
>   description text,
>   signature text,
>   actioned boolean default false,
>   created_at timestamptz default now()
> );
>
> -- quarantine_log
> create table quarantine_log (
>   id uuid primary key default gen_random_uuid(),

>   hash text,
>   ip text,
>   fingerprint text,
>   user_id uuid references profiles,
>   mime_type text,
>   reason text,
>   flagged_at timestamptz default now()
> );
>
> -- upload_presets
> create table upload_presets (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   name text,
>   settings jsonb,
>   created_at timestamptz default now()
> );
>
> -- folders
> create table folders (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   name text,
>   created_at timestamptz default now()
> );
>
> -- upload_folders (join table)
> create table upload_folders (
>   upload_id uuid references uploads,
>   folder_id uuid references folders,
>   primary key (upload_id, folder_id)
> );
>
> -- webhooks (Ultimate only)
> create table webhooks (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   url text not null,
>   events text[], -- upload | view | delete | expire
>   secret text,
>   is_active boolean default true,
>   created_at timestamptz default now()
> );
>
> -- notifications
> create table notifications (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   type text,
>   message text,
>   read boolean default false,
>   created_at timestamptz default now()
> );
>
>
> Apply RLS: authenticated users can only SELECT/UPDATE/DELETE their own rows. Public SELECT on uploads/bundles is allowed only when `deleted_at is null` and `dmca_removed = false`. Password gating is enforced at the Worker level.
>
> ---
>
> ## Tier Limits
>
> Enforce these limits in the upload Worker before processing:
>
> 
typescript
> const TIER_LIMITS = {
>   guest:    { maxFileSize: 400 * 1024 * 1024, maxStorage: 0,                  uploadsPerHour: 3  },
>   free:     { maxFileSize: 400 * 1024 * 1024, maxStorage: 5 * 1024 * 1024 * 1024, uploadsPerHour: 20 },
>   pro:      { maxFileSize: 2 * 1024 * 1024 * 1024, maxStorage: Infinity,      uploadsPerHour: 100 },
>   ultimate: { maxFileSize: 5 * 1024 * 1024 * 1024, maxStorage: Infinity,      uploadsPerHour: 500 },
> };
>
>
> For free users, enforce `storage_used + incomingFileSize <= 5GB`. Show an upsell banner at 80% quota. Guests are tracked by IP + fingerprint only.
>
> ---
>
> ## Feature-to-Tier Gating
>
> 
typescript
> const TIER_FEATURES = {
>   bundles:            ['pro', 'ultimate'],
>   pinProtection:      ['pro', 'ultimate'],
>   customExpiry:       ['pro', 'ultimate'],
>   scheduledDeletion:  ['pro', 'ultimate'],
>   dashboard:          ['pro', 'ultimate'],
>   viewCounts:         ['pro', 'ultimate'],
>   uploadPresets:      ['pro', 'ultimate'],
>   bulkActions:        ['pro', 'ultimate'],
>   folderOrganization: ['pro', 'ultimate'],
>   duplicateDetection: ['pro', 'ultimate'],
>   tagsAndSearch:      ['pro', 'ultimate'],
>   emailNotifications: ['pro', 'ultimate'],
>   fileVersioning:     ['ultimate'],
>   recycleBin:         ['ultimate'],
>   vanityUrls:         ['ultimate'],
>   apiAccess:          ['ultimate'],
>   webhooks:           ['ultimate'],
>   publicProfile:      ['ultimate'],
>   shareableUploadPage:['ultimate'],
>   prioritySupport:    ['ultimate'],
> };
>
>
> Free for all tiers including guests: QR codes, embed codes, paste from clipboard, dark/light mode, reactions, upload via URL, text/code snippets.
>
> ---
>
> ## Abuse Prevention & Security
>
> **Cloudflare Turnstile**
> Verify on every upload request before processing:
> 
typescript
> const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
>   method: 'POST',
>   body: JSON.stringify({
>     secret: env.TURNSTILE_SECRET,
>     response: formData.get('cf-turnstile-response'),
>     remoteip: request.headers.get('CF-Connecting-IP')

>   })
> });
> const { success } = await verify.json();
> if (!success) return new Response('Bot detected', { status: 403 });
> `
>
> Guest Rate Limiting (KV)
> Track by IP and browser fingerprint (`@fingerprintjs/fingerprintjs`, hashed). Max 3 uploads/day per IP. 24hr TTL on KV keys. Shadow-block fingerprints that hit limits across multiple IPs.
>
> Authenticated Rate Limiting
> Check upload count per hour via Supabase before accepting. Return 429 if exceeded per tier limit above.
>
> File Type Validation
> Validate magic bytes against declared MIME type. Reject `.exe .dll .sh .bat .ps1 .msi .vbs .cmd .scr .jar` outright regardless of declared type.
>
> Malware Scanning
> SHA-256 hash every file. Check against KV blocklist first. Then check VirusTotal API (hash lookup, instant). If unknown hash, forward to ClamAV sidecar on Hetzner for full scan. Store in quarantine R2 bucket until clean. Auto-ban IP + fingerprint after 3 quarantine hits (7-day KV ban).
>
> CSAM Detection (non-negotiable)
> Run every image and video through Amazon Rekognition `DetectModerationLabels` asynchronously after quarantine storage. If flagged at highest severity: delete immediately, permanently log the hash in KV, report via NCMEC CyberTipline API, notify admin via Resend email.
>
> SHA-256 Hash Blocklist
> Maintain in KV under `blocklist:[hash]`. Check before every scan. Permanent — survives file deletion.
>
> SSRF Prevention
> For upload-via-URL: reject any URL resolving to `10.x`, `172.16.x`, `192.168.x`, `127.x`, `169.254.x` before fetching.
>
> ---
>
> ## Upload Flow (Cloudflare Worker)
>
> `POST /api/upload` — accepts `multipart/form-data`:
> - Fields: `file(s)`, `bundle_title?`, `expires_in?` (1h/24h/7d/never), `expires_after_views?`, `expiry_message?`, `pin?`, `scheduled_delete_at?`, `is_nsfw?`, `tags?`, `preset_id?`, `folder_id?`, `remote_url?`
> - Verify Turnstile token
> - Validate tier limits and feature access
> - Validate magic bytes, reject blocked extensions
> - SHA-256 hash → blocklist check → VirusTotal → ClamAV
> - If `pin` provided, hash with `argon2`
> - Write clean files to R2 under generated slug key
> - Generate QR code PNG via `qrcode`, store at `qr/[slug].png` in R2
> - Insert metadata rows into Supabase
> - If multiple files, create bundle row and link uploads via `bundle_id`
> - Update `profiles.storage_used` and `profiles.bytes_uploaded_total`
> - Fire webhooks for Ultimate users
> - Return `{ url, bundle_url?, qr_url, deletion_token }`
>
> ---
>
> ## File & Bundle Retrieval
>
> `GET /f/[slug]`
> - Check `deleted_at`, `dmca_removed`, `expires_at`, `view_count >= expires_after_views` — return appropriate error page if any are true
> - If `is_nsfw`, render blur gate with click-to-reveal
> - If `password_hash`, render PIN gate. On correct PIN issue signed cookie (1hr). Rate limit PIN attempts: 5 tries then 15-min KV lockout
> - Increment `view_count` via Supabase RPC
> - Return signed R2 URL (15min expiry)
> - Fire view webhook if configured
>
> `GET /b/[slug]`
> - Same expiry, NSFW, and PIN gate logic as above
> - Render gallery: CSS grid thumbnail view + fullscreen lightbox/scroll mode
> - Files rendered in `position` order ascending
> - Show reaction bar (👍 ❤️ 🔥 😮 😂), comment thread, embed codes, QR code, ZIP download button
> - OG meta tags: `og:title`, `og:description`, `og:image` (bundle thumbnail or first file)
>
> `GET /v/[alias]` — vanity URL lookup, redirect to `/f/[slug]` or `/b/[slug]`
>
> `GET /api/qr/[slug]` — return QR PNG from R2
>
> `GET /api/bundle/[slug]/zip` — stream all bundle files compressed via `fflate`, return as `[bundle-slug].zip`
>
> ---
>
> ## User Dashboard (`/dashboard`)
>
> Protected route. Supabase session required. Sections:
>
> Uploads tab

> - List all uploads with: slug, thumbnail, MIME, size, view count, expiry, PIN status, tags, folder
> - Bulk select with actions: delete, change expiry, add/remove PIN, move to folder, add tags
> - Per-item actions: delete, edit PIN, change expiry, schedule deletion, create vanity URL (Ultimate), view versions (Ultimate)
> - Search uploads by tag or filename fragment (Supabase tsvector)
> - Folder sidebar for filtering by folder
>
> Bundles tab
> - List bundles with title, file count, view count, PIN status
> - Drag-to-reorder files within a bundle via @dnd-kit/core (persists position)
> - Edit bundle title, PIN, thumbnail, tags
>
> Storage tab
> - Usage bar for free users: [████░░] 4.1GB / 5GB — Upgrade to Pro →
> - Total upload count, total views across all files
> - CSV export of full upload history
>
> API Keys tab (Ultimate only)
> - Generate keys: fh_live_[32-char base58], shown once, stored as SHA-256 hash
> - Label, last used, active toggle, delete
>
> Webhooks tab (Ultimate only)
> - Add webhook URL, select events (upload/view/delete/expire), set signing secret
>
> Presets tab (Pro + Ultimate)
> - Save named upload configurations (expiry, PIN, NSFW flag, tags)
> - Select preset on upload form
>
> Notifications bell
> - In-app notification center: comments, reactions, expiry alerts, system events
> - Mark all read
>
> ---
>
> ## Subscriptions (Stripe)
>
> Plans
> - Pro: $5/mo or $40/yr
> - Ultimate: $9.99/mo or $84/yr
> - Pro Lifetime: $49 one-time (limited to 200 seats, enforce via a lifetime_seats_sold counter in KV)
> - Ultimate Lifetime: $99 one-time (limited to 200 seats)
>
> Implementation
> - Stripe Checkout for new subscriptions and lifetime purchases
> - Stripe Customer Portal for plan changes and cancellation
> - Stripe webhooks: handle checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
> - On subscription change, update profiles.tier via Supabase
> - On downgrade to free: block new uploads over 400MB and 5GB total. Do not delete existing files. Show banner.
> - On cancellation: keep Pro/Ultimate features until end of billing period, then downgrade
>
> Referral system
> - Each user gets a unique referral_code on signup
> - Share link: yourhost.com/ref/[code]
> - On paid signup via referral: credit referrer 1 free month via Stripe coupon API
> - Track in referred_by column on profiles
>
> ---
>
> ## Additional Pages & Routes
>
> **/pricing** — tier comparison table, annual/monthly toggle, lifetime deal countdown (seats remaining)
>
> **/dmca** — public takedown form. On submit: insert to dmca_requests, email admin via Resend. /admin/dmca to action: removes R2 object, sets dmca_removed: true, returns 451 at file URL, emails complainant.
>
> **/changelog** — static MDX page listing releases and f/status **/status** — uptime indicators for upload, download, API endpoints via Cloudflare health checks
>
> **/u/[username]** — public profile page (Ultimate, opt-in). Shows public bundles with OG /admin.
>
> **/admin** — admin-only (is_admin: true). Sections: reports queue, DMCA queue, quarantine queue, user list (search, ban, change tier, delete uploads), platform stats (recharts line charts: signups, uploads, storage growth over time).
>
> ---
>
> ## Cron Jobs (Cloudflare Workers Cron)
>
> - 0 * * * * — process scheduled deletions: query scheduled_delete_at <= now(), delete R2 objects, mark rows deleted, email uploader via Resend
> - 0 0 * * * — purge expired files: query expires_at <= now(), same deletion flow
> - 0 0 * * * — empty recycle bin: hard delete rows where deleted_at <= now() - 30 days (Ultimate users only)
> - */15 * * * * — process quarantine scan results: check pending VirusTotal reports, promote clean files to public R2 bucket or permanently block flagged ones
>
> ---
>
> ## Misc Features
>
> QR codes — generated on every upload, stored in R2 at qr/[slug].png, downloadable from result page and dashboard
>
> Embed codes — modal with Direct URL, Markdown, BBCode, HTML, iFrame variants. One-click copy. Auto-selects best format by MIME type.
>
> Paste from clipboard — global paste event listener on upload page. Auto-populates file input from clipboard image. Works for guests and authenticated users.
>
> Text/code snippets — textarea upload mode. Stored as .txt in R2. Rendered with shiki syntax highlighting. Auto-detect or manual language select.
>
> Upload via URL — server-side fetch in Worker. Validates MIME, size, magic bytes, runs full security pipeline. SSRF-protected.
>
> Duplicate detection (Pro+) — SHA-256 match against user's own uploads. Offer to reuse existing link instead of re-uploading.
>
> Dark/light mode — data-theme on <html>, CSS variables, localStorage persistence, respects prefers-color-scheme. No page reload.
>
> OG meta tags — auto-generated for every file and bundle page. og:image uses QR for non-image files, actual thumbnail for images/video.
>
> Share sheet — native Web Share API button + pre-filled text for Twitter/X, Discord, Reddit on every file and bundle page.
>
> CLI tool — document npx [yourhost]-cli upload ./file.png --api-key fh_live_... as an open-source package. Hits POST /api/upload.
>
> Shareable upload page (Ultimate) — generate a dropzone URL at /drop/[token]. Anyone with the link can upload directly to the owner's account/folder without an account.
>
> File versioning (Ultimate) — upload new version under same slug via POST /api/file/[slug]/version. Increments version, sets parent_slug on new row. Accessible at /f/[slug]/v/[n].
>
> Recycle bin (Ultimate) — soft delete sets deleted_at. Files recoverable within 30 days from /dashboard/trash. Hard deleted by cron after 30 days.
>
> Reactions — POST /api/react/[slug] with { emoji }. One per IP per bundle. Optimistic UI update. Live counts displayed.
>
> Comments — threaded on bundle pages. Guest comments require name + Turnstile. Flag button → admin queue. Bundle owners can delete.
>
> Notifications — email via Resend on: first view, expiry, comment, reaction, scheduled deletion fired. In-app bell in dashboard.
>
> Webhooks (Ultimate) — HMAC-signed POST to user-configured URL on: upload, view, delete, expire events. Retry 3x on failure.
>
> Vanity URLs (Ultimate) — /v/[alias] redirect. Lowercase alphanumeric + hyphens, 3–30 chars. Reserved words blocked: api, admin, dashboard, f, b, v, qr, u, drop, ref, dmca, status, changelog, pricing.
>
> API access (Ultimate) — authenticate via Authorization: Bearer fh_live_.... SHA-256 hash comparison. 500 req/hr per key via KV. Endpoints: POST /api/upload, DELETE /api/file/[slug], GET /api/file/[slug]/info, POST /api/bundle, GET /api/bundle/[slug]/info.

---