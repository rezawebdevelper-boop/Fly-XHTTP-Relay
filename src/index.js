/**
 * Fly-XHTTP Relay
 * A minimal XHTTP relay for Xray/V2Ray on Fly.io (scale-to-zero)
 * Forwards XHTTP traffic from Xray clients to a backend Xray server.
 */

import http from "http";
import https from "https";
import { URL } from "url";

const PORT = parseInt(process.env.PORT || "8080", 10);
const TARGET_URL = process.env.TARGET_URL; // e.g. https://your-xray-server.example.com:443

// Validate TARGET_URL at startup
if (!TARGET_URL) {
  console.error("[ERROR] TARGET_URL environment variable is not set.");
  process.exit(1);
}

let targetBase;
try {
  targetBase = new URL(TARGET_URL);
} catch {
  console.error("[ERROR] TARGET_URL is not a valid URL:", TARGET_URL);
  process.exit(1);
}

const isHttps = targetBase.protocol === "https:";
const lib = isHttps ? https : http;
const targetHost = targetBase.hostname;
const targetPort = targetBase.port
  ? parseInt(targetBase.port, 10)
  : isHttps
  ? 443
  : 80;

// Headers to strip before forwarding upstream
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "fly-client-ip",
  "fly-forwarded-port",
  "fly-region",
  "fly-request-id",
  "via",
]);

function buildUpstreamHeaders(incomingHeaders) {
  const headers = {};
  for (const [key, val] of Object.entries(incomingHeaders)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = val;
    }
  }
  headers["host"] = targetBase.host;
  return headers;
}

const server = http.createServer((req, res) => {
  // Only allow GET and POST — XHTTP uses these two methods
  if (req.method !== "GET" && req.method !== "POST") {
    res.writeHead(405, { Allow: "GET, POST" });
    res.end("Method Not Allowed");
    return;
  }

  const upstreamPath = req.url || "/";
  const upstreamHeaders = buildUpstreamHeaders(req.headers);

  const options = {
    hostname: targetHost,
    port: targetPort,
    path: upstreamPath,
    method: req.method,
    headers: upstreamHeaders,
    // Disable socket pooling so each request gets a fresh connection
    agent: false,
  };

  const upstreamReq = lib.request(options, (upstreamRes) => {
    // Forward status + headers downstream (strip hop-by-hop from upstream too)
    const responseHeaders = {};
    for (const [key, val] of Object.entries(upstreamRes.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        responseHeaders[key] = val;
      }
    }

    res.writeHead(upstreamRes.statusCode, responseHeaders);

    // Stream upstream → client (no buffering)
    upstreamRes.pipe(res, { end: true });

    upstreamRes.on("error", (err) => {
      console.error("[UPSTREAM READ ERROR]", err.message);
      if (!res.destroyed) res.destroy();
    });
  });

  upstreamReq.on("error", (err) => {
    console.error("[UPSTREAM CONNECT ERROR]", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway");
    } else if (!res.destroyed) {
      res.destroy();
    }
  });

  // Stream client → upstream (no buffering)
  req.pipe(upstreamReq, { end: true });

  req.on("error", (err) => {
    console.error("[CLIENT READ ERROR]", err.message);
    if (!upstreamReq.destroyed) upstreamReq.destroy();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[fly-xhttp] relay listening on port ${PORT}`);
  console.log(`[fly-xhttp] forwarding to ${TARGET_URL}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
