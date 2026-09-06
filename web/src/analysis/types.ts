export type SpeedCategory = 'gachi' | 'midspeed' | 'highspeed' | 'delay';

export interface SongAnalysis {
  sha256: string;
  bpm: number;
  avgNps: number;
  peakNps: number;
  totalNotes: number;
  chordRatio: number;
  scratchRatio: number;
  longNoteRatio: number;
  tupletRatio: number;
  jackRatio: number;
  category: SpeedCategory;
  analyzedAt: number;
}
