import type { DifficultyResult } from '../bms/types';
import type { PatternFeatures } from '../bms/patterns';
import type { SpeedCategory } from './types';

// v1のヒューリスティック閾値。ユーザー定義:
// ・ガチ押し = 縦連率が高いかどうかで判定(BPM不問。2026-09-06にユーザー指定)。
//   ただし縦連が目立たなくてもBPMが異様に速く同時押しが多い譜面もガチ押し寄りとして拾う。
// ・ディレイ = 24分/36分中心のリズム(Satellite sl12 "Sunny[ディレイ&物量]"で実測: tupletRatio≒0.75)
// ・高速 = BPM180以上(2026-09-06にユーザー指定: それ以外の条件は問わない)
// ・中速 = BPM130-165(2026-09-06にユーザー指定)
const HIGH_BPM = 250;
const JACK_HEAVY = 0.15;
const CHORD_HEAVY = 0.2;
const DELAY_TUPLET = 0.4;
const MIDSPEED_MIN_BPM = 130;
const MIDSPEED_MAX_BPM = 165;
const HIGHSPEED_BPM = 180;
// 高速の選曲候補が0件の時だけ、選曲時(categoryEngine.ts側)にこのBPMまで下限を緩めて
// 拾い直す(2026-09-06にユーザー指示)。曲自体の固定カテゴリ判定には使わない。
export const HIGHSPEED_FALLBACK_BPM = 165;

export function classifySpeedCategory(
  bpm: number,
  difficulty: DifficultyResult,
  patterns: PatternFeatures
): SpeedCategory {
  if (patterns.tupletRatio >= DELAY_TUPLET) return 'delay';

  const heavyJack = patterns.jackRatio >= JACK_HEAVY;
  const highBpmChord = bpm > HIGH_BPM && difficulty.chordRatio >= CHORD_HEAVY;
  if (heavyJack || highBpmChord) return 'gachi';

  if (bpm >= HIGHSPEED_BPM) return 'highspeed';
  if (bpm >= MIDSPEED_MIN_BPM && bpm <= MIDSPEED_MAX_BPM) return 'midspeed';

  // BPM130未満、または165<BPM<180の狭間はどちらの定義にも明確に該当しないため、
  // 消去法でmidspeedに含める(全曲に必ず4カテゴリのいずれかを割り当てる必要があるため)。
  // 165-180の狭間は、高速の選曲候補が0件の場合にHIGHSPEED_FALLBACK_BPM経由でも拾われる。
  return 'midspeed';
}
