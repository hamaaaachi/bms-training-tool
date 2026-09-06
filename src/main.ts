import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { listPlayers, loadLibrary } from './beatoraja/db';
import type { BeatorajaPlayer, SongWithScore } from './beatoraja/types';
import { clampLevelForTrack, formatLevelForTrack, pickByTheme, resolveTableLevel } from './recommend/categoryEngine';
import type { AnalyzedSong, CategorySuggestion, Track } from './recommend/categoryEngine';
import type { SpeedCategory } from './analysis/types';
import { AnalysisCache } from './analysis/cache';
import { analyzeSongFile, resolveSongPath } from './analysis/analyzeSong';
import { computeClearCeiling, decideAutoLevel } from './recommend/clearCeiling';
import type { ClearSample } from './recommend/clearCeiling';
import { DifficultyTables } from './tables/tables';
import type { TableEntry } from './tables/types';
import { SuggestionHistory } from './recommend/suggestionHistory';
import { KeystrokeStore } from './keystroke/store';
import type { KeystrokeHistory } from './keystroke/types';
import { PhoenixWanReader } from './keystroke/phoenixWanReader';
import { PlaySessionDetector } from './keystroke/playSessionDetector';
import { Settings } from './session/settings';
import type { Lang } from './session/settings';

// bms.model.Mode の getMode() が返す値。songdata.db の mode 列はこの値(キー数)で入っている。
const MODE_7K = 7;
// 1回の提案生成で実解析する曲数の上限(応答性を保つため)
const MAX_ANALYZE_CANDIDATES = 400;

let mainWindow: BrowserWindow | null = null;

async function isValidBeatorajaDir(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, 'songdata.db'));
    return true;
  } catch {
    return false;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    // ページが読み込まれるまでの一瞬、白い画面がちらつくのを防ぐ(既定は白)
    backgroundColor: '#0d0d13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.once('did-finish-load', () => {
    loadAndStart().catch(() => {});
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('settings:getBeatorajaDir', async (): Promise<string | null> => {
  const settings = await getSettings();
  return settings.beatorajaDir;
});

ipcMain.handle('settings:getLanguage', async (): Promise<Lang> => {
  const settings = await getSettings();
  return settings.language;
});

ipcMain.handle('settings:setLanguage', async (_event, language: Lang): Promise<void> => {
  const settings = await getSettings();
  settings.setLanguage(language);
});

// beatorajaのインストールフォルダをユーザーに選んでもらう(初回セットアップ・後からの変更の両方で使う)。
ipcMain.handle('settings:chooseBeatorajaDir', async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'beatorajaのインストールフォルダを選択してください',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const dir = result.filePaths[0];
  if (!(await isValidBeatorajaDir(dir))) {
    throw new Error(
      '選択したフォルダにsongdata.dbが見つかりませんでした。beatorajaをインストールしたフォルダ' +
        '(beatoraja.exeやsongdata.dbがある場所)を選んでください。'
    );
  }

  cachedLibrary = null;
  cachedPlayerId = null;
  const settings = await getSettings();
  settings.setBeatorajaDir(dir);
  await loadAndStart();
  return dir;
});

// プレイヤーごとの曲ライブラリ(songdata.db + score.db)をメインプロセス側にキャッシュし、
// レコメンド操作のたびに巨大な配列をIPCで送らずに済むようにする。
let cachedLibrary: SongWithScore[] | null = null;
let cachedPlayerId: string | null = null;

let analysisCachePromise: Promise<AnalysisCache> | null = null;
function getAnalysisCache(): Promise<AnalysisCache> {
  if (!analysisCachePromise) {
    analysisCachePromise = AnalysisCache.load(path.join(app.getPath('userData'), 'analysis-cache.json'));
  }
  return analysisCachePromise;
}

let difficultyTablesPromise: Promise<DifficultyTables> | null = null;
function getDifficultyTables(): Promise<DifficultyTables> {
  if (!difficultyTablesPromise) {
    difficultyTablesPromise = DifficultyTables.load(app.getPath('userData'));
  }
  return difficultyTablesPromise;
}

