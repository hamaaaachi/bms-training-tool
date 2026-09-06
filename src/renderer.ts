import type { AutoStartResult, DailyRecommendationResult } from './main';
import type { KeystrokeHistory } from './keystroke/types';
import type { SpeedCategory } from './analysis/types';
import type { Track } from './recommend/categoryEngine';
import type { Lang } from './session/settings';

declare global {
  interface Window {
    settings: {
      getBeatorajaDir: () => Promise<string | null>;
      chooseBeatorajaDir: () => Promise<string | null>;
      getLanguage: () => Promise<Lang>;
      setLanguage: (language: Lang) => Promise<void>;
    };
    recommend: {
      refresh: (playerId: string, track: Track, level: number, theme: SpeedCategory) => Promise<DailyRecommendationResult>;
      switchTrack: (playerId: string, track: Track) => Promise<DailyRecommendationResult>;
      setCeilingOverride: (track: Track, level: number | null) => Promise<DailyRecommendationResult>;
      setAutoAdvance: (enabled: boolean) => Promise<void>;
      setWarmupEnabled: (enabled: boolean) => Promise<void>;
      setWarmupFloor: (track: Track, level: number) => Promise<void>;
      onAutoAdvance: (callback: (result: DailyRecommendationResult) => void) => void;
      onAutoStart: (callback: (result: AutoStartResult) => void) => void;
      onAutoStartFailed: (callback: (message: string) => void) => void;
      onNeedsSetup: (callback: () => void) => void;
    };
    keystroke: {
      getHistory: () => Promise<KeystrokeHistory>;
      isConnected: () => Promise<boolean>;
      addDelta: (delta: number) => Promise<number>;
      onCount: (callback: (total: number) => void) => void;
      onConnectionChange: (callback: (connected: boolean) => void) => void;
    };
    scratch: {
      getHistory: () => Promise<KeystrokeHistory>;
      onCount: (callback: (total: number) => void) => void;
    };
  }
}

// UIの固定文言のみを多言語化する対象(2026-09-06にユーザー指示)。曲名/アーティスト名/
// クリアランプ名(NoPlay/Hard等、beatoraja内部の名称)はデータそのものなので翻訳しない。
// main.tsから届く一部のエラーメッセージ(フォルダ未設定時の案内など)も日本語のまま。
interface StringTable {
  appTagline: string;
  langLabel: string;
  recommendPanelTitle: string;
  beatorajaFolderLabel: string;
  notSet: string;
  chooseFolderBtn: string;
  labelPlayer: string;
  labelMode: string;
  labelLevel: string;
  labelTheme: string;
  labelCeiling: string;
  labelFloor: string;
  playerPlaceholder: string;
  rerollBtn: string;
  loadingInitial: string;
  autoAdvanceLabel: string;
  warmupLabel: string;
  keystrokePanelTitle: string;
  noControllerDetected: string;
  todayKeystrokes: string;
  todayScratches: string;
  monthKeystrokes: string;
  monthScratches: string;
  categoryGachi: string;
  categoryMidspeed: string;
  categoryHighspeed: string;
  categoryDelay: string;
  trackInsane: string;
  ceilingAutoOption: string;
  statLevelBpm: string;
  statNotes: string;
  statRatios: string;
  statClear: string;
  currentLevelHeading: string;
  ceilingUnknown: string;
  ceilingManual: string;
  ceilingAutoDetected: string;
  emptyNoLibrary: string;
  emptyNoTables: string;
  emptyGeneric: string;
  analyzing: string;
  analyzingShort: string;
  errorPrefix: string;
  needsSetup: string;
  hidConnected: string;
  gamepadConnected: string;
  calendarTooltip: string;
}

