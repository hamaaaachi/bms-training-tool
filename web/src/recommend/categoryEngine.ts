import type { SongWithScore } from '../beatoraja/types';
import { HIGHSPEED_FALLBACK_BPM } from '../analysis/category';
import type { SongAnalysis, SpeedCategory } from '../analysis/types';
import type { TableEntry } from '../tables/types';

export interface AnalyzedSong {
  song: SongWithScore;
  analysis: SongAnalysis;
}

export interface CategorySuggestion {
  category: SpeedCategory;
  song: SongWithScore;
  analysis: SongAnalysis;
  tableMatches: TableEntry[];
}

// 練習の系統。Satellite/Stella(連続軸)・発狂(発狂BMS難易度表独自の軸)・Scramble
// (Scramble難易度表独自の軸)は、2026-09-06にユーザーから明示された通りそれぞれ難易度を
// リンクさせない独立したトラックとして扱う。
// 'insane2'(第2発狂難易度表)・'insaneEasy'(発狂BMS難度推定表 EASY)は2026-11-13に
// ユーザー指示で追加。発狂BMS難易度表とは格付けの基準が異なるため、同じ「発狂」でも
// レベル/上限/レベルアップ進捗をリンクさせない独立したトラックとして扱う。
export type Track = 'keys' | 'insane' | 'insane2' | 'insaneEasy' | 'scratch';
export const TRACKS: readonly Track[] = ['keys', 'insane', 'insane2', 'insaneEasy', 'scratch'];

// Satellite(sl0-12)の次にStella(st0-12)が続く1本のレベル軸として扱う(Satellite/Stella
// トラック)。2026-09-06にユーザーから指摘: sl12の次はst0であり、両表は別トラックではなく
// 連続した難易度帯。以前は同じ数値のsl/stを同時にマッチさせていたが、それだと「sl0を選んだ
// のにst0も出てくる」ことになるため、レベル数値からどちらの表の何番かを一意に決められる
// ようにする。
export const SATELLITE_LEVEL_COUNT = 13; // sl0-sl12(2026-09-05にscore.json実データで確認済み)
export const STELLA_LEVEL_COUNT = 13; // st0-st12(同上)
export const MIN_TABLE_LEVEL = 0;
export const MAX_TABLE_LEVEL = SATELLITE_LEVEL_COUNT + STELLA_LEVEL_COUNT - 1;

export function clampTableLevel(level: number): number {
  return Math.max(MIN_TABLE_LEVEL, Math.min(MAX_TABLE_LEVEL, level));
}

export interface TableLevelRef {
  tableName: 'Satellite' | 'Stella';
  subLevel: number;
}

// 0-12ならSatelliteのその番号、13-25ならStellaの(番号-13)を指す。
export function resolveTableLevel(level: number): TableLevelRef {
  if (level < SATELLITE_LEVEL_COUNT) return { tableName: 'Satellite', subLevel: level };
  return { tableName: 'Stella', subLevel: level - SATELLITE_LEVEL_COUNT };
}

export function formatLevelLabel(level: number): string {
  const { tableName, subLevel } = resolveTableLevel(level);
  return tableName === 'Satellite' ? `sl${subLevel}` : `st${subLevel}`;
}

// 発狂トラック: 発狂BMS難易度表(★1-25)独自の軸。Satellite/Stella側のレベルとはリンク
// させない、Scrambleと同様の独立したトラックとして扱う。
// level_orderは[1,2,...,25,"???"](2026-09-06にheader_insane.jsonで確認済み)。
// "???"は未格付け記号のため軸には含めない。
export const INSANE_MIN_LEVEL = 1;
export const INSANE_MAX_LEVEL = 25;

export function clampInsaneLevel(level: number): number {
  return Math.max(INSANE_MIN_LEVEL, Math.min(INSANE_MAX_LEVEL, level));
}

export function formatInsaneLevel(level: number): string {
  return `★${level}`;
}

// Scrambleトラック: Scramble難易度表(SB-1〜SB12)独自の軸。Satellite/Stella・発狂の
// レベルとは連動させない。level_orderは[-1,0,1,...,12,"提案","!i"]
// (2026-09-06にheader.jsonで確認済み)。"提案"(掲載候補)・"!i"は数値レベルでは
// ないため軸には含めない。
export const SCRAMBLE_MIN_LEVEL = -1;
export const SCRAMBLE_MAX_LEVEL = 12;

