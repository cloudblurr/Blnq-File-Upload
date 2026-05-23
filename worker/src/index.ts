import { adjectives, nouns } from "./words";
import { PLAN_DEFINITIONS, TIER_FEATURES, TIER_LIMITS, TierLimits, TierName, tierIncludesFeature } from "./tiers";

const DEFAULT_EXPIRY_MESSAGE = "This file is no longer available.";
const DMCA_REMOVAL_MESSAGE = "This file is unavailable due to a DMCA takedown.";
const DELETED_FILE_MESSAGE = "This file has been removed.";
const BUNDLE_FILE_LIMIT = 20;
const GUEST_DAILY_LIMIT = 3;
const FREE_MAX_EXPIRY_MS = 72 * 60 * 60 * 1000;
const FINGERPRINT_FALLBACK = "anonymous";
const FEATURE_ERROR_MESSAGES: Record<"bundles" | "pinProtection" | "customExpiry", string> = {
  bundles: "Bundles are available on Pro plans.",
  pinProtection: "PIN protection is available on Pro plans.",
  customExpiry: "Custom expiry options are available on Pro plans.",
};

class GuardError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GuardError";
    this.status = status;
  }
}

interface Env {
  BLNQ_BUCKET: R2Bucket;
  RATE_LIMIT: KVNamespace;
  PUBLIC_URL_PREFIX?: string;
  ALLOWED_ORIGIN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  PIN_COOKIE_SECRET?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  PRESIGN_TTL_SECONDS?: string;
  QR_BUCKET?: string;
  TURNSTILE_SECRET?: string;
  REMOTE_FETCH_MAX_SIZE_BYTES?: string;
}

function isAllowedRemoteMime(mime: string): boolean {
  if (!mime) return false;
  const allowedPrefixes = ["image/", "video/", "audio/", "application/pdf", "application/zip", "text/plain"];
  return allowedPrefixes.some(prefix => mime.startsWith(prefix) || mime === prefix);
}

// Generate the unique slug [adjective]-[noun]-[4-char alphanumeric]
function generateSlug(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${adj}-${noun}-${suffix}`;
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length > 1) {
    const ext = parts.pop()?.toLowerCase() || "";
    return ext.replace(/[^a-z0-9]/g, "").substring(0, 10);
  }
  return "";
}

function sanitizeContentType(input?: string | null): string | null {
  if (!input) return null;
  const [type] = input.split(";");
  const trimmed = type.trim().toLowerCase();
  return trimmed || null;
}

function isPrivateIpHost(hostname: string): boolean {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
    return true;
  }

  if (lower.startsWith("[") && lower.endsWith("]")) {
    const ipv6 = lower.slice(1, -1);
    return ipv6 === "::1";
  }

  const ipv4Match = lower.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = lower.split(".").map(part => Number(part));
  if (octets.some(o => Number.isNaN(o) || o < 0 || o > 255)) {
    return true;
  }

  const [o1, o2] = octets;
  if (o1 === 10) return true;
  if (o1 === 127) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  return false;
}

function deriveFilenameFromUrl(pathname: string): string | null {
  if (!pathname) return null;
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return null;
  try {
    return decodeURIComponent(segments[segments.length - 1]);
  } catch {
    return segments[segments.length - 1];
  }
}

function extensionFromMime(mime?: string | null): string {
  if (!mime) return "";
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/zip": "zip",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
  };
  return map[mime] || "";
}

function detectMimeFromMagic(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    const signature = bytes.slice(0, 8);
    const hex = Array.from(signature).map(b => b.toString(16).padStart(2, "0")).join(" ");
    if (hex.startsWith("89 50 4e 47 0d 0a 1a 0a")) return "image/png";
    if (hex.startsWith("47 49 46 38")) return "image/gif";
    if (hex.startsWith("25 50 44 46")) return "application/pdf";
    if (hex.startsWith("50 4b 03 04")) return "application/zip";
    if (hex.startsWith("52 49 46 46") && bytes.length >= 12) {
      const webpCheck = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (webpCheck === "WEBP") return "image/webp";
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (isLikelyText(bytes)) {
    return "text/plain";
  }
  return null;
}

function isLikelyText(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  let printable = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      return false;
    }
    if (byte >= 9 && byte <= 13) {
      printable++;
      continue;
    }
    if (byte >= 32 && byte <= 126) {
      printable++;
      continue;
    }
  }
  return printable / bytes.length > 0.8;
}

async function readBytes(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) break;
  }

  await reader.cancel().catch(() => undefined);
  reader.releaseLock();

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function createByteLimitedStream(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  let bytesWritten = 0;
  let limitExceeded = false;
  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesWritten += chunk.byteLength;
      if (bytesWritten > maxBytes) {
        limitExceeded = true;
        controller.error(new Error(`Remote file exceeds limit of ${formatBytes(maxBytes)}`));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  return {
    stream: stream.pipeThrough(transformer),
    get bytesWritten() {
      return bytesWritten;
    },
    wasAborted() {
      return limitExceeded;
    },
  };
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(1)} ${units[power]}`;
}

interface ProfileRow {
  id: string;
  tier: string;
  storage_used: number | string | null;
  bytes_uploaded_total: number | string | null;
  subscription_status?: string | null;
  plan_expires_at?: string | null;
  lifetime_plan?: string | null;
}

interface UploaderContext {
  tier: TierName;
  profile: ProfileRow | null;
  limits: TierLimits;
  isGuest: boolean;
  userId?: string;
  ip: string;
  fingerprint: string;
}