const STRINGS: Record<Lang, StringTable> = {
  ja: {
    appTagline: 'beatoraja連携・難易度表ベースの練習アシスタント',
    langLabel: '言語',
    recommendPanelTitle: 'おすすめ選曲',
    beatorajaFolderLabel: 'beatorajaフォルダ:',
    notSet: '未設定',
    chooseFolderBtn: 'フォルダを選択',
    labelPlayer: 'プレイヤー',
    labelMode: 'モード',
    labelLevel: 'レベル',
    labelTheme: 'テーマ',
    labelCeiling: '今日の上限',
    labelFloor: '下限',
    playerPlaceholder: '起動時に自動読み込み...',
    rerollBtn: 'この3曲を変える',
    loadingInitial: '起動時に自動でおすすめを読み込みます...',
    autoAdvanceLabel: '1曲プレイ後に自動でレベルを調整して次の選曲を表示',
    warmupLabel: 'ウォーミングアップ(当日初回起動時に下限からレベルを上げる)',
    keystrokePanelTitle: '打鍵カウント',
    noControllerDetected: 'コントローラーが検出されていません',
    todayKeystrokes: '本日の打鍵数',
    todayScratches: '本日のスクラッチ数',
    monthKeystrokes: '今月の打鍵数',
    monthScratches: '今月のスクラッチ数',
    categoryGachi: 'ガチ押し',
    categoryMidspeed: '中速',
    categoryHighspeed: '高速',
    categoryDelay: 'ディレイ',
    trackInsane: '発狂',
    ceilingAutoOption: '自動(クリアランプから推定)',
    statLevelBpm: 'レベル: {level}  BPM: {bpm}',
    statNotes: 'ノーツ数: {notes}',
    statRatios: '同時押し率 {chord}%  スクラッチ率 {scratch}%',
    statClear: 'クリアランプ: {clear}',
    currentLevelHeading: '現在のレベル({track}): {level}',
    ceilingUnknown: '上限: まだ検出されていません',
    ceilingManual: '上限: {label}(今日の手動設定)',
    ceilingAutoDetected: '上限: {label}(自動推定、このあたりでFailedが多発)',
    emptyNoLibrary: '7key譜面が見つかりませんでした。beatorajaで7keyの曲を読み込んでいるか確認してください。',
    emptyNoTables: '難易度表の取得に失敗しました。インターネット接続を確認して、アプリを再起動してみてください。',
    emptyGeneric: '{level} で条件に合う曲が見つかりませんでした。レベルかテーマを変えてみてください。',
    analyzing: '解析中...(初回はファイル解析のため少し時間がかかります)',
    analyzingShort: '解析中...',
    errorPrefix: 'エラー: {message}',
    needsSetup: '初めまして。まずは「フォルダを選択」からbeatorajaのインストールフォルダを選んでください。',
    hidConnected: 'PhoenixWan 接続中(HID直接読み取り)',
    gamepadConnected: 'コントローラー接続中: {names}',
    calendarTooltip: '{date}: {count}打鍵',
  },
  en: {
    appTagline: 'A beatoraja-integrated, difficulty-table-based practice assistant',
    langLabel: 'Language',
    recommendPanelTitle: 'Suggested Songs',
    beatorajaFolderLabel: 'beatoraja folder:',
    notSet: 'Not set',
    chooseFolderBtn: 'Choose Folder',
    labelPlayer: 'Player',
    labelMode: 'Mode',
    labelLevel: 'Level',
    labelTheme: 'Theme',
    labelCeiling: "Today's Ceiling",
    labelFloor: 'Floor',
    playerPlaceholder: 'Loading automatically on startup...',
    rerollBtn: 'Reroll These 3 Songs',
    loadingInitial: 'Suggestions will load automatically on startup...',
    autoAdvanceLabel: 'After playing a song, auto-adjust the level and show the next picks',
    warmupLabel: 'Warm-up (raise the level from the floor on the first launch of the day)',
    keystrokePanelTitle: 'Keystroke Count',
    noControllerDetected: 'No controller detected',
    todayKeystrokes: "Today's Keystrokes",
    todayScratches: "Today's Scratches",
    monthKeystrokes: "This Month's Keystrokes",
    monthScratches: "This Month's Scratches",
    categoryGachi: 'Gachi-oshi',
    categoryMidspeed: 'Midspeed',
    categoryHighspeed: 'Highspeed',
    categoryDelay: 'Delay',
    trackInsane: 'Insane',
    ceilingAutoOption: 'Auto (estimated from clear lamps)',
    statLevelBpm: 'Level: {level}  BPM: {bpm}',
    statNotes: 'Notes: {notes}',
    statRatios: 'Chord {chord}%  Scratch {scratch}%',
    statClear: 'Clear Lamp: {clear}',
    currentLevelHeading: 'Current Level ({track}): {level}',
    ceilingUnknown: 'Ceiling: not detected yet',
    ceilingManual: 'Ceiling: {label} (manually set for today)',
    ceilingAutoDetected: 'Ceiling: {label} (auto-estimated — Failed results cluster around here)',
    emptyNoLibrary: 'No 7-key charts were found. Make sure beatoraja has loaded 7-key songs.',
    emptyNoTables: 'Failed to fetch difficulty tables. Check your internet connection and try restarting the app.',
    emptyGeneric: 'No matching songs were found at {level}. Try a different level or theme.',
    analyzing: 'Analyzing... (the first time takes a bit longer due to file analysis)',
    analyzingShort: 'Analyzing...',
    errorPrefix: 'Error: {message}',
    needsSetup: 'Welcome! First, choose your beatoraja installation folder using "Choose Folder".',
    hidConnected: 'PhoenixWan connected (direct HID read)',
    gamepadConnected: 'Controller connected: {names}',
    calendarTooltip: '{date}: {count} keystrokes',
  },
  ko: {
    appTagline: 'beatoraja 연동 · 난이도표 기반 연습 어시스턴트',
    langLabel: '언어',
    recommendPanelTitle: '추천 선곡',
    beatorajaFolderLabel: 'beatoraja 폴더:',
    notSet: '미설정',
    chooseFolderBtn: '폴더 선택',
    labelPlayer: '플레이어',
    labelMode: '모드',
    labelLevel: '레벨',
    labelTheme: '테마',
    labelCeiling: '오늘의 상한',
    labelFloor: '하한',
    playerPlaceholder: '시작 시 자동으로 불러옵니다...',
    rerollBtn: '이 3곡 다시 뽑기',
    loadingInitial: '시작 시 자동으로 추천을 불러옵니다...',
    autoAdvanceLabel: '한 곡 플레이 후 자동으로 레벨을 조정해 다음 선곡을 표시',
    warmupLabel: '워밍업(당일 첫 실행 시 하한부터 레벨을 올림)',
    keystrokePanelTitle: '키 입력 카운트',
    noControllerDetected: '컨트롤러가 감지되지 않았습니다',
    todayKeystrokes: '오늘의 키 입력 수',
    todayScratches: '오늘의 스크래치 수',
    monthKeystrokes: '이번 달 키 입력 수',
    monthScratches: '이번 달 스크래치 수',
    categoryGachi: '가치오시',
    categoryMidspeed: '중속',
    categoryHighspeed: '고속',
    categoryDelay: '딜레이',
    trackInsane: '인세인',
    ceilingAutoOption: '자동(클리어 램프로 추정)',
    statLevelBpm: '레벨: {level}  BPM: {bpm}',
    statNotes: '노트 수: {notes}',
    statRatios: '동시치기 {chord}%  스크래치 {scratch}%',
    statClear: '클리어 램프: {clear}',
    currentLevelHeading: '현재 레벨({track}): {level}',
    ceilingUnknown: '상한: 아직 감지되지 않았습니다',
    ceilingManual: '상한: {label}(오늘 수동 설정)',
    ceilingAutoDetected: '상한: {label}(자동 추정, 이 부근에서 Failed가 많이 발생)',
    emptyNoLibrary: '7key 채보를 찾을 수 없습니다. beatoraja에 7key 곡이 로드되어 있는지 확인해 주세요.',
    emptyNoTables: '난이도표를 가져오지 못했습니다. 인터넷 연결을 확인하고 앱을 다시 시작해 보세요.',
    emptyGeneric: '{level}에서 조건에 맞는 곡을 찾을 수 없습니다. 레벨이나 테마를 바꿔 보세요.',
    analyzing: '분석 중...(처음에는 파일 분석 때문에 시간이 조금 걸립니다)',
    analyzingShort: '분석 중...',
    errorPrefix: '오류: {message}',
    needsSetup: '환영합니다! 먼저 "폴더 선택"에서 beatoraja 설치 폴더를 선택해 주세요.',
    hidConnected: 'PhoenixWan 연결됨(HID 직접 읽기)',
    gamepadConnected: '컨트롤러 연결됨: {names}',
    calendarTooltip: '{date}: {count}회 입력',
  },
};

