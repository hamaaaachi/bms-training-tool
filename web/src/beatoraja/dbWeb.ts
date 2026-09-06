import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { CLEAR_TYPE_NAMES } from './types';
import type { BeatorajaPlayer, ScoreRecord, Song, SongWithScore } from './types';
import { listPlayerDirNames, readFileAt } from '../browser/fsAccess';

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    // sql-wasm.wasmはビルド時にpublic/へコピーし、同一オリジンから配信する
    // (esbuildはwasmをバンドルしないため、ビルドスクリプト側でコピーしている)。
    sqlPromise = initSqlJs({ locateFile: (file) => `./${file}` });
  }
  return sqlPromise;
}

export async function listPlayers(root: FileSystemDirectoryHandle): Promise<BeatorajaPlayer[]> {
  const dirNames = await listPlayerDirNames(root);
  const SQL = await getSql();
  const players: BeatorajaPlayer[] = [];
  for (const dirName of dirNames) {
    try {
      const buf = await readFileAt(root, `player/${dirName}/score.db`);
      const db = new SQL.Database(buf);
      const res = db.exec('SELECT name FROM info LIMIT 1');
      const name = res[0]?.values?.[0]?.[0];
      players.push({
        id: dirName,
        name: typeof name === 'string' && name.length > 0 ? name : dirName,
      });
      db.close();
    } catch {
      // score.db が存在しない/壊れているフォルダはスキップ
    }
  }
  return players;
}

export async function loadSongs(root: FileSystemDirectoryHandle): Promise<Song[]> {
  const SQL = await getSql();
  const buf = await readFileAt(root, 'songdata.db');
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

export async function loadScores(root: FileSystemDirectoryHandle, playerId: string): Promise<Map<string, ScoreRecord>> {
  const SQL = await getSql();
  const buf = await readFileAt(root, `player/${playerId}/score.db`);
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

export async function loadLibrary(root: FileSystemDirectoryHandle, playerId: string): Promise<SongWithScore[]> {
  const [songs, scores] = await Promise.all([loadSongs(root), loadScores(root, playerId)]);
  return joinSongsWithScores(songs, scores);
}
