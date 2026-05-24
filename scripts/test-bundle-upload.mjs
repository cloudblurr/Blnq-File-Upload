#!/usr/bin/env node
import crypto from "node:crypto";

const API_URL = process.env.API_URL || "https://www.blnq.click";

function buildTestFiles() {
  const nonce = crypto.randomBytes(4).toString("hex");
  const base = Date.now();
  return [
    {
      name: `bundle-test-${base}-${nonce}-a.txt`,
      type: "text/plain",
      contents: `Automated test bundle file A @ ${new Date().toISOString()}`,
    },
    {
      name: `bundle-test-${base}-${nonce}-b.txt`,
      type: "text/plain",
      contents: "Second file content for bundle flow validation.",
    },
  ];
}

async function signBundle(filesMeta) {
  const res = await fetch(`${API_URL}/api/sign-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "bundle", files: filesMeta }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`sign-upload failed ${res.status}: ${err}`);
  }
  return res.json();
}

async function uploadFile(uploadUrl, file) {
  const body = Buffer.from(file.contents, "utf8");
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

async function completeBundle(bundleSlug, filesMeta, uploads) {
  const payload = {
    mode: "bundle",
    bundle: {
      slug: bundleSlug,
      title: "Automated Bundle Test",
    },
    files: uploads.map((upload, idx) => ({
      slug: upload.slug,
      file_type: filesMeta[idx].type,
      file_size: filesMeta[idx].size,
    })),
  };

  const res = await fetch(`${API_URL}/api/complete-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`complete-upload failed ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

(async () => {
  const files = buildTestFiles();
  const filesMeta = files.map((file) => ({
    name: file.name,
    type: file.type,
    size: Buffer.byteLength(file.contents, "utf8"),
  }));

  console.log("Signing bundle upload for", filesMeta.length, "files...");
  const signData = await signBundle(filesMeta);
  if (!signData.bundle_slug) {
    throw new Error("sign-upload did not return bundle_slug");
  }

  console.log("Uploading files to R2...");
  for (let i = 0; i < signData.uploads.length; i++) {
    await uploadFile(signData.uploads[i].uploadUrl, files[i]);
  }

  console.log("Completing bundle...");
  const completeData = await completeBundle(signData.bundle_slug, filesMeta, signData.uploads);
  console.log("Bundle complete:", completeData);
})();
