// Electron版main.tsの選曲ロジックを、IPC境界の無い単一のブラウザコンテキスト向けに移植した
// もの。ファイルI/Oは全てbrowser/fsAccess.ts(File System Access API)経由になる。
import { listPlayers, loadLibrary } from './beatoraja/dbWeb';
import type { BeatorajaPlayer, SongWithScore } from './beatoraja/types';
import {
  clampLevelForTrack,
  formatLevelForTrack,
  isThemeValidForTrack,
  pickByTheme,
  resolveTableLevel,
} from './recommend/categoryEngine';
import type { AnalyzedSong, CategorySuggestion, Theme, Track } from './recommend/categoryEngine';
import { AnalysisCache } from './analysis/cacheWeb';
import { analyzeSongBytes } from './analysis/analyzeSongWeb';
import { computeClearCeiling, decideAutoLevel } from './recommend/clearCeiling';
import type { ClearSample } from './recommend/clearCeiling';
import { DifficultyTables } from './tables/tablesWeb';
import type { TableEntry } from './tables/types';
import { SuggestionHistory } from './recommend/suggestionHistoryWeb';
import { KeystrokeStore } from './keystroke/storeWeb';
import type { KeystrokeHistory } from './keystroke/types';
import { PlaySessionDetector } from './keystroke/playSessionDetector';
import { Settings } from './session/settingsWeb';
import {
  ensurePermission,
  fileExistsAtAny,
  getSavedExtraDirHandles,
  pickExtraChartDir,
  readFileAtAny,
} from './browser/fsAccess';

const MODE_7K = 7;
const MAX_ANALYZE_CANDIDATES = 400;

let cachedLibrary: SongWithScore[] | null = null;
let cachedPlayerId: string | null = null;
let cachedDirHandle: FileSystemDirectoryHandle | null = null;
let cachedExtraDirHandles: FileSystemDirectoryHandle[] = [];

export function setActiveDirHandle(handle: FileSystemDirectoryHandle): void {
  if (cachedDirHandle !== handle) {
    cachedDirHandle = handle;
    cachedLibrary = null;
    cachedPlayerId = null;
  }
}

// bmsroot設定で外部フォルダを登録している場合に、そこも合わせて許可してもらった
// 追加の譜面フォルダ一覧。songdata.dbのpath列が絶対パスの曲を解析する際に使う。
export function setExtraDirHandles(handles: FileSystemDirectoryHandle[]): void {
  cachedExtraDirHandles = handles;
}

export function getActiveDirHandle(): FileSystemDirectoryHandle | null {
  return cachedDirHandle;
}

let analysisCachePromise: Promise<AnalysisCache> | null = null;
function getAnalysisCache(): Promise<AnalysisCache> {
  if (!analysisCachePromise) analysisCachePromise = AnalysisCache.load();
  return analysisCachePromise;
}

let difficultyTablesPromise: Promise<DifficultyTables> | null = null;
function getDifficultyTables(): Promise<DifficultyTables> {
  if (!difficultyTablesPromise) difficultyTablesPromise = DifficultyTables.load();
  return difficultyTablesPromise;
}

let suggestionHistoryPromise: Promise<SuggestionHistory> | null = null;
function getSuggestionHistory(): Promise<SuggestionHistory> {
  if (!suggestionHistoryPromise) suggestionHistoryPromise = SuggestionHistory.load();
  return suggestionHistoryPromise;
}

let keystrokeStorePromise: Promise<KeystrokeStore> | null = null;
export function getKeystrokeStore(): Promise<KeystrokeStore> {
  if (!keystrokeStorePromise) keystrokeStorePromise = KeystrokeStore.load('keystrokes');
  return keystrokeStorePromise;
}

let scratchStorePromise: Promise<KeystrokeStore> | null = null;
export function getScratchStore(): Promise<KeystrokeStore> {
  if (!scratchStorePromise) scratchStorePromise = KeystrokeStore.load('scratch');
  return scratchStorePromise;
}

let settingsPromise: Promise<Settings> | null = null;
export function getSettings(): Promise<Settings> {
  if (!settingsPromise) settingsPromise = Settings.load();
  return settingsPromise;
}

