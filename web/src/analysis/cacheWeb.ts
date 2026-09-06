import { idbGet, idbSet } from '../browser/idb';
import type { SongAnalysis } from './types';

const KEY = 'analysisCache';

// 楽曲ごとの譜面解析結果(密度・パターン等)をIndexedDBにキャッシュする。
// 数万曲ある曲ライブラリを毎回全解析すると重いため、sha256をキーに再利用する。
export class AnalysisCache {
  private map = new Map<string, SongAnalysis>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  static async load(): Promise<AnalysisCache> {
    const cache = new AnalysisCache();
    try {
      const data = (await idbGet<SongAnalysis[]>(KEY)) ?? [];
      for (const entry of data) cache.map.set(entry.sha256, entry);
    } catch {
      // キャッシュが無い/壊れている場合は空から始める
    }
    return cache;
  }

  get(sha256: string): SongAnalysis | undefined {
    return this.map.get(sha256);
  }

  set(entry: SongAnalysis): void {
    this.map.set(entry.sha256, entry);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch(() => {});
    }, 1000);
  }

  async flush(): Promise<void> {
    await idbSet(KEY, Array.from(this.map.values()));
  }
}
