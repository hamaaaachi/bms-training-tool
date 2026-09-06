import type { BmsChart, DifficultyResult } from './types';

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// ノーツ密度・同時押し・スクラッチ・LN比率から算出する簡易ヒューリスティック。
// トリル/階段/縦連といったパターン認識は含まない(v1の範囲外)。
export function computeDifficulty(chart: BmsChart): DifficultyResult {
  const { notes, bpmChanges } = chart;
  const totalNotes = notes.length;

  if (totalNotes === 0) {
    return {
      totalNotes: 0,
      durationSec: 0,
      averageNps: 0,
      peakNps: 0,
      chordRatio: 0,
      maxChordSize: 0,
      scratchRatio: 0,
      longNoteRatio: 0,
      bpmMin: chart.header.bpm ?? 0,
      bpmMax: chart.header.bpm ?? 0,
      bpmChangeCount: 0,
      score: 0,
    };
  }

  const durationSec = Math.max(notes[notes.length - 1].timeSec - notes[0].timeSec, 0.001);
  const averageNps = totalNotes / durationSec;

  let peakNps = 0;
  let left = 0;
  for (let right = 0; right < notes.length; right++) {
    while (notes[right].timeSec - notes[left].timeSec > 1) left++;
    peakNps = Math.max(peakNps, right - left + 1);
  }

  const chordGroups = new Map<string, number>();
  for (const note of notes) {
    const key = note.timeSec.toFixed(3);
    chordGroups.set(key, (chordGroups.get(key) ?? 0) + 1);
  }
  let maxChordSize = 0;
  let chordedNoteCount = 0;
  for (const size of chordGroups.values()) {
    if (size > maxChordSize) maxChordSize = size;
    if (size >= 2) chordedNoteCount += size;
  }
  const chordRatio = chordedNoteCount / totalNotes;

  const scratchCount = notes.filter((n) => n.kind === 'scratch').length;
  const longNoteCount = notes.filter((n) => n.kind === 'longNote').length;
  const scratchRatio = scratchCount / totalNotes;
  const longNoteRatio = longNoteCount / totalNotes;

  const bpmValues = bpmChanges.map((b) => b.bpm);
  const bpmMin = Math.min(...bpmValues);
  const bpmMax = Math.max(...bpmValues);
  const bpmChangeCount = Math.max(bpmChanges.length - 1, 0);

  const densityScore = clamp01(averageNps / 12) * 40;
  const peakScore = clamp01(peakNps / 20) * 25;
  const chordScore = clamp01(chordRatio) * 15;
  const scratchScore = clamp01(scratchRatio * 3) * 10;
  const lnScore = clamp01(longNoteRatio) * 10;
  const score = Math.round(densityScore + peakScore + chordScore + scratchScore + lnScore);

  return {
    totalNotes,
    durationSec,
    averageNps,
    peakNps,
    chordRatio,
    maxChordSize,
    scratchRatio,
    longNoteRatio,
    bpmMin,
    bpmMax,
    bpmChangeCount,
    score,
  };
}
