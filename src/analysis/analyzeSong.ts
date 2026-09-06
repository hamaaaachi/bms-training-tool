import * as fs from 'fs/promises';
import * as path from 'path';
import { parseBms } from '../bms/parser';
import { computeDifficulty } from '../bms/difficulty';
import { computePatternFeatures } from '../bms/patterns';
import { classifySpeedCategory } from './category';
import type { SongAnalysis } from './types';

// songdata.dbのpath列は、beatorajaの設定でbmsroot(追加の曲フォルダ)が未設定なら
// beatorajaインストールフォルダからの相対パスで格納されるが、bmsrootに別ドライブ/
// 別フォルダを登録しているユーザーの場合は絶対パスで格納されることがある
// (2026-09-06にユーザー指摘・実データで確認: bmsroot未設定時は相対パス "[package]\..."
// だった)。絶対パスならそのまま使い、相対パスならbeatorajaDirを基準に解決する。
export function resolveSongPath(beatorajaDir: string, songPath: string): string {
  return path.isAbsolute(songPath) ? songPath : path.join(beatorajaDir, songPath);
}

export async function analyzeSongFile(
  beatorajaDir: string,
  songPath: string,
  sha256: string
): Promise<SongAnalysis> {
  const filePath = resolveSongPath(beatorajaDir, songPath);
  const buffer = await fs.readFile(filePath);
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
    chordRatio: difficulty.chordRatio,
    scratchRatio: difficulty.scratchRatio,
    longNoteRatio: difficulty.longNoteRatio,
    tupletRatio: patterns.tupletRatio,
    jackRatio: patterns.jackRatio,
    category,
    analyzedAt: Date.now(),
  };
}
