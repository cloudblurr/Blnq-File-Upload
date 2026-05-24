#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const idx = trimmed.indexOf("=");
      if (idx === -1) return acc;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
      acc[key] = value;
      return acc;
    }, {});
}

const envFiles = [
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, ".env"),
  path.join(repoRoot, "frontend", ".env.local"),
];
const fileEnvs = envFiles.reduce((acc, file) => ({ ...acc, ...parseEnvFile(file) }), {});
const readEnv = (key) => process.env[key] ?? fileEnvs[key];

const CLOUDFLARE_API_TOKEN = readEnv("CLOUDFLARE_API_TOKEN");
const CLOUDFLARE_ACCOUNT_ID = readEnv("CLOUDFLARE_ACCOUNT_ID") ?? readEnv("R2_ACCOUNT_ID");
const VERCEL_API_TOKEN = readEnv("VERCEL_API_TOKEN") ?? readEnv("VERCEL_TEAM_API_TOKEN");
const VERCEL_TEAM_ID = readEnv("VERCEL_TEAM_ID") ?? undefined;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error("Missing Cloudflare token or account id. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID).");
  process.exit(1);
}

if (!VERCEL_API_TOKEN) {
  console.error("Missing Vercel API token (VERCEL_API_TOKEN).");
  process.exit(1);
}

const APEX_DOMAIN = readEnv("API_APEX_DOMAIN") || "blnq.click";
const API_HOST = readEnv("API_HOST") || `www.${APEX_DOMAIN}`;
const API_ROUTE_PREFIX = readEnv("API_ROUTE_PREFIX") || "/api";
const API_URL = `https://${API_HOST}`;

function detectWorkerName() {
  const wranglerPath = path.join(repoRoot, "worker", "wrangler.toml");
  if (!fs.existsSync(wranglerPath)) return null;
  const content = fs.readFileSync(wranglerPath, "utf8");
  const match = content.match(/name\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

const WORKER_NAME = readEnv("WORKER_NAME") || detectWorkerName();
if (!WORKER_NAME) {
  console.error("Unable to determine worker script name. Set WORKER_NAME env var or ensure worker/wrangler.toml has a name.");
  process.exit(1);
}

function detectRepoSlug() {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) return null;
    const output = result.stdout.trim();
    const match = output.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/i);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  } catch {
    return null;
  }
}

const REPO_SLUG = readEnv("VERCEL_REPO_SLUG") || detectRepoSlug();
const VERCEL_PROJECT_NAME = readEnv("VERCEL_PROJECT_NAME") || readEnv("VERCEL_PROJECT_SLUG") || readEnv("VERCEL_PROJECT") || "frontend";

async function cfRequest(pathname, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await res.json();
  if (!payload.success) {
    throw new Error(`Cloudflare API error on ${pathname}: ${JSON.stringify(payload.errors || payload, null, 2)}`);
  }
  return payload.result;
}

async function vercelRequest(pathname, options = {}) {
  const url = new URL(`https://api.vercel.com${pathname}`);
  if (VERCEL_TEAM_ID) {
    url.searchParams.set("teamId", VERCEL_TEAM_ID);
  }
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API error ${res.status} on ${url.pathname}: ${text}`);
  }
  return res.json();
}

async function getZone() {
  const result = await cfRequest(`/zones?name=${encodeURIComponent(APEX_DOMAIN)}`);
  if (!result || !result.length) {
    throw new Error(`Cloudflare zone for ${APEX_DOMAIN} not found.`);
  }
  return result[0];
}

function buildRoutePattern(host, prefix) {
  const normalizedPrefix = prefix.endsWith("/*")
    ? prefix
    : `${prefix.replace(/\/+$/, "")}${prefix.endsWith("/") ? "*" : "/*"}`;
  const cleanPrefix = normalizedPrefix.startsWith("/") ? normalizedPrefix : `/${normalizedPrefix}`;
  return `${host}${cleanPrefix}`;
}

async function ensureWorkerRoute(zoneId) {
  const pattern = buildRoutePattern(API_HOST, API_ROUTE_PREFIX);
  const routes = await cfRequest(`/zones/${zoneId}/workers/routes`);
  const existing = routes.find(route => route.pattern === pattern);
  if (existing) {
    if (existing.script === WORKER_NAME) {
      console.log(`ℹ️  Worker route ${pattern} already bound to ${WORKER_NAME}.`);
      return existing.id;
    }
    await cfRequest(`/zones/${zoneId}/workers/routes/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ pattern, script: WORKER_NAME }),
    });
    console.log(`✅ Updated worker route ${pattern} -> ${WORKER_NAME}`);
    return existing.id;
  }
  const created = await cfRequest(`/zones/${zoneId}/workers/routes`, {
    method: "POST",
    body: JSON.stringify({ pattern, script: WORKER_NAME }),
  });
  console.log(`✅ Created worker route ${pattern} -> ${WORKER_NAME}`);
  return created.id;
}

async function findVercelProject() {
  const projects = await vercelRequest("/v9/projects", { query: { limit: "100" } });
  const list = projects.projects || projects;
  if (!Array.isArray(list)) {
    throw new Error("Unexpected response from Vercel projects API");
  }
  const byRepo = list.find(project => {
    const link = project.link;
    if (!link || link.type !== "github" || !REPO_SLUG) return false;
    const slug = `${link.org}/${link.repo}`.toLowerCase();
    return slug === REPO_SLUG?.toLowerCase();
  });
  if (byRepo) return byRepo;
  const byName = list.find(project => project.name === VERCEL_PROJECT_NAME);
  if (byName) return byName;
  throw new Error("Unable to determine Vercel project. Set VERCEL_PROJECT_NAME or VERCEL_REPO_SLUG in env.");
}

async function ensureVercelEnv(project) {
  const envKey = "NEXT_PUBLIC_API_URL";
  const envRes = await vercelRequest(`/v10/projects/${project.id}/env`);
  const envs = envRes.envs || envRes;
  if (!Array.isArray(envs)) {
    throw new Error("Unexpected response from Vercel env API");
  }
  const existing = envs.filter(entry => entry.key === envKey);
  for (const envVar of existing) {
    await vercelRequest(`/v10/projects/${project.id}/env/${envVar.id}`, { method: "DELETE" });
    console.log(`🗑️  Removed old ${envKey} (${envVar.target?.join?.(",") || "?"})`);
  }
  await vercelRequest(`/v10/projects/${project.id}/env`, {
    method: "POST",
    body: JSON.stringify({
      key: envKey,
      value: API_URL,
      target: ["production", "preview"],
      type: "plain",
    }),
  });
  console.log(`✅ Set ${envKey}=${API_URL} on Vercel project ${project.name}`);
}

async function main() {
  console.log(`Configuring API routing for ${API_HOST}${API_ROUTE_PREFIX} via worker ${WORKER_NAME}...`);
  const zone = await getZone();
  await ensureWorkerRoute(zone.id);
  const project = await findVercelProject();
  await ensureVercelEnv(project);
  console.log("🎉 Routing + env configuration complete. Trigger a deployment or push to pick up the new API URL.");
}

main().catch((err) => {
  console.error("❌", err.message || err);
  process.exit(1);
});
