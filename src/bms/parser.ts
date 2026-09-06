import type { BmsChart, BmsHeader, BpmChangeEvent, NoteEvent, NoteKind } from './types';

const SCRATCH_CHANNELS = new Set(['16', '26', '56', '66']);

// 51-59/61-69 は旧来のロングノーツ専用チャンネル。#LNOBJ 方式のLNは
// 通常チャンネル上でオブジェクトIDがLNOBJと一致した箇所として別途判定する。
const LN_CHANNELS = new Set([
  '51', '52', '53', '54', '55', '56', '57', '58', '59',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
]);

const NOTE_CHANNELS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '23', '24', '25', '26', '27', '28', '29',
  ...LN_CHANNELS,
]);

function decodeBmsText(buffer: Buffer): string {
  // BMSは伝統的にShift-JISが主流。UTF-8で書かれたファイルもあるため
  // 置換文字(U+FFFD)の出現数で判定してフォールバックする。
  const shiftJisText = new TextDecoder('shift_jis').decode(buffer);
  const shiftJisReplacementCount = (shiftJisText.match(/�/g) ?? []).length;
  if (shiftJisReplacementCount === 0) return shiftJisText;

  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  const utf8ReplacementCount = (utf8Text.match(/�/g) ?? []).length;
  return utf8ReplacementCount < shiftJisReplacementCount ? utf8Text : shiftJisText;
}

function classifyChannel(channel: string, objectId: string, lnObj: string | undefined): NoteKind {
  if (SCRATCH_CHANNELS.has(channel)) return 'scratch';
  if (LN_CHANNELS.has(channel)) return 'longNote';
  if (lnObj && objectId === lnObj) return 'longNote';
  return 'normal';
}

interface PositionEvent {
  position: number;
  kind: 'bpm' | 'stop' | 'note';
  value: number;
  channel?: string;
  objectId?: string;
}

export function parseBms(buffer: Buffer): BmsChart {
  const text = decodeBmsText(buffer);
  const lines = text.split(/\r\n|\r|\n/);

  const header: BmsHeader = {};
  const bpmDefs = new Map<string, number>();
  const stopDefs = new Map<string, number>();
  const measures = new Map<number, Record<string, string[]>>();
  let lnObj: string | undefined;
  let maxMeasure = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('#') || line.length < 2) continue;
    const body = line.slice(1);

    const measureMatch = /^(\d{3})([0-9A-Za-z]{2}):(.*)$/.exec(body);
    if (measureMatch) {
      const measureNum = parseInt(measureMatch[1], 10);
      const channel = measureMatch[2].toUpperCase();
      const data = measureMatch[3].trim();
      maxMeasure = Math.max(maxMeasure, measureNum);
      let channelMap = measures.get(measureNum);
      if (!channelMap) {
        channelMap = {};
        measures.set(measureNum, channelMap);
      }
      (channelMap[channel] ??= []).push(data);
      continue;
    }

    const spaceIdx = body.search(/\s/);
    const rawKey = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
    const rawValue = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim();
    const keyUpper = rawKey.toUpperCase();

    const defMatch = /^(WAV|BPM|STOP)([0-9A-Za-z]{2})$/i.exec(rawKey);
    if (defMatch) {
      const defKind = defMatch[1].toUpperCase();
      const id = defMatch[2].toUpperCase();
      if (defKind === 'BPM') bpmDefs.set(id, parseFloat(rawValue));
      else if (defKind === 'STOP') stopDefs.set(id, parseFloat(rawValue));
      continue;
    }

    switch (keyUpper) {
      case 'TITLE': header.title = rawValue; break;
      case 'ARTIST': header.artist = rawValue; break;
      case 'GENRE': header.genre = rawValue; break;
      case 'BPM': header.bpm = parseFloat(rawValue); break;
      case 'PLAYLEVEL': header.playLevel = rawValue; break;
      case 'RANK': header.rank = parseInt(rawValue, 10); break;
      case 'TOTAL': header.total = parseFloat(rawValue); break;
      case 'DIFFICULTY': header.difficulty = parseInt(rawValue, 10); break;
      case 'PLAYER': header.player = parseInt(rawValue, 10); break;
      case 'LNOBJ': lnObj = rawValue.trim().toUpperCase(); break;
      default: break;
    }
  }

  const notes: NoteEvent[] = [];
  const bpmChanges: BpmChangeEvent[] = [];
  let currentBpm = header.bpm && header.bpm > 0 ? header.bpm : 130;
  let currentTimeSec = 0;
  let currentBeat = 0;
  bpmChanges.push({ timeSec: 0, bpm: currentBpm });

  const sortedMeasureNums = Array.from(measures.keys()).sort((a, b) => a - b);
  for (const measureNum of sortedMeasureNums) {
    const channelMap = measures.get(measureNum)!;
    const lengthStrs = channelMap['02'];
    const factor = lengthStrs && lengthStrs.length > 0
      ? parseFloat(lengthStrs[lengthStrs.length - 1])
      : 1.0;
    const measureBeats = 4 * (Number.isFinite(factor) && factor > 0 ? factor : 1.0);

    const events: PositionEvent[] = [];

    for (const [channel, dataList] of Object.entries(channelMap)) {
      if (channel === '02') continue;
      for (const data of dataList) {
        const cellCount = data.length - (data.length % 2);
        const gridSize = cellCount / 2;
        if (gridSize === 0) continue;
        for (let i = 0; i < gridSize; i++) {
          const objectId = data.substr(i * 2, 2).toUpperCase();
          if (objectId === '00') continue;
          const position = i / gridSize;
          if (channel === '03') {
            events.push({ position, kind: 'bpm', value: parseInt(objectId, 16) });
          } else if (channel === '08') {
            const bpm = bpmDefs.get(objectId);
            if (bpm !== undefined) events.push({ position, kind: 'bpm', value: bpm });
          } else if (channel === '09') {
            const stopVal = stopDefs.get(objectId);
            if (stopVal !== undefined) events.push({ position, kind: 'stop', value: stopVal });
          } else if (NOTE_CHANNELS.has(channel)) {
            events.push({ position, kind: 'note', value: 0, channel, objectId });
          }
        }
      }
    }

    events.sort((a, b) => a.position - b.position);

    let lastPos = 0;
    for (const ev of events) {
      const elapsedBeats = (ev.position - lastPos) * measureBeats;
      currentTimeSec += elapsedBeats * (60 / currentBpm);
      currentBeat += elapsedBeats;
      lastPos = ev.position;

      if (ev.kind === 'bpm') {
        currentBpm = ev.value;
        bpmChanges.push({ timeSec: currentTimeSec, bpm: currentBpm });
      } else if (ev.kind === 'stop') {
        // STOPは経過秒数だけ進めて拍(currentBeat)は進めない。n連符判定は拍基準で行うため。
        const stopBeats = (ev.value / 192) * 4;
        currentTimeSec += stopBeats * (60 / currentBpm);
      } else if (ev.kind === 'note') {
        const kind = classifyChannel(ev.channel!, ev.objectId!, lnObj);
        notes.push({
          timeSec: currentTimeSec,
          beat: currentBeat,
          measure: measureNum,
          channel: ev.channel!,
          objectId: ev.objectId!,
          kind,
        });
      }
    }

    const remainingBeats = (1 - lastPos) * measureBeats;
    currentTimeSec += remainingBeats * (60 / currentBpm);
    currentBeat += remainingBeats;
  }

  notes.sort((a, b) => a.timeSec - b.timeSec);

  return { header, notes, bpmChanges, totalMeasures: maxMeasure };
}