let currentLang: Lang = 'ja';

function t(key: keyof StringTable, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[currentLang][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'gachi':
      return t('categoryGachi');
    case 'midspeed':
      return t('categoryMidspeed');
    case 'highspeed':
      return t('categoryHighspeed');
    case 'delay':
      return t('categoryDelay');
    default:
      return category;
  }
}

function buildCategoryCard(suggestion: DailyRecommendationResult['suggestions'][number]): HTMLElement {
  const { category, song, analysis, tableMatches } = suggestion;

  const card = document.createElement('div');
  card.className = `song-card category-${category}`;

  const label = document.createElement('div');
  label.className = 'category-label';
  label.textContent = categoryLabel(category);
  card.appendChild(label);

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = song.title;
  card.appendChild(title);

  const artist = document.createElement('div');
  artist.className = 'artist';
  artist.textContent = song.artist;
  card.appendChild(artist);

  const lines = [
    t('statLevelBpm', { level: song.level, bpm: analysis.bpm }),
    t('statNotes', { notes: song.notes }),
    t('statRatios', {
      chord: (analysis.chordRatio * 100).toFixed(0),
      scratch: (analysis.scratchRatio * 100).toFixed(0),
    }),
    t('statClear', { clear: song.clearName }),
  ];
  for (const line of lines) {
    const el = document.createElement('div');
    el.className = 'stat-line';
    el.textContent = line;
    card.appendChild(el);
  }

  if (tableMatches.length > 0) {
    const badges = document.createElement('div');
    badges.className = 'table-badges';
    for (const match of tableMatches) {
      const badge = document.createElement('span');
      badge.className = 'table-badge';
      badge.textContent = `${match.tableName} ${match.symbol}${match.level}`;
      badges.appendChild(badge);
    }
    card.appendChild(badges);
  }

  return card;
}

// Satellite/Stellaトラック: Satellite(sl0-12)→Stella(st0-12)が続く1本のレベル軸
// (main.tsのcategoryEngine.tsと同じ定義。ESM/CJS二重ビルド構成のため値としてはここで
// 小さく複製している)。
const KEYS_LEVEL_OPTION_COUNT = 26; // 13 + 13
function formatKeysLevelLabel(level: number): string {
  return level < 13 ? `sl${level}` : `st${level - 13}`;
}

