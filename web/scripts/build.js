// Web版のビルドスクリプト。esbuildでweb/src/ui.tsを単一のbundle.jsにまとめ、
// index.html・sql.jsのwasm・難易度表スナップショットをweb/dist/へコピーする。
// GitHub Pagesはビルドステップを持たない単純な静的ホスティングのため、事前に
// 全て静的ファイルへ変換しておく必要がある。
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const webRoot = path.join(__dirname, '..');
const distDir = path.join(webRoot, 'dist');

async function main() {
  fs.mkdirSync(distDir, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(webRoot, 'src', 'ui.ts')],
    bundle: true,
    outfile: path.join(distDir, 'bundle.js'),
    platform: 'browser',
    format: 'iife',
    target: ['chrome100', 'edge100'],
    sourcemap: true,
    logLevel: 'info',
  });

  fs.copyFileSync(path.join(webRoot, 'index.html'), path.join(distDir, 'index.html'));
  fs.copyFileSync(path.join(webRoot, 'public', 'og-image.png'), path.join(distDir, 'og-image.png'));

  // sql.jsのpackage.jsonは"exports"で"./package.json"を公開していないため、
  // 代わりにmainエントリ(dist/sql-wasm.js)から dist/ ディレクトリを逆算する。
  const sqlJsDistDir = path.dirname(require.resolve('sql.js'));
  const wasmSrc = path.join(sqlJsDistDir, 'sql-wasm-browser.wasm');
  fs.copyFileSync(wasmSrc, path.join(distDir, 'sql-wasm-browser.wasm'));

  // 難易度表スナップショットが既にpublic/にあればdist/へコピーする
  // (無ければCIのupdate-tables.jsが最初に生成するまでWeb版は難易度表無しで動く=
  // buildDailySuggestionsのemptyReason:'no-tables'表示になる)。
  const snapshotSrc = path.join(webRoot, 'public', 'tables-snapshot.json');
  if (fs.existsSync(snapshotSrc)) {
    fs.copyFileSync(snapshotSrc, path.join(distDir, 'tables-snapshot.json'));
  } else {
    console.warn('tables-snapshot.json が public/ に見つかりません。先に scripts/update-tables.js を実行してください。');
  }

  console.log('ビルド完了:', distDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