export function clampScrambleLevel(level: number): number {
  return Math.max(SCRAMBLE_MIN_LEVEL, Math.min(SCRAMBLE_MAX_LEVEL, level));
}

export function formatScrambleLevel(level: number): string {
  return `SB${level}`;
}

// 第2発狂トラック: 第2発狂難易度表(▼0-24)独自の軸。level_orderは
// ["0-","0",...,"24","?"](2026-11-13にinsane_header.jsonで確認済み)。"0-"(0未満)・
// "?"(未格付け)は数値レベルではないため軸には含めない。
export const INSANE2_MIN_LEVEL = 0;
export const INSANE2_MAX_LEVEL = 24;

// 発狂推定EASYトラック: 発狂BMS難度推定表 EASY(E★)。levelは"12.00...12.50"のような
// 0.5刻みの推定値の範囲文字列で、両端は"...0.00"・"24.50..."、未推定は"-"
// (2026-11-13にheader_json.cgi?lamp=easy...で確認済み)。0.5刻みのままだと49段階に
// なり細かすぎるため、範囲の下限の整数部を取ってE★0-24の整数レベルに丸める
// ("...0.00"は0、"24.50..."は24に含める)。
export const INSANE_EASY_MIN_LEVEL = 0;
export const INSANE_EASY_MAX_LEVEL = 24;

function parseEstimateRangeLevel(raw: string): number | null {
  const m = /^([\d.]*)\.\.\.([\d.]*)$/.exec(raw);
  if (!m) return null;
  if (m[1] === '') return INSANE_EASY_MIN_LEVEL; // "...0.00"
  const lower = Number(m[1]);
  return Number.isFinite(lower) ? Math.floor(lower) : null;
}