let suggestionHistoryPromise: Promise<SuggestionHistory> | null = null;
function getSuggestionHistory(): Promise<SuggestionHistory> {
  if (!suggestionHistoryPromise) {
    suggestionHistoryPromise = SuggestionHistory.load(
      path.join(app.getPath('userData'), 'suggestion-history.json')
    );
  }
  return suggestionHistoryPromise;
}

let keystrokeStorePromise: Promise<KeystrokeStore> | null = null;
function getKeystrokeStore(): Promise<KeystrokeStore> {
  if (!keystrokeStorePromise) {
    keystrokeStorePromise = KeystrokeStore.load(path.join(app.getPath('userData'), 'keystrokes.json'));
  }
  return keystrokeStorePromise;
}

// KeystrokeStoreは「日付ごとに値を積算するだけ」の汎用的な作りなので、スクラッチの
// 回転量の記録にもそのまま流用する。
let scratchStorePromise: Promise<KeystrokeStore> | null = null;
function getScratchStore(): Promise<KeystrokeStore> {
  if (!scratchStorePromise) {
    scratchStorePromise = KeystrokeStore.load(path.join(app.getPath('userData'), 'scratch.json'));
  }
  return scratchStorePromise;
}

let settingsPromise: Promise<Settings> | null = null;
function getSettings(): Promise<Settings> {
  if (!settingsPromise) {
    settingsPromise = Settings.load(path.join(app.getPath('userData'), 'settings.json'));
  }
  return settingsPromise;
}

async function ensureLibrary(playerId: string): Promise<SongWithScore[]> {
  const settings = await getSettings();
  if (!settings.beatorajaDir) {
    throw new Error('beatorajaのフォルダが設定されていません。');
  }
  if (cachedPlayerId !== playerId || !cachedLibrary) {
    const library = await loadLibrary(settings.beatorajaDir, playerId);
    cachedLibrary = library.filter((song) => song.mode === MODE_7K);
    cachedPlayerId = playerId;
    updateAutoAdvanceThreshold(cachedLibrary).catch(() => {});
  }
  return cachedLibrary;
}

// 自動レベル移行(PlaySessionDetector)の閾値を、実際のライブラリ中のSatellite表掲載曲の
// 最小ノーツ数に合わせて更新する。一番ノーツ数が少ない曲でも必ず発火するようにするため
// (2026-09-06にユーザー指示)。難易度表が未取得/該当曲が無い場合は何もしない
// (PlaySessionDetector側のデフォルト値のまま)。
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

export interface DailyRecommendationResult {
  track: Track;
  level: number;
  levelLabel: string;
  theme: SpeedCategory;
  ceilingLevel: number | null;
  ceilingLabel: string | null;
  ceilingIsManual: boolean;
  // ウォーミングアップ機能のON/OFF(全トラック共通)と、現在のトラックの下限値。
  warmupEnabled: boolean;
  warmupFloorLevel: number;
  warmupFloorLabel: string;
  suggestions: CategorySuggestion[];
  // suggestionsが0件のとき、なぜ0件なのかをレンダラー側で具体的に案内するための理由。
  // 「そのレベル/テーマに単純に該当曲が無い」場合はnull(既存の汎用メッセージを使う)。
  emptyReason: 'no-library' | 'no-tables' | null;
}

// このsongが指定トラック・レベルに載っているか。Satellite/Stella: Satellite→Stellaの
// 連番(0-25)。発狂: 発狂BMS難易度表独自のレベル(★1-25)。Scramble: Scramble難易度表
// 独自のレベル(SB-1〜SB12)。2026-09-06にユーザーから明示された通り、3トラックは
// 互いに別軸でリンクさせない独立したトラックとして扱う。
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

// 指定トラック・レベルに載っている7key譜面から、指定テーマ(ガチ押し/中速/高速/
// ディレイ)の曲を最大3曲選んで返す。選曲のベースを難易度表に限定することで、beatoraja内部の
// level値ではなく実際のコミュニティ難易度表に基づいた提案にする。
interface DailySuggestionsResult {
  suggestions: CategorySuggestion[];
  emptyReason: 'no-library' | 'no-tables' | null;
}

