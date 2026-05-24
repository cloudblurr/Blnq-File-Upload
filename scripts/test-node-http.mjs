import https from "https";

const data = JSON.stringify({
  rules: [
    {
      allowed: {
        origins: ["http://localhost:3000", "https://www.blnq.click"],
        methods: ["GET", "HEAD", "PUT", "OPTIONS"],
        headers: ["*"],
      },
      expose_headers: ["etag", "content-length", "content-type", "x-amz-request-id"],
      max_age_seconds: 86400,
    },
  ],
});

const token = process.env.CLOUDFLARE_API_TOKEN;

if (!token) {
  throw new Error("CLOUDFLARE_API_TOKEN is not set in the environment");
}

const options = {
  hostname: "api.cloudflare.com",
  path: "/client/v4/accounts/44d53af1cbad58434c8537110e556fa5/r2/buckets/blnq-storage/cors",
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data).toString(),
    Authorization: `Bearer ${token}`,
  },
};

const req = https.request(options, res => {
  let body = "";
  res.on("data", chunk => {
    body += chunk;
  });
  res.on("end", () => {
    console.log(res.statusCode, body);
  });
});

req.on("error", err => {
  console.error("Request error", err);
});

req.write(data);
req.end();