function parseNumeric(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTier(input?: string | null): TierName {
  const normalized = (input || "free").toLowerCase();
  if (normalized === "pro" || normalized === "ultimate") {
    return normalized;
  }
  return "free";
}

async function fetchProfile(env: Env, userId?: string | null): Promise<ProfileRow | null> {
  if (!userId) return null;
  const rows = await supabaseQuery(env, `profiles?id=eq.${encodeURIComponent(userId)}&select=id,tier,storage_used,bytes_uploaded_total,subscription_status,plan_expires_at,lifetime_plan`, { method: "GET" });
  return rows && rows.length ? rows[0] : null;
}

function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function getFingerprintHash(request: Request): string {
  return request.headers.get("x-fp-hash")?.trim() || FINGERPRINT_FALLBACK;
}

async function buildUploaderContext(env: Env, request: Request, userId?: string | null): Promise<UploaderContext> {
  if (!userId) {
    return {
      tier: "guest",
      profile: null,
      limits: TIER_LIMITS.guest,
      isGuest: true,
      ip: getClientIp(request),
      fingerprint: getFingerprintHash(request),
    };
  }

  const profile = await fetchProfile(env, userId);
  const tier = normalizeTier(profile?.tier || "free");
  return {
    tier,
    profile,
    limits: TIER_LIMITS[tier],
    isGuest: false,
    userId,
    ip: getClientIp(request),
    fingerprint: getFingerprintHash(request),
  };
}

async function enforceUploaderRateLimits(env: Env, context: UploaderContext, submissionCount: number): Promise<void> {
  if (submissionCount <= 0) return;
  if (context.isGuest) {
    await enforceGuestRateLimit(env, context, submissionCount);
    return;
  }
  await enforceAuthenticatedRateLimit(env, context.userId!, context.limits.uploadsPerHour, submissionCount);
}

async function enforceGuestRateLimit(env: Env, context: UploaderContext, submissionCount: number): Promise<void> {
  const ipKey = `guest:ip:${context.ip}`;
  const fpKey = `guest:fp:${context.fingerprint}`;
  const [ipRecordRaw, fpRecordRaw] = await Promise.all([
    context.ip === "unknown" ? Promise.resolve(null) : env.RATE_LIMIT.get(ipKey),
    env.RATE_LIMIT.get(fpKey),
  ]);

  const ipRecord = ipRecordRaw ? JSON.parse(ipRecordRaw) as { count?: number } : { count: 0 };
  const fpRecord = fpRecordRaw ? JSON.parse(fpRecordRaw) as { shadowBlock?: boolean; ips?: string[] } : {};

  if (fpRecord.shadowBlock) {
    throw new GuardError(429, "Daily limit reached. Create a free account to continue.");
  }

  const projected = (ipRecord.count || 0) + submissionCount;
  if (projected > GUEST_DAILY_LIMIT) {
    const ips = new Set(fpRecord.ips || []);
    if (context.ip !== "unknown") {
      ips.add(context.ip);
    }
    const shouldShadowBlock = ips.size >= 2;
    await env.RATE_LIMIT.put(fpKey, JSON.stringify({ ...fpRecord, ips: Array.from(ips), shadowBlock: shouldShadowBlock }), { expirationTtl: 86400 });
    throw new GuardError(429, "Daily limit reached. Create a free account to continue.");
  }
}

async function recordGuestUpload(env: Env, context: UploaderContext, submissionCount: number): Promise<void> {
  if (!context.isGuest) return;
  if (context.ip !== "unknown") {
    const ipKey = `guest:ip:${context.ip}`;
    const existing = await env.RATE_LIMIT.get(ipKey);
    const payload = existing ? JSON.parse(existing) as { count?: number } : {};
    const next = (payload.count || 0) + submissionCount;
    await env.RATE_LIMIT.put(ipKey, JSON.stringify({ count: next }), { expirationTtl: 86400 });
  }

  const fpKey = `guest:fp:${context.fingerprint}`;
  const existingFp = await env.RATE_LIMIT.get(fpKey);
  const parsedFp = existingFp ? JSON.parse(existingFp) as { ips?: string[]; shadowBlock?: boolean } : {};
  const ips = new Set(parsedFp.ips || []);
  if (context.ip !== "unknown") {
    ips.add(context.ip);
  }
  await env.RATE_LIMIT.put(fpKey, JSON.stringify({ ...parsedFp, ips: Array.from(ips) }), { expirationTtl: 86400 });
}

async function enforceAuthenticatedRateLimit(env: Env, userId: string, hourlyLimit: number, submissionCount: number): Promise<void> {
  const sinceIso = new Date(Date.now() - 3600000).toISOString();
  const current = await countUploadsSince(env, userId, sinceIso);
  if (current + submissionCount > hourlyLimit) {
    throw new GuardError(429, "Hourly upload limit reached for your plan. Try again later or upgrade.");
  }
}

async function countUploadsSince(env: Env, userId: string, sinceIso: string): Promise<number> {
  const url = `${env.SUPABASE_URL}/rest/v1/uploads?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`;
  const headers: Record<string, string> = {
    "apikey": env.SUPABASE_SERVICE_KEY || "",
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY || ""}`,
    "Prefer": "count=exact",
    "Range": "0-0",
    "Range-Unit": "items",
  };
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok && res.status !== 206) {
    const text = await res.text();
    throw new Error(`Supabase count error ${res.status}: ${text}`);
  }
  const contentRange = res.headers.get("Content-Range") || "";
  const totalPart = contentRange.split("/")[1];
  const total = totalPart ? Number(totalPart) : 0;
  // Drain the tiny JSON payload to avoid leaked locks
  await res.arrayBuffer();
  return Number.isFinite(total) ? total : 0;
}

function ensureFileSizesWithinLimit(context: UploaderContext, sizes: number[]): void {
  const maxSize = context.limits.maxFileSize;
  const oversized = sizes.find(size => size > maxSize);
  if (oversized) {
    throw new GuardError(413, `Max file size for the ${context.tier} plan is ${formatBytes(maxSize)}.`);
  }
}

function ensureStorageHeadroom(context: UploaderContext, incomingBytes: number): void {
  if (context.isGuest) return;
  const maxStorage = context.limits.maxStorage;
  if (!Number.isFinite(maxStorage)) return;
  const used = parseNumeric(context.profile?.storage_used);
  if (used + incomingBytes > maxStorage) {
    throw new GuardError(403, "Storage limit reached. Delete older files or upgrade your plan.");
  }
}

function ensureFeatureAllowed(tier: TierName, feature: keyof typeof TIER_FEATURES): void {
  if (!tierIncludesFeature(tier, feature)) {
    const message = FEATURE_ERROR_MESSAGES[feature as keyof typeof FEATURE_ERROR_MESSAGES] || "Feature unavailable for current plan.";
    throw new GuardError(403, message);
  }
}

function computeTierExpiry(tier: TierName, expiresIn?: string): string | null {
  if (tier === "guest" || tier === "free") {
    return new Date(Date.now() + FREE_MAX_EXPIRY_MS).toISOString();
  }
  if (!expiresIn) return null;
  return computeExpiresAt(expiresIn);
}

async function incrementProfileUsage(env: Env, userId: string, bytesDelta: number): Promise<void> {
  await supabaseQuery(env, "rpc/increment_profile_usage", {
    method: "POST",
    body: JSON.stringify({ p_id: userId, storage_delta: bytesDelta, total_delta: bytesDelta }),
  });
}

function sumBytes(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

async function deleteUploadedKeys(env: Env, keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => env.BLNQ_BUCKET.delete(key).catch(() => undefined)));
}

const CORS_HEADERS = (origin: string, allowedOrigin: string) => {
  const finalOrigin = allowedOrigin === "*" ? origin || "*" : allowedOrigin;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": finalOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  if (finalOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
};

// Simple bcrypt-like comparison using Web Crypto (we store hashes as hex of SHA-256 for Workers compatibility)
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "blnq-salt-v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const computed = await hashPin(pin);
  return computed === storedHash;
}

// Create a signed token for PIN access (1hr expiry)
async function createAccessToken(slug: string, secret: string): Promise<string> {
  const payload = { slug, exp: Date.now() + 3600000 };
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload) + secret);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const sig = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(JSON.stringify(payload)) + "." + sig;
}

async function verifyAccessToken(token: string, slug: string, secret: string): Promise<boolean> {
  try {
    const [payloadB64, sig] = token.split(".");
    const payload = JSON.parse(atob(payloadB64));
    if (payload.slug !== slug || payload.exp < Date.now()) return false;
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload) + secret);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const expectedSig = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    return sig === expectedSig;
  } catch {
    return false;
  }
}

// Supabase REST helper
async function supabaseQuery(env: Env, path: string, options: RequestInit = {}): Promise<any> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    "apikey": env.SUPABASE_SERVICE_KEY || "",
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY || ""}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...(options.headers as Record<string, string> || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Rate limiting helpers
async function checkRateLimit(env: Env, key: string): Promise<{ blocked: boolean; attempts: number }> {
  const data = await env.RATE_LIMIT.get(key);
  if (!data) return { blocked: false, attempts: 0 };
  const parsed = JSON.parse(data);
  if (parsed.lockedUntil && Date.now() < parsed.lockedUntil) {
    return { blocked: true, attempts: parsed.attempts };
  }
  if (parsed.lockedUntil && Date.now() >= parsed.lockedUntil) {
    await env.RATE_LIMIT.delete(key);
    return { blocked: false, attempts: 0 };
  }
  return { blocked: false, attempts: parsed.attempts || 0 };
}

async function incrementRateLimit(env: Env, key: string): Promise<void> {
  const data = await env.RATE_LIMIT.get(key);
  let attempts = 1;
  if (data) {
    const parsed = JSON.parse(data);
    attempts = (parsed.attempts || 0) + 1;
  }
  const value: any = { attempts };
  if (attempts >= 5) {
    value.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
  }
  await env.RATE_LIMIT.put(key, JSON.stringify(value), { expirationTtl: 900 });
}

async function clearRateLimit(env: Env, key: string): Promise<void> {
  await env.RATE_LIMIT.delete(key);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS(origin, allowedOrigin) });
    }

    const corsHeaders = CORS_HEADERS(origin, allowedOrigin);
    const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

    try {
      // ─── POST /api/sign-upload ─── Generate presigned URLs for direct-to-R2 uploads
      if (request.method === "POST" && url.pathname === "/api/sign-upload") {
        return await handleSignUpload(request, env, jsonHeaders);
      }

      // ─── POST /api/complete-upload ─── Persist metadata once direct upload succeeds
      if (request.method === "POST" && url.pathname === "/api/complete-upload") {
        return await handleCompleteUpload(request, env, jsonHeaders);
      }

      // ─── POST /api/remote-upload ─── Fetch remote URL server-side and store in R2
      if (request.method === "POST" && url.pathname === "/api/remote-upload") {
        return await handleRemoteUpload(request, env, jsonHeaders);
      }

      // ─── POST /api/verify-pin ─── Verify PIN for protected content
      if (request.method === "POST" && url.pathname === "/api/verify-pin") {
        return await handleVerifyPin(request, env, jsonHeaders);
      }

      // ─── DELETE /api/files/:slug ─── Delete a file
      if (request.method === "DELETE" && url.pathname.startsWith("/api/files/")) {
        return await handleDelete(request, env, url, jsonHeaders);
      }

      // ─── POST /api/files/:slug/pin ─── Set/update PIN on a file
      if (request.method === "POST" && url.pathname.match(/^\/api\/files\/[^/]+\/pin$/)) {
        return await handleSetPin(request, env, url, jsonHeaders);
      }

      // ─── DELETE /api/files/:slug/pin ─── Remove PIN from a file
      if (request.method === "DELETE" && url.pathname.match(/^\/api\/files\/[^/]+\/pin$/)) {
        return await handleRemovePin(request, env, url, jsonHeaders);
      }

      // ─── POST /api/files/:slug/expiry ─── Update expiry
      if (request.method === "POST" && url.pathname.match(/^\/api\/files\/[^/]+\/expiry$/)) {
        return await handleSetExpiry(request, env, url, jsonHeaders);
      }

      // ─── GET /api/plans ─── Public plan metadata
      if (request.method === "GET" && url.pathname === "/api/plans") {
        return new Response(JSON.stringify({ plans: PLAN_DEFINITIONS, features: TIER_FEATURES, limits: TIER_LIMITS }), { status: 200, headers: jsonHeaders });
      }

      // ─── GET /api/file-info/:slug ─── Get file metadata (public, for PIN gate check)
      if (request.method === "GET" && url.pathname.startsWith("/api/file-info/")) {
        return await handleFileInfo(request, env, url, jsonHeaders);
      }

      // ─── GET /api/bundle-info/:slug ─── Get bundle metadata
      if (request.method === "GET" && url.pathname.startsWith("/api/bundle-info/")) {
        return await handleBundleInfo(request, env, url, jsonHeaders);
      }

      // ─── POST /api/bundles/:slug/reorder ─── Update bundle positions
      if (request.method === "POST" && url.pathname.match(/^\/api\/bundles\/[^/]+\/reorder$/)) {
        return await handleBundleReorder(request, env, url, jsonHeaders);
      }

      // ─── GET /:key ─── Serve file from R2
      if (request.method === "GET") {
        return await handleFileServe(request, env, url, corsHeaders, ctx);
      }

      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Internal Server Error", message: err?.message }), { status: 500, headers: jsonHeaders });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

type SignUploadMode = "single" | "bundle";

interface SignUploadFile {
  name?: string;
  type?: string;
  size?: number;
}

interface CompleteSinglePayload {
  mode: "single";
  upload: {
    slug: string;
    file_type?: string;
    file_size: number;
    user_id?: string;
    pin?: string;
    expires_in?: string;
  };
}

interface CompleteBundlePayload {
  mode: "bundle";
  bundle: {
    slug: string;
    title?: string;
    user_id?: string;
    pin?: string;
  };
  files: {
    slug: string;
    file_type?: string;
    file_size: number;
  }[];
}

type CompletePayload = CompleteSinglePayload | CompleteBundlePayload;

type UploadRecord = {
  id: string;
  slug: string;
  expires_at: string | null;
  expires_after_views: number | null;
  expiry_message: string | null;
  view_count: number;
  deleted_at: string | null;
  dmca_removed: boolean;
};

async function getUploadBySlug(env: Env, slug: string): Promise<UploadRecord | null> {
  const rows = await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&select=id,slug,expires_at,expires_after_views,expiry_message,view_count,deleted_at,dmca_removed`, { method: "GET" });
  return rows && rows.length ? rows[0] : null;
}

