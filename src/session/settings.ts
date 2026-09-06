import * as fs from 'fs/promises';
import * as path from 'path';
import type { SpeedCategory } from '../analysis/types';
import { clampLevelForTrack, INSANE_MIN_LEVEL, SCRAMBLE_MIN_LEVEL } from '../recommend/categoryEngine';
import type { Track } from '../recommend/categoryEngine';
import { todayString } from '../util/date';

const TRACKS: Track[] = ['keys', 'insane', 'scratch'];

// UIの表示言語(固定文言のみ。曲名/アーティスト名/クリアランプ名などのデータはそのまま)。
// 2026-09-06にユーザー指示で日本語/英語/韓国語の切替に対応した。
export type Lang = 'ja' | 'en' | 'ko';

export interface SettingsData {
  // beatorajaのインストールフォルダ(songdata.dbがある場所)。未設定なら初回セットアップが必要。
  beatorajaDir: string | null;
  playerId: string | null;
  language: Lang;
  // 直近選んでいた練習トラック(Satellite/Stella/発狂/Scramble)。次回起動時もここから
  // 自動で再開する。
  track: Track;
  // 3トラックは互いに難易度をリンクさせないため、レベルをトラックごとに別々に持つ
  // (2026-09-06にユーザーから明示された制約)。
  levels: Record<Track, number>;
  theme: SpeedCategory;
  // ユーザーが手動で設定した「今日の上限」。日付が変わったら自動でリセットされる
  // (「今日の」上限という趣旨のため、level/themeと違って日付をまたいで持ち越さない)。
  // トラックごとに別軸のため上限も別々に持つが、リセット判定の日付は共通でよい。
  ceilingOverrides: Record<Track, number | null>;
  ceilingOverrideDate: string | null;
  // 当日まだレベルを下限にリセットしていなければリセットするための判定用日付
  // (2026-09-06にユーザー指示: 当日初回起動時は低いレベルから始めて、クリアランプに
  // 基づく自動進行(handleSongFinished)で上限に向けて徐々に上げる)。
  levelResetDate: string | null;
  // ウォーミングアップ機能のON/OFF。OFFなら当日初回起動時のレベルリセットを行わず、
  // 前回終了時点のレベルからそのまま再開する(2026-09-06にユーザー指示)。
  warmupEnabled: boolean;
  // ウォーミングアップ有効時、当日初回起動時にリセットする先のレベル(トラックごと。
  // ユーザーが自由に設定できる。「今日の上限」と違い日付をまたいで持ち越す永続設定)。
  warmupFloors: Record<Track, number>;
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

function defaultSettings(): SettingsData {
  return {
    beatorajaDir: null,
    playerId: null,
    language: 'ja',
    track: 'keys',
    levels: { ...DEFAULT_LEVELS },
    theme: 'midspeed',
    ceilingOverrides: { ...DEFAULT_CEILING_OVERRIDES },
    ceilingOverrideDate: null,
    levelResetDate: null,
    warmupEnabled: true,
    warmupFloors: { ...DEFAULT_LEVELS },
  };
}

// 旧バージョンの設定ファイル形状(トラック導入前の単一level/ceilingOverride、
// 鍵盤/スクラッチ2トラック時代のkeysLevel/scratchLevel等)。既存ユーザーの設定が
// 消えてレベル0に巻き戻らないよう、読み込み時にlevels/ceilingOverridesへ引き継ぐ。
interface LegacySettingsShape {
  level?: number;
  ceilingOverride?: number | null;
  keysLevel?: number;
  scratchLevel?: number;
  keysCeilingOverride?: number | null;
  scratchCeilingOverride?: number | null;
}

// 「今どのプレイヤー/トラック/レベル/テーマで練習しているか」を日付をまたいで永続化する。
// warmupのような「その日だけ」の概念は持たず、次回起動時もここから自動で再開する
// (ユーザーが毎回クリックし直さなくて済むようにするため)。
// ただし手動設定の上限(ceilingOverrides)だけは「今日の」上限という趣旨なので日付スコープ。
export class Settings {
  private data: SettingsData;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private filePath: string,
    data: SettingsData
  ) {
    this.data = data;
  }