function parseIntegerLevel(raw: string): number | null {
  // "0-"や"???"などを数値扱いしないよう、整数表記のみ受け付ける(Number("")が0になる点にも注意)。
  if (!/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

// Satellite/Stella以外の、1つの難易度表だけで軸が決まるトラックの定義。
interface SingleTableTrack {
  tableName: string;
  min: number;
  max: number;
  format: (level: number) => string;
  parseLevel: (raw: string) => number | null;
}

const SINGLE_TABLE_TRACKS: Record<Exclude<Track, 'keys'>, SingleTableTrack> = {
  insane: {
    tableName: '発狂BMS難易度表',
    min: INSANE_MIN_LEVEL,
    max: INSANE_MAX_LEVEL,
    format: formatInsaneLevel,
    parseLevel: parseIntegerLevel,
  },
  insane2: {
    tableName: '第2発狂難易度表',
    min: INSANE2_MIN_LEVEL,
    max: INSANE2_MAX_LEVEL,
    format: (level) => `▼${level}`,
    parseLevel: parseIntegerLevel,
  },
  insaneEasy: {
    tableName: '発狂BMS難度推定表 EASY',
    min: INSANE_EASY_MIN_LEVEL,
    max: INSANE_EASY_MAX_LEVEL,
    format: (level) => `E★${level}`,
    parseLevel: parseEstimateRangeLevel,
  },
  scratch: {
    tableName: 'Scramble難易度表',
    min: SCRAMBLE_MIN_LEVEL,
    max: SCRAMBLE_MAX_LEVEL,
    format: formatScrambleLevel,
    parseLevel: parseIntegerLevel,
  },
};

export function levelRangeForTrack(track: Track): [number, number] {
  if (track === 'keys') return [MIN_TABLE_LEVEL, MAX_TABLE_LEVEL];
  const config = SINGLE_TABLE_TRACKS[track];
  return [config.min, config.max];
}

export function clampLevelForTrack(track: Track, level: number): number {
  const [min, max] = levelRangeForTrack(track);
  return Math.max(min, Math.min(max, level));
}

export function formatLevelForTrack(track: Track, level: number): string {
  if (track === 'keys') return formatLevelLabel(level);
  return SINGLE_TABLE_TRACKS[track].format(level);
}

// matchesの中から、trackの軸での曲のレベルを返す(該当無し・軸外はnull)。matchesLevelと
// estimateClearCeilingの両方がこれを使う(2026-10-01にlogic.tsで統一、2026-11-13に
// トラック追加に合わせてSINGLE_TABLE_TRACKSの定義から引くようここへ移動)。難易度表には
// "???"「提案」のような数値でないlevelもあるため、parseLevelがnullを返すものはスキップする。
export function trackLevelOf(matches: readonly TableEntry[], track: Track): number | null {
  if (track === 'keys') {
    for (const m of matches) {
      if (m.tableName !== 'Satellite' && m.tableName !== 'Stella') continue;
      const level = parseIntegerLevel(m.level);
      if (level === null) continue;
      return m.tableName === 'Satellite' ? level : SATELLITE_LEVEL_COUNT + level;
    }
    return null;
  }
  const config = SINGLE_TABLE_TRACKS[track];
  for (const m of matches) {
    if (m.tableName !== config.tableName) continue;
    const level = config.parseLevel(m.level);
    if (level !== null && level >= config.min && level <= config.max) return level;
  }
  return null;
}

// テーマ選択肢。SpeedCategory(曲自体の分類)に加えて、カテゴリで絞り込まず全部から
// 選ぶ「おまかせ」を選べるようにする(2026-09-06にユーザー指示)。
export type Theme = SpeedCategory | 'omakase';

// Scrambleトラック(スクラッチ)では「ガチ押し」「ディレイ」はBPM/ノーツパターンに基づく
// 鍵盤側の分類概念であり選曲対象として意味を持たないため選べないようにする
// (2026-09-06にユーザー指示)。
export function themeOptionsForTrack(track: Track): Theme[] {
  if (track === 'scratch') return ['midspeed', 'highspeed', 'omakase'];
  return ['gachi', 'midspeed', 'highspeed', 'delay', 'omakase'];
}

export function isThemeValidForTrack(theme: Theme, track: Track): boolean {
  return themeOptionsForTrack(track).includes(theme);
}

const SUGGESTIONS_PER_THEME = 3;

// 「練習の必要度」順に並べる: 提案された回数(suggestionCounts、無ければ0)が少ない曲を
// 最優先し、その中でNo play→Failed→Easy→…とクリアランプが低いほど優先度が高い
// (ClearTypeName配列のインデックス=score.clearの値そのもの)。これにより、1巡目は
// 提案回数0の曲をクリアランプの低い順に出し切り、出し切ったら2巡目として提案回数1の曲に
// 進む…という形になる(2026-10-01に修正: 以前は提案済みか否かのフラグ
// (seen/unseen)で見ていたため、各レベルの曲を一巡提案し終えると全曲が「提案済み」になり、
// その後はクリアランプ順だけが効いて同じ低クリアランプの曲ばかり無限に出続けていた)。
// 同条件の曲同士はプレイ回数が少ない方を優先し、それでも決まらなければランダムに散らす。
function sortByPracticeNeed(
  list: AnalyzedSong[],
  suggestionCounts: ReadonlyMap<string, number>
): AnalyzedSong[] {
  const withRandomKey = list.map((item) => ({ item, r: Math.random() }));
  withRandomKey.sort((a, b) => {
    const aCount = suggestionCounts.get(a.item.song.sha256) ?? 0;
    const bCount = suggestionCounts.get(b.item.song.sha256) ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    if (a.item.song.clear !== b.item.song.clear) return a.item.song.clear - b.item.song.clear;
    if (a.item.song.playcount !== b.item.song.playcount) return a.item.song.playcount - b.item.song.playcount;
    return a.r - b.r;
  });
  return withRandomKey.map(({ item }) => item);
}

// ユーザーが選んだテーマ(ガチ押し/中速/高速/ディレイ)1つに絞って、そのテーマの曲を
// 最大3曲ピックする。priorityCategoryMap(ディレイjoy/Delay小学校/ウーデオシ小学校/
// Gachimijoyなど、参考難易度表に載っている曲のsha256→強制分類先カテゴリのマップ)に
// 含まれる曲は、BPM/パターンのヒューリスティック分類が別のテーマだったとしても、まず
// この強制分類を表示カテゴリとして適用してから絞り込む(参考難易度表への掲載は「この
// テーマの譜面である」という強いシグナルのため)。この正規化はテーマを個別に選んだときも
// おまかせのときも同じ基準で行うため、同じ曲であればどちらを選んでも表示カテゴリが
// 一致する(2026-09-23にユーザー指摘: 以前はおまかせのときだけ参考難易度表による
// 強制分類が適用されず、個別選択時と食い違っていた)。
// 強制分類された曲は、(おまかせではなく)テーマを個別に選んだときに限り、その候補内でも
// sortByPracticeNeedの優先順位(未提案優先→クリアランプ順)の前に最優先で表示する
// (2026-09-06にユーザー指示: ディレイ/ガチ押しは参考難易度表の掲載曲を優先表示・拾い上げる)。
// shownTodayTitlesに含まれるタイトルの曲は、その日は一切候補に含めない
// (sha256が異なる別ファイルとして同じ曲が二重登録されているケースがあり、
// sha256だけで判定すると同じ曲がその日のうちに複数回出てしまうため)。
export function pickByTheme(
  candidates: AnalyzedSong[],
  theme: Theme,
  priorityCategoryMap: Map<string, SpeedCategory> = new Map(),
  suggestionCounts: ReadonlyMap<string, number> = new Map(),
  shownTodayTitles: Set<string> = new Set()
): AnalyzedSong[] {
  // 候補自体はあるのに、その日のうちに全部出し切っていて0件になった場合は「一巡した」と
  // みなし、当日表示済み除外を無視して最初から選び直す(でないと候補が少ないレベル/テーマは
  // その日ずっと「見つかりませんでした」のままになってしまう。2026-09-06にユーザー指示)。
  const excludeShownToday = (pool: AnalyzedSong[]): AnalyzedSong[] => {
    if (pool.length === 0) return pool;
    const filtered = pool.filter((c) => !shownTodayTitles.has(c.song.title));
    return filtered.length > 0 ? filtered : pool;
  };

  // 参考難易度表による強制分類を、テーマの絞り込みより先に全候補へ適用する。
  const normalizedCandidates = candidates.map((c) => {
    const forced = priorityCategoryMap.get(c.song.sha256);
    if (!forced || forced === c.analysis.category) return c;
    return { ...c, analysis: { ...c.analysis, category: forced } };
  });

  let matching: AnalyzedSong[];
  if (theme === 'omakase') {
    // おまかせ: カテゴリで絞り込まずごちゃまぜで選ぶ。表示カテゴリは強制分類反映済みのもの
    // (2026-09-06にユーザー指示、2026-09-23に強制分類の反映を追加)。
    matching = excludeShownToday(normalizedCandidates);
  } else {
    // 強制分類済みのカテゴリがこのテーマと一致する曲を候補に含める。
    matching = excludeShownToday(normalizedCandidates.filter((c) => c.analysis.category === theme));

    // 高速は事前分類(BPM180以上)だけだと候補が0件になりやすいため、その場合だけBPMの
    // 下限をHIGHSPEED_FALLBACK_BPMまで緩めて拾い直す(2026-09-06にユーザー指示)。
    // 元のanalysis.categoryは変えず(キャッシュを汚さないため)、返す提案の分類だけを
    // このpick用に上書きする。
    if (theme === 'highspeed' && matching.length === 0) {
      matching = excludeShownToday(
        normalizedCandidates
          .filter((c) => c.analysis.bpm >= HIGHSPEED_FALLBACK_BPM)
          .map((c) => ({ ...c, analysis: { ...c.analysis, category: 'highspeed' as SpeedCategory } }))
      );
    }
  }

  const picks: AnalyzedSong[] = [];
  const pickedTitles = new Set<string>();
  const addFrom = (pool: AnalyzedSong[]): void => {
    for (const c of pool) {
      if (picks.length >= SUGGESTIONS_PER_THEME) return;
      if (pickedTitles.has(c.song.title)) continue; // 同一バッチ内での重複タイトルも防ぐ
      picks.push(c);
      pickedTitles.add(c.song.title);
    }
  };
  if (theme === 'omakase') {
    // おまかせでは参考難易度表の掲載曲を優先せず、全候補をまとめて練習必要度順に並べる
    // (2026-10-03にユーザー指摘: ガチ押し/ディレイが優先されすぎていた)。
    addFrom(sortByPracticeNeed(matching, suggestionCounts));
  } else {
    const priority = sortByPracticeNeed(
      matching.filter((c) => priorityCategoryMap.has(c.song.sha256)),
      suggestionCounts
    );
    const rest = sortByPracticeNeed(
      matching.filter((c) => !priorityCategoryMap.has(c.song.sha256)),
      suggestionCounts
    );
    addFrom(priority);
    addFrom(rest);
  }
  return picks;
}