async function buildDailySuggestions(
  playerId: string,
  track: Track,
  level: number,
  theme: SpeedCategory
): Promise<DailySuggestionsResult> {
  const library = await ensureLibrary(playerId);
  const settings = await getSettings();
  const beatorajaDir = settings.beatorajaDir!; // ensureLibraryが既にnullでないことを確認済み
  const difficultyTables = await getDifficultyTables();

  // 選曲候補が0件になる理由をユーザーに案内できるよう、よくある原因を先にチェックしておく。
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
    // 過去に解析済み(キャッシュ済み)でも、その後ファイルが削除/移動されていることがある。
    // キャッシュを信用する前に実ファイルの存在を確認しないと、譜面を入れていない曲が
    // いつまでもおすすめされ続けてしまう(2026-09-06にユーザー指摘)。
    try {
      await fs.access(resolveSongPath(beatorajaDir, song.path));
    } catch {
      continue; // 譜面ファイルが実際には存在しないためスキップ
    }
    let analysis = analysisCache.get(song.sha256);
    if (!analysis) {
      try {
        analysis = await analyzeSongFile(beatorajaDir, song.path, song.sha256);
        analysisCache.set(analysis);
      } catch {
        continue; // ファイルが見つからない/壊れている譜面はスキップ
      }
    }
    analyzed.push({ song, analysis });
  }

  // ディレイ/ガチ押しは、それぞれの参考難易度表(ディレイjoy・Delay小学校/ウーデオシ小学校)に
  // 載っている曲を優先的に拾い上げる(2026-09-06にユーザー指示)。
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

// プレイヤーの実際のクリアランプから「今の上限」を推定する。sl10あたりからFailedが増え、
// sl11でほぼ全滅、のようなレベルを検出する(既にプレイ済みの曲のみが対象)。
// Satellite/StellaトラックはSatellite/Stellaを連番軸に、発狂トラックは発狂BMS難易度表、
// ScrambleトラックはScramble難易度表をそれぞれ独自軸として、別々に推定する
// (難易度をリンクさせないため)。
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

// ユーザーが手動で「今日の上限」を設定していればそちらを優先し、なければクリアランプから
// 自動推定する。
async function getEffectiveCeiling(playerId: string, track: Track): Promise<{ level: number | null; isManual: boolean }> {
  const settings = await getSettings();
  const override = settings.ceilingOverrideFor(track);
  if (override !== null) {
    return { level: override, isManual: true };
  }
  return { level: await estimateClearCeiling(playerId, track), isManual: false };
}

// 直近の提案で使われたプレイヤー/トラック/テーマ。曲終了自動検知(ユーザー操作を経由しない)で
// 次の提案を作るときに使う。
let currentTrack: Track = 'keys';
let currentTheme: SpeedCategory = 'midspeed';

async function refreshSuggestions(
  playerId: string,
  track: Track,
  level: number,
  theme: SpeedCategory
): Promise<DailyRecommendationResult> {
  const settings = await getSettings();
  settings.update(playerId, track, level, theme);
  currentTrack = track;
  currentTheme = theme;

  const [{ suggestions, emptyReason }, ceiling] = await Promise.all([
    buildDailySuggestions(playerId, track, level, theme),
    getEffectiveCeiling(playerId, track),
  ]);

  const warmupFloorLevel = settings.warmupFloorFor(track);

  return {
    track,
    level,
    levelLabel: formatLevelForTrack(track, level),
    theme,
    ceilingLevel: ceiling.level,
    ceilingLabel: ceiling.level !== null ? formatLevelForTrack(track, ceiling.level) : null,
    ceilingIsManual: ceiling.isManual,
    warmupEnabled: settings.warmupEnabled,
    warmupFloorLevel,
    warmupFloorLabel: formatLevelForTrack(track, warmupFloorLevel),
    suggestions,
    emptyReason,
  };
}

// トラック・レベル・テーマを明示的に指定して曲を選び直す(プルダウン変更・手動リロールの両方で使う)。
ipcMain.handle(
  'recommend:refresh',
  async (_event, playerId: string, track: Track, level: number, theme: SpeedCategory): Promise<DailyRecommendationResult> =>
    refreshSuggestions(playerId, track, clampLevelForTrack(track, level), theme)
);