function getExpiryStatus(upload: UploadRecord): { expired: boolean; message: string; statusCode: number } {
  if (upload.dmca_removed) {
    return { expired: true, message: DMCA_REMOVAL_MESSAGE, statusCode: 451 };
  }
  if (upload.deleted_at) {
    return { expired: true, message: DELETED_FILE_MESSAGE, statusCode: 410 };
  }
  if (upload.expires_at && new Date(upload.expires_at).getTime() <= Date.now()) {
    return { expired: true, message: upload.expiry_message || DEFAULT_EXPIRY_MESSAGE, statusCode: 410 };
  }
  if (upload.expires_after_views && upload.view_count >= upload.expires_after_views) {
    return { expired: true, message: upload.expiry_message || DEFAULT_EXPIRY_MESSAGE, statusCode: 410 };
  }
  return { expired: false, message: "", statusCode: 200 };
}

async function incrementViews(env: Env, rowId: string, table: "uploads" | "bundles"): Promise<void> {
  await supabaseQuery(env, `rpc/increment_views`, {
    method: "POST",
    body: JSON.stringify({ row_id: rowId, table_name: table }),
    headers: { "Content-Type": "application/json" },
  });
}

async function handleSignUpload(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const body = await request.json().catch(() => null) as { mode?: SignUploadMode; files?: SignUploadFile[] } | null;
  const mode: SignUploadMode = body?.mode === "bundle" ? "bundle" : "single";
  const files = Array.isArray(body?.files) ? body!.files : [];

  if (!files.length) {
    return new Response(JSON.stringify({ error: "No files provided" }), { status: 400, headers });
  }

  if (files.length > BUNDLE_FILE_LIMIT) {
    return new Response(JSON.stringify({ error: `Maximum ${BUNDLE_FILE_LIMIT} files per request` }), { status: 400, headers });
  }

  ensurePresignEnv(env);

  const bucketName = env.R2_BUCKET_NAME || "blnq-storage";
  const presignTtl = Number(env.PRESIGN_TTL_SECONDS || 900);
  const uploads: { slug: string; uploadUrl: string }[] = [];

  for (const file of files) {
    const ext = getExtension(file?.name || "file");
    const slugBase = generateSlug();
    const slug = ext ? `${slugBase}.${ext}` : slugBase;
    const uploadUrl = await createPresignedUrl({
      key: slug,
      bucket: bucketName,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      accountId: env.R2_ACCOUNT_ID!,
      expiresInSeconds: presignTtl,
    });
    uploads.push({ slug, uploadUrl });
  }

  const bundleSlug = mode === "bundle" ? generateSlug() : null;

  return new Response(JSON.stringify({
    mode,
    bundle_slug: bundleSlug,
    uploads,
    expires_in: presignTtl,
  }), { status: 200, headers });
}

