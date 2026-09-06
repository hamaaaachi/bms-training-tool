// Electron版renderer.tsのUIロジックをWeb版向けに移植したもの。IPC呼び出しは全て
// logic.ts/browser/fsAccess.ts/keystroke/webHidReaderの直接呼び出しに置き換えている。
import type { DailyRecommendationResult, AutoStartResult } from './logic';
import * as logicModule from './logic';
import type { KeystrokeHistory } from './keystroke/types';
import type { Theme, Track } from './recommend/categoryEngine';
import { themeOptionsForTrack } from './recommend/categoryEngine';
import type { Lang } from './session/settingsWeb';
import { getSettings } from './logic';
import { pickBeatorajaDir, getSavedDirHandle, ensurePermission } from './browser/fsAccess';
import { ControllerWebHidReader } from './keystroke/webHidReader';

interface StringTable {
  appTagline: string;
  aboutLink: string;
  devCredit: string;
  langLabel: string;
  recommendPanelTitle: string;
  beatorajaFolderLabel: string;
  notSet: string;
  chooseFolderBtn: string;
  connectHidBtn: string;
  labelPlayer: string;
  labelMode: string;
  labelLevel: string;
  labelTheme: string;
  labelCeiling: string;
  labelFloor: string;
  labelLevelStep: string;
  levelStepOption: string;
  warmupBtn: string;
  playerPlaceholder: string;
  rerollBtn: string;
  loadingInitial: string;
  autoAdvanceLabel: string;
  keystrokePanelTitle: string;
  noControllerDetected: string;
  todayKeystrokes: string;
  todayScratches: string;
  monthKeystrokes: string;
  monthScratches: string;
  shareBtn: string;
  shareTweetText: string;
  chooseExtraChartBtn: string;
  extraChartStatus: string;
  nextSongCountdown: string;
  categoryGachi: string;
  categoryMidspeed: string;
  categoryHighspeed: string;
  categoryDelay: string;
  categoryOmakase: string;
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
  needsHidPermission: string;
  hidConnected: string;
  gamepadConnected: string;
  calendarTooltip: string;
  unsupportedBrowser: string;
}