// トラック(鍵盤/発狂/スクラッチ)を切り替える。難易度をリンクさせないため、切替先トラックで
// 直前に使っていたレベルをsettingsから読み出して復元する。
ipcMain.handle(
  'recommend:switchTrack',
  async (_event, playerId: string, track: Track): Promise<DailyRecommendationResult> => {
    const settings = await getSettings();
    return refreshSuggestions(playerId, track, settings.levelFor(track), settings.theme);
  }
);

// 「今日の上限」をユーザーが手動で指定する(nullなら自動推定に戻す)。トラックごとに別軸。
ipcMain.handle(
  'recommend:setCeilingOverride',
  async (_event, track: Track, level: number | null): Promise<DailyRecommendationResult> => {
    if (!cachedPlayerId) {
      throw new Error('セッションが開始されていません。');
    }
    const settings = await getSettings();
    settings.setCeilingOverride(track, level === null ? null : clampLevelForTrack(track, level));
    return refreshSuggestions(cachedPlayerId, track, settings.levelFor(track), settings.theme);
  }
);

let autoAdvanceEnabled = true;

ipcMain.handle('recommend:setAutoAdvance', (_event, enabled: boolean): void => {
  autoAdvanceEnabled = enabled;
});

// ウォーミングアップ機能のON/OFF。今表示中の提案には影響しない(次回、日付が変わって
// 最初に起動した時のレベルリセット挙動にのみ影響する)ため、提案を作り直す必要は無い。
ipcMain.handle('recommend:setWarmupEnabled', async (_event, enabled: boolean): Promise<void> => {
  const settings = await getSettings();
  settings.setWarmupEnabled(enabled);
});

// ウォーミングアップの下限(トラックごと)をユーザーが設定する。「今日の上限」と違い、
// 今表示中の提案(現在のレベル)には影響しない永続設定のため、提案を作り直す必要は無い。
ipcMain.handle('recommend:setWarmupFloor', async (_event, track: Track, level: number): Promise<void> => {
  const settings = await getSettings();
  settings.setWarmupFloor(track, clampLevelForTrack(track, level));
});

// 打鍵数が一定数(PlaySessionDetector参照)に達するたびに、上限(手動設定 or クリアランプ
// からの自動推定)を踏まえて次のレベルを自動で決め、提案を作り直す。上限に近づいたら
// 同じレベル帯に留まり、それ以外は1レベルずつ上げる。
async function handleSongFinished(): Promise<void> {
  if (!autoAdvanceEnabled || !cachedPlayerId) return;
  try {
    const settings = await getSettings();
    const track = currentTrack;
    const ceiling = await getEffectiveCeiling(cachedPlayerId, track);
    const nextLevel = decideAutoLevel(settings.levelFor(track), ceiling.level, (n) => clampLevelForTrack(track, n));
    const result = await refreshSuggestions(cachedPlayerId, track, nextLevel, currentTheme);
    mainWindow?.webContents.send('recommend:autoAdvance', result);
  } catch {
    // セッション未開始などは無視
  }
}

const playSessionDetector = new PlaySessionDetector(() => {
  handleSongFinished().catch(() => {});
});

// アプリ起動時(またはbeatorajaフォルダ選択直後)に、プレイヤー選択・セッション開始の
// クリックをユーザーにさせずに前回の続き(プレイヤー/レベル/テーマ)から自動で
// 今日のおすすめを表示する。refreshSuggestions() が内部でscore.db(クリアランプ)を
// 読んで上限を推定するため、起動直後からクリアランプに基づいた提案になる。
export interface AutoStartResult {
  players: BeatorajaPlayer[];
  playerId: string;
  result: DailyRecommendationResult;
}

