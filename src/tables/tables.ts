import * as fs from 'fs/promises';
import * as path from 'path';
import type { DifficultyTableConfig, TableEntry } from './types';

export const TABLE_CONFIGS: DifficultyTableConfig[] = [
  { key: 'satellite', name: 'Satellite', headerUrl: 'https://stellabms.xyz/sl/header.json' },
  { key: 'stella', name: 'Stella', headerUrl: 'https://stellabms.xyz/st/header.json' },
  {
    key: 'insane',
    name: '発狂BMS難易度表',
    headerUrl: 'https://mirai-yokohama.sakura.ne.jp/bms/header_insane.json',
  },
  { key: 'scramble', name: 'Scramble難易度表', headerUrl: 'https://egret9.github.io/Scramble/header.json' },
  // 以下はレベル選択には使わず、テーマ判定の優先表示・拾い上げにのみ使う参考難易度表
  // (2026-09-06にユーザー指示: ディレイ/ガチ押しはこれらに載っている譜面を優先表示する)。
  {
    key: 'delayJoy',
    name: 'ディレイjoy',
    headerUrl: 'https://lets-go-time-hell.github.io/Delay-joy-table/header.json',
  },
  {
    key: 'delayShou',
    name: 'Delay小学校難易度表',
    headerUrl: 'https://wrench616.github.io/Delay/header.json',
  },
  {
    key: 'udeShougakkou',
    name: 'ウーデオシ小学校難易度表',
    headerUrl: 'https://lets-go-time-hell.github.io/Arm-Shougakkou-table/header.json',
  },
];

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7日

interface RawScoreEntry {
  md5?: string;
  sha256?: string;
  level: string | number;
  title?: string;
}

interface RawTableData {
  symbol: string;
  entries: RawScoreEntry[];
}

interface CacheFile {
  fetchedAt: number;
  tables: Record<string, RawTableData>;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchTableData(config: DifficultyTableConfig): Promise<RawTableData> {
  const header = (await fetchJson(config.headerUrl)) as { data_url: string; symbol?: string };
  const dataUrl = new URL(header.data_url, config.headerUrl).toString();
  const entries = (await fetchJson(dataUrl)) as RawScoreEntry[];
  return { symbol: header.symbol ?? '', entries };
}

// Satellite/Stella/発狂BMS難易度表/Scrambleの4表をまとめて取得し、md5/sha256から
// 「この譜面はどの表の何レベルか」を引けるようにする。ネットワーク不可時は
// 直近のキャッシュ(最大7日)を使う。
export class DifficultyTables {
  private byMd5 = new Map<string, TableEntry[]>();
  private bySha256 = new Map<string, TableEntry[]>();

  private constructor(private cacheFilePath: string) {}

  static async load(cacheDir: string): Promise<DifficultyTables> {
    const tables = new DifficultyTables(path.join(cacheDir, 'tables-cache.json'));
    await tables.init();
    return tables;
  }

  // 難易度表のデータはmd5/sha256の両方を持つ曲があり、単純に連結すると同じ曲が
  // 二重にヒットする。md5一致を優先し、sha256はmd5で見つからなかった分のみ補う。
  lookup(md5?: string, sha256?: string): TableEntry[] {
    const md5Matches = md5 ? (this.byMd5.get(md5) ?? []) : [];
    if (md5Matches.length > 0) return md5Matches;
    return sha256 ? (this.bySha256.get(sha256) ?? []) : [];
  }

  // 難易度表を1件も読み込めていない場合はtrue(初回起動時にネットワーク取得が失敗し、
  // キャッシュも無かった場合など)。この状態だと選曲候補が常に0件になってしまうため、
  // main.ts側で「ネットワーク接続を確認してください」という具体的な案内を出すために使う。
  hasData(): boolean {
    return this.byMd5.size > 0 || this.bySha256.size > 0;
  }

  private async init(): Promise<void> {
    let cached: CacheFile | null = null;
    try {
      cached = JSON.parse(await fs.readFile(this.cacheFilePath, 'utf-8'));
    } catch {
      // キャッシュなし
    }

    const isFresh = !!cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS;
    // TABLE_CONFIGSに表を追加した直後は、古いキャッシュに新しい表のキーが無いため、
    // 7日以内でも古いキャッシュのままだと新しい表が一切取得されない。設定済みの表が
    // 全てキャッシュに揃っているかも確認し、足りなければ再取得する。
    const hasAllConfiguredTables = !!cached && TABLE_CONFIGS.every((c) => c.key in cached.tables);
    if (isFresh && hasAllConfiguredTables && cached) {
      this.buildIndex(cached.tables);
      return;
    }

    try {
      const tables: Record<string, RawTableData> = {};
      for (const config of TABLE_CONFIGS) {
        tables[config.key] = await fetchTableData(config);
      }
      this.buildIndex(tables);
      await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
      await fs.writeFile(this.cacheFilePath, JSON.stringify({ fetchedAt: Date.now(), tables }), 'utf-8');
    } catch {
      // ネットワーク不可等: 古いキャッシュがあればそれで妥協、無ければ空のまま
      if (cached) this.buildIndex(cached.tables);
    }
  }

  private buildIndex(tables: Record<string, RawTableData>): void {
    this.byMd5.clear();
    this.bySha256.clear();
    for (const config of TABLE_CONFIGS) {
      const table = tables[config.key];
      if (!table) continue;
      for (const entry of table.entries) {
        const tableEntry: TableEntry = {
          tableName: config.name,
          symbol: table.symbol,
          level: String(entry.level),
        };
        if (entry.md5) {
          const list = this.byMd5.get(entry.md5) ?? [];
          list.push(tableEntry);
          this.byMd5.set(entry.md5, list);
        }
        if (entry.sha256) {
          const list = this.bySha256.get(entry.sha256) ?? [];
          list.push(tableEntry);
          this.bySha256.set(entry.sha256, list);
        }
      }
    }
  }
}