async function handleCompleteUpload(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const body = await request.json().catch(() => null) as CompletePayload | null;
  if (!body) {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400, headers });
  }

  if (body.mode === "single") {
    const { upload } = body;
    if (!upload || !upload.slug || typeof upload.file_size !== "number") {
      return new Response(JSON.stringify({ error: "Missing upload metadata" }), { status: 400, headers });
    }
    const context = await buildUploaderContext(env, request, upload.user_id);
    try {
      await enforceUploaderRateLimits(env, context, 1);
      const headObject = await ensureObjectExists(env, upload.slug);
      const actualSize = headObject.size ?? upload.file_size;
      ensureFileSizesWithinLimit(context, [actualSize]);
      ensureStorageHeadroom(context, actualSize);

      if (upload.pin) {
        ensureFeatureAllowed(context.tier, "pinProtection");
      }
      if (upload.expires_in) {
        ensureFeatureAllowed(context.tier, "customExpiry");
      }

      const passwordHash = upload.pin ? await validateAndHashPin(upload.pin) : null;
      const expiresAt = computeTierExpiry(context.tier, upload.expires_in);
      const originalExt = getExtension(upload.slug) || null;

      await supabaseQuery(env, "uploads", {
        method: "POST",
        body: JSON.stringify({
          slug: upload.slug,
          r2_key: upload.slug,
          user_id: upload.user_id || null,
          original_ext: originalExt,
          file_type: upload.file_type || null,
          file_size: actualSize,
          password_hash: passwordHash,
          expires_at: expiresAt,
          position: 0,
        }),
      });

      if (context.isGuest) {
        await recordGuestUpload(env, context, 1);
      } else if (context.userId) {
        await incrementProfileUsage(env, context.userId, actualSize);
      }

      const host = env.PUBLIC_URL_PREFIX || new URL(request.url).origin;
      return new Response(JSON.stringify({
        success: true,
        key: upload.slug,
        url: `${host}/${upload.slug}`,
        filename: upload.slug,
      }), { status: 200, headers });
    } catch (err: any) {
      if (err instanceof GuardError) {
        await deleteUploadedKeys(env, [upload.slug]);
        return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
      }
      throw err;
    }
  }

  // Bundle completion
  const bundlePayload = body as CompleteBundlePayload;
  const bundle = bundlePayload.bundle;
  const files = Array.isArray(bundlePayload.files) ? bundlePayload.files : [];

  if (!bundle || !bundle.slug) {
    return new Response(JSON.stringify({ error: "Bundle metadata missing" }), { status: 400, headers });
  }

  if (!files.length) {
    return new Response(JSON.stringify({ error: "No files attached to bundle" }), { status: 400, headers });
  }

  if (files.length > 20) {
    return new Response(JSON.stringify({ error: "Maximum 20 files per bundle" }), { status: 400, headers });
  }

  const context = await buildUploaderContext(env, request, bundle.user_id);
  try {
    ensureFeatureAllowed(context.tier, "bundles");
    await enforceUploaderRateLimits(env, context, files.length);
    if (bundle.pin) {
      ensureFeatureAllowed(context.tier, "pinProtection");
    }

    const headObjects: R2Object[] = [];
    for (const file of files) {
      if (!file.slug || typeof file.file_size !== "number") {
        return new Response(JSON.stringify({ error: "Invalid bundle file metadata" }), { status: 400, headers });
      }
      headObjects.push(await ensureObjectExists(env, file.slug));
    }

    const actualSizes = headObjects.map((obj, idx) => obj.size ?? files[idx].file_size);
    ensureFileSizesWithinLimit(context, actualSizes);
    ensureStorageHeadroom(context, sumBytes(actualSizes));

    const passwordHash = bundle.pin ? await validateAndHashPin(bundle.pin) : null;
    const bundleRows = await supabaseQuery(env, "bundles", {
      method: "POST",
      body: JSON.stringify({
        slug: bundle.slug,
        user_id: bundle.user_id || null,
        title: bundle.title || "Untitled Bundle",
        password_hash: passwordHash,
      }),
    });
    const bundleId = bundleRows[0]?.id;

    if (!bundleId) {
      throw new Error("Failed to create bundle record");
    }

    for (const [index, file] of files.entries()) {
      await supabaseQuery(env, "uploads", {
        method: "POST",
        body: JSON.stringify({
          slug: file.slug,
          r2_key: file.slug,
          user_id: bundle.user_id || null,
          original_ext: getExtension(file.slug) || null,
          file_type: file.file_type || null,
          file_size: actualSizes[index],
          password_hash: null,
          bundle_id: bundleId,
          position: index,
        }),
      });
    }

    if (context.isGuest) {
      await recordGuestUpload(env, context, files.length);
    } else if (context.userId) {
      await incrementProfileUsage(env, context.userId, sumBytes(actualSizes));
    }

    return new Response(JSON.stringify({ success: true, bundle_slug: bundle.slug }), { status: 200, headers });
  } catch (err: any) {
    if (err instanceof GuardError) {
      await deleteUploadedKeys(env, files.map((file) => file.slug));
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    throw err;
  }
}

