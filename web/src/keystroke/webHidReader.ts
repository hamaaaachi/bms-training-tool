// BMSコントローラーのWebHID版リーダー。複数機種のプロファイルを登録しておき、
// 接続されている方を自動判定する(2026-09-06にユーザー指示: PHOENIXWANとINFINITAS
// コントローラーのどちらでも自動認識できるようにする)。
// WebHIDは初回のデバイス選択にユーザー操作(クリック)が必須で、勝手には繋がらない。
// 一度許可されたデバイスはnavigator.hid.getDevices()で(ユーザー操作なしに)再取得できるため、
// 2回目以降の訪問では自動再接続できる。
// ハードウェア接続の実機確認はブラウザ環境が必要なため未検証(2026-09-06にユーザーに依頼予定)。

interface HidReportShape {
  // 鍵盤の押下状態を表すビット列(bit0-6が鍵盤7つ、同時押しはビットが複数立つ)。
  keyBits: number;
  // 連続回転式スクラッチの現在値(0-255等、機種依存の8bit値)。無ければnull
  // (INFINITASコントローラーがどう報告するか未確認のため、機種ごとに異なる可能性がある)。
  scratch: number | null;
}

interface HidControllerProfile {
  name: string;
  vendorId: number;
  productId: number;
  usagePage: number;
  usage: number;
  parseReport: (data: DataView) => HidReportShape;
}

// 実機のHIDレポートを解析して特定した値(2026-09-05にキャプチャして確認済み)。
// VID/PIDは`HKLM\SYSTEM\CurrentControlSet\Control\MediaProperties\PrivateProperties\
// Joystick\OEM`に"Controller INF&BMS"として登録されている。レポートは5バイトで、
// byte0=スクラッチ(連続回転する8bitエンコーダ)、byte1・byte4=常に0、byte2=鍵盤7つ
// (bit0-6)、byte3=追加ボタン4つ(bit0-3、Start/Select等、打鍵数には含めない)。
//
// このVID(0x1ccf)/PID(0x8048)の組み合わせは、beatmania IIDX INFINITASが要求する
// 正規ライセンスコントローラーの識別子(いわゆる「プレミアムモデル」系)と同一であることが
// 2026-09-06のWeb検索で判明した。INFINITAS対応をうたう市販・自作コントローラーの多くは、
// INFINITASクライアントに認識させるためこのVID/PIDを名乗る設計になっているとみられ、
// PHOENIXWANもその一つと考えられる。
const IIDX_LICENSED_VENDOR_ID = 0x1ccf;

const PHOENIXWAN_PROFILE: HidControllerProfile = {
  name: 'PHOENIXWAN',
  vendorId: IIDX_LICENSED_VENDOR_ID,
  productId: 0x8048, // 通称「プレミアムモデル」系のライセンスID
  usagePage: 0x01, // Generic Desktop Page
  usage: 0x04, // Joystick
  parseReport: (data) => ({
    keyBits: (data.getUint8(2) ?? 0) & 0x7f,
    scratch: data.getUint8(0) ?? 0,
  }),
};

// INFINITASの「エントリーモデル」系ライセンスID(PID: 0x1018、VIDはプレミアムモデルと
// 同じ)も2026-09-06のWeb検索で確認できた。ただしレポートのバイト配置(スクラッチ/鍵盤の
// 位置)は実機未確認のため、ひとまずPHOENIXWANと同じ形式と仮定している。もし正しく
// 読み取れない場合はここを実機キャプチャで補正する必要がある
// (2026-09-06にユーザーから追加依頼、ただし手元に実機が無いため未検証)。
const IIDX_ENTRY_MODEL_PROFILE: HidControllerProfile = {
  name: 'INFINITASコントローラー',
  vendorId: IIDX_LICENSED_VENDOR_ID,
  productId: 0x1018,
  usagePage: 0x01,
  usage: 0x04,
  parseReport: PHOENIXWAN_PROFILE.parseReport,
};

