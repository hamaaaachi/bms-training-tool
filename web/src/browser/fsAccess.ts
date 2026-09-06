import { idbGet, idbSet, idbDelete } from './idb';

const HANDLE_KEY = 'beatorajaDirHandle';
const EXTRA_HANDLES_KEY = 'beatorajaExtraDirHandles';

// Web版はFile System Access APIでユーザーが明示的に許可したフォルダ配下しか読めない
// (Electron版と違いOS上の任意の絶対パスにはアクセスできない)。songdata.dbのpath列が
// 絶対パスで格納されているケース(beatorajaのbmsroot設定で別フォルダを登録している場合)は
// このフォルダ配下からは辿れないため、該当曲は「ファイルが見つからない」として除外される。
export async function getSavedDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbSet(HANDLE_KEY, handle);
}

export async function clearSavedDirHandle(): Promise<void> {
  await idbDelete(HANDLE_KEY);
}

// 一度許可されたフォルダでも、ブラウザ再起動後などは権限が失われている(または'prompt'状態に
// 戻っている)ことがある。再度ユーザー操作(クリック等)を挟んでrequestPermissionすれば、
// フォルダ選択をやり直さずに1クリックで再許可できる。
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  try {
    return (await handle.requestPermission(opts)) === 'granted';
  } catch {
    return false;
  }
}

export async function isValidBeatorajaDir(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await handle.getFileHandle('songdata.db');
    return true;
  } catch {
    return false;
  }
}

export async function pickBeatorajaDir(): Promise<FileSystemDirectoryHandle | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ id: 'beatoraja-dir', mode: 'read' });
  } catch {
    return null; // ユーザーがキャンセルした
  }
  if (!(await isValidBeatorajaDir(handle))) {
    throw new Error(
      '選択したフォルダにsongdata.dbが見つかりませんでした。beatorajaをインストールしたフォルダ' +
        '(beatoraja.exeやsongdata.dbがある場所)を選んでください。'
    );
  }
  await saveDirHandle(handle);
  return handle;
}

// bmsroot設定で外部フォルダ(beatorajaフォルダの外)を登録している場合、その譜面フォルダを
// 個別に許可してもらうことで、songdata.dbのpath列が絶対パスになっている曲も読めるようにする。
export async function getSavedExtraDirHandles(): Promise<FileSystemDirectoryHandle[]> {
  try {
    const handles = await idbGet<FileSystemDirectoryHandle[]>(EXTRA_HANDLES_KEY);
    return handles ?? [];
  } catch {
    return [];
  }
}

async function saveExtraDirHandles(handles: FileSystemDirectoryHandle[]): Promise<void> {
  await idbSet(EXTRA_HANDLES_KEY, handles);
}

export async function removeExtraDirHandle(handle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle[]> {
  const existing = await getSavedExtraDirHandles();
  const next: FileSystemDirectoryHandle[] = [];
  for (const h of existing) {
    if (!(await h.isSameEntry(handle))) next.push(h);
  }
  await saveExtraDirHandles(next);
  return next;
}

export async function pickExtraChartDir(): Promise<FileSystemDirectoryHandle[] | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ id: 'beatoraja-extra-dir', mode: 'read' });
  } catch {
    return null; // ユーザーがキャンセルした
  }
  const existing = await getSavedExtraDirHandles();
  for (const h of existing) {
    if (await h.isSameEntry(handle)) return existing; // 既に登録済み
  }
  const next = [...existing, handle];
  await saveExtraDirHandles(next);
  return next;
}

async function readFile(handle: FileSystemFileHandle): Promise<Uint8Array> {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function readFileAt(root: FileSystemDirectoryHandle, path: string): Promise<Uint8Array> {
  const fileHandle = await getFileHandleAt(root, path);
  return readFile(fileHandle);
}

// 絶対パス(外部bmsroot)のsong.pathを、追加で許可された譜面フォルダ群から探す。
// FileSystemDirectoryHandleは実際のOSパスを持たないため、パス文字列中に登場する
// フォルダ名(handle.name)を手がかりに、そこから先の相対パスとして辿れるか試す
// (同名フォルダが複数箇所に登場するパスでは後方から順に候補を試す)。
async function resolveExternalFileHandle(
  extraRoots: FileSystemDirectoryHandle[],
  absolutePath: string
): Promise<FileSystemFileHandle | null> {
  const segments = absolutePath.split(/[\\/]+/).filter((s) => s.length > 0);
  for (const root of extraRoots) {
    for (let i = segments.length - 2; i >= 0; i--) {
      if (segments[i].toLowerCase() !== root.name.toLowerCase()) continue;
      const rest = segments.slice(i + 1);
      try {
        let dir = root;
        for (let j = 0; j < rest.length - 1; j++) {
          dir = await dir.getDirectoryHandle(rest[j]);
        }
        return await dir.getFileHandle(rest[rest.length - 1]);
      } catch {
        // この位置のフォルダ名一致では辿れなかった。他の一致箇所を試す
      }
    }
  }
  return null;
}

export async function readFileAtAny(
  root: FileSystemDirectoryHandle,
  extraRoots: FileSystemDirectoryHandle[],
  path: string
): Promise<Uint8Array> {
  if (!isAbsolutePath(path)) return readFileAt(root, path);
  const handle = await resolveExternalFileHandle(extraRoots, path);
  if (!handle) throw new Error('外部フォルダ内に譜面ファイルが見つかりませんでした。');
  return readFile(handle);
}

export async function fileExistsAtAny(
  root: FileSystemDirectoryHandle,
  extraRoots: FileSystemDirectoryHandle[],
  path: string
): Promise<boolean> {
  if (!isAbsolutePath(path)) return fileExistsAt(root, path);
  return (await resolveExternalFileHandle(extraRoots, path)) !== null;
}

// pathは"folder\\sub\\file.bms"や"folder/sub/file.bms"のようなbeatorajaルートからの相対パス。
// 絶対パス(bmsroot設定で外部フォルダを使っている場合)はブラウザのサンドボックス上
// 辿りようが無いため、呼び出し側でチェックしてスキップすること。
async function getFileHandleAt(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = path.split(/[\\/]+/).filter((s) => s.length > 0);
  let dir = root;
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i]);
  }
  return dir.getFileHandle(segments[segments.length - 1]);
}

export async function fileExistsAt(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  try {
    await getFileHandleAt(root, path);
    return true;
  } catch {
    return false;
  }
}

// path.isAbsolute相当(Windowsのドライブレター表記 "C:\..." や先頭が "/" のもの)。
// これらはFile System Access APIのサンドボックス外なので読めない。
export function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/');
}

export async function listPlayerDirNames(root: FileSystemDirectoryHandle): Promise<string[]> {
  let playerDir: FileSystemDirectoryHandle;
  try {
    playerDir = await root.getDirectoryHandle('player');
  } catch {
    return [];
  }
  const names: string[] = [];
  // @ts-expect-error: FileSystemDirectoryHandleはasyncIterableだが型定義に無い環境がある
  for await (const [name, entryHandle] of playerDir.entries()) {
    if (entryHandle.kind === 'directory') names.push(name);
  }
  return names;
}
