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
export type Track = 'keys' | 'insane' | 'scratch';

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

export function clampLevelForTrack(track: Track, level: number): number {
  if (track === 'scratch') return clampScrambleLevel(level);
  if (track === 'insane') return clampInsaneLevel(level);
  return clampTableLevel(level);
}

export function formatLevelForTrack(track: Track, level: number): string {
  if (track === 'scratch') return formatScrambleLevel(level);
  if (track === 'insane') return formatInsaneLevel(level);
  return formatLevelLabel(level);
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
