// GitHub ActionsのCronで定期実行し、Web版が同一オリジンから読めるように
// 難易度表のスナップショットを web/public/tables-snapshot.json へ書き出す。
// (ブラウザは主要な難易度表サイトへCORSの都合で直接fetchできないための対応。
// 2026-09-06にユーザー指示でWeb版へ移行した際に判明・対応した。)
// Node(このスクリプトの実行環境)はCORSの制約を受けないため、Electron版のtables.tsと
// 同じ一覧をここでも定期取得する。
const fs = require('fs');
const path = require('path');

const TABLE_CONFIGS = [
  { key: 'satellite', name: 'Satellite', headerUrl: 'https://stellabms.xyz/sl/header.json' },
  { key: 'stella', name: 'Stella', headerUrl: 'https://stellabms.xyz/st/header.json' },
  { key: 'insane', name: '発狂BMS難易度表', headerUrl: 'https://mirai-yokohama.sakura.ne.jp/bms/header_insane.json' },
  { key: 'scramble', name: 'Scramble難易度表', headerUrl: 'https://egret9.github.io/Scramble/header.json' },
  { key: 'delayJoy', name: 'ディレイjoy', headerUrl: 'https://lets-go-time-hell.github.io/Delay-joy-table/header.json' },
  { key: 'delayShou', name: 'Delay小学校難易度表', headerUrl: 'https://wrench616.github.io/Delay/header.json' },
  {
    key: 'udeShougakkou',
    name: 'ウーデオシ小学校難易度表',
    headerUrl: 'https://lets-go-time-hell.github.io/Arm-Shougakkou-table/header.json',
  },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchTableData(config) {
  const header = await fetchJson(config.headerUrl);
  const dataUrl = new URL(header.data_url, config.headerUrl).toString();
  const entries = await fetchJson(dataUrl);
  return {
    name: config.name,
    symbol: header.symbol ?? '',
    entries: entries.map((e) => ({ md5: e.md5, sha256: e.sha256, level: e.level })),
  };
}

async function main() {
  const outPath = path.join(__dirname, '..', 'public', 'tables-snapshot.json');
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
  } catch {
    // 初回はまだ存在しない
  }

  const tables = {};
  const failed = [];
  for (const config of TABLE_CONFIGS) {
    try {
      tables[config.key] = await fetchTableData(config);
      console.log(`OK   ${config.key}: ${tables[config.key].entries.length} entries`);
    } catch (err) {
      failed.push(config.key);
      console.error(`FAIL ${config.key}: ${err.message}`);
      // 個別の表が落ちても、前回のスナップショットにその表があれば引き継ぐ
      // (Google Apps Script系は不安定な時があるため、1つの失敗で全体を止めない)。
      if (previous?.tables?.[config.key]) {
        tables[config.key] = previous.tables[config.key];
        console.log(`     -> keeping previous snapshot for ${config.key}`);
      }
    }
  }

  if (Object.keys(tables).length === 0) {
    console.error('全ての表の取得に失敗したため、スナップショットを更新せず終了します。');
    process.exit(1);
  }

  const snapshot = { fetchedAt: Date.now(), tables };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot));
  console.log(`書き出し完了: ${outPath}`);
  if (failed.length > 0) {
    console.log(`一部失敗(前回値を維持): ${failed.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
