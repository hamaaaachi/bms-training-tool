import type { NoteEvent } from './types';

export interface PatternFeatures {
  tupletRatio: number; // 24分/36分など3連系リズムが占める割合(ディレイ判定用)
  jackRatio: number; // 同一レーンの高速連打(縦連)が占める割合
}

const JACK_BEAT_THRESHOLD = 0.26; // これより短い同レーン間隔は縦連とみなす(16分未満)

// ノート間の拍間隔(BPM/STOPの影響を受けない拍単位)を1/dで整数化し、
// 分母が3の倍数(かつ6以上)であれば24分/36分系のリズムと判定する。
// 実測(Satellite sl12 "Sunny [ディレイ&物量]" vs 同レベル帯の他曲)で
// ディレイ譜面は0.75、非ディレイ譜面は0.20程度だったため、閾値は0.4を採用。
export function computeTupletRatio(notes: NoteEvent[]): number {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);
  let total = 0;
  let tuplet = 0;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].beat - sorted[i - 1].beat;
    if (d <= 0.0001) continue; // 同時押しはスキップ
    total++;
    const denom = Math.round(1 / d);
    if (denom >= 6 && denom % 3 === 0) tuplet++;
  }
  return total === 0 ? 0 : tuplet / total;
}

export function computeJackRatio(notes: NoteEvent[]): number {
  const byChannel = new Map<string, NoteEvent[]>();
  for (const note of notes) {
    if (note.kind === 'scratch') continue;
    let list = byChannel.get(note.channel);
    if (!list) {
      list = [];
      byChannel.set(note.channel, list);
    }
    list.push(note);
  }

  let total = 0;
  let jack = 0;
  for (const list of byChannel.values()) {
    list.sort((a, b) => a.beat - b.beat);
    for (let i = 1; i < list.length; i++) {
      total++;
      const d = list[i].beat - list[i - 1].beat;
      if (d > 0.0001 && d < JACK_BEAT_THRESHOLD) jack++;
    }
  }
  return total === 0 ? 0 : jack / total;
}

export function computePatternFeatures(notes: NoteEvent[]): PatternFeatures {
  return {
    tupletRatio: computeTupletRatio(notes),
    jackRatio: computeJackRatio(notes),
  };
}