const STRINGS: Record<Lang, StringTable> = {
  ja: {
    appTagline: 'beatoraja連携・難易度表ベースの練習アシスタント',
    aboutLink: '使い方はこちら',
    devCredit: '開発者',
    langLabel: '言語',
    recommendPanelTitle: 'おすすめ選曲',
    beatorajaFolderLabel: 'beatorajaフォルダ:',
    notSet: '未設定',
    chooseFolderBtn: 'フォルダを選択',
    connectHidBtn: 'コントローラーに接続(PHOENIXWAN/INFINITAS)',
    labelPlayer: 'プレイヤー',
    labelMode: 'モード',
    labelLevel: 'レベル',
    labelTheme: 'テーマ',
    labelCeiling: '今日の上限',
    labelFloor: '下限',
    labelLevelStep: 'レベルアップ幅',
    levelStepOption: '{songs}曲で{amount}レベル',
    warmupBtn: 'ウォーミングアップ(下限まで下げる)',
    playerPlaceholder: '起動時に自動読み込み...',
    rerollBtn: 'この3曲を変える',
    loadingInitial: '起動時に自動でおすすめを読み込みます...',
    autoAdvanceLabel: '1曲プレイ後に自動でレベルを調整して次の選曲を表示',
    keystrokePanelTitle: '打鍵カウント',
    noControllerDetected: 'コントローラーが検出されていません',
    todayKeystrokes: '本日の打鍵数',
    todayScratches: '本日のスクラッチ数',
    monthKeystrokes: '今月の打鍵数',
    monthScratches: '今月のスクラッチ数',
    shareBtn: '本日の打鍵を投稿する',
    shareTweetText:
      'BMS Training Toolを使って打鍵しました。\n今日の打鍵数: {todayCount} スクラッチ数: {todayScratch}(今月の打鍵数: {monthCount} スクラッチ数: {monthScratch})',
    chooseExtraChartBtn: '譜面フォルダを追加で選択',
    extraChartStatus: '追加フォルダ: {count}件',
    nextSongCountdown: '次の曲まで {seconds}',
    categoryGachi: 'ガチ押し',
    categoryMidspeed: '中速',
    categoryHighspeed: '高速',
    categoryDelay: 'ディレイ',
    categoryOmakase: 'おまかせ',
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
    emptyNoTables: '難易度表の取得に失敗しました。インターネット接続を確認して、ページを再読み込みしてみてください。',
    emptyGeneric: '{level} で条件に合う曲が見つかりませんでした。レベルかテーマを変えてみてください。',
    analyzing: '解析中...(初回はファイル解析のため少し時間がかかります)',
    analyzingShort: '解析中...',
    errorPrefix: 'エラー: {message}',
    needsSetup: '初めまして。まずは「フォルダを選択」からbeatorajaのインストールフォルダを選んでください。',
    needsHidPermission: 'フォルダへのアクセス許可が必要です。「フォルダを選択」を押して再度許可してください。',
    hidConnected: '{name} 接続中(HID直接読み取り)',
    gamepadConnected: 'コントローラー接続中: {names}',
    calendarTooltip: '{date}: {count}打鍵',
    unsupportedBrowser:
      'お使いのブラウザは対応していません。Google ChromeまたはMicrosoft Edgeの最新版でお試しください。',
  },
  en: {
    appTagline: 'A beatoraja-integrated, difficulty-table-based practice assistant',
    aboutLink: 'How to use',
    devCredit: 'Developer',
    langLabel: 'Language',
    recommendPanelTitle: 'Suggested Songs',
    beatorajaFolderLabel: 'beatoraja folder:',
    notSet: 'Not set',
    chooseFolderBtn: 'Choose Folder',
    connectHidBtn: 'Connect Controller (PHOENIXWAN/INFINITAS)',
    labelPlayer: 'Player',
    labelMode: 'Mode',
    labelLevel: 'Level',
    labelTheme: 'Theme',
    labelCeiling: "Today's Ceiling",
    labelFloor: 'Floor',
    labelLevelStep: 'Level-up Step',
    levelStepOption: '{amount} level(s) per {songs} song(s)',
    warmupBtn: 'Warm Up (drop to floor)',
    playerPlaceholder: 'Loading automatically on startup...',
    rerollBtn: 'Reroll These 3 Songs',
    loadingInitial: 'Suggestions will load automatically on startup...',
    autoAdvanceLabel: 'After playing a song, auto-adjust the level and show the next picks',
    keystrokePanelTitle: 'Keystroke Count',
    noControllerDetected: 'No controller detected',
    todayKeystrokes: "Today's Keystrokes",
    todayScratches: "Today's Scratches",
    monthKeystrokes: "This Month's Keystrokes",
    monthScratches: "This Month's Scratches",
    shareBtn: "Post Today's Keystrokes",
    shareTweetText:
      "I trained with BMS Training Tool!\nToday's keystrokes: {todayCount} Scratches: {todayScratch} (This month's keystrokes: {monthCount} Scratches: {monthScratch})",
    chooseExtraChartBtn: 'Add another chart folder',
    extraChartStatus: 'Extra folders: {count}',
    nextSongCountdown: 'Next songs in {seconds}',
    categoryGachi: 'Gachi-oshi',
    categoryMidspeed: 'Midspeed',
    categoryHighspeed: 'Highspeed',
    categoryDelay: 'Delay',
    categoryOmakase: 'Omakase (mixed)',
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
    emptyNoTables: 'Failed to fetch difficulty tables. Check your internet connection and try reloading the page.',
    emptyGeneric: 'No matching songs were found at {level}. Try a different level or theme.',
    analyzing: 'Analyzing... (the first time takes a bit longer due to file analysis)',
    analyzingShort: 'Analyzing...',
    errorPrefix: 'Error: {message}',
    needsSetup: 'Welcome! First, choose your beatoraja installation folder using "Choose Folder".',
    needsHidPermission: 'Folder access is needed. Click "Choose Folder" to re-grant access.',
    hidConnected: '{name} connected (direct HID read)',
    gamepadConnected: 'Controller connected: {names}',
    calendarTooltip: '{date}: {count} keystrokes',
    unsupportedBrowser: 'Your browser is not supported. Please try the latest Google Chrome or Microsoft Edge.',
  },
  ko: {
    appTagline: 'beatoraja 연동 · 난이도표 기반 연습 어시스턴트',
    aboutLink: '사용법 보기',
    devCredit: '개발자',
    langLabel: '언어',
    recommendPanelTitle: '추천 선곡',
    beatorajaFolderLabel: 'beatoraja 폴더:',
    notSet: '미설정',
    chooseFolderBtn: '폴더 선택',
    connectHidBtn: '컨트롤러 연결(PHOENIXWAN/INFINITAS)',
    labelPlayer: '플레이어',
    labelMode: '모드',
    labelLevel: '레벨',
    labelTheme: '테마',
    labelCeiling: '오늘의 상한',
    labelFloor: '하한',
    labelLevelStep: '레벨업 폭',
    levelStepOption: '{songs}곡당 {amount}레벨',
    warmupBtn: '워밍업(하한까지 내리기)',
    playerPlaceholder: '시작 시 자동으로 불러옵니다...',
    rerollBtn: '이 3곡 다시 뽑기',
    loadingInitial: '시작 시 자동으로 추천을 불러옵니다...',
    autoAdvanceLabel: '한 곡 플레이 후 자동으로 레벨을 조정해 다음 선곡을 표시',
    keystrokePanelTitle: '키 입력 카운트',
    noControllerDetected: '컨트롤러가 감지되지 않았습니다',
    todayKeystrokes: '오늘의 키 입력 수',
    todayScratches: '오늘의 스크래치 수',
    monthKeystrokes: '이번 달 키 입력 수',
    monthScratches: '이번 달 스크래치 수',
    shareBtn: '오늘의 입력 수 공유하기',
    shareTweetText:
      'BMS Training Tool로 연습했어요!\n오늘의 입력 수: {todayCount} 스크래치 수: {todayScratch}(이번 달 입력 수: {monthCount} 스크래치 수: {monthScratch})',
    chooseExtraChartBtn: '추가 채보 폴더 선택',
    extraChartStatus: '추가 폴더: {count}개',
    nextSongCountdown: '다음 추천까지 {seconds}',
    categoryGachi: '가치오시',
    categoryMidspeed: '중속',
    categoryHighspeed: '고속',
    categoryDelay: '딜레이',
    categoryOmakase: '오마카세(뒤섞기)',
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
    emptyNoTables: '난이도표를 가져오지 못했습니다. 인터넷 연결을 확인하고 페이지를 새로고침해 보세요.',
    emptyGeneric: '{level}에서 조건에 맞는 곡을 찾을 수 없습니다. 레벨이나 테마를 바꿔 보세요.',
    analyzing: '분석 중...(처음에는 파일 분석 때문에 시간이 조금 걸립니다)',
    analyzingShort: '분석 중...',
    errorPrefix: '오류: {message}',
    needsSetup: '환영합니다! 먼저 "폴더 선택"에서 beatoraja 설치 폴더를 선택해 주세요.',
    needsHidPermission: '폴더 접근 권한이 필요합니다. "폴더 선택"을 눌러 다시 허용해 주세요.',
    hidConnected: '{name} 연결됨(HID 직접 읽기)',
    gamepadConnected: '컨트롤러 연결됨: {names}',
    calendarTooltip: '{date}: {count}회 입력',
    unsupportedBrowser: '지원되지 않는 브라우저입니다. 최신 Google Chrome 또는 Microsoft Edge를 사용해 주세요.',
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
    case 'omakase':
      return t('categoryOmakase');
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

const KEYS_LEVEL_OPTION_COUNT = 26;
function formatKeysLevelLabel(level: number): string {
  return level < 13 ? `sl${level}` : `st${level - 13}`;
}

const INSANE_MIN_LEVEL = 1;
const INSANE_MAX_LEVEL = 25;
function formatInsaneLevelLabel(level: number): string {
  return `★${level}`;
}

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
  const levelStepSelect = document.getElementById('level-step-select') as HTMLSelectElement | null;
  const warmupBtn = document.getElementById('warmup-btn') as HTMLButtonElement | null;
  const rerollBtn = document.getElementById('reroll-btn') as HTMLButtonElement | null;
  const levelHeadingEl = document.getElementById('level-heading') as HTMLDivElement | null;
  const ceilingHeadingEl = document.getElementById('ceiling-heading') as HTMLDivElement | null;
  const advanceCountdownEl = document.getElementById('advance-countdown') as HTMLDivElement | null;
  const suggestionResultsEl = document.getElementById('suggestion-results') as HTMLDivElement | null;
  const autoAdvanceCheckbox = document.getElementById('auto-advance-checkbox') as HTMLInputElement | null;
  const beatorajaPathEl = document.getElementById('beatoraja-path') as HTMLSpanElement | null;
  const chooseBeatorajaBtn = document.getElementById('choose-beatoraja-btn') as HTMLButtonElement | null;
  const chooseExtraChartBtn = document.getElementById('choose-extra-chart-btn') as HTMLButtonElement | null;
  const extraChartStatusEl = document.getElementById('extra-chart-status') as HTMLSpanElement | null;
  const setupBannerEl = document.getElementById('setup-banner') as HTMLDivElement | null;
  if (
    !playerSelect ||
    !trackSelect ||
    !levelSelect ||
    !themeSelect ||
    !ceilingSelect ||
    !floorSelect ||
    !levelStepSelect ||
    !warmupBtn ||
    !rerollBtn ||
    !levelHeadingEl ||
    !ceilingHeadingEl ||
    !advanceCountdownEl ||
    !suggestionResultsEl ||
    !autoAdvanceCheckbox ||
    !beatorajaPathEl ||
    !chooseBeatorajaBtn ||
    !chooseExtraChartBtn ||
    !extraChartStatusEl ||
    !setupBannerEl
  ) {
    return null;
  }
  const extraChartStatus = extraChartStatusEl;
  const advanceCountdown = advanceCountdownEl;

  let currentTrack: Track = 'keys';
  let needsSetup = false;
  let lastResult: DailyRecommendationResult | null = null;
  let lastBeatorajaDirName: string | null | undefined = undefined;
  let currentExtraChartCount = 0;

  const updateExtraChartStatus = (): void => {
    extraChartStatus.textContent = currentExtraChartCount > 0 ? t('extraChartStatus', { count: currentExtraChartCount }) : '';
  };

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

  const populateThemeOptions = (track: Track): void => {
    const selected = themeSelect.value;
    themeSelect.innerHTML = '';
    for (const category of themeOptionsForTrack(track)) {
      const opt = document.createElement('option');
      opt.value = category;
      opt.textContent = categoryLabel(category);
      themeSelect.appendChild(opt);
    }
    // 選んでいたテーマが新しいトラックの選択肢に無い場合(例: Scrambleへの切り替えで
    // ガチ押し/ディレイが消えた場合)は先頭の選択肢に委ねる。
    themeSelect.value = selected;
    if (!themeSelect.value) themeSelect.selectedIndex = 0;
    themeSelect.dataset.track = track;
  };
  populateThemeOptions(currentTrack);

  // レベルアップ幅のプリセット: [1曲で1UP, 2曲で1UP, 3曲で1UP, 1曲で2UP, 1曲で3UP]。
  const LEVEL_STEP_PRESETS: Array<[songs: number, amount: number]> = [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [1, 3],
  ];
  const populateLevelStepOptions = (): void => {
    const selected = levelStepSelect.value;
    levelStepSelect.innerHTML = '';
    for (const [songs, amount] of LEVEL_STEP_PRESETS) {
      const opt = document.createElement('option');
      opt.value = `${songs}:${amount}`;
      opt.textContent = t('levelStepOption', { songs, amount });
      levelStepSelect.appendChild(opt);
    }
    if (selected) levelStepSelect.value = selected;
  };
  populateLevelStepOptions();

  const setControlsEnabled = (enabled: boolean): void => {
    playerSelect.disabled = !enabled;
    trackSelect.disabled = !enabled;
    levelSelect.disabled = !enabled;
    themeSelect.disabled = !enabled;
    ceilingSelect.disabled = !enabled;
    floorSelect.disabled = !enabled;
    levelStepSelect.disabled = !enabled;
    warmupBtn.disabled = !enabled;
    rerollBtn.disabled = !enabled;
  };
  setControlsEnabled(false);

  const renderSuggestions = (result: DailyRecommendationResult): void => {
    lastResult = result;
    currentTrack = result.track;
    trackSelect.value = result.track;
    if (levelSelect.dataset.track !== result.track) populateLevelOptions(result.track);
    levelSelect.value = String(result.level);
    if (themeSelect.dataset.track !== result.track) populateThemeOptions(result.track);
    themeSelect.value = result.theme;
    ceilingSelect.value = result.ceilingIsManual && result.ceilingLevel !== null ? String(result.ceilingLevel) : '';
    floorSelect.value = String(result.warmupFloorLevel);
    levelStepSelect.value = `${result.levelStepSongs}:${result.levelStepAmount}`;
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

  const showError = (err: unknown): void => {
    levelHeadingEl.textContent = t('errorPrefix', { message: err instanceof Error ? err.message : String(err) });
  };

  const refresh = (playerId: string): void => {
    if (!playerId) return;
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzing');
    logicModule
      .refresh(playerId, currentTrack, Number(levelSelect.value), themeSelect.value as Theme)
      .then(renderSuggestions)
      .catch(showError)
      .finally(() => setControlsEnabled(true));
  };

  playerSelect.addEventListener('change', () => refresh(playerSelect.value));
  levelSelect.addEventListener('change', () => refresh(playerSelect.value));
  themeSelect.addEventListener('change', () => refresh(playerSelect.value));
  rerollBtn.addEventListener('click', () => refresh(playerSelect.value));

  trackSelect.addEventListener('change', () => {
    const playerId = playerSelect.value;
    if (!playerId) return;
    const track = trackSelect.value as Track;
    currentTrack = track;
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzingShort');
    logicModule
      .switchTrack(playerId, track)
      .then(renderSuggestions)
      .catch(showError)
      .finally(() => setControlsEnabled(true));
  });

  ceilingSelect.addEventListener('change', () => {
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzingShort');
    const value = ceilingSelect.value === '' ? null : Number(ceilingSelect.value);
    logicModule
      .setCeilingOverride(currentTrack, value)
      .then(renderSuggestions)
      .catch(showError)
      .finally(() => setControlsEnabled(true));
  });

  floorSelect.addEventListener('change', () => {
    logicModule.setWarmupFloor(currentTrack, Number(floorSelect.value)).catch(() => {});
  });

  levelStepSelect.addEventListener('change', () => {
    const [songs, amount] = levelStepSelect.value.split(':').map(Number);
    logicModule.setLevelStep(songs, amount).catch(() => {});
  });

  warmupBtn.addEventListener('click', () => {
    setControlsEnabled(false);
    levelHeadingEl.textContent = t('analyzingShort');
    logicModule.applyWarmup().then(renderSuggestions).catch(showError).finally(() => setControlsEnabled(true));
  });

  autoAdvanceCheckbox.addEventListener('change', () => {
    logicModule.setAutoAdvance(autoAdvanceCheckbox.checked);
  });
  logicModule.setAutoAdvance(autoAdvanceCheckbox.checked);

  logicModule.onAutoAdvance((result) => {
    advanceCountdown.hidden = true;
    renderSuggestions(result);
  });

  logicModule.onCountdownChange((secondsLeft) => {
    if (secondsLeft === null) {
      advanceCountdown.hidden = true;
      advanceCountdown.textContent = '';
    } else {
      advanceCountdown.hidden = false;
      advanceCountdown.textContent = t('nextSongCountdown', { seconds: secondsLeft });
    }
  });

  const applyAutoStart = ({ players, playerId, result }: AutoStartResult): void => {
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
  };

  const showNeedsSetup = (message?: string): void => {
    needsSetup = true;
    setupBannerEl.textContent = message ?? t('needsSetup');
    setupBannerEl.hidden = false;
    setControlsEnabled(false);
  };

  const runLoadAndStart = (handle: FileSystemDirectoryHandle): void => {
    lastBeatorajaDirName = handle.name;
    beatorajaPathEl.textContent = handle.name;
    logicModule
      .loadAndStart(handle)
      .then((outcome) => {
        if ('failedMessage' in outcome) {
          levelHeadingEl.textContent = outcome.failedMessage;
          return;
        }
        applyAutoStart(outcome);
      })
      .catch(showError);
  };

  chooseBeatorajaBtn.addEventListener('click', () => {
    chooseBeatorajaBtn.disabled = true;
    pickBeatorajaDir()
      .then((handle) => {
        if (handle) runLoadAndStart(handle);
      })
      .catch(showError)
      .finally(() => {
        chooseBeatorajaBtn.disabled = false;
      });
  });

  // bmsroot設定で外部フォルダ(beatorajaフォルダの外)に譜面を置いているユーザー向け。
  // songdata.dbのpath列が絶対パスになっている曲を解析できるよう、その譜面フォルダを
  // 個別に許可してもらう(無くても動作はするので任意)。
  chooseExtraChartBtn.addEventListener('click', () => {
    chooseExtraChartBtn.disabled = true;
    logicModule
      .addExtraChartDir()
      .then((count) => {
        if (count === null) return; // ユーザーがキャンセルした
        currentExtraChartCount = count;
        updateExtraChartStatus();
        if (playerSelect.value) refresh(playerSelect.value);
      })
      .catch(showError)
      .finally(() => {
        chooseExtraChartBtn.disabled = false;
      });
  });

  // 起動時: 過去に許可したフォルダハンドルがIndexedDBにあれば、権限が生きている限り
  // クリック不要で自動的に前回の続きを再開する。権限が切れていれば「フォルダを選択」を
  // 押し直してもらう(ブラウザの仕様上、無操作でのアクセス許可の再取得はできないため)。
  (async () => {
    const handle = await getSavedDirHandle();
    if (!handle) {
      showNeedsSetup();
      return;
    }
    const granted = await ensurePermission(handle);
    if (!granted) {
      showNeedsSetup(t('needsHidPermission'));
      return;
    }
    runLoadAndStart(handle);
  })().catch(() => showNeedsSetup());

  logicModule
    .restoreExtraDirHandles()
    .then((count) => {
      currentExtraChartCount = count;
      updateExtraChartStatus();
    })
    .catch(() => {});

  return () => {
    populateTrackOptions();
    populateThemeOptions(currentTrack);
    // 「今日の上限」欄の「自動(クリアランプから推定)」はrenderSuggestions内の
    // populateLevelOptionsがトラック変更時にしか呼ばれないため、言語切替のたびに
    // 明示的に選択肢を作り直す(でないと表示中の言語のまま残ってしまう。
    // 2026-09-06にユーザー指摘)。
    populateLevelOptions(currentTrack);
    populateLevelStepOptions();
    updateExtraChartStatus();
    if (needsSetup) {
      setupBannerEl.textContent = t('needsSetup');
    } else if (lastResult) {
      renderSuggestions(lastResult);
    } else {
      levelHeadingEl.textContent = t('loadingInitial');
    }
    if (lastBeatorajaDirName !== undefined) {
      beatorajaPathEl.textContent = lastBeatorajaDirName ?? t('notSet');
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

// PhoenixWan(WebHID)・打鍵カウント・スクラッチカウントをまとめて1つの関数で管理する
// (Electron版はmain.ts/renderer.ts/IPCの3層だったが、Web版は単一コンテキストなので
// ここに集約した方がイベント配線が単純になる)。
function setupKeystrokeAndScratchCounters(): (() => void) | null {
  const statusEl = document.getElementById('gamepad-status') as HTMLDivElement | null;
  const connectBtnEl = document.getElementById('connect-hid-btn') as HTMLButtonElement | null;
  const todayCountEl = document.getElementById('keystroke-today-count') as HTMLDivElement | null;
  const monthCountEl = document.getElementById('keystroke-month-count') as HTMLDivElement | null;
  const scratchTodayEl = document.getElementById('scratch-today-count') as HTMLDivElement | null;
  const scratchMonthEl = document.getElementById('scratch-month-count') as HTMLDivElement | null;
  const calendarEl = document.getElementById('calendar') as HTMLDivElement | null;
  const calendarMonthEl = document.getElementById('calendar-month') as HTMLDivElement | null;
  const calendarDetailEl = document.getElementById('calendar-detail') as HTMLDivElement | null;
  const shareBtnEl = document.getElementById('share-x-btn') as HTMLButtonElement | null;
  if (
    !statusEl ||
    !connectBtnEl ||
    !todayCountEl ||
    !monthCountEl ||
    !scratchTodayEl ||
    !scratchMonthEl ||
    !calendarEl ||
    !calendarMonthEl ||
    !calendarDetailEl ||
    !shareBtnEl
  ) {
    return null;
  }
  const status = statusEl;
  const connect = connectBtnEl;
  const todayCount = todayCountEl;
  const monthCount = monthCountEl;
  const scratchToday = scratchTodayEl;
  const scratchMonth = scratchMonthEl;
  const calendar = calendarEl;
  const calendarMonth = calendarMonthEl;
  const calendarDetail = calendarDetailEl;
  const shareBtn = shareBtnEl;

  let currentTodayCount = 0;
  let currentMonthTotal = 0;
  let scratchTodayCount = 0;
  let scratchMonthTotal = 0;
  let lastHistory: KeystrokeHistory | null = null;
  let lastConnectedNames: string[] = [];
  let hidActive = false;
  let hidDeviceName: string | null = null;

  function renderStatus(): void {
    if (hidActive) {
      status.classList.add('connected');
      status.textContent = t('hidConnected', { name: hidDeviceName ?? '' });
      connect.hidden = true;
      return;
    }
    connect.hidden = false;
    status.classList.toggle('connected', lastConnectedNames.length > 0);
    status.textContent =
      lastConnectedNames.length > 0
        ? t('gamepadConnected', { names: lastConnectedNames.join(', ') })
        : t('noControllerDetected');
  }

  if (!ControllerWebHidReader.isSupported()) {
    connect.hidden = true;
    status.textContent = t('unsupportedBrowser');
  }

  const controllerReader = new ControllerWebHidReader(
    (count) => {
      logicModule.addKeystrokeDelta(count).then((total) => {
        todayCount.textContent = String(total);
        currentMonthTotal += total - currentTodayCount;
        currentTodayCount = total;
        monthCount.textContent = String(currentMonthTotal);
      });
    },
    (ticks) => {
      logicModule.addScratchDelta(ticks).then((total) => {
        scratchMonthTotal += total - scratchTodayCount;
        scratchTodayCount = total;
        scratchToday.textContent = String(total);
        scratchMonth.textContent = String(scratchMonthTotal);
      });
    },
    (connected, deviceName) => {
      hidActive = connected;
      hidDeviceName = deviceName;
      renderStatus();
    }
  );
  controllerReader.tryReconnectSilently().catch(() => {});

  connect.addEventListener('click', () => {
    connect.disabled = true;
    controllerReader
      .requestAndConnect()
      .catch(() => {})
      .finally(() => {
        connect.disabled = false;
      });
  });

  shareBtn.addEventListener('click', () => {
    const tweetText = t('shareTweetText', {
      todayCount: currentTodayCount.toLocaleString(),
      todayScratch: scratchTodayCount.toLocaleString(),
      monthCount: currentMonthTotal.toLocaleString(),
      monthScratch: scratchMonthTotal.toLocaleString(),
    });
    const intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(
      'https://tinyurl.com/bms-training-tool'
    )}`;
    window.open(intentUrl, '_blank', 'noopener');
  });

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
    logicModule.addKeystrokeDelta(delta).then((total) => {
      todayCount.textContent = String(total);
    });
  }
  setInterval(flushDelta, 1000);

  function renderCalendar(history: KeystrokeHistory): void {
    lastHistory = history;
    calendarMonth.textContent = monthLabelFormat().format(new Date());
    calendar.innerHTML = '';
    calendarDetail.hidden = true;
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
      el.addEventListener('click', () => {
        calendarDetail.textContent = t('calendarTooltip', { date: dateStr, count });
        calendarDetail.hidden = false;
      });
      calendar.appendChild(el);
    }
    currentMonthTotal = monthTotal;
    monthCount.textContent = String(monthTotal);
  }

  function refreshKeystrokeFromStore(): void {
    logicModule.getKeystrokeHistory().then((history) => {
      currentTodayCount = history[todayDateStr()] ?? 0;
      todayCount.textContent = String(currentTodayCount);
      renderCalendar(history);
    });
  }

  function refreshScratchFromStore(): void {
    logicModule.getScratchHistory().then((history) => {
      scratchTodayCount = history[todayDateStr()] ?? 0;
      scratchMonthTotal = sumCurrentMonth(history);
      scratchToday.textContent = String(scratchTodayCount);
      scratchMonth.textContent = String(scratchMonthTotal);
    });
  }

  setInterval(refreshKeystrokeFromStore, 15000);
  setInterval(refreshScratchFromStore, 15000);
  refreshKeystrokeFromStore();
  refreshScratchFromStore();
  renderStatus();

  return () => {
    renderStatus();
    if (lastHistory) renderCalendar(lastHistory);
  };
}

function applyStaticStrings(): void {
  const setText = (id: string, value: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('app-tagline', t('appTagline'));
  setText('dev-credit-label', t('devCredit'));
  setText('about-link', t('aboutLink'));
  setText('recommend-panel-title', t('recommendPanelTitle'));
  setText('beatoraja-folder-label', t('beatorajaFolderLabel'));
  setText('choose-beatoraja-btn', t('chooseFolderBtn'));
  setText('connect-hid-btn', t('connectHidBtn'));
  setText('label-player', t('labelPlayer'));
  setText('label-mode', t('labelMode'));
  setText('label-level', t('labelLevel'));
  setText('label-theme', t('labelTheme'));
  setText('label-ceiling', t('labelCeiling'));
  setText('label-floor', t('labelFloor'));
  setText('label-level-step', t('labelLevelStep'));
  setText('warmup-btn', t('warmupBtn'));
  setText('player-placeholder-option', t('playerPlaceholder'));
  setText('reroll-btn', t('rerollBtn'));
  setText('auto-advance-text', t('autoAdvanceLabel'));
  setText('keystroke-panel-title', t('keystrokePanelTitle'));
  setText('share-x-btn', t('shareBtn'));
  setText('choose-extra-chart-btn', t('chooseExtraChartBtn'));
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

  getSettings()
    .then((settings) => applyLang(settings.language))
    .catch(() => applyLang('ja'));

  langSelect.addEventListener('change', () => {
    const lang = langSelect.value as Lang;
    applyLang(lang);
    getSettings().then((settings) => settings.setLanguage(lang));
  });
}

function main(): void {
  applyStaticStrings();
  const refreshRecommender = setupRecommender();
  const refreshKeystroke = setupKeystrokeAndScratchCounters();
  setupLanguageSelector(() => {
    refreshRecommender?.();
    refreshKeystroke?.();
  });

  // タブを閉じる直前にデバウンス保存待ちのキャッシュ/履歴を確実に反映する。
  window.addEventListener('beforeunload', () => {
    logicModule.flushAll().catch(() => {});
  });
}

main();
