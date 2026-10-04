/**
 * M61 Restaurant — local preview server
 *
 *   node serve.js            -> http://localhost:8080
 *   node serve.js 3000       -> http://localhost:3000
 *   LAN=1 node serve.js      -> also reachable at your machine's IP
 *                               (handy for checking the mobile layout
 *                                on a real phone)
 *
 * Serves this folder as static files. No build step, no dependencies.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;
const HOST = process.env.LAN === "1" ? "0.0.0.0" : "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  // Resolve inside ROOT only — blocks ../ traversal.
  const target = path.resolve(ROOT, "." + pathname);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let file = target;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, "index.html");
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>404</title>" +
        "<body style='font:16px system-ui;padding:3rem;background:#FAF6F0;color:#1A1A1A'>" +
        "<h1 style='font-weight:500'>404 — not found</h1>" +
        `<p style='color:#4A4A4A'>No file at <code>${pathname.replace(/[<>&]/g, "")}</code></p>` +
        "<p><a href='/' style='color:#7A0F1B'>Back to M61 home</a></p>"
      );
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try:  node serve.js ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  M61 Restaurant — local preview");
  console.log("  " + "-".repeat(42));
  console.log(`  http://localhost:${PORT}`);
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .forEach((i) => console.log(`  http://${i.address}:${PORT}   (same network)`));
  console.log("");
  console.log("  Pages: /  /menu.html  /cart.html  /checkout.html");
  console.log("  Ctrl+C to stop.");
  console.log("");
});