// 発狂トラック: 発狂BMS難易度表(★1-25)独自のレベル軸。Satellite/Stellaとはリンクさせない
// 独立したトラック(2026-09-06にユーザーから指示)。
const INSANE_MIN_LEVEL = 1;
const INSANE_MAX_LEVEL = 25;
function formatInsaneLevelLabel(level: number): string {
  return `★${level}`;
}

// Scrambleトラック: Scramble難易度表(SB-1〜SB12)独自のレベル軸。2026-09-06にユーザーから
// 明示された通り、Satellite/Stella・発狂側のレベルとはリンクさせない別軸として扱う。
const SCRATCH_LEVEL_MIN = -1;
const SCRATCH_LEVEL_MAX = 12;
function formatScratchLevelLabel(level: number): string {
  return `SB${level}`;
}

interface LevelOption {
  value: number;
  label: string;
}

function levelOptionsFor(track: Track): LevelOption[] {
  const opts: LevelOption[] = [];
  if (track === 'scratch') {
    for (let level = SCRATCH_LEVEL_MIN; level <= SCRATCH_LEVEL_MAX; level++) {
      opts.push({ value: level, label: formatScratchLevelLabel(level) });
    }
    return opts;
  }
  if (track === 'insane') {
    for (let level = INSANE_MIN_LEVEL; level <= INSANE_MAX_LEVEL; level++) {
      opts.push({ value: level, label: formatInsaneLevelLabel(level) });
    }
    return opts;
  }
  for (let level = 0; level < KEYS_LEVEL_OPTION_COUNT; level++) {
    opts.push({ value: level, label: formatKeysLevelLabel(level) });
  }
  return opts;
}

// 2026-09-06にユーザー指示: モード名は難易度表の実名で表記する(3トラックとも)。
// Satellite/Stella・Scrambleは元々ラテン文字表記のため翻訳不要。発狂のみ言語ごとに変わる。
function trackLabel(track: Track): string {
  if (track === 'insane') return t('trackInsane');
  if (track === 'scratch') return 'Scramble';
  return 'Satellite/Stella';
}