export async function flushAll(): Promise<void> {
  await Promise.all([
    analysisCachePromise?.then((c) => c.flush()).catch(() => {}),
    keystrokeStorePromise?.then((s) => s.flush()).catch(() => {}),
    scratchStorePromise?.then((s) => s.flush()).catch(() => {}),
    settingsPromise?.then((s) => s.flush()).catch(() => {}),
    suggestionHistoryPromise?.then((s) => s.flush()).catch(() => {}),
  ]);
}

async function ensureLibrary(playerId: string): Promise<SongWithScore[]> {
  if (!cachedDirHandle) {
    throw new Error('beatorajaのフォルダが設定されていません。');
  }
  if (cachedPlayerId !== playerId || !cachedLibrary) {
    const library = await loadLibrary(cachedDirHandle, playerId);
    cachedLibrary = library.filter((song) => song.mode === MODE_7K);
    cachedPlayerId = playerId;
    updateAutoAdvanceThreshold(cachedLibrary).catch(() => {});
    updateScratchThreshold(cachedLibrary).catch(() => {});
  }
  return cachedLibrary;
}

async function updateAutoAdvanceThreshold(library: SongWithScore[]): Promise<void> {
  const difficultyTables = await getDifficultyTables();
  let min = Infinity;
  for (const song of library) {
    if (song.notes <= 0) continue;
    const matches = difficultyTables.lookup(song.md5, song.sha256);
    if (matches.some((m) => m.tableName === 'Satellite') && song.notes < min) {
      min = song.notes;
    }
  }
  if (Number.isFinite(min)) playSessionDetector.setThreshold(min);
}

// Scramble(スクラッチ)トラック選択中の自動レベルアップ判定用。SB-1(Scramble難易度表の
// 一番低いレベル)に掲載されている曲のうち、実際のスクラッチ回数が一番少ないものを閾値にする
// (「一番スクラッチが少ない曲でも必ず発火する」ため。2026-09-06にユーザー指示)。
// songdata.dbにはスクラッチ数の内訳が無いため、譜面ファイルを実際に解析して算出する。
async function updateScratchThreshold(library: SongWithScore[]): Promise<void> {
  const root = cachedDirHandle;
  if (!root) return;
  const difficultyTables = await getDifficultyTables();
  const analysisCache = await getAnalysisCache();
  let min = Infinity;
  for (const song of library) {
    const matches = difficultyTables.lookup(song.md5, song.sha256);
    if (!matches.some((m) => m.tableName === 'Scramble難易度表' && m.level === '-1')) continue;
    if (!(await fileExistsAtAny(root, cachedExtraDirHandles, song.path))) continue;
    let analysis = analysisCache.get(song.sha256);
    if (!analysis) {
      try {
        const bytes = await readFileAtAny(root, cachedExtraDirHandles, song.path);
        analysis = analyzeSongBytes(bytes, song.sha256);
        analysisCache.set(analysis);
      } catch {
        continue; // ファイルが読めない/壊れている譜面はスキップ
      }
    }
    if (typeof analysis.totalNotes !== 'number') continue; // この機能追加前にキャッシュされた解析結果には無い
    const scratchCount = Math.round(analysis.totalNotes * analysis.scratchRatio);
    if (scratchCount > 0 && scratchCount < min) min = scratchCount;
  }
  if (Number.isFinite(min)) playSessionDetector.setScratchThreshold(min);
}

export interface DailyRecommendationResult {
  track: Track;
  level: number;
  levelLabel: string;
  theme: Theme;
  ceilingLevel: number | null;
  ceilingLabel: string | null;
  ceilingIsManual: boolean;
  warmupFloorLevel: number;
  warmupFloorLabel: string;
  levelStepSongs: number;
  levelStepAmount: number;
  suggestions: CategorySuggestion[];
  emptyReason: 'no-library' | 'no-tables' | null;
}

function matchesLevel(matches: TableEntry[], track: Track, level: number): boolean {
  if (track === 'scratch') {
    return matches.some((m) => m.tableName === 'Scramble難易度表' && Number(m.level) === level);
  }
  if (track === 'insane') {
    return matches.some((m) => m.tableName === '発狂BMS難易度表' && Number(m.level) === level);
  }
  const { tableName, subLevel } = resolveTableLevel(level);
  return matches.some((m) => m.tableName === tableName && Number(m.level) === subLevel);
}

interface DailySuggestionsResult {
  suggestions: CategorySuggestion[];
  emptyReason: 'no-library' | 'no-tables' | null;
}

