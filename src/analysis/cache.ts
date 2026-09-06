import * as fs from 'fs/promises';
import * as path from 'path';
import type { SongAnalysis } from './types';

// 楽曲ごとの譜面解析結果(密度・パターン等)をディスクにキャッシュする。
// 数万曲ある曲ライブラリを毎回全解析すると重いため、sha256をキーに再利用する。
export class AnalysisCache {
  private map = new Map<string, SongAnalysis>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private filePath: string) {}

  static async load(filePath: string): Promise<AnalysisCache> {
    const cache = new AnalysisCache(filePath);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: SongAnalysis[] = JSON.parse(raw);
      for (const entry of data) cache.map.set(entry.sha256, entry);
    } catch {
      // キャッシュファイルが無い/壊れている場合は空から始める
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
    const data = Array.from(this.map.values());
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data), 'utf-8');
  }
}
