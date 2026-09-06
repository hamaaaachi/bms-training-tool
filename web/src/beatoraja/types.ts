// bms/player/beatoraja/ClearType.class (beatoraja.jar) の enum 定義順そのまま。
// インデックス = score.db の score.clear の値。
export const CLEAR_TYPE_NAMES = [
  'NoPlay',
  'Failed',
  'AssistEasy',
  'LightAssistEasy',
  'Easy',
  'Normal',
  'Hard',
  'ExHard',
  'FullCombo',
  'Perfect',
  'Max',
] as const;

export type ClearTypeName = (typeof CLEAR_TYPE_NAMES)[number];

export interface Song {
  sha256: string;
  md5: string;
  title: string;
  artist: string;
  genre: string;
  path: string;
  level: number;
  difficulty: number;
  minbpm: number;
  maxbpm: number;
  notes: number;
  mode: number;
}

export interface ScoreRecord {
  sha256: string;
  clear: number;
  notes: number;
  minbp: number;
  playcount: number;
  clearcount: number;
}

export interface SongWithScore extends Song {
  clear: number;
  clearName: ClearTypeName;
  playcount: number;
  clearcount: number;
}

export interface BeatorajaPlayer {
  id: string;
  name: string;
}