async function buildDailySuggestions(
  playerId: string,
  track: Track,
  level: number,
  theme: Theme
): Promise<DailySuggestionsResult> {
  const library = await ensureLibrary(playerId);
  const root = cachedDirHandle!; // ensureLibraryが既にnullでないことを確認済み
  const difficultyTables = await getDifficultyTables();

  if (library.length === 0) {
    return { suggestions: [], emptyReason: 'no-library' };
  }
  if (!difficultyTables.hasData()) {
    return { suggestions: [], emptyReason: 'no-tables' };
  }

  const withMatches: Array<{ song: SongWithScore; matches: TableEntry[] }> = [];
  for (const song of library) {
    const matches = difficultyTables.lookup(song.md5, song.sha256);
    if (matchesLevel(matches, track, level)) withMatches.push({ song, matches });
  }

  let candidates = withMatches;
  if (candidates.length > MAX_ANALYZE_CANDIDATES) {
    candidates = [...candidates].sort(() => Math.random() - 0.5).slice(0, MAX_ANALYZE_CANDIDATES);
  }

  const analysisCache = await getAnalysisCache();
  const analyzed: AnalyzedSong[] = [];
  const matchesBySha256 = new Map<string, TableEntry[]>();
  for (const { song, matches } of candidates) {
    matchesBySha256.set(song.sha256, matches);
    // song.pathが絶対パス(bmsroot設定で外部フォルダを使っている場合)でも、
    // 追加で許可された譜面フォルダ(cachedExtraDirHandles)から探せることがある。
    // 過去に解析済み(キャッシュ済み)でも、その後ファイルが削除/移動されていることがある。
    if (!(await fileExistsAtAny(root, cachedExtraDirHandles, song.path))) continue;
    let analysis = analysisCache.get(song.sha256);
    if (!analysis) {
      try {
        const bytes = await readFileAtAny(root, cachedExtraDirHandles, song.path);
        analysis = analyzeSongBytes(bytes, song.sha256);
        analysisCache.set(analysis);
      } catch {
        continue; // ファイルが読めない/壊れている譜面はスキップ
      }
    }
    analyzed.push({ song, analysis });
  }

  const priorityTableNames: readonly string[] =
    theme === 'delay'
      ? ['ディレイjoy', 'Delay小学校難易度表']
      : theme === 'gachi'
        ? ['ウーデオシ小学校難易度表']
        : [];
  const priorityMatches = new Set<string>();
  if (priorityTableNames.length > 0) {
    for (const [sha256, matches] of matchesBySha256) {
      if (matches.some((m) => priorityTableNames.includes(m.tableName))) priorityMatches.add(sha256);
    }
  }

  const suggestionHistory = await getSuggestionHistory();
  const picks = pickByTheme(
    analyzed,
    theme,
    priorityMatches,
    suggestionHistory.suggestedSet(),
    suggestionHistory.shownTodayTitleSet()
  );
  suggestionHistory.record(picks.map(({ song }) => ({ sha256: song.sha256, title: song.title })));

  return {
    suggestions: picks.map(({ song, analysis }) => ({
      category: analysis.category,
      song,
      analysis,
      tableMatches: matchesBySha256.get(song.sha256) ?? [],
    })),
    emptyReason: null,
  };
}

async function estimateClearCeiling(playerId: string, track: Track): Promise<number | null> {
  const library = await ensureLibrary(playerId);
  const difficultyTables = await getDifficultyTables();

  const samples: ClearSample[] = [];
  for (const song of library) {
    if (song.playcount <= 0) continue;
    const matches = difficultyTables.lookup(song.md5, song.sha256);
    if (track === 'scratch') {
      for (const m of matches) {
        if (m.tableName === 'Scramble難易度表') {
          samples.push({ level: Number(m.level), playcount: song.playcount, clear: song.clear });
          break;
        }
      }
      continue;
    }
    if (track === 'insane') {
      for (const m of matches) {
        if (m.tableName === '発狂BMS難易度表') {
          samples.push({ level: Number(m.level), playcount: song.playcount, clear: song.clear });
          break;
        }
      }
      continue;
    }
    for (const m of matches) {
      if (m.tableName === 'Satellite') {
        samples.push({ level: Number(m.level), playcount: song.playcount, clear: song.clear });
        break;
      }
      if (m.tableName === 'Stella') {
        samples.push({ level: 13 + Number(m.level), playcount: song.playcount, clear: song.clear });
        break;
      }
    }
  }
  return computeClearCeiling(samples);
}

