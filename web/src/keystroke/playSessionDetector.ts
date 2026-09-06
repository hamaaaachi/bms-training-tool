// 打鍵数(またはスクラッチ回数)の累計が閾値(threshold)に達し、かつそこから一定時間
// (IDLE_GAP_MS)入力が途切れたら「1曲分プレイし終わった」とみなし、次の選曲(レベル自動調整)
// をトリガーする。
// 時間・無音区間だけの判定だと、Satellite sl0のようにノーツ数が少なく短時間で終わる譜面では
// 「プレイ中」と判定される前に曲が終わってしまい、一度も発火しないことがあった
// (2026-09-06にユーザー指示)。逆に打鍵数だけで判定すると、曲の途中でいきなり発火してしまい
// 不自然なため、閾値到達後に実際に手が止まった(曲が終わった)タイミングを無音区間検知で
// 待ってから発火する(2026-09-06にユーザー指示で追加)。
// 閾値は固定値ではなく、実際のライブラリのSatellite表掲載曲の最小ノーツ数をmain.ts側で計算して
// setThreshold()で渡す(「一番ノーツ数が少ない曲でも必ず発火する」ため。2026-09-06にユーザー指示)。
// Scramble(スクラッチ)トラック選択中は、鍵盤の打鍵数ではなくスクラッチ回数で判定する方が
// 自然なため、判定に使う指標(metric)を切り替えられるようにしている
// (2026-09-06にユーザー指示。閾値はScramble難易度表のSB-1掲載曲の最小スクラッチ数)。
// IDLE_GAP_MSが短すぎると、譜面中盤の無音区間(イントロ・ブレイク等)を曲終わりと誤検知して
// 1曲で2回レベルが上がってしまうことがあった。20秒→10秒と調整したが、閾値到達後の
// キャンセルにCANCEL_THRESHOLD回分の打鍵を要求するようになった(下記)ことで誤検知の
// リスクが下がったため、テンポよく次に進めるよう6秒に短縮した(2026-09-06にユーザー指示)。
const DEFAULT_THRESHOLD = 1000; // ライブラリ未読み込み時などのフォールバック値
const DEFAULT_SCRATCH_THRESHOLD = 20; // 同上(スクラッチ用)
const IDLE_GAP_MS = 6_000; // 閾値到達後、この時間入力が無ければ「曲が終わった」とみなす
const COUNTDOWN_WINDOW_MS = 3_000; // 発火する直前この時間だけカウントダウンを表示する
const CHECK_INTERVAL_MS = 1_000;
// 閾値到達後(=カウントダウン中)に1回でも押すと待機が丸ごとリセットされてしまうと、
// 選曲画面での誤操作等ですぐキャンセルされてしまうため、まとまった打鍵(既定15回分)が
// 入ってきたときだけ「まだ演奏が続いている」と判断してリセットする(2026-09-06にユーザー指示)。
const CANCEL_THRESHOLD = 15;

export type SessionMetric = 'notes' | 'scratch';

interface MetricState {
  count: number;
  lastInputTime: number;
  threshold: number;
  cancelVotes: number; // 閾値到達後に入ってきた、待機キャンセル用の打鍵の積算
}

function createState(defaultThreshold: number): MetricState {
  return { count: 0, lastInputTime: 0, threshold: defaultThreshold, cancelVotes: 0 };
}

export class PlaySessionDetector {
  private metric: SessionMetric = 'notes';
  private notesState = createState(DEFAULT_THRESHOLD);
  private scratchState = createState(DEFAULT_SCRATCH_THRESHOLD);
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCountdown: number | null = null;

  constructor(
    private onSongFinished: () => void,
    private onCountdown?: (secondsLeft: number | null) => void
  ) {}

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

  // 現在選択中のトラックに応じて、判定に使う指標を切り替える。
  setMetric(metric: SessionMetric): void {
    this.metric = metric;
    this.setCountdown(null); // トラック切替時は表示中のカウントダウンをクリアする
  }

  // ライブラリ読み込み(プレイヤー切替時など)のたびに呼び直す。0以下や不正値は無視する。
  setThreshold(notes: number): void {
    if (Number.isFinite(notes) && notes > 0) {
      this.notesState.threshold = Math.floor(notes);
    }
  }

  setScratchThreshold(count: number): void {
    if (Number.isFinite(count) && count > 0) {
      this.scratchState.threshold = Math.floor(count);
    }
  }

  // countは今回の入力で押された鍵盤の数(同時押しなら2以上)。スクラッチ・追加ボタンは
  // 呼び出し側(main.ts)で除外済みの値を渡すこと。
  recordPress(count: number): void {
    this.applyInput(this.notesState, count);
  }

  // countは今回のスクラッチ回転量(ティック数)。
  recordScratch(count: number): void {
    this.applyInput(this.scratchState, count);
  }

  private applyInput(state: MetricState, delta: number): void {
    state.count += delta;
    if (state.count < state.threshold) {
      // まだ閾値未到達(=曲を演奏中)。通常通り入力のたびに無音タイマーを更新する。
      state.lastInputTime = Date.now();
      state.cancelVotes = 0;
      return;
    }
    // 閾値到達後(=無音区間の計測中)。1回の打鍵では待機をキャンセルせず、
    // CANCEL_THRESHOLD回分まとまって入ってきたときだけ「まだ演奏が続いている」と
    // 判断して無音タイマーをリセットする。
    state.cancelVotes += delta;
    if (state.cancelVotes >= CANCEL_THRESHOLD) {
      state.lastInputTime = Date.now();
      state.cancelVotes = 0;
    }
  }

  private setCountdown(secondsLeft: number | null): void {
    if (this.lastCountdown === secondsLeft) return;
    this.lastCountdown = secondsLeft;
    this.onCountdown?.(secondsLeft);
  }

  private checkIdle(): void {
    const state = this.metric === 'scratch' ? this.scratchState : this.notesState;
    if (state.count < state.threshold || state.lastInputTime === 0) {
      this.setCountdown(null);
      return;
    }
    const remaining = IDLE_GAP_MS - (Date.now() - state.lastInputTime);
    if (remaining > COUNTDOWN_WINDOW_MS) {
      this.setCountdown(null);
      return;
    }
    if (remaining > 0) {
      // 発火直前(既定3秒)だけ「3, 2, 1」のようなカウントダウンを見せる
      // (最初から見えると煩わしいため。2026-09-06にユーザー指示)。
      this.setCountdown(Math.ceil(remaining / 1000));
      return;
    }
    // 閾値分だけ引いて余りを持ち越す方式だと、実際の曲は基準となる最小曲よりノーツが
    // ずっと多いことがほとんどのため、余りが選曲画面での数回の鍵盤操作と合わさって
    // すぐ次の閾値を満たしてしまい、1曲で2回レベルが上がることがあった
    // (2026-09-06にユーザー指摘)。次に必ずフルの閾値分の新しい入力を要求するため、
    // 余りを持ち越さず完全にリセットする。
    state.count = 0;
    state.lastInputTime = 0; // 次に入力が来るまでは再発火しない
    state.cancelVotes = 0;
    this.setCountdown(null);
    this.onSongFinished();
  }
}
