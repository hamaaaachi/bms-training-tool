import * as fs from 'fs/promises';
import * as path from 'path';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { CLEAR_TYPE_NAMES } from './types';
import type { BeatorajaPlayer, ScoreRecord, Song, SongWithScore } from './types';

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    sqlPromise = initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlPromise;
}

export async function listPlayers(beatorajaDir: string): Promise<BeatorajaPlayer[]> {
  const playerDir = path.join(beatorajaDir, 'player');
  let entries;
  try {
    entries = await fs.readdir(playerDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const SQL = await getSql();
  const players: BeatorajaPlayer[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dbPath = path.join(playerDir, entry.name, 'score.db');
    try {
      const buf = await fs.readFile(dbPath);
      const db = new SQL.Database(buf);
      const res = db.exec('SELECT name FROM info LIMIT 1');
      const name = res[0]?.values?.[0]?.[0];
      players.push({
        id: entry.name,
        name: typeof name === 'string' && name.length > 0 ? name : entry.name,
      });
      db.close();
    } catch {
      // score.db が存在しない/壊れているフォルダはスキップ
    }
  }
  return players;
}

export async function loadSongs(beatorajaDir: string): Promise<Song[]> {
  const SQL = await getSql();
  const buf = await fs.readFile(path.join(beatorajaDir, 'songdata.db'));
  const db = new SQL.Database(buf);
  const stmt = db.prepare(
    'SELECT sha256, md5, title, artist, genre, path, level, difficulty, minbpm, maxbpm, notes, mode FROM song WHERE sha256 IS NOT NULL AND notes > 0'
  );

  const songs: Song[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    songs.push({
      sha256: String(row.sha256),
      md5: String(row.md5 ?? ''),
      title: String(row.title ?? ''),
      artist: String(row.artist ?? ''),
      genre: String(row.genre ?? ''),
      path: String(row.path ?? ''),
      level: Number(row.level ?? 0),
      difficulty: Number(row.difficulty ?? 0),
      minbpm: Number(row.minbpm ?? 0),
      maxbpm: Number(row.maxbpm ?? 0),
      notes: Number(row.notes ?? 0),
      mode: Number(row.mode ?? 0),
    });
  }
  stmt.free();
  db.close();
  return songs;
}

export async function loadScores(beatorajaDir: string, playerId: string): Promise<Map<string, ScoreRecord>> {
  const SQL = await getSql();
  const dbPath = path.join(beatorajaDir, 'player', playerId, 'score.db');
  const buf = await fs.readFile(dbPath);
  const db = new SQL.Database(buf);
  const stmt = db.prepare('SELECT sha256, clear, notes, minbp, playcount, clearcount FROM score');

  const scores = new Map<string, ScoreRecord>();
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    const sha256 = String(row.sha256);
    scores.set(sha256, {
      sha256,
      clear: Number(row.clear ?? 0),
      notes: Number(row.notes ?? 0),
      minbp: Number(row.minbp ?? -1),
      playcount: Number(row.playcount ?? 0),
      clearcount: Number(row.clearcount ?? 0),
    });
  }
  stmt.free();
  db.close();
  return scores;
}

export function joinSongsWithScores(songs: Song[], scores: Map<string, ScoreRecord>): SongWithScore[] {
  return songs.map((song) => {
    const score = scores.get(song.sha256);
    const clear = score?.clear ?? 0;
    return {
      ...song,
      clear,
      clearName: CLEAR_TYPE_NAMES[clear] ?? 'NoPlay',
      playcount: score?.playcount ?? 0,
      clearcount: score?.clearcount ?? 0,
    };
  });
}

export async function loadLibrary(beatorajaDir: string, playerId: string): Promise<SongWithScore[]> {
  const [songs, scores] = await Promise.all([
    loadSongs(beatorajaDir),
    loadScores(beatorajaDir, playerId),
  ]);
  return joinSongsWithScores(songs, scores);
}
