#!/usr/bin/env node
import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  return lines.reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return acc;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      return acc;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    acc[key] = value.replace(/^"|"$/g, "");
    return acc;
  }, {});
}

const envFromFile = parseEnvFile(path.join(repoRoot, ".env"));
const readEnv = key => process.env[key] ?? envFromFile[key];

const accountId = readEnv("R2_ACCOUNT_ID") ?? readEnv("CLOUDFLARE_ACCOUNT_ID");
const bucketName = readEnv("R2_BUCKET_NAME");
const apiToken = readEnv("CLOUDFLARE_API_TOKEN");

if (!apiToken || !accountId || !bucketName) {
  if (readEnv("R2_CORS_DEBUG")) {
    console.error("Debug info:", {
      hasApiToken: Boolean(apiToken),
      accountId,
      bucketName,
    });
  }
  console.error("Missing required configuration. Ensure R2_ACCOUNT_ID, R2_BUCKET_NAME, and CLOUDFLARE_API_TOKEN are set in the environment or .env file.");
  process.exit(1);
}

const allowedOrigins = (readEnv("R2_CORS_ALLOWED_ORIGINS") ?? "http://localhost:3000,https://www.blnq.click,https://blnq.click")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedMethods = (readEnv("R2_CORS_ALLOWED_METHODS") ?? "GET,HEAD,PUT,POST,OPTIONS")
  .split(",")
  .map(method => method.trim().toUpperCase())
  .filter(Boolean);

const allowedHeadersInput = readEnv("R2_CORS_ALLOWED_HEADERS") ?? "*";
const allowedHeaders = allowedHeadersInput === "*"
  ? ["*"]
  : allowedHeadersInput.split(",").map(header => header.trim()).filter(Boolean);

const maxAgeSeconds = Number(readEnv("R2_CORS_MAX_AGE") ?? "86400");

const corsRule = {
  origins: allowedOrigins,
  methods: allowedMethods,
  headers: allowedHeaders,
  exposeHeaders: ["etag", "content-length", "content-type", "x-amz-request-id"],
  maxAgeSeconds,
};

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCorsXml(rule) {
  const originNodes = rule.origins.map(origin => `    <AllowedOrigin>${escapeXml(origin)}</AllowedOrigin>`).join("\n");
  const methodNodes = rule.methods.map(method => `    <AllowedMethod>${escapeXml(method)}</AllowedMethod>`).join("\n");
  const headerNodes = rule.headers.map(header => `    <AllowedHeader>${escapeXml(header)}</AllowedHeader>`).join("\n");
  const exposeNodes = rule.exposeHeaders?.length
    ? rule.exposeHeaders.map(header => `    <ExposeHeader>${escapeXml(header)}</ExposeHeader>`).join("\n")
    : "";

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<CORSConfiguration xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">",
    "  <CORSRule>",
    originNodes,
    methodNodes,
    headerNodes,
    exposeNodes,
    `    <MaxAgeSeconds>${rule.maxAgeSeconds}</MaxAgeSeconds>`,
    "  </CORSRule>",
    "</CORSConfiguration>",
  ].filter(Boolean).join("\n");
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/cors`;
const powershellBinary = process.platform === "win32" ? (readEnv("R2_CORS_POWERSHELL_BIN") || "powershell.exe") : null;

function runPowerShell(command) {
  if (!powershellBinary) {
    throw new Error("PowerShell command execution is only supported on Windows for this script.");
  }
  const result = spawnSync(powershellBinary, ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
  if (result.error) {
    throw new Error(`Failed to execute PowerShell: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const combined = (result.stdout || "") + (result.stderr || "");
    throw new Error(`PowerShell exited with code ${result.status}: ${combined.trim()}`);
  }
  return (result.stdout || "").trim();
}

function handleApiResponse(rawOutput) {
  if (!rawOutput) {
    return {};
  }
  try {
    return JSON.parse(rawOutput);
  } catch (err) {
    throw new Error(`Unable to parse Cloudflare API response: ${err.message}. Raw output: ${rawOutput}`);
  }
}

function hasApiErrors(result) {
  if (!result || typeof result !== "object") {
    return false;
  }
  if (result.success === false) {
    return true;
  }
  if (Array.isArray(result.errors) && result.errors.length) {
    return true;
  }
  return false;
}

function applyCors() {
  console.log(`Updating CORS rules for bucket "${bucketName}" on account ${accountId}...`);
  const payloadXml = buildCorsXml(corsRule);
  if (readEnv("R2_CORS_DEBUG")) {
    console.log("Payload:\n", payloadXml);
  }

  const putCommand = `
$headers = @{Authorization = "Bearer ${apiToken}"; "Content-Type" = "application/xml"};
$body = @'
${payloadXml}
'@;
$response = Invoke-RestMethod -Method Put -Uri "${endpoint}" -Headers $headers -Body $body;
$response | ConvertTo-Json -Depth 5
`.trim();

  const putOutput = runPowerShell(putCommand);
  const putResult = handleApiResponse(putOutput);
  if (hasApiErrors(putResult)) {
    throw new Error(`Cloudflare API PUT failed: ${JSON.stringify(putResult.errors || putResult, null, 2)}`);
  }
  console.log("✔️  CORS configuration updated. Fetching current rules to verify...");

  const getCommand = `
$headers = @{Authorization = "Bearer ${apiToken}"};
$response = Invoke-RestMethod -Method Get -Uri "${endpoint}" -Headers $headers;
$response | ConvertTo-Json -Depth 5
`.trim();

  const getOutput = runPowerShell(getCommand);
  const getResult = handleApiResponse(getOutput);
  if (hasApiErrors(getResult)) {
    throw new Error(`Cloudflare API GET failed: ${JSON.stringify(getResult.errors || getResult, null, 2)}`);
  }

  if (getResult.result) {
    console.log(JSON.stringify(getResult.result, null, 2));
  } else {
    console.log(JSON.stringify(getResult, null, 2));
  }
}

try {
  applyCors();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