interface RemoteUploadPayload {
  url?: string;
  user_id?: string;
  filename?: string;
  pin?: string;
  expires_in?: string;
}

async function handleRemoteUpload(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const body = await request.json().catch(() => null) as RemoteUploadPayload | null;
  if (!body || !body.url) {
    return new Response(JSON.stringify({ error: "url is required" }), { status: 400, headers });
  }

  const context = await buildUploaderContext(env, request, body.user_id);
  try {
    await enforceUploaderRateLimits(env, context, 1);
    if (body.pin) {
      ensureFeatureAllowed(context.tier, "pinProtection");
    }
    if (body.expires_in) {
      ensureFeatureAllowed(context.tier, "customExpiry");
    }
  } catch (err: any) {
    if (err instanceof GuardError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    throw err;
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(body.url);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers });
  }

  if (!/^https?:$/.test(remoteUrl.protocol)) {
    return new Response(JSON.stringify({ error: "Only HTTP(S) URLs are supported" }), { status: 400, headers });
  }

  if (isPrivateIpHost(remoteUrl.hostname)) {
    return new Response(JSON.stringify({ error: "Private network URLs are not allowed" }), { status: 400, headers });
  }

  const configuredLimit = Number(env.REMOTE_FETCH_MAX_SIZE_BYTES);
  const workerCeiling = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : context.limits.maxFileSize;
  const maxBytes = Math.min(workerCeiling, context.limits.maxFileSize);
  let response: Response;
  try {
    response = await fetch(remoteUrl.toString(), { method: "GET" });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Failed to fetch remote URL", detail: err?.message }), { status: 502, headers });
  }

  if (!response.ok || !response.body) {
    return new Response(JSON.stringify({ error: `Remote server returned ${response.status}` }), { status: 502, headers });
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
    return new Response(JSON.stringify({ error: `Remote file exceeds limit of ${formatBytes(maxBytes)}` }), { status: 413, headers });
  }

  const contentTypeHeader = sanitizeContentType(response.headers.get("content-type"));
  const [sniffStream, uploadStream] = response.body.tee();
  const sniffBytes = await readBytes(sniffStream, 8192);
  const detectedMime = detectMimeFromMagic(sniffBytes) || contentTypeHeader || "application/octet-stream";

  if (!isAllowedRemoteMime(detectedMime)) {
    return new Response(JSON.stringify({ error: `Unsupported MIME type: ${detectedMime}` }), { status: 415, headers });
  }

  const derivedName = body.filename?.trim() || deriveFilenameFromUrl(remoteUrl.pathname) || "remote-upload";
  const derivedExt = getExtension(derivedName);
  const mimeExt = extensionFromMime(detectedMime);
  const finalExt = derivedExt || mimeExt;
  const slugBase = generateSlug();
  const slug = finalExt ? `${slugBase}.${finalExt}` : slugBase;

  const limited = createByteLimitedStream(uploadStream, maxBytes);
  try {
    await env.BLNQ_BUCKET.put(slug, limited.stream, {
      httpMetadata: { contentType: detectedMime },
      customMetadata: {
        "remote-source": remoteUrl.hostname,
      },
    });
  } catch (err: any) {
    const status = limited.wasAborted() ? 413 : 502;
    return new Response(JSON.stringify({ error: limited.wasAborted() ? `Remote file exceeds limit of ${formatBytes(maxBytes)}` : "Failed to persist remote file", detail: err?.message }), { status, headers });
  }

  const passwordHash = body.pin ? await validateAndHashPin(body.pin) : null;
  const expiresAt = computeTierExpiry(context.tier, body.expires_in);

  try {
    ensureFileSizesWithinLimit(context, [limited.bytesWritten]);
    ensureStorageHeadroom(context, limited.bytesWritten);

    await supabaseQuery(env, "uploads", {
      method: "POST",
      body: JSON.stringify({
        slug,
        r2_key: slug,
        user_id: body.user_id || null,
        original_ext: finalExt || null,
        file_type: detectedMime,
        file_size: limited.bytesWritten,
        password_hash: passwordHash,
        expires_at: expiresAt,
      }),
    });

    if (context.isGuest) {
      await recordGuestUpload(env, context, 1);
    } else if (context.userId) {
      await incrementProfileUsage(env, context.userId, limited.bytesWritten);
    }

    const host = env.PUBLIC_URL_PREFIX || new URL(request.url).origin;
    return new Response(JSON.stringify({
      success: true,
      key: slug,
      url: `${host}/${slug}`,
      filename: slug,
      via: "remote",
      file_size: limited.bytesWritten,
      content_type: detectedMime,
    }), { status: 200, headers });
  } catch (err: any) {
    if (err instanceof GuardError) {
      await env.BLNQ_BUCKET.delete(slug).catch(() => undefined);
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    throw err;
  }
}

