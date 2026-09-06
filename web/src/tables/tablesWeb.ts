import { idbGet, idbSet } from '../browser/idb';
import type { TableEntry } from './types';

// ブラウザからは主要な難易度表サイト(stellabms.xyz、発狂BMS難易度表など)へ直接fetchできない
// (CORSヘッダーが無いため)。そのため、GitHub Actionsで定期的に全表を取得しこのファイルへ
// スナップショットとして書き出し、同一オリジンの静的ファイルとして配信している
// (2026-09-06にユーザー指示でWeb版へ移行した際に判明・対応。scripts/update-tables.tsと
// .github/workflows/update-tables.ymlを参照)。
const SNAPSHOT_URL = './tables-snapshot.json';
const CACHE_KEY = 'tablesSnapshotCache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1日(スナップショット自体もCIで毎日更新される)

interface RawScoreEntry {
  md5?: string;
  sha256?: string;
  level: string | number;
}

interface RawTableData {
  name: string;
  symbol: string;
  entries: RawScoreEntry[];
}

export interface TablesSnapshot {
  fetchedAt: number;
  tables: Record<string, RawTableData>;
}

export class DifficultyTables {
  private byMd5 = new Map<string, TableEntry[]>();
  private bySha256 = new Map<string, TableEntry[]>();

  private constructor() {}

  static async load(): Promise<DifficultyTables> {
    const tables = new DifficultyTables();
    await tables.init();
    return tables;
  }

  lookup(md5?: string, sha256?: string): TableEntry[] {
    const md5Matches = md5 ? (this.byMd5.get(md5) ?? []) : [];
    if (md5Matches.length > 0) return md5Matches;
    return sha256 ? (this.bySha256.get(sha256) ?? []) : [];
  }

  hasData(): boolean {
    return this.byMd5.size > 0 || this.bySha256.size > 0;
  }

  private async init(): Promise<void> {
    let cached: TablesSnapshot | undefined;
    try {
      cached = await idbGet<TablesSnapshot>(CACHE_KEY);
    } catch {
      // キャッシュなし
    }

    const isFresh = !!cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS;
    if (isFresh && cached) {
      this.buildIndex(cached.tables);
      return;
    }

    try {
      const res = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snapshot = (await res.json()) as TablesSnapshot;
      this.buildIndex(snapshot.tables);
      await idbSet(CACHE_KEY, snapshot);
    } catch {
      // ネットワーク不可等: 古いキャッシュがあればそれで妥協、無ければ空のまま
      if (cached) this.buildIndex(cached.tables);
    }
  }

  private buildIndex(tables: Record<string, RawTableData>): void {
    this.byMd5.clear();
    this.bySha256.clear();
    for (const table of Object.values(tables)) {
      for (const entry of table.entries) {
        const tableEntry: TableEntry = {
          tableName: table.name,
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
