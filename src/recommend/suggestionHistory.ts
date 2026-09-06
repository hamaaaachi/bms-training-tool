import * as fs from 'fs/promises';
import * as path from 'path';
import { todayString } from '../util/date';

interface StoredData {
  suggested: Record<string, number>; // sha256 -> 提案された回数(全期間)
  // 「今日すでに表示したタイトル」。日付が変わったらリセットする。
  shownTodayDate: string | null;
  shownTodayTitles: string[];
}

// これまでに「今日のおすすめ」で提案したことがある曲を記録する。同じ曲ばかり
// 繰り返し提案されるのを避け、なるべく未提案の曲を優先できるようにする。
// さらに、同じ曲(タイトル)がその日のうちに複数回表示されるのを防ぐため、
// 当日表示済みのタイトルも別途記録する(sha256が違っても同じ曲が別ファイルとして
// 二重登録されているケースがあるため、sha256ではなくタイトルで判定する)。
export class SuggestionHistory {
  private data: StoredData = { suggested: {}, shownTodayDate: null, shownTodayTitles: [] };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private filePath: string) {}

  static async load(filePath: string): Promise<SuggestionHistory> {
    const history = new SuggestionHistory(filePath);
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      if (raw && typeof raw === 'object' && 'suggested' in raw) {
        history.data = {
          suggested: raw.suggested ?? {},
          shownTodayDate: raw.shownTodayDate ?? null,
          shownTodayTitles: raw.shownTodayTitles ?? [],
        };
      } else if (raw && typeof raw === 'object') {
        // 旧フォーマット(sha256->回数のフラットなオブジェクト)からの移行
        history.data = { suggested: raw, shownTodayDate: null, shownTodayTitles: [] };
      }
    } catch {
      // ファイルが無い/壊れている場合は空から始める
    }
    return history;
  }

  // 提案済みの曲のsha256集合。pickByThemeで未提案の曲を優先するために使う。
  suggestedSet(): Set<string> {
    return new Set(Object.keys(this.data.suggested));
  }

  // 今日すでに表示したタイトルの集合。日付が変わっていれば空集合を返す。
  shownTodayTitleSet(): Set<string> {
    if (this.data.shownTodayDate !== todayString()) return new Set();
    return new Set(this.data.shownTodayTitles);
  }

  record(picks: Array<{ sha256: string; title: string }>): void {
    const today = todayString();
    if (this.data.shownTodayDate !== today) {
      this.data.shownTodayDate = today;
      this.data.shownTodayTitles = [];
    }
    for (const { sha256, title } of picks) {
      this.data.suggested[sha256] = (this.data.suggested[sha256] ?? 0) + 1;
      if (!this.data.shownTodayTitles.includes(title)) {
        this.data.shownTodayTitles.push(title);
      }
    }
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
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data), 'utf-8');
  }
}