async function ensureObjectExists(env: Env, key: string): Promise<R2Object> {
  const head = await env.BLNQ_BUCKET.head(key);
  if (!head) {
    throw new Error(`Object ${key} not found in R2. Upload may have failed.`);
  }
  return head;
}

function computeExpiresAt(expiresIn?: string): string | null {
  if (!expiresIn) return null;
  const durations: Record<string, number> = { "1h": 3600000, "24h": 86400000, "7d": 604800000 };
  const duration = durations[expiresIn];
  if (!duration) return null;
  return new Date(Date.now() + duration).toISOString();
}

async function validateAndHashPin(pin: string): Promise<string> {
  if (pin.length < 4 || pin.length > 8 || /\D/.test(pin)) {
    throw new Error("PIN must be 4-8 digits");
  }
  return hashPin(pin);
}

function ensurePresignEnv(env: Env) {
  const missing: string[] = [];
  const unresolved: string[] = [];

  if (!env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");

  const looksUnresolved = (value?: string | null) => typeof value === "string" && value.includes("${") && value.includes("}");
  if (looksUnresolved(env.R2_ACCESS_KEY_ID)) unresolved.push("R2_ACCESS_KEY_ID");
  if (looksUnresolved(env.R2_SECRET_ACCESS_KEY)) unresolved.push("R2_SECRET_ACCESS_KEY");

  if (missing.length || unresolved.length) {
    const problems: string[] = [];
    if (missing.length) {
      problems.push(`missing: ${missing.join(", ")}`);
    }
    if (unresolved.length) {
      problems.push(`unresolved placeholders: ${unresolved.join(", ")}`);
    }
    throw new Error(
      `R2 credentials are not configured correctly (${problems.join("; ")}). ` +
      "Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY via worker secrets (e.g. `wrangler secret put R2_ACCESS_KEY_ID`) or worker/.dev.vars before calling /api/sign-upload."
    );
  }
}

async function createPresignedUrl(opts: {
  key: string;
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
}): Promise<string> {
  const { key, bucket, accountId, accessKeyId, secretAccessKey, expiresInSeconds } = opts;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${encodeURIComponentPath(key)}`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  const signedHeaders = "host";

  const queryEntries: [string, string][] = [
    ["X-Amz-Algorithm", algorithm],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", `${expiresInSeconds}`],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];

  const canonicalQuery = queryEntries
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalRequest = `PUT\n${path}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp);
  const signature = toHex(await signHmac(signingKey, stringToSign));

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return `https://${host}${path}?${finalQuery}`;
}

