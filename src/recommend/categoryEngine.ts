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

const SUGGESTIONS_PER_THEME = 3;

function shuffle<T>(list: T[]): T[] {
  return [...list].sort(() => Math.random() - 0.5);
}

// ユーザーが選んだテーマ(ガチ押し/中速/高速/ディレイ)1つに絞って、そのテーマの曲を
// 最大3曲ピックする。priorityMatches(ディレイjoy/Delay小学校/ウーデオシ小学校など、
// そのテーマの参考難易度表に載っている曲のsha256集合)に含まれる曲は、BPM/パターンの
// ヒューリスティック分類が別のテーマだったとしてもこのテーマの候補に含め(参考難易度表への
// 掲載は「このテーマの譜面である」という強いシグナルのため)、かつ最優先で表示する。
// その中でもalreadySuggestedに含まれない(＝まだ提案したことがない)曲をさらに優先する
// (2026-09-06にユーザー指示: ディレイ/ガチ押しは参考難易度表の掲載曲を優先表示・拾い上げる)。
// shownTodayTitlesに含まれるタイトルの曲は、その日は一切候補に含めない
// (sha256が異なる別ファイルとして同じ曲が二重登録されているケースがあり、
// sha256だけで判定すると同じ曲がその日のうちに複数回出てしまうため)。
export function pickByTheme(
  candidates: AnalyzedSong[],
  theme: SpeedCategory,
  priorityMatches: Set<string> = new Set(),
  alreadySuggested: Set<string> = new Set(),
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

  // ヒューリスティック分類がこのテーマの曲、または参考難易度表(priorityMatches)にこのテーマの
  // 表として載っている曲を候補に含める(後者は表示上のカテゴリもこのテーマに揃える)。
  const themeMatches = candidates.filter((c) => c.analysis.category === theme || priorityMatches.has(c.song.sha256));
  const normalized = themeMatches.map((c) =>
    c.analysis.category === theme ? c : { ...c, analysis: { ...c.analysis, category: theme } }
  );
  let matching = excludeShownToday(normalized);

  // 高速は事前分類(BPM180以上)だけだと候補が0件になりやすいため、その場合だけBPMの
  // 下限をHIGHSPEED_FALLBACK_BPMまで緩めて拾い直す(2026-09-06にユーザー指示)。
  // 元のanalysis.categoryは変えず(キャッシュを汚さないため)、返す提案の分類だけを
  // このpick用に上書きする。
  if (theme === 'highspeed' && matching.length === 0) {
    matching = excludeShownToday(
      candidates
        .filter((c) => c.analysis.bpm >= HIGHSPEED_FALLBACK_BPM)
        .map((c) => ({ ...c, analysis: { ...c.analysis, category: 'highspeed' as SpeedCategory } }))
    );
  }

  const priority = matching.filter((c) => priorityMatches.has(c.song.sha256));
  const rest = matching.filter((c) => !priorityMatches.has(c.song.sha256));
  const priorityUnseen = shuffle(priority.filter((c) => !alreadySuggested.has(c.song.sha256)));
  const prioritySeen = shuffle(priority.filter((c) => alreadySuggested.has(c.song.sha256)));
  const unseen = shuffle(rest.filter((c) => !alreadySuggested.has(c.song.sha256)));
  const seen = shuffle(rest.filter((c) => alreadySuggested.has(c.song.sha256)));

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
  addFrom(priorityUnseen);
  addFrom(prioritySeen);
  addFrom(unseen);
  addFrom(seen);
  return picks;
}
