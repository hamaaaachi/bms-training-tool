// 打鍵数の累計が閾値(threshold)に達し、かつそこから一定時間(IDLE_GAP_MS)打鍵が途切れたら
// 「1曲分プレイし終わった」とみなし、次の選曲(レベル自動調整)をトリガーする。
// 時間・無音区間だけの判定だと、Satellite sl0のようにノーツ数が少なく短時間で終わる譜面では
// 「プレイ中」と判定される前に曲が終わってしまい、一度も発火しないことがあった
// (2026-09-06にユーザー指示)。逆に打鍵数だけで判定すると、曲の途中でいきなり発火してしまい
// 不自然なため、閾値到達後に実際に手が止まった(曲が終わった)タイミングを無音区間検知で
// 待ってから発火する(2026-09-06にユーザー指示で追加)。
// 閾値は固定値ではなく、実際のライブラリのSatellite表掲載曲の最小ノーツ数をmain.ts側で計算して
// setThreshold()で渡す(「一番ノーツ数が少ない曲でも必ず発火する」ため。2026-09-06にユーザー指示)。
const DEFAULT_THRESHOLD = 1000; // ライブラリ未読み込み時などのフォールバック値
const IDLE_GAP_MS = 6_000; // 閾値到達後、この時間打鍵が無ければ「曲が終わった」とみなす
const CHECK_INTERVAL_MS = 1_000;

export class PlaySessionDetector {
  private noteCount = 0;
  private lastPressTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private threshold = DEFAULT_THRESHOLD;

  constructor(private onSongFinished: () => void) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkIdle(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ライブラリ読み込み(プレイヤー切替時など)のたびに呼び直す。0以下や不正値は無視する。
  setThreshold(notes: number): void {
    if (Number.isFinite(notes) && notes > 0) {
      this.threshold = Math.floor(notes);
    }
  }

  // countは今回の入力で押された鍵盤の数(同時押しなら2以上)。スクラッチ・追加ボタンは
  // 呼び出し側(main.ts)で除外済みの値を渡すこと。
  recordPress(count: number): void {
    this.noteCount += count;
    this.lastPressTime = Date.now();
  }

  private checkIdle(): void {
    if (this.noteCount < this.threshold) return;
    if (this.lastPressTime === 0) return; // 前回の発火後、まだ新しい入力が無い
    if (Date.now() - this.lastPressTime < IDLE_GAP_MS) return;
    this.noteCount -= this.threshold;
    this.lastPressTime = 0; // 次に打鍵が来るまでは再発火しない
    this.onSongFinished();
  }
}
