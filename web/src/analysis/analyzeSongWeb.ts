import { parseBms } from '../bms/parser';
import { computeDifficulty } from '../bms/difficulty';
import { computePatternFeatures } from '../bms/patterns';
import { classifySpeedCategory } from './category';
import type { SongAnalysis } from './types';

// Electron版と違い、ファイルの読み込み自体は呼び出し側(browser/fsAccess経由)で行い、
// ここではバイト列を受け取って解析するだけにする(ブラウザのサンドボックスではfsに
// 直接アクセスできないため)。
export function analyzeSongBytes(buffer: Uint8Array, sha256: string): SongAnalysis {
  const chart = parseBms(buffer);
  const difficulty = computeDifficulty(chart);
  const patterns = computePatternFeatures(chart.notes);
  const bpm = chart.header.bpm && chart.header.bpm > 0 ? chart.header.bpm : difficulty.bpmMax;
  const category = classifySpeedCategory(bpm, difficulty, patterns);

  return {
    sha256,
    bpm,
    avgNps: difficulty.averageNps,
    peakNps: difficulty.peakNps,
    totalNotes: difficulty.totalNotes,
    chordRatio: difficulty.chordRatio,
    scratchRatio: difficulty.scratchRatio,
    longNoteRatio: difficulty.longNoteRatio,
    tupletRatio: patterns.tupletRatio,
    jackRatio: patterns.jackRatio,
    category,
    analyzedAt: Date.now(),
  };
}