  static async load(filePath: string): Promise<Settings> {
    let data: SettingsData = defaultSettings();
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SettingsData> & LegacySettingsShape;
      data = {
        ...defaultSettings(),
        ...parsed,
        levels: { ...DEFAULT_LEVELS, ...(parsed.levels ?? {}) },
        ceilingOverrides: { ...DEFAULT_CEILING_OVERRIDES, ...(parsed.ceilingOverrides ?? {}) },
        warmupFloors: { ...DEFAULT_LEVELS, ...(parsed.warmupFloors ?? {}) },
      };
      if (parsed.levels === undefined) {
        if (parsed.keysLevel !== undefined) data.levels.keys = parsed.keysLevel;
        else if (parsed.level !== undefined) data.levels.keys = parsed.level;
        if (parsed.scratchLevel !== undefined) data.levels.scratch = parsed.scratchLevel;
      }
      if (parsed.ceilingOverrides === undefined) {
        if (parsed.keysCeilingOverride !== undefined) data.ceilingOverrides.keys = parsed.keysCeilingOverride;
        else if (parsed.ceilingOverride !== undefined) data.ceilingOverrides.keys = parsed.ceilingOverride;
        if (parsed.scratchCeilingOverride !== undefined) data.ceilingOverrides.scratch = parsed.scratchCeilingOverride;
      }
      // トラック定義自体が増えた場合に備え、未知のトラックのlevels/ceilingOverrides/
      // warmupFloorsが欠けていないことを保証する。
      for (const track of TRACKS) {
        if (data.levels[track] === undefined) data.levels[track] = DEFAULT_LEVELS[track];
        if (data.ceilingOverrides[track] === undefined) data.ceilingOverrides[track] = null;
        if (data.warmupFloors[track] === undefined) data.warmupFloors[track] = DEFAULT_LEVELS[track];
      }
    } catch {
      // ファイルが無い場合は初期状態
    }
    return new Settings(filePath, data);
  }

  get beatorajaDir(): string | null {
    return this.data.beatorajaDir;
  }

  setBeatorajaDir(dir: string): void {
    this.data.beatorajaDir = dir;
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

  // レベル軸の定義が変わったバージョン間でも、保存済みの値が新しい範囲外になっている場合が
  // あるため(例: 旧バージョンで発狂込みの連番軸だった頃の値)、常にクランプしてから返す。
  levelFor(track: Track): number {
    return clampLevelForTrack(track, this.data.levels[track]);
  }

  get theme(): SpeedCategory {
    return this.data.theme;
  }

  // 日付が変わっていたら自動的にnull(未設定=自動推定に任せる)を返す。
  ceilingOverrideFor(track: Track): number | null {
    if (this.data.ceilingOverrideDate !== todayString()) return null;
    return this.data.ceilingOverrides[track];
  }

  update(playerId: string, track: Track, level: number, theme: SpeedCategory): void {
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

  get warmupEnabled(): boolean {
    return this.data.warmupEnabled;
  }

  setWarmupEnabled(enabled: boolean): void {
    this.data.warmupEnabled = enabled;
    this.scheduleSave();
  }

  warmupFloorFor(track: Track): number {
    return clampLevelForTrack(track, this.data.warmupFloors[track]);
  }

  setWarmupFloor(track: Track, level: number): void {
    this.data.warmupFloors[track] = clampLevelForTrack(track, level);
    this.scheduleSave();
  }

  // ウォーミングアップが有効かつ当日まだ実行していなければ、全トラックのレベルを
  // ユーザー設定の下限(warmupFloors)まで下げる。起動のたびに呼んでよい(同じ日のうちは
  // 2回目以降は何もしない)。1曲プレイし終えるたびの自動進行(decideAutoLevel)が、
  // クリアランプ由来の上限に向けて改めて上げていく。
  resetLevelsForNewDay(): void {
    const today = todayString();
    if (this.data.levelResetDate === today) return;
    this.data.levelResetDate = today;
    if (this.data.warmupEnabled) {
      for (const track of TRACKS) {
        this.data.levels[track] = this.warmupFloorFor(track);
      }
    }
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch(() => {});
    }, 500);
  }

  async flush(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data), 'utf-8');
  }
}