function encodeRfc3986(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeURIComponentPath(path: string): string {
  return path.split("/").map(segment => encodeRfc3986(segment)).join("/");
}

function toAmzDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(hash);
}

async function signHmac(keyData: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyBuffer = typeof keyData === "string" ? encoder.encode(keyData) : keyData;
  const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(data));
}

async function getSignatureKey(secret: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await signHmac(`AWS4${secret}`, dateStamp);
  const kRegion = await signHmac(kDate, "auto");
  const kService = await signHmac(kRegion, "s3");
  return signHmac(kService, "aws4_request");
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleVerifyPin(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const body = await request.json() as { slug: string; pin: string; type?: "file" | "bundle" };
  const { slug, pin, type = "file" } = body;

  if (!slug || !pin) {
    return new Response(JSON.stringify({ error: "slug and pin required" }), { status: 400, headers });
  }

  // Rate limit check
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `pin:${clientIp}:${slug}`;
  const { blocked } = await checkRateLimit(env, rlKey);
  if (blocked) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again in 15 minutes." }), { status: 429, headers });
  }

  // Fetch the row
  const table = type === "bundle" ? "bundles" : "uploads";
  const rows = await supabaseQuery(env, `${table}?slug=eq.${encodeURIComponent(slug)}&select=password_hash`, { method: "GET" });

  if (!rows || !rows.length || !rows[0].password_hash) {
    return new Response(JSON.stringify({ error: "Not found or no PIN set" }), { status: 404, headers });
  }

  const valid = await verifyPin(pin, rows[0].password_hash);
  if (!valid) {
    await incrementRateLimit(env, rlKey);
    return new Response(JSON.stringify({ error: "Incorrect PIN" }), { status: 401, headers });
  }

  // Clear rate limit on success
  await clearRateLimit(env, rlKey);

  // Issue signed access token
  const secret = env.PIN_COOKIE_SECRET || "default-secret";
  const token = await createAccessToken(slug, secret);

  return new Response(JSON.stringify({ success: true, token }), { status: 200, headers });
}

async function handleDelete(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/files/", "");
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  // Verify user owns this file via Supabase auth
  // We verify the JWT from the frontend session
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": env.SUPABASE_SERVICE_KEY || "" },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }
  const userData = await userRes.json() as any;
  const userId = userData.id;

  // Check ownership
  const rows = await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&user_id=eq.${userId}&select=id,slug,file_size`, { method: "GET" });
  if (!rows || !rows.length) {
    return new Response(JSON.stringify({ error: "File not found or not owned by user" }), { status: 404, headers });
  }
  const fileSize = parseNumeric(rows[0]?.file_size);

  // Delete from R2
  await env.BLNQ_BUCKET.delete(slug);

  // Delete from Supabase
  await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&user_id=eq.${userId}`, { method: "DELETE" });

  if (fileSize > 0) {
    await incrementProfileUsage(env, userId, -fileSize);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

async function handleSetPin(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/files/", "").replace("/pin", "");
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": env.SUPABASE_SERVICE_KEY || "" },
  });
  if (!userRes.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  const userData = await userRes.json() as any;

  const context = await buildUploaderContext(env, request, userData.id);
  try {
    ensureFeatureAllowed(context.tier, "pinProtection");
  } catch (err: any) {
    if (err instanceof GuardError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    throw err;
  }

  const body = await request.json() as { pin: string };
  if (!body.pin || body.pin.length < 4 || body.pin.length > 8) {
    return new Response(JSON.stringify({ error: "PIN must be 4-8 digits" }), { status: 400, headers });
  }

  const passwordHash = await hashPin(body.pin);
  await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&user_id=eq.${userData.id}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash: passwordHash }),
  });

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

async function handleRemovePin(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/files/", "").replace("/pin", "");
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": env.SUPABASE_SERVICE_KEY || "" },
  });
  if (!userRes.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  const userData = await userRes.json() as any;

  await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&user_id=eq.${userData.id}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash: null }),
  });

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