async function getEffectiveCeiling(playerId: string, track: Track): Promise<{ level: number | null; isManual: boolean }> {
  const settings = await getSettings();
  const override = settings.ceilingOverrideFor(track);
  if (override !== null) return { level: override, isManual: true };
  return { level: await estimateClearCeiling(playerId, track), isManual: false };
}

let currentTrack: Track = 'keys';
let currentTheme: Theme = 'midspeed';

export async function refreshSuggestions(
  playerId: string,
  track: Track,
  level: number,
  theme: Theme
): Promise<DailyRecommendationResult> {
  // Scrambleトラックでは「ガチ押し」「ディレイ」は選べないため(UIの選択肢にも出さない)、
  // トラック切り替え直後などに他トラックの持ち越しテーマが来た場合はここで補正する。
  const effectiveTheme = isThemeValidForTrack(theme, track) ? theme : 'midspeed';
  const settings = await getSettings();
  settings.update(playerId, track, level, effectiveTheme);
  currentTrack = track;
  currentTheme = effectiveTheme;
  playSessionDetector.setMetric(track === 'scratch' ? 'scratch' : 'notes');

  const [{ suggestions, emptyReason }, ceiling] = await Promise.all([
    buildDailySuggestions(playerId, track, level, effectiveTheme),
    getEffectiveCeiling(playerId, track),
  ]);

  const warmupFloorLevel = settings.warmupFloorFor(track);

  return {
    track,
    level,
    levelLabel: formatLevelForTrack(track, level),
    theme: effectiveTheme,
    ceilingLevel: ceiling.level,
    ceilingLabel: ceiling.level !== null ? formatLevelForTrack(track, ceiling.level) : null,
    ceilingIsManual: ceiling.isManual,
    warmupFloorLevel,
    warmupFloorLabel: formatLevelForTrack(track, warmupFloorLevel),
    levelStepSongs: settings.levelStepSongs,
    levelStepAmount: settings.levelStepAmount,
    suggestions,
    emptyReason,
  };
}

export async function refresh(playerId: string, track: Track, level: number, theme: Theme): Promise<DailyRecommendationResult> {
  return refreshSuggestions(playerId, track, clampLevelForTrack(track, level), theme);
}

export async function switchTrack(playerId: string, track: Track): Promise<DailyRecommendationResult> {
  const settings = await getSettings();
  return refreshSuggestions(playerId, track, settings.levelFor(track), settings.theme);
}

export async function setCeilingOverride(track: Track, level: number | null): Promise<DailyRecommendationResult> {
  if (!cachedPlayerId) throw new Error('セッションが開始されていません。');
  const settings = await getSettings();
  settings.setCeilingOverride(track, level === null ? null : clampLevelForTrack(track, level));
  return refreshSuggestions(cachedPlayerId, track, settings.levelFor(track), settings.theme);
}

let autoAdvanceEnabled = true;
export function setAutoAdvance(enabled: boolean): void {
  autoAdvanceEnabled = enabled;
}

export async function setWarmupFloor(track: Track, level: number): Promise<void> {
  const settings = await getSettings();
  settings.setWarmupFloor(track, clampLevelForTrack(track, level));
}

export async function setLevelStep(songs: number, amount: number): Promise<void> {
  const settings = await getSettings();
  settings.setLevelStep(songs, amount);
}

// ウォーミングアップボタン用: 現在のトラックのレベルを、ユーザーが設定した下限まで
// 即座に下げて選曲を更新する(日付を跨いだ自動リセットとは異なり、押した時だけ効く)。
export async function applyWarmup(): Promise<DailyRecommendationResult> {
  if (!cachedPlayerId) throw new Error('セッションが開始されていません。');
  const settings = await getSettings();
  const track = currentTrack;
  const level = settings.applyWarmup(track);
  return refreshSuggestions(cachedPlayerId, track, level, currentTheme);
}

let onAutoAdvanceCallback: ((result: DailyRecommendationResult) => void) | null = null;
export function onAutoAdvance(callback: (result: DailyRecommendationResult) => void): void {
  onAutoAdvanceCallback = callback;
}

