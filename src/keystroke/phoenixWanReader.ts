import * as HID from 'node-hid';

// PhoenixWan(7key BMSコントローラー)を実機のHIDレポートを解析して特定した値。
// 2026-09-05に生のHIDレポートをキャプチャして確認済み:
//   VID/PID は `HKLM\SYSTEM\CurrentControlSet\Control\MediaProperties\PrivateProperties\
//   Joystick\OEM` に "Controller INF&BMS" として登録されている。
//   レポートは5バイトで、byte0=スクラッチ(連続回転する8bitエンコーダ。回すたびに
//   1ずつ増減し、0x00-0xFFで折り返す。ボタンではない)、byte1・byte4=常に0、
//   byte2=鍵盤7つ(bit0-6)、byte3=追加ボタン4つ(bit0-3、Start/Select等)。
const VENDOR_ID = 0x1ccf;
const PRODUCT_ID = 0x8048;
const JOYSTICK_USAGE = 4;

function popcount(n: number): number {
  let count = 0;
  let v = n;
  while (v) {
    count += v & 1;
    v >>= 1;
  }
  return count;
}

// 0-255で折り返す8bitエンコーダの2値間の符号付き差分を求める(半周=128を超える差は
// 逆向きに折り返したとみなす)。HIDレポートは高頻度で届くため、実際に1レポート間で
// 半周以上回転することは無い前提。
function wrappedDelta(current: number, previous: number): number {
  let delta = (current - previous + 256) % 256;
  if (delta > 128) delta -= 256;
  return delta;
}

// スクラッチを同じ向きに回し続けている間、動きが一定時間(ミリ秒)止まらなければ
// 「まだ同じ一振りの途中」とみなす。この時間が経過してから次の入力が来たら、
// 向きが変わっていなくても新しい一振りとして数える。
const SCRATCH_IDLE_RESET_MS = 150;

// Gamepad API経由のポーリング(rAF単位・1フレーム分の遅延やdirectinputデバイス特有の
// 取得遅延がある)を避け、node-hidでOSからの入力レポートを直接イベントとして受け取る。
export class PhoenixWanReader {
  private device: HID.HID | null = null;
  private prevBits = 0;
  private prevScratch: number | null = null;
  // 直前のスクラッチ移動の向き(-1/1)。0は「止まっている(まだどちらにも動いていない)」。
  private scratchDirection = 0;
  private scratchIdleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private onPress: (count: number) => void,
    private onScratch: (count: number) => void,
    private onConnectionChange: (connected: boolean) => void
  ) {}

  isConnected(): boolean {
    return this.device !== null;
  }

  // 既に接続済みなら何もしない。未接続なら探して開こうとする(見つからなくても例外にしない)。
  tryConnect(): void {
    if (this.device) return;
    const target = HID.devices().find(
      (d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID && d.usage === JOYSTICK_USAGE
    );
    if (!target?.path) return;

    try {
      const device = new HID.HID(target.path);
      this.device = device;
      this.prevBits = 0;
      this.prevScratch = null;
      this.resetScratchDirection();
      device.on('data', (data: Buffer) => this.handleReport(data));
      device.on('error', () => this.handleDisconnect());
      this.onConnectionChange(true);
    } catch {
      this.device = null;
    }
  }

  private resetScratchDirection(): void {
    if (this.scratchIdleTimer) clearTimeout(this.scratchIdleTimer);
    this.scratchIdleTimer = null;
    this.scratchDirection = 0;
  }

  private handleReport(data: Buffer): void {
    // byte3(追加ボタン4つ)は「打鍵」に含めない。鍵盤7つ(byte2 bit0-6)のみ数える。
    const bits = (data[2] ?? 0) & 0x7f;
    const risingEdges = bits & ~this.prevBits;
    this.prevBits = bits;
    if (risingEdges !== 0) {
      this.onPress(popcount(risingEdges));
    }

    // スクラッチ(byte0)はある一方向への一振りを1カウントとする。同じ向きに回し続けている
    // 間(=1回のHIDレポートごとに細かく届く途中経過)は追加でカウントせず、向きが変わるか
    // 一定時間(SCRATCH_IDLE_RESET_MS)動きが止まった後の入力だけを新しい一振りとして数える。
    const scratch = data[0] ?? 0;
    if (this.prevScratch !== null) {
      const delta = wrappedDelta(scratch, this.prevScratch);
      if (delta !== 0) {
        const direction = delta > 0 ? 1 : -1;
        if (direction !== this.scratchDirection) {
          this.scratchDirection = direction;
          this.onScratch(1);
        }
        if (this.scratchIdleTimer) clearTimeout(this.scratchIdleTimer);
        this.scratchIdleTimer = setTimeout(() => this.resetScratchDirection(), SCRATCH_IDLE_RESET_MS);
      }
    }
    this.prevScratch = scratch;
  }

  private handleDisconnect(): void {
    if (!this.device) return;
    try {
      this.device.close();
    } catch {
      // 既に切断されている場合は無視
    }
    this.device = null;
    this.resetScratchDirection();
    this.onConnectionChange(false);
  }

  close(): void {
    this.handleDisconnect();
  }
}
