import * as fs from 'fs/promises';
import * as path from 'path';
import { todayString } from '../util/date';
import type { KeystrokeHistory } from './types';

// 日別の打鍵数をディスクに永続化する。カレンダー表示用に日付ごとの合計を保持する。
export class KeystrokeStore {
  private history: KeystrokeHistory = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private filePath: string) {}

  static async load(filePath: string): Promise<KeystrokeStore> {
    const store = new KeystrokeStore(filePath);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      store.history = JSON.parse(raw);
    } catch {
      // ファイルが無い/壊れている場合は空から始める
    }
    return store;
  }

  addDelta(delta: number): number {
    const key = todayString();
    const next = (this.history[key] ?? 0) + delta;
    this.history[key] = next;
    this.scheduleSave();
    return next;
  }

  getHistory(): KeystrokeHistory {
    return { ...this.history };
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch(() => {});
    }, 1000);
  }

  async flush(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.history), 'utf-8');
  }
}
