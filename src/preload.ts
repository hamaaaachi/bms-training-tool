import { contextBridge, ipcRenderer } from 'electron';
import type { AutoStartResult, DailyRecommendationResult } from './main';
import type { KeystrokeHistory } from './keystroke/types';
import type { SpeedCategory } from './analysis/types';
import type { Track } from './recommend/categoryEngine';
import type { Lang } from './session/settings';

contextBridge.exposeInMainWorld('settings', {
  getBeatorajaDir: (): Promise<string | null> => ipcRenderer.invoke('settings:getBeatorajaDir'),
  chooseBeatorajaDir: (): Promise<string | null> => ipcRenderer.invoke('settings:chooseBeatorajaDir'),
  getLanguage: (): Promise<Lang> => ipcRenderer.invoke('settings:getLanguage'),
  setLanguage: (language: Lang): Promise<void> => ipcRenderer.invoke('settings:setLanguage', language),
});

contextBridge.exposeInMainWorld('recommend', {
  refresh: (playerId: string, track: Track, level: number, theme: SpeedCategory): Promise<DailyRecommendationResult> =>
    ipcRenderer.invoke('recommend:refresh', playerId, track, level, theme),
  switchTrack: (playerId: string, track: Track): Promise<DailyRecommendationResult> =>
    ipcRenderer.invoke('recommend:switchTrack', playerId, track),
  setCeilingOverride: (track: Track, level: number | null): Promise<DailyRecommendationResult> =>
    ipcRenderer.invoke('recommend:setCeilingOverride', track, level),
  setAutoAdvance: (enabled: boolean): Promise<void> => ipcRenderer.invoke('recommend:setAutoAdvance', enabled),
  setWarmupEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('recommend:setWarmupEnabled', enabled),
  setWarmupFloor: (track: Track, level: number): Promise<void> =>
    ipcRenderer.invoke('recommend:setWarmupFloor', track, level),
  onAutoAdvance: (callback: (result: DailyRecommendationResult) => void): void => {
    ipcRenderer.on('recommend:autoAdvance', (_event, result: DailyRecommendationResult) => callback(result));
  },
  onAutoStart: (callback: (result: AutoStartResult) => void): void => {
    ipcRenderer.on('recommend:autoStart', (_event, result: AutoStartResult) => callback(result));
  },
  onAutoStartFailed: (callback: (message: string) => void): void => {
    ipcRenderer.on('recommend:autoStartFailed', (_event, message: string) => callback(message));
  },
  onNeedsSetup: (callback: () => void): void => {
    ipcRenderer.on('recommend:needsSetup', () => callback());
  },
});

contextBridge.exposeInMainWorld('keystroke', {
  getHistory: (): Promise<KeystrokeHistory> => ipcRenderer.invoke('keystroke:getHistory'),
  isConnected: (): Promise<boolean> => ipcRenderer.invoke('keystroke:isConnected'),
  addDelta: (delta: number): Promise<number> => ipcRenderer.invoke('keystroke:addDelta', delta),
  onCount: (callback: (total: number) => void): void => {
    ipcRenderer.on('keystroke:count', (_event, total: number) => callback(total));
  },
  onConnectionChange: (callback: (connected: boolean) => void): void => {
    ipcRenderer.on('keystroke:connection', (_event, connected: boolean) => callback(connected));
  },
});

contextBridge.exposeInMainWorld('scratch', {
  getHistory: (): Promise<KeystrokeHistory> => ipcRenderer.invoke('scratch:getHistory'),
  onCount: (callback: (total: number) => void): void => {
    ipcRenderer.on('scratch:count', (_event, total: number) => callback(total));
  },
});
