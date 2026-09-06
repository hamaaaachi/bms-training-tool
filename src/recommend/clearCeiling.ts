// クリアランプの実績から「今のプレイヤーの上限」を推定する。
// 例: sl11でFailedの曲が5個以上あれば、sl11を壁として検出する。
// ただし、そのレベル帯でHard以上のクリアが3つ以上あれば「実際はこなせている」とみなして
// 壁の候補から除外する(低いレベルはプレイ数自体が多く、Failedの絶対数だけ見ると
// 誤検出しやすいため)。
export interface ClearSample {
  level: number;
  playcount: number;
  clear: number;
}

// bms/player/beatoraja/ClearType.class の並びでの値。
const FAILED_CLEAR = 1;
const HARD_CLEAR = 6;
// このレベルでFailedの曲がこの数以上あれば「壁」の候補とみなす(割合ではなく個数で判定)
const FAILED_WALL_COUNT = 5;
// このレベルでHard以上の曲がこの数以上あれば、そのレベル帯は壁の候補から除外する
const HARD_IGNORE_COUNT = 3;

// レベルが低い順に見ていき、(Hard以上が3つ未満 かつ Failedが5つ以上)になる最初のレベルを返す。
// 壁を検出できなければ(データ不足、またはまだ壁に到達していない)nullを返す。
export function computeClearCeiling(samples: ClearSample[]): number | null {
  const failedCounts = new Map<number, number>();
  const hardPlusCounts = new Map<number, number>();
  for (const { level, playcount, clear } of samples) {
    if (playcount <= 0) continue;
    if (clear === FAILED_CLEAR) failedCounts.set(level, (failedCounts.get(level) ?? 0) + 1);
    if (clear >= HARD_CLEAR) hardPlusCounts.set(level, (hardPlusCounts.get(level) ?? 0) + 1);
  }

  const levels = [...failedCounts.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    if ((hardPlusCounts.get(level) ?? 0) >= HARD_IGNORE_COUNT) continue;
    if ((failedCounts.get(level) ?? 0) >= FAILED_WALL_COUNT) return level;
  }
  return null;
}

// 壁の1つ手前のレベルで足踏みしつつ、それ以外は次に進むたびに1レベルずつ上げる。
export function decideAutoLevel(currentLevel: number, ceiling: number | null, clamp: (n: number) => number): number {
  if (ceiling === null) return clamp(currentLevel + 1);
  const cap = ceiling - 1;
  if (currentLevel >= cap) return currentLevel;
  return clamp(currentLevel + 1);
}
