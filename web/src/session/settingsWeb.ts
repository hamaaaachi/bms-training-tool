import { idbGet, idbSet } from '../browser/idb';
import { clampLevelForTrack, INSANE_MIN_LEVEL, SCRAMBLE_MIN_LEVEL } from '../recommend/categoryEngine';
import type { Theme, Track } from '../recommend/categoryEngine';
import { todayString } from '../util/date';

const TRACKS: Track[] = ['keys', 'insane', 'scratch'];
const KEY = 'settings';

// UIの表示言語(固定文言のみ)。曲名/アーティスト名/クリアランプ名などのデータはそのまま。
export type Lang = 'ja' | 'en' | 'ko';

export interface SettingsData {
  // Web版はFile System Access APIの都合上、実際のフォルダハンドルはbrowser/fsAccess.ts側で
  // 別途IndexedDBに保存する(ハンドルはSettingsData自体には含めない)。ここにはUI表示用に
  // 選択済みフォルダの名前だけを持つ(実際のアクセス許可有無はfsAccess.ts側で毎回確認する)。
  beatorajaDirName: string | null;
  playerId: string | null;
  language: Lang;
  track: Track;
  levels: Record<Track, number>;
  theme: Theme;
  ceilingOverrides: Record<Track, number | null>;
  ceilingOverrideDate: string | null;
  // ウォーミングアップボタンを押したときに飛び先とするレベル(トラックごと)。
  warmupFloors: Record<Track, number>;
  // レベルアップ幅: songsごとにamountレベル上げる(既定は1曲で1レベル)。
  levelStepSongs: number;
  levelStepAmount: number;
  // levelStepSongs曲に到達するまでの進捗(トラックごと)。到達したらリセットする。
  stepProgress: Record<Track, number>;
}

const DEFAULT_LEVELS: Record<Track, number> = {
  keys: 0,
  insane: INSANE_MIN_LEVEL,
  scratch: SCRAMBLE_MIN_LEVEL,
};

const DEFAULT_CEILING_OVERRIDES: Record<Track, number | null> = {
  keys: null,
  insane: null,
  scratch: null,
};

const DEFAULT_STEP_PROGRESS: Record<Track, number> = {
  keys: 0,
  insane: 0,
  scratch: 0,
};

function defaultSettings(): SettingsData {
  return {
    beatorajaDirName: null,
    playerId: null,
    language: 'ja',
    track: 'keys',
    levels: { ...DEFAULT_LEVELS },
    theme: 'midspeed',
    ceilingOverrides: { ...DEFAULT_CEILING_OVERRIDES },
    ceilingOverrideDate: null,
    warmupFloors: { ...DEFAULT_LEVELS },
    levelStepSongs: 1,
    levelStepAmount: 1,
    stepProgress: { ...DEFAULT_STEP_PROGRESS },
  };
}

// 「今どのプレイヤー/トラック/レベル/テーマで練習しているか」を日付をまたいで永続化する。
// ただし手動設定の上限(ceilingOverrides)だけは「今日の」上限という趣旨なので日付スコープ。
export class Settings {
  private data: SettingsData;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(data: SettingsData) {
    this.data = data;
  }

  static async load(): Promise<Settings> {
    let data: SettingsData = defaultSettings();
    try {
      const parsed = await idbGet<Partial<SettingsData>>(KEY);
      if (parsed) {
        data = {
          ...defaultSettings(),
          ...parsed,
          levels: { ...DEFAULT_LEVELS, ...(parsed.levels ?? {}) },
          ceilingOverrides: { ...DEFAULT_CEILING_OVERRIDES, ...(parsed.ceilingOverrides ?? {}) },
          warmupFloors: { ...DEFAULT_LEVELS, ...(parsed.warmupFloors ?? {}) },
          stepProgress: { ...DEFAULT_STEP_PROGRESS, ...(parsed.stepProgress ?? {}) },
        };
        for (const track of TRACKS) {
          if (data.levels[track] === undefined) data.levels[track] = DEFAULT_LEVELS[track];
          if (data.ceilingOverrides[track] === undefined) data.ceilingOverrides[track] = null;
          if (data.warmupFloors[track] === undefined) data.warmupFloors[track] = DEFAULT_LEVELS[track];
          if (data.stepProgress[track] === undefined) data.stepProgress[track] = 0;
        }
      }
    } catch {
      // データが無い場合は初期状態
    }
    return new Settings(data);
  }

  get beatorajaDirName(): string | null {
    return this.data.beatorajaDirName;
  }

  setBeatorajaDirName(name: string): void {
    this.data.beatorajaDirName = name;
    this.scheduleSave();
  }

  get playerId(): string | null {
    return this.data.playerId;
  }

  get language(): Lang {
    return this.data.language;
  }

  setLanguage(language: Lang): void {
    this.data.language = language;
    this.scheduleSave();
  }

  get track(): Track {
    return this.data.track;
  }

  levelFor(track: Track): number {
    return clampLevelForTrack(track, this.data.levels[track]);
  }

  get theme(): Theme {
    return this.data.theme;
  }

  ceilingOverrideFor(track: Track): number | null {
    if (this.data.ceilingOverrideDate !== todayString()) return null;
    return this.data.ceilingOverrides[track];
  }

  update(playerId: string, track: Track, level: number, theme: Theme): void {
    this.data.playerId = playerId;
    this.data.track = track;
    this.data.levels[track] = level;
    this.data.theme = theme;
    this.scheduleSave();
  }

  setCeilingOverride(track: Track, level: number | null): void {
    this.data.ceilingOverrides[track] = level;
    this.data.ceilingOverrideDate = todayString();
    this.scheduleSave();
  }

  warmupFloorFor(track: Track): number {
    return clampLevelForTrack(track, this.data.warmupFloors[track]);
  }

  setWarmupFloor(track: Track, level: number): void {
    this.data.warmupFloors[track] = clampLevelForTrack(track, level);
    this.scheduleSave();
  }

  // ウォーミングアップボタンが押されたとき、指定トラックのレベルを下限まで下げ、
  // レベルアップ幅の進捗もリセットする。押した瞬間に効果があるだけで、日付には紐付かない。
  applyWarmup(track: Track): number {
    this.data.levels[track] = this.warmupFloorFor(track);
    this.data.stepProgress[track] = 0;
    this.scheduleSave();
    return this.data.levels[track];
  }

  get levelStepSongs(): number {
    return this.data.levelStepSongs;
  }

  get levelStepAmount(): number {
    return this.data.levelStepAmount;
  }

  setLevelStep(songs: number, amount: number): void {
    this.data.levelStepSongs = Math.max(1, Math.floor(songs));
    this.data.levelStepAmount = Math.max(1, Math.floor(amount));
    for (const track of TRACKS) this.data.stepProgress[track] = 0;
    this.scheduleSave();
  }

  // 1曲終了するたびに呼ぶ。levelStepSongs曲分たまったらtrueを返して進捗をリセットする
  // (呼び出し側はtrueが返った回だけレベルをlevelStepAmount上げる)。
  recordSongFinishedAndCheckStep(track: Track): boolean {
    this.data.stepProgress[track] += 1;
    if (this.data.stepProgress[track] < this.data.levelStepSongs) {
      this.scheduleSave();
      return false;
    }
    this.data.stepProgress[track] = 0;
    this.scheduleSave();
    return true;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch(() => {});
    }, 500);
  }

  async flush(): Promise<void> {
    await idbSet(KEY, this.data);
  }
}