// 選曲が切り替わる直前(既定3秒)のカウントダウン表示用。secondsLeftはnullで非表示。
let onCountdownCallback: ((secondsLeft: number | null) => void) | null = null;
export function onCountdownChange(callback: (secondsLeft: number | null) => void): void {
  onCountdownCallback = callback;
}

async function handleSongFinished(): Promise<void> {
  if (!autoAdvanceEnabled || !cachedPlayerId) return;
  try {
    const settings = await getSettings();
    const track = currentTrack;
    let level = settings.levelFor(track);
    // levelStepSongs曲終わるごとにlevelStepAmountレベル上げる(既定は1曲で1レベル)。
    // 曲数が足りない間もレベルは変えず、選曲だけ新しい3曲に入れ替える。
    if (settings.recordSongFinishedAndCheckStep(track)) {
      const ceiling = await getEffectiveCeiling(cachedPlayerId, track);
      level = decideAutoLevel(level, ceiling.level, settings.levelStepAmount, (n) => clampLevelForTrack(track, n));
    }
    const result = await refreshSuggestions(cachedPlayerId, track, level, currentTheme);
    onAutoAdvanceCallback?.(result);
  } catch {
    // セッション未開始などは無視
  }
}

export const playSessionDetector = new PlaySessionDetector(
  () => {
    handleSongFinished().catch(() => {});
  },
  (secondsLeft) => {
    // 自動切り替えがオフの間は、切り替わらないカウントダウンを見せると紛らわしいため隠す。
    onCountdownCallback?.(autoAdvanceEnabled ? secondsLeft : null);
  }
);
playSessionDetector.start();

export interface AutoStartResult {
  players: BeatorajaPlayer[];
  playerId: string;
  result: DailyRecommendationResult;
}

// フォルダ選択(File System Access APIの権限確認含む)が完了した後に呼ぶ。
// 前回の続き(プレイヤー/トラック/レベル/テーマ)から自動で今日のおすすめを表示する。
export async function loadAndStart(handle: FileSystemDirectoryHandle): Promise<AutoStartResult | { failedMessage: string }> {
  setActiveDirHandle(handle);
  const settings = await getSettings();
  settings.setBeatorajaDirName(handle.name);

  const players = await listPlayers(handle);
  if (players.length === 0) {
    return {
      failedMessage:
        `選択したフォルダ(${handle.name})にbeatorajaのプレイヤーが見つかりませんでした。` +
        'beatorajaを一度起動してプレイヤーを作成してから、もう一度お試しください。',
    };
  }

  const playerId = players.find((p) => p.id === settings.playerId)?.id ?? players[0].id;
  const track = settings.track;
  const result = await refreshSuggestions(playerId, track, settings.levelFor(track), settings.theme);
  return { players, playerId, result };
}

// 起動時、過去に許可した追加の譜面フォルダがあれば権限が生きているものだけ復元する。
// 権限が切れているフォルダは黙ってスキップする(メインのbeatorajaフォルダと違い、
// 無くても動作自体はできる補助的なものなので、失敗をエラー扱いにはしない)。
export async function restoreExtraDirHandles(): Promise<number> {
  const saved = await getSavedExtraDirHandles();
  const granted: FileSystemDirectoryHandle[] = [];
  for (const handle of saved) {
    if (await ensurePermission(handle)) granted.push(handle);
  }
  setExtraDirHandles(granted);
  return granted.length;
}

export async function addExtraChartDir(): Promise<number | null> {
  const handles = await pickExtraChartDir();
  if (!handles) return null; // ユーザーがキャンセルした
  setExtraDirHandles(handles);
  return handles.length;
}

export async function getKeystrokeHistory(): Promise<KeystrokeHistory> {
  const store = await getKeystrokeStore();
  return store.getHistory();
}

export async function getScratchHistory(): Promise<KeystrokeHistory> {
  const store = await getScratchStore();
  return store.getHistory();
}

export async function addKeystrokeDelta(delta: number): Promise<number> {
  const store = await getKeystrokeStore();
  const total = store.addDelta(delta);
  playSessionDetector.recordPress(delta);
  return total;
}

export async function addScratchDelta(delta: number): Promise<number> {
  const store = await getScratchStore();
  const total = store.addDelta(delta);
  playSessionDetector.recordScratch(delta);
  return total;
}