const KNOWN_PROFILES: HidControllerProfile[] = [PHOENIXWAN_PROFILE, IIDX_ENTRY_MODEL_PROFILE];

function popcount(n: number): number {
  let count = 0;
  let v = n;
  while (v) {
    count += v & 1;
    v >>= 1;
  }
  return count;
}

function wrappedDelta(current: number, previous: number): number {
  let delta = (current - previous + 256) % 256;
  if (delta > 128) delta -= 256;
  return delta;
}

const SCRATCH_IDLE_RESET_MS = 150;

export class ControllerWebHidReader {
  private device: HIDDevice | null = null;
  private profile: HidControllerProfile | null = null;
  private prevBits = 0;
  private prevScratch: number | null = null;
  private scratchDirection = 0;
  private scratchIdleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private onPress: (count: number) => void,
    private onScratch: (count: number) => void,
    private onConnectionChange: (connected: boolean, deviceName: string | null) => void
  ) {}

  isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  static isSupported(): boolean {
    return 'hid' in navigator;
  }

  private findMatchingProfile(device: HIDDevice): HidControllerProfile | undefined {
    return KNOWN_PROFILES.find(
      (p) =>
        p.vendorId === device.vendorId &&
        p.productId === device.productId &&
        device.collections.some((c) => c.usagePage === p.usagePage && c.usage === p.usage)
    );
  }

  // 過去に許可済みのデバイスがあれば、ユーザー操作なしで自動的に再接続を試みる。
  async tryReconnectSilently(): Promise<void> {
    if (this.device) return;
    if (!ControllerWebHidReader.isSupported()) return;
    const devices = await navigator.hid.getDevices();
    for (const device of devices) {
      const profile = this.findMatchingProfile(device);
      if (profile) {
        await this.open(device, profile);
        return;
      }
    }
  }

  // ユーザーのクリック操作から呼ぶこと(WebHIDの仕様上、requestDeviceはユーザー操作
  // ハンドラ内からしか呼べない)。登録済みの全プロファイルをまとめてフィルタに渡し、
  // 接続されている方を自動認識する。
  async requestAndConnect(): Promise<boolean> {
    if (!ControllerWebHidReader.isSupported()) return false;
    if (this.device) return true;
    let devices: HIDDevice[];
    try {
      devices = await navigator.hid.requestDevice({
        filters: KNOWN_PROFILES.map((p) => ({
          vendorId: p.vendorId,
          productId: p.productId,
          usagePage: p.usagePage,
          usage: p.usage,
        })),
      });
    } catch {
      return false; // ユーザーがキャンセルした等
    }
    for (const device of devices) {
      const profile = this.findMatchingProfile(device);
      if (profile) {
        await this.open(device, profile);
        return this.isConnected();
      }
    }
    return false;
  }

  private async open(device: HIDDevice, profile: HidControllerProfile): Promise<void> {
    try {
      if (!device.opened) await device.open();
      this.device = device;
      this.profile = profile;
      this.prevBits = 0;
      this.prevScratch = null;
      device.oninputreport = (event: HIDInputReportEvent) => this.handleReport(event.data);
      this.onConnectionChange(true, profile.name);
    } catch {
      this.device = null;
      this.profile = null;
    }
  }

  private handleReport(data: DataView): void {
    if (!this.profile) return;
    const { keyBits, scratch } = this.profile.parseReport(data);

    const bits = keyBits & 0x7f;
    const risingEdges = bits & ~this.prevBits;
    this.prevBits = bits;
    if (risingEdges !== 0) {
      this.onPress(popcount(risingEdges));
    }

    if (scratch === null) return;
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

  private resetScratchDirection(): void {
    if (this.scratchIdleTimer) clearTimeout(this.scratchIdleTimer);
    this.scratchIdleTimer = null;
    this.scratchDirection = 0;
  }

  async close(): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.close();
    } catch {
      // 既に切断されている場合は無視
    }
    this.device = null;
    this.profile = null;
    this.resetScratchDirection();
    this.onConnectionChange(false, null);
  }
}
