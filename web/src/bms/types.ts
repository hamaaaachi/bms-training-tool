export interface BmsHeader {
  title?: string;
  artist?: string;
  genre?: string;
  bpm?: number;
  playLevel?: string;
  rank?: number;
  total?: number;
  difficulty?: number;
  player?: number;
}

export type NoteKind = 'normal' | 'scratch' | 'longNote';

export interface NoteEvent {
  timeSec: number;
  // 曲頭からの累積拍数。BPM変化やSTOPの影響を受けない拍単位の時間軸で、
  // n連符(24分/36分など)のようなリズムパターン検出に使う。
  beat: number;
  measure: number;
  channel: string;
  objectId: string;
  kind: NoteKind;
}

export interface BpmChangeEvent {
  timeSec: number;
  bpm: number;
}

export interface BmsChart {
  header: BmsHeader;
  notes: NoteEvent[];
  bpmChanges: BpmChangeEvent[];
  totalMeasures: number;
}

export interface DifficultyResult {
  totalNotes: number;
  durationSec: number;
  averageNps: number;
  peakNps: number;
  chordRatio: number;
  maxChordSize: number;
  scratchRatio: number;
  longNoteRatio: number;
  bpmMin: number;
  bpmMax: number;
  bpmChangeCount: number;
  score: number;
}
