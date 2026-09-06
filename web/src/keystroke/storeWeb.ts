import { idbGet, idbSet } from '../browser/idb';
import { todayString } from '../util/date';
import type { KeystrokeHistory } from './types';

// 日別の打鍵数/スクラッチ回転量をIndexedDBに永続化する。カレンダー表示用に
// 日付ごとの合計を保持する(idbKeyを変えることで打鍵用・スクラッチ用の両方に流用する)。
export class KeystrokeStore {
  private history: KeystrokeHistory = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private idbKey: string) {}

  static async load(idbKey: string): Promise<KeystrokeStore> {
    const store = new KeystrokeStore(idbKey);
    try {
      store.history = (await idbGet<KeystrokeHistory>(idbKey)) ?? {};
    } catch {
      // データが無い/壊れている場合は空から始める
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
    await idbSet(this.idbKey, this.history);
  }
}