async function handleSetExpiry(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/files/", "").replace("/expiry", "");
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": env.SUPABASE_SERVICE_KEY || "" },
  });
  if (!userRes.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  const userData = await userRes.json() as any;

  const context = await buildUploaderContext(env, request, userData.id);
  try {
    ensureFeatureAllowed(context.tier, "customExpiry");
  } catch (err: any) {
    if (err instanceof GuardError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    throw err;
  }

  const body = await request.json() as { expires_in: string };
  let expiresAt: string | null = null;
  const durations: Record<string, number> = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "never": 0 };
  if (body.expires_in && body.expires_in !== "never" && durations[body.expires_in]) {
    expiresAt = new Date(Date.now() + durations[body.expires_in]).toISOString();
  }

  await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&user_id=eq.${userData.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expires_at: expiresAt }),
  });

  return new Response(JSON.stringify({ success: true, expires_at: expiresAt }), { status: 200, headers });
}

async function handleFileInfo(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/file-info/", "");
  const rows = await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(slug)}&select=slug,file_type,file_size,password_hash,expires_at,bundle_id,created_at`, { method: "GET" });

  if (!rows || !rows.length) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  }

  const row = rows[0];
  return new Response(JSON.stringify({
    slug: row.slug,
    file_type: row.file_type,
    file_size: row.file_size,
    has_pin: !!row.password_hash,
    expires_at: row.expires_at,
    created_at: row.created_at,
  }), { status: 200, headers });
}

async function handleBundleInfo(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/bundle-info/", "");
  const bundles = await supabaseQuery(env, `bundles?slug=eq.${encodeURIComponent(slug)}&select=id,slug,title,password_hash,created_at`, { method: "GET" });

  if (!bundles || !bundles.length) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  }

  const bundle = bundles[0];
  // Fetch files in this bundle
  const files = await supabaseQuery(env, `uploads?bundle_id=eq.${bundle.id}&select=slug,file_type,file_size,created_at,position&order=position.asc`, { method: "GET" });

  const host = env.PUBLIC_URL_PREFIX || new URL(request.url).origin;

  return new Response(JSON.stringify({
    slug: bundle.slug,
    title: bundle.title,
    has_pin: !!bundle.password_hash,
    created_at: bundle.created_at,
    files: (files || []).map((f: any) => ({
      slug: f.slug,
      url: `${host}/${f.slug}`,
      file_type: f.file_type,
      file_size: f.file_size,
      position: f.position ?? 0,
    })),
  }), { status: 200, headers });
}

async function handleBundleReorder(request: Request, env: Env, url: URL, headers: Record<string, string>): Promise<Response> {
  const slug = url.pathname.replace("/api/bundles/", "").replace("/reorder", "");
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": env.SUPABASE_SERVICE_KEY || "" },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }
  const user = await userRes.json() as any;

  const bundles = await supabaseQuery(env, `bundles?slug=eq.${encodeURIComponent(slug)}&select=id,user_id`, { method: "GET" });
  if (!bundles || !bundles.length) {
    return new Response(JSON.stringify({ error: "Bundle not found" }), { status: 404, headers });
  }
  const bundle = bundles[0];
  if (bundle.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const payload = await request.json().catch(() => null) as { order?: string[] } | null;
  const order = Array.isArray(payload?.order) ? payload!.order : null;
  if (!order || !order.length) {
    return new Response(JSON.stringify({ error: "order array required" }), { status: 400, headers });
  }

  const existing = await supabaseQuery(env, `uploads?bundle_id=eq.${bundle.id}&select=slug`, { method: "GET" });
  const slugs = new Set((existing || []).map((f: any) => f.slug));
  if (order.length !== slugs.size || !order.every((s) => slugs.has(s))) {
    return new Response(JSON.stringify({ error: "Order must include every file slug" }), { status: 400, headers });
  }

  let position = 0;
  for (const fileSlug of order) {
    await supabaseQuery(env, `uploads?slug=eq.${encodeURIComponent(fileSlug)}&bundle_id=eq.${bundle.id}`, {
      method: "PATCH",
      body: JSON.stringify({ position }),
    });
    position++;
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

async function handleFileServe(request: Request, env: Env, url: URL, corsHeaders: Record<string, string>, ctx: ExecutionContext): Promise<Response> {
  const key = url.pathname.slice(1);

  if (!key) {
    return new Response(JSON.stringify({ status: "Blnq API running", version: "1.0.0" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const upload = await getUploadBySlug(env, key);
  if (!upload) {
    return new Response("File not found", { status: 404, headers: corsHeaders });
  }

  const expiryStatus = getExpiryStatus(upload);
  if (expiryStatus.expired) {
    return new Response(expiryStatus.message, { status: expiryStatus.statusCode, headers: corsHeaders });
  }

  ctx.waitUntil(incrementViews(env, upload.id, "uploads"));

  const cache = await caches.open("r2-file-cache");
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const object = await env.BLNQ_BUCKET.get(key);
  if (object === null) {
    return new Response("File not found", { status: 404, headers: corsHeaders });
  }

  const responseHeaders = new Headers();
  object.writeHttpMetadata(responseHeaders);
  responseHeaders.set("etag", object.httpEtag);
  for (const [k, v] of Object.entries(corsHeaders)) {
    responseHeaders.set(k, v);
  }

  if (!responseHeaders.get("Content-Type")) {
    const ext = getExtension(key);
    const mimeTypes: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      svg: "image/svg+xml", webp: "image/webp", pdf: "application/pdf",
      txt: "text/plain", json: "application/json", zip: "application/zip",
      mp3: "audio/mpeg", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    };
    responseHeaders.set("Content-Type", mimeTypes[ext] || "application/octet-stream");
  }

  const ct = responseHeaders.get("Content-Type") || "";
  const isInline = ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/") || ct === "application/pdf" || ct === "text/plain";
  responseHeaders.set("Content-Disposition", isInline ? "inline" : `attachment; filename="${key}"`);

  const cacheableHeaders = new Headers(responseHeaders);
  cacheableHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600, immutable");

  const response = new Response(object.body, { headers: cacheableHeaders });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