async function loadAndStart(): Promise<void> {
  const settings = await getSettings();
  if (!settings.beatorajaDir) {
    // beatorajaフォルダが未設定(初回起動)。フォルダ選択を促す。
    mainWindow?.webContents.send('recommend:needsSetup');
    return;
  }

  // 当日初回起動なら全トラックのレベルを下限に戻す。1曲プレイし終えるたびの自動進行
  // (handleSongFinished→decideAutoLevel)がクリアランプ由来の上限に向けて改めて上げていく
  // ため、日をまたいだ「今日のウォームアップ」として機能する(2026-09-06にユーザー指示)。
  settings.resetLevelsForNewDay();

  const players = await listPlayers(settings.beatorajaDir);
  if (players.length === 0) {
    mainWindow?.webContents.send(
      'recommend:autoStartFailed',
      `選択したフォルダ(${settings.beatorajaDir})にbeatorajaのプレイヤーが見つかりませんでした。` +
        'beatorajaを一度起動してプレイヤーを作成してから、もう一度お試しください。'
    );
    return;
  }

  const playerId = players.find((p) => p.id === settings.playerId)?.id ?? players[0].id;
  const track = settings.track;
  const result = await refreshSuggestions(playerId, track, settings.levelFor(track), settings.theme);
  const payload: AutoStartResult = { players, playerId, result };
  mainWindow?.webContents.send('recommend:autoStart', payload);
}

ipcMain.handle('keystroke:getHistory', async (): Promise<KeystrokeHistory> => {
  const store = await getKeystrokeStore();
  return store.getHistory();
});

// PhoenixWan以外のコントローラーを使うユーザー向けのフォールバック経路。レンダラー側で
// Gamepad APIを使ってボタン押下を検知し、まとめてここに送る(PhoenixWanがHIDで検出されている
// 間はレンダラー側で二重カウントしないようにしている)。
ipcMain.handle('keystroke:addDelta', async (_event, delta: number): Promise<number> => {
  const store = await getKeystrokeStore();
  const total = store.addDelta(delta);
  playSessionDetector.recordPress(delta);
  return total;
});

// スクラッチはPhoenixWan固有のHID経路(byte0)でのみ検出できるため、Gamepad APIの
// フォールバックは無い(他機種のスクラッチ/ターンテーブル軸は機種ごとにバラバラで
// 汎用的に扱えないため)。
ipcMain.handle('scratch:getHistory', async (): Promise<KeystrokeHistory> => {
  const store = await getScratchStore();
  return store.getHistory();
});

// node-hidでPhoenixWanのHIDレポートを直接受け取ることで表示のラグを無くす(Gamepad APIの
// rAF単位のポーリングより低遅延)。PhoenixWan固有のVID/PIDでのみ動作し、見つからなければ
// 上のGamepad APIフォールバックに任せる。
const phoenixWanReader = new PhoenixWanReader(
  (count) => {
    getKeystrokeStore().then((store) => {
      const total = store.addDelta(count);
      mainWindow?.webContents.send('keystroke:count', total);
    });
    playSessionDetector.recordPress(count);
  },
  (ticks) => {
    getScratchStore().then((store) => {
      const total = store.addDelta(ticks);
      mainWindow?.webContents.send('scratch:count', total);
    });
  },
  (connected) => {
    mainWindow?.webContents.send('keystroke:connection', connected);
  }
);

ipcMain.handle('keystroke:isConnected', (): boolean => phoenixWanReader.isConnected());

let phoenixWanPollTimer: ReturnType<typeof setInterval> | null = null;

app.whenReady().then(() => {
  createWindow();
  playSessionDetector.start();
  phoenixWanReader.tryConnect();
  phoenixWanPollTimer = setInterval(() => phoenixWanReader.tryConnect(), 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let isQuitting = false;
app.on('before-quit', (event) => {
  // デバウンス保存待ちのキャッシュ/履歴を確実にディスクへ反映してから終了する
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  if (phoenixWanPollTimer) clearInterval(phoenixWanPollTimer);
  playSessionDetector.stop();
  phoenixWanReader.close();
  Promise.all([
    analysisCachePromise?.then((c) => c.flush()).catch(() => {}),
    keystrokeStorePromise?.then((s) => s.flush()).catch(() => {}),
    scratchStorePromise?.then((s) => s.flush()).catch(() => {}),
    settingsPromise?.then((s) => s.flush()).catch(() => {}),
    suggestionHistoryPromise?.then((s) => s.flush()).catch(() => {}),
  ]).finally(() => app.quit());
});
