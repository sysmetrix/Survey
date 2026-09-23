// Python이 없는 개발 환경의 로컬 E2E 서버.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let file;
  try { file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (file === root) file = path.join(root, "index.html");
  res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  const stream = fs.createReadStream(file);
  stream.on("error", () => { res.statusCode = 404; res.end(); });
  stream.pipe(res);
}).listen(8000, "127.0.0.1", () => console.log("http://127.0.0.1:8000"));
