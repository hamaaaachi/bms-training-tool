const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');
const rendererBuildDir = path.join(distDir, '.renderer-build');

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));

// renderer.ts はブラウザ向けESモジュールとして別途コンパイルしている(tsconfig.renderer.json)。
// mainプロセス用のCommonJS出力を上書きしないよう、一時ディレクトリからrenderer.jsだけ取り出す。
for (const file of ['renderer.js', 'renderer.js.map']) {
  const from = path.join(rendererBuildDir, file);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, path.join(distDir, file));
  }
}
fs.rmSync(rendererBuildDir, { recursive: true, force: true });
