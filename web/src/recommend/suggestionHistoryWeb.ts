import { idbGet, idbSet } from '../browser/idb';
import { todayString } from '../util/date';

const KEY = 'suggestionHistory';

interface StoredData {
  suggested: Record<string, number>; // sha256 -> 提案された回数(全期間)
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

  private constructor() {}

  static async load(): Promise<SuggestionHistory> {
    const history = new SuggestionHistory();
    try {
      const raw = await idbGet<StoredData>(KEY);
      if (raw) {
        history.data = {
          suggested: raw.suggested ?? {},
          shownTodayDate: raw.shownTodayDate ?? null,
          shownTodayTitles: raw.shownTodayTitles ?? [],
        };
      }
    } catch {
      // データが無い/壊れている場合は空から始める
    }
    return history;
  }

  suggestedSet(): Set<string> {
    return new Set(Object.keys(this.data.suggested));
  }

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
    await idbSet(KEY, this.data);
  }
}
