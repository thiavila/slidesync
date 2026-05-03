// Tiny static server that mimics Cloudflare Pages: trailing-slash + _redirects rewrites.
// Usage: node scripts/serve-static.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "out");
const PORT = parseInt(process.argv[2] || "3000", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function loadRedirects() {
  const file = path.join(ROOT, "_redirects");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((line) => {
      const [from, to, status] = line.split(/\s+/);
      return { from, to, status: parseInt(status || "301", 10) };
    });
}

const REDIRECTS = loadRedirects();
console.log(`[serve] loaded ${REDIRECTS.length} _redirects rule(s)`);
for (const r of REDIRECTS) console.log(`        ${r.from} → ${r.to} (${r.status})`);

function matchRedirect(pathname) {
  for (const r of REDIRECTS) {
    if (r.from.endsWith("/*")) {
      const prefix = r.from.slice(0, -2);
      if (pathname.startsWith(prefix + "/") || pathname === prefix) {
        return r;
      }
    } else if (r.from === pathname) {
      return r;
    }
  }
  return null;
}

function tryServeFile(filePath, res) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);

  // Block parent traversal
  if (urlPath.includes("..")) {
    res.writeHead(400);
    res.end("bad request");
    return;
  }

  const filePath = path.join(ROOT, urlPath);

  // Direct file?
  if (tryServeFile(filePath, res)) return;

  // Directory? Try index.html (with or without trailing slash)
  if (urlPath.endsWith("/")) {
    if (tryServeFile(path.join(filePath, "index.html"), res)) return;
  } else {
    // No trailing slash but matches a directory — redirect to add slash (matches trailingSlash: true)
    const dirVersion = path.join(ROOT, urlPath, "index.html");
    if (fs.existsSync(dirVersion)) {
      res.writeHead(308, { Location: urlPath + "/" });
      res.end();
      return;
    }
  }

  // Fallback to _redirects
  const rule = matchRedirect(urlPath);
  if (rule) {
    if (rule.status === 200) {
      // Rewrite (serve content, keep URL)
      const target = path.join(ROOT, rule.to);
      if (tryServeFile(target, res)) return;
    } else {
      res.writeHead(rule.status, { Location: rule.to });
      res.end();
      return;
    }
  }

  // 404
  const notFound = path.join(ROOT, "404.html");
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  if (fs.existsSync(notFound)) {
    fs.createReadStream(notFound).pipe(res);
  } else {
    res.end("404");
  }
});

server.listen(PORT, () => {
  console.log(`[serve] http://localhost:${PORT}/  (root: ${ROOT})`);
});
