// ローカル動作確認用の簡易静的サーバー。File System Access API / WebHIDは
// secure context(https、またはlocalhost)でしか動かないため、file://直接開きではなく
// これ経由でテストする。
const http = require('http');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(distDir, urlPath);
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`http://localhost:${port}/ で配信中 (${distDir})`);
});