function setupRecommender(): (() => void) | null {
  const playerSelect = document.getElementById('player-select') as HTMLSelectElement | null;
  const trackSelect = document.getElementById('track-select') as HTMLSelectElement | null;
  const levelSelect = document.getElementById('level-select') as HTMLSelectElement | null;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
  const ceilingSelect = document.getElementById('ceiling-select') as HTMLSelectElement | null;
  const floorSelect = document.getElementById('floor-select') as HTMLSelectElement | null;
  const rerollBtn = document.getElementById('reroll-btn') as HTMLButtonElement | null;
  const levelHeadingEl = document.getElementById('level-heading') as HTMLDivElement | null;
  const ceilingHeadingEl = document.getElementById('ceiling-heading') as HTMLDivElement | null;
  const suggestionResultsEl = document.getElementById('suggestion-results') as HTMLDivElement | null;
  const autoAdvanceCheckbox = document.getElementById('auto-advance-checkbox') as HTMLInputElement | null;
  const warmupCheckbox = document.getElementById('warmup-checkbox') as HTMLInputElement | null;
  const beatorajaPathEl = document.getElementById('beatoraja-path') as HTMLSpanElement | null;
  const chooseBeatorajaBtn = document.getElementById('choose-beatoraja-btn') as HTMLButtonElement | null;
  const setupBannerEl = document.getElementById('setup-banner') as HTMLDivElement | null;
  if (
    !playerSelect ||
    !trackSelect ||
    !levelSelect ||
    !themeSelect ||
    !ceilingSelect ||
    !floorSelect ||
    !rerollBtn ||
    !levelHeadingEl ||
    !ceilingHeadingEl ||
    !suggestionResultsEl ||
    !autoAdvanceCheckbox ||
    !warmupCheckbox ||
    !beatorajaPathEl ||
    !chooseBeatorajaBtn ||
    !setupBannerEl
  ) {
    return null;
  }

  let currentTrack: Track = 'keys';
  let needsSetup = false;
  // 言語切替時に現在の表示を訳し直すため、直近の状態を覚えておく
  // (main側に再度問い合わせずにレンダラー側だけで再描画するため)。
  let lastResult: DailyRecommendationResult | null = null;
  let lastBeatorajaDir: string | null | undefined = undefined;

  const populateTrackOptions = (): void => {
    const selected = trackSelect.value;
    trackSelect.innerHTML = '';
    for (const track of ['keys', 'insane', 'scratch'] as Track[]) {
      const opt = document.createElement('option');
      opt.value = track;
      opt.textContent = trackLabel(track);
      trackSelect.appendChild(opt);
    }
    if (selected) trackSelect.value = selected;
  };
  populateTrackOptions();

  const populateLevelOptions = (track: Track): void => {
    levelSelect.innerHTML = '';
    ceilingSelect.innerHTML = '';
    floorSelect.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = t('ceilingAutoOption');
    ceilingSelect.appendChild(autoOption);
    for (const { value, label } of levelOptionsFor(track)) {
      const levelOpt = document.createElement('option');
      levelOpt.value = String(value);
      levelOpt.textContent = label;
      levelSelect.appendChild(levelOpt);

      const ceilingOpt = document.createElement('option');
      ceilingOpt.value = String(value);
      ceilingOpt.textContent = label;
      ceilingSelect.appendChild(ceilingOpt);

      const floorOpt = document.createElement('option');
      floorOpt.value = String(value);
      floorOpt.textContent = label;
      floorSelect.appendChild(floorOpt);
    }
    levelSelect.dataset.track = track;
  };
  populateLevelOptions(currentTrack);

  const populateThemeOptions = (): void => {
    const selected = themeSelect.value;
    themeSelect.innerHTML = '';
    for (const category of ['gachi', 'midspeed', 'highspeed', 'delay'] as SpeedCategory[]) {
      const opt = document.createElement('option');
      opt.value = category;
      opt.textContent = categoryLabel(category);
      themeSelect.appendChild(opt);
    }
    if (selected) themeSelect.value = selected;
  };
  populateThemeOptions();

  const setControlsEnabled = (enabled: boolean): void => {
    playerSelect.disabled = !enabled;
    trackSelect.disabled = !enabled;
    levelSelect.disabled = !enabled;
    themeSelect.disabled = !enabled;
    ceilingSelect.disabled = !enabled;
    floorSelect.disabled = !enabled;
    rerollBtn.disabled = !enabled;
  };
  setControlsEnabled(false);

  const renderSuggestions = (result: DailyRecommendationResult): void => {
    lastResult = result;
    currentTrack = result.track;
    trackSelect.value = result.track;
    if (levelSelect.dataset.track !== result.track) populateLevelOptions(result.track);
    levelSelect.value = String(result.level);
    themeSelect.value = result.theme;
    ceilingSelect.value = result.ceilingIsManual && result.ceilingLevel !== null ? String(result.ceilingLevel) : '';
    floorSelect.value = String(result.warmupFloorLevel);
    warmupCheckbox.checked = result.warmupEnabled;
    levelHeadingEl.textContent = t('currentLevelHeading', { track: trackLabel(result.track), level: result.levelLabel });
    if (!result.ceilingLabel) {
      ceilingHeadingEl.textContent = t('ceilingUnknown');
    } else if (result.ceilingIsManual) {
      ceilingHeadingEl.textContent = t('ceilingManual', { label: result.ceilingLabel });
    } else {
      ceilingHeadingEl.textContent = t('ceilingAutoDetected', { label: result.ceilingLabel });
    }
    suggestionResultsEl.innerHTML = '';
    if (result.suggestions.length === 0) {
      let message: string;
      if (result.emptyReason === 'no-library') {
        message = t('emptyNoLibrary');
      } else if (result.emptyReason === 'no-tables') {
        message = t('emptyNoTables');
      } else {
        message = t('emptyGeneric', { level: result.levelLabel });
      }
      // #suggestion-resultsはCSS Grid(auto-fill, minmax(230px, 1fr))なので、生のテキストを
      // 直接置くと最初の列幅(230px)に閉じ込められて変な位置で折り返される。全幅のdivで包む。
      const messageEl = document.createElement('div');
      messageEl.className = 'empty-message';
      messageEl.textContent = message;
      suggestionResultsEl.appendChild(messageEl);
      return;
    }
    for (const suggestion of result.suggestions) {
      suggestionResultsEl.appendChild(buildCategoryCard(suggestion));
    }
  };

  const refresh = (playerId: string): void => {
    if (!playerId) return;
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzing');

    window.recommend
      .refresh(playerId, currentTrack, Number(levelSelect.value), themeSelect.value as SpeedCategory)
      .then((result) => {
        renderSuggestions(result);
      })
      .catch((err: unknown) => {
        levelHeadingEl.textContent = t('errorPrefix', { message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        setControlsEnabled(true);
      });
  };

  playerSelect.addEventListener('change', () => refresh(playerSelect.value));
  levelSelect.addEventListener('change', () => refresh(playerSelect.value));
  themeSelect.addEventListener('change', () => refresh(playerSelect.value));
  rerollBtn.addEventListener('click', () => refresh(playerSelect.value));

  // トラック切替はレベルの選択肢そのものが変わる(鍵盤/発狂/スクラッチは別軸)ため、
  // 現在のlevelSelect値をそのまま使い回さず、切替先トラックの直前のレベルをmain側から取得する。
  trackSelect.addEventListener('change', () => {
    const playerId = playerSelect.value;
    if (!playerId) return;
    const track = trackSelect.value as Track;
    currentTrack = track;
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzingShort');
    window.recommend
      .switchTrack(playerId, track)
      .then((result) => {
        renderSuggestions(result);
      })
      .catch((err: unknown) => {
        levelHeadingEl.textContent = t('errorPrefix', { message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        setControlsEnabled(true);
      });
  });

  ceilingSelect.addEventListener('change', () => {
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzingShort');
    const value = ceilingSelect.value === '' ? null : Number(ceilingSelect.value);
    window.recommend
      .setCeilingOverride(currentTrack, value)
      .then((result) => {
        renderSuggestions(result);
      })
      .catch((err: unknown) => {
        levelHeadingEl.textContent = t('errorPrefix', { message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        setControlsEnabled(true);
      });
  });

  // 下限(ウォーミングアップ開始レベル)・ウォーミングアップON/OFFは今表示中の提案には
  // 影響しない永続設定のため、reroll/refreshは行わない(表示中の3曲を変えたくないため)。
  floorSelect.addEventListener('change', () => {
    window.recommend.setWarmupFloor(currentTrack, Number(floorSelect.value)).catch(() => {});
  });

  warmupCheckbox.addEventListener('change', () => {
    window.recommend.setWarmupEnabled(warmupCheckbox.checked).catch(() => {});
  });

  autoAdvanceCheckbox.addEventListener('change', () => {
    window.recommend.setAutoAdvance(autoAdvanceCheckbox.checked).catch(() => {});
  });
  window.recommend.setAutoAdvance(autoAdvanceCheckbox.checked).catch(() => {});

  // 打鍵が途切れて1曲プレイし終えたと判定されたら、クリアランプの上限を踏まえて
  // レベルを自動調整し、次の3曲を自動表示する(ボタン操作は不要)
  window.recommend.onAutoAdvance((result) => {
    renderSuggestions(result);
  });

  // アプリ起動時にクリック操作なしで前回の続きから今日のおすすめを自動表示する
  window.recommend.onAutoStart(({ players, playerId, result }) => {
    needsSetup = false;
    setupBannerEl.hidden = true;
    playerSelect.innerHTML = '';
    for (const player of players) {
      const opt = document.createElement('option');
      opt.value = player.id;
      opt.textContent = player.name;
      playerSelect.appendChild(opt);
    }
    playerSelect.value = playerId;
    renderSuggestions(result);
    setControlsEnabled(true);
  });

  // beatorajaが見つからない場合、無反応のままにせず理由を表示する
  window.recommend.onAutoStartFailed((message) => {
    levelHeadingEl.textContent = message;
  });

  const refreshBeatorajaPath = (): void => {
    window.settings
      .getBeatorajaDir()
      .then((dir) => {
        lastBeatorajaDir = dir;
        beatorajaPathEl.textContent = dir ?? t('notSet');
      })
      .catch(() => {});
  };
  refreshBeatorajaPath();

  chooseBeatorajaBtn.addEventListener('click', () => {
    chooseBeatorajaBtn.disabled = true;
    window.settings
      .chooseBeatorajaDir()
      .then((dir) => {
        if (dir) refreshBeatorajaPath();
      })
      .catch((err: unknown) => {
        levelHeadingEl.textContent = t('errorPrefix', { message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        chooseBeatorajaBtn.disabled = false;
      });
  });

  // beatorajaフォルダが未設定(初回起動)。フォルダ選択を促す。
  // 案内メッセージは「フォルダを選択」ボタンより下に置くと、レイアウト変更時に文言と
  // 位置がずれる(2026-09-06にユーザー指摘)ため、パネル最上部の専用バナーに表示する。
  window.recommend.onNeedsSetup(() => {
    needsSetup = true;
    setupBannerEl.textContent = t('needsSetup');
    setupBannerEl.hidden = false;
    setControlsEnabled(false);
  });

  // 言語切替時、main側に再度問い合わせずに直近の状態をそのまま新しい言語で再描画する。
  return () => {
    populateTrackOptions();
    populateThemeOptions();
    // 「今日の上限」欄の「自動(クリアランプから推定)」はrenderSuggestions内の
    // populateLevelOptionsがトラック変更時にしか呼ばれないため、言語切替のたびに
    // 明示的に選択肢を作り直す(でないと表示中の言語のまま残ってしまう。
    // 2026-09-06にユーザー指摘)。
    populateLevelOptions(currentTrack);
    if (needsSetup) {
      setupBannerEl.textContent = t('needsSetup');
    } else if (lastResult) {
      renderSuggestions(lastResult);
    } else {
      levelHeadingEl.textContent = t('loadingInitial');
    }
    if (lastBeatorajaDir !== undefined) {
      beatorajaPathEl.textContent = lastBeatorajaDir ?? t('notSet');
    }
  };
}

const WEEKDAY_LABELS: Record<Lang, string[]> = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ko: ['일', '월', '화', '수', '목', '금', '토'],
};

const MONTH_LOCALE: Record<Lang, string> = { ja: 'ja-JP', en: 'en-US', ko: 'ko-KR' };
function monthLabelFormat(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(MONTH_LOCALE[currentLang], { year: 'numeric', month: 'long' });
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumCurrentMonth(history: KeystrokeHistory): number {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    total += history[dateStr] ?? 0;
  }
  return total;
}

function setupKeystrokeCounter(): (() => void) | null {
  const statusEl = document.getElementById('gamepad-status') as HTMLDivElement | null;
  const todayCountEl = document.getElementById('keystroke-today-count') as HTMLDivElement | null;
  const monthCountEl = document.getElementById('keystroke-month-count') as HTMLDivElement | null;
  const calendarEl = document.getElementById('calendar') as HTMLDivElement | null;
  const calendarMonthEl = document.getElementById('calendar-month') as HTMLDivElement | null;
  if (!statusEl || !todayCountEl || !monthCountEl || !calendarEl || !calendarMonthEl) return null;
  // ネストした関数からも非nullとして扱えるよう、確定済みの参照に詰め替える
  const status = statusEl;
  const todayCount = todayCountEl;
  const monthCount = monthCountEl;
  const calendar = calendarEl;
  const calendarMonth = calendarMonthEl;

  // onCount()で今日の合計が届くたびに、その増分を今月の合計にも反映する
  let currentTodayCount = 0;
  let currentMonthTotal = 0;
  // 言語切替時にAPIを叩き直さず再描画するための直近状態
  let lastHistory: KeystrokeHistory | null = null;
  let lastConnectedNames: string[] = [];

  // PhoenixWanがHIDで検出されている間はメインプロセス側で直接カウントしているので、
  // Gamepad API側のポーリングでは二重カウントしないようにこのフラグで止める。
  let hidActive = false;

  function renderStatus(): void {
    if (hidActive) {
      status.classList.add('connected');
      status.textContent = t('hidConnected');
      return;
    }
    status.classList.toggle('connected', lastConnectedNames.length > 0);
    status.textContent =
      lastConnectedNames.length > 0
        ? t('gamepadConnected', { names: lastConnectedNames.join(', ') })
        : t('noControllerDetected');
  }

  function updateHidStatus(connected: boolean): void {
    hidActive = connected;
    if (connected) renderStatus();
    // 切断時はここでは何もしない。次のGamepad APIポーリングのフレームで
    // 「コントローラー接続中/検出されていません」の表示に自然に切り替わる。
  }

  let pendingDelta = 0;
  const prevPressed = new Map<string, boolean>();

  function pollGamepads(): void {
    const pads = navigator.getGamepads();
    const connectedNames: string[] = [];
    for (const pad of pads) {
      if (!pad) continue;
      connectedNames.push(pad.id);
      if (hidActive) continue;
      pad.buttons.forEach((btn, i) => {
        const key = `${pad.index}:${i}`;
        const wasPressed = prevPressed.get(key) ?? false;
        if (btn.pressed && !wasPressed) pendingDelta++;
        prevPressed.set(key, btn.pressed);
      });
    }
    if (!hidActive) {
      lastConnectedNames = connectedNames;
      renderStatus();
    }
    requestAnimationFrame(pollGamepads);
  }
  requestAnimationFrame(pollGamepads);

  function flushDelta(): void {
    if (hidActive || pendingDelta <= 0) return;
    const delta = pendingDelta;
    pendingDelta = 0;
    window.keystroke
      .addDelta(delta)
      .then((total) => {
        todayCount.textContent = String(total);
      })
      .catch(() => {});
  }
  setInterval(flushDelta, 1000);

  function renderCalendar(history: KeystrokeHistory): void {
    lastHistory = history;
    calendarMonth.textContent = monthLabelFormat().format(new Date());
    calendar.innerHTML = '';
    for (const label of WEEKDAY_LABELS[currentLang]) {
      const el = document.createElement('div');
      el.className = 'weekday';
      el.textContent = label;
      calendar.appendChild(el);
    }

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstWeekday; i++) {
      const el = document.createElement('div');
      el.className = 'day-cell empty';
      calendar.appendChild(el);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const counts = Object.values(history);
    const maxCount = Math.max(1, ...counts);
    let monthTotal = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const count = history[dateStr] ?? 0;
      monthTotal += count;
      const el = document.createElement('div');
      el.className = 'day-cell';
      el.textContent = String(day);
      el.title = t('calendarTooltip', { date: dateStr, count });
      const intensity = count === 0 ? 0 : Math.min(1, count / maxCount);
      el.style.background = count === 0 ? '#1a1a24' : `rgba(139, 123, 255, ${(0.18 + intensity * 0.65).toFixed(2)})`;
      if (day === today.getDate()) {
        el.classList.add('today');
      }
      calendar.appendChild(el);
    }
    currentMonthTotal = monthTotal;
    monthCount.textContent = String(monthTotal);
  }

  function refreshFromServer(): void {
    window.keystroke
      .getHistory()
      .then((history) => {
        currentTodayCount = history[todayDateStr()] ?? 0;
        todayCount.textContent = String(currentTodayCount);
        renderCalendar(history); // 今月の合計(monthCount)もここで更新される
      })
      .catch(() => {});
  }

  // 打鍵のたびにメインプロセス(node-hidでPhoenixWanを直接読み取っている)からpushされる。
  // ポーリング/バッチ送信を挟まないため画面表示のラグがない。今日の増分をそのまま
  // 今月の合計にも反映することで、カレンダーの再取得を待たずに即座に更新する。
  window.keystroke.onCount((total) => {
    currentMonthTotal += total - currentTodayCount;
    currentTodayCount = total;
    todayCount.textContent = String(total);
    monthCount.textContent = String(currentMonthTotal);
  });
  window.keystroke.onConnectionChange(updateHidStatus);
  window.keystroke.isConnected().then(updateHidStatus).catch(() => {});

  // カレンダー(月間ヒートマップ)は打鍵のたびに全再描画すると無駄なので、緩やかに同期する
  setInterval(refreshFromServer, 15000);

  refreshFromServer();

  // 言語切替時、APIを叩き直さず直近の状態を新しい言語で再描画する。
  return () => {
    renderStatus();
    if (lastHistory) renderCalendar(lastHistory);
  };
}

// スクラッチはPhoenixWan固有のHID経路(byte0の回転量)でのみ検出できるため、
// Gamepad APIフォールバックは無い。打鍵カウントと同様、本日/今月の合計を表示する。
function setupScratchCounter(): void {
  const todayCountEl = document.getElementById('scratch-today-count') as HTMLDivElement | null;
  const monthCountEl = document.getElementById('scratch-month-count') as HTMLDivElement | null;
  if (!todayCountEl || !monthCountEl) return;
  const todayCount = todayCountEl;
  const monthCount = monthCountEl;

  let currentTodayCount = 0;
  let currentMonthTotal = 0;

  function refreshFromServer(): void {
    window.scratch
      .getHistory()
      .then((history) => {
        currentTodayCount = history[todayDateStr()] ?? 0;
        currentMonthTotal = sumCurrentMonth(history);
        todayCount.textContent = String(currentTodayCount);
        monthCount.textContent = String(currentMonthTotal);
      })
      .catch(() => {});
  }

  window.scratch.onCount((total) => {
    currentMonthTotal += total - currentTodayCount;
    currentTodayCount = total;
    todayCount.textContent = String(total);
    monthCount.textContent = String(currentMonthTotal);
  });

  setInterval(refreshFromServer, 15000);
  refreshFromServer();
}

// index.html内の固定文言(常に表示されているラベル・見出し・ボタン等)を現在の言語に
// 差し替える。おすすめ選曲パネルの動的な内容(見出し・メッセージ・曲カード)は
// setupRecommenderが返す再描画コールバック側の担当。
function applyStaticStrings(): void {
  const setText = (id: string, value: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('app-tagline', t('appTagline'));
  setText('recommend-panel-title', t('recommendPanelTitle'));
  setText('beatoraja-folder-label', t('beatorajaFolderLabel'));
  setText('choose-beatoraja-btn', t('chooseFolderBtn'));
  setText('label-player', t('labelPlayer'));
  setText('label-mode', t('labelMode'));
  setText('label-level', t('labelLevel'));
  setText('label-theme', t('labelTheme'));
  setText('label-ceiling', t('labelCeiling'));
  setText('label-floor', t('labelFloor'));
  setText('player-placeholder-option', t('playerPlaceholder'));
  setText('reroll-btn', t('rerollBtn'));
  setText('auto-advance-text', t('autoAdvanceLabel'));
  setText('warmup-text', t('warmupLabel'));
  setText('keystroke-panel-title', t('keystrokePanelTitle'));
  setText('label-today-keystrokes', t('todayKeystrokes'));
  setText('label-today-scratches', t('todayScratches'));
  setText('label-month-keystrokes', t('monthKeystrokes'));
  setText('label-month-scratches', t('monthScratches'));
}

const LANG_OPTION_LABEL: Record<Lang, string> = { ja: '日本語', en: 'English', ko: '한국어' };

function setupLanguageSelector(onChange: () => void): void {
  const langSelect = document.getElementById('lang-select') as HTMLSelectElement | null;
  if (!langSelect) return;
  for (const lang of Object.keys(LANG_OPTION_LABEL) as Lang[]) {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = LANG_OPTION_LABEL[lang];
    langSelect.appendChild(opt);
  }

  const applyLang = (lang: Lang): void => {
    currentLang = lang;
    langSelect.value = lang;
    applyStaticStrings();
    onChange();
  };

  window.settings
    .getLanguage()
    .then((lang) => applyLang(lang))
    .catch(() => applyLang('ja'));

  langSelect.addEventListener('change', () => {
    const lang = langSelect.value as Lang;
    applyLang(lang);
    window.settings.setLanguage(lang).catch(() => {});
  });
}

function main(): void {
  applyStaticStrings();
  const refreshRecommender = setupRecommender();
  const refreshKeystroke = setupKeystrokeCounter();
  setupScratchCounter();
  setupLanguageSelector(() => {
    refreshRecommender?.();
    refreshKeystroke?.();
  });
}

main();
