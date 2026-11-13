/**
 * RealPlayer "Annabelle the Sheep" 风格跳舞小羊的 Canvas 2D 移植，
 * 与 pan-music-car-player（Android/Java 版）的 DancingSheepVisualizer 保持同等的细腻程度。
 *
 * 场景：渐变天空、亮绿草地、左侧透视栅栏、像素云；白天偶尔有带均衡器灯的飞艇飞过，
 * 夜晚出现星星、弯月，并会降下迪斯科球在草地上投出光斑，偶尔有 UFO 用绿光照向小羊；
 * 鸟群不时掠过；小猫偶尔来串门，它出现时前景草丛从右侧长出。
 * 小羊侧身朝左，慵懒半闭眼，随节拍点头、轻微起伏、踏步，偶尔吐舌头，并定期更换装扮：
 * 牛仔帽+靴子、礼帽、红帽、墨镜、粉色朋克（粉毛、粉靴、耳环）、粉色蝴蝶结。
 *
 * 昼夜：白天/夜晚各持续 150 秒，之间用 15 秒平滑过渡，绝不跳变。
 * 场景时钟只在播放（有音频）时推进，暂停后整个场景平滑静止。
 */

import { BeatTracker } from './sheep/beat-tracker';

// ---------- 常量 ----------

/** 场景基准高度（逻辑单位），宽度随视图比例扩展。 */
const SCENE_H = 360;

const DAY_SECONDS = 150;
const NIGHT_SECONDS = 150;
const TRANSITION_SECONDS = 15;
const CYCLE_SECONDS = DAY_SECONDS + NIGHT_SECONDS + 2 * TRANSITION_SECONDS;

/** 重力加速度（场景单位/秒²），跳跃按竖直上抛运动计算。 */
const GRAVITY = 540;
/** 大跳最高不超过此高度：慢歌时改为 1 拍腾空。 */
const MAX_JUMP = 90;
const PREP_BEATS = 0.45;
const LAND_SECONDS = 0.16;
/** 两段式腿的长度。 */
const LEG = 54;
const CAT_SECONDS = 40;
const UFO_SECONDS = 9;
/** 采集到显示之间的大致延迟（毫秒）：按预测的未来拍位置摆姿势。 */
const LATENCY_MS = 70;

/** 飞艇侧面的均衡器：频段 × LED 节数，下绿中黄上红，带峰值保持。 */
const EQ_BANDS = 10;
const EQ_SEGS = 7;
const EQ_GREEN: RGB = [56, 249, 62];
const EQ_YELLOW: RGB = [255, 225, 74];
const EQ_RED: RGB = [255, 49, 49];

type RGB = [number, number, number];

const DAY_SKY_TOP: RGB = [140, 150, 255];
const DAY_SKY_BOT: RGB = [10, 30, 240];
const NIGHT_SKY_TOP: RGB = [11, 15, 58];
const NIGHT_SKY_BOT: RGB = [26, 42, 134];
const DAY_GRASS: RGB = [34, 224, 34];
const NIGHT_GRASS: RGB = [17, 154, 17];
const DAY_CLOUD: RGB = [255, 255, 255];
const NIGHT_CLOUD: RGB = [110, 110, 120];

/** 装扮：约一半时间不戴任何装扮，只是"有时候"戴帽子。 */
type Outfit = 'none' | 'cowboy' | 'tophat' | 'redcap' | 'shades' | 'punk' | 'bow';
/** 鬼脸：短暂出现后回到慵懒表情。 */
type Face = 'normal' | 'bigeye' | 'wink' | 'cross' | 'grin' | 'tongue';
/** 舞步：每隔几个节拍随机切换。 */
type Move = 'bob' | 'hop' | 'lunge' | 'crouch' | 'tap';
/** 跳跃阶段：地面 → 蓄力（等待拍点）→ 腾空 → 落地缓冲。 */
type JumpPhase = 'ground' | 'prep' | 'air' | 'land';

// ---------- 状态 ----------

interface CloudState { x: number; y: number; s: number }
interface StarState { x: number; y: number; phase: number }

const S = {
  clock: 0,
  // 音频
  activity: 0,
  bass: 0,
  treble: 0,
  volume: 0,
  prevVolume: 0,
  peakCooldown: 0,
  // 节拍
  beatPos: 0,
  beatConfidence: 0,
  secondsPerBeat: 0.5,
  lastBeat: null as number | null,
  // 姿态（平滑后的实际值）
  bodyLift: 0, bodyShift: 0, bodyTilt: 0, crouch: 0,
  headAngle: 0, headDrop: 0, feetLift: 0, legTap: 0,
  breathe: 0,
  // 跳跃
  jumpPhase: 'ground' as JumpPhase,
  jumpStart: 0,
  jumpAirBeats: 1,
  jumpAirSeconds: 0,
  jumpT: 0,
  jumpLift: 0,
  jumpSquash: 0,
  barsUntilJump: 3,
  // 舞步 / 表情 / 眨眼
  move: 'bob' as Move,
  moveBeats: 8,
  face: 'normal' as Face,
  faceT: 0,
  faceTimer: 6,
  blinkTimer: 3,
  blink: 0,
  // 装扮
  outfit: 'none' as Outfit,
  peace: false,
  outfitTimer: 20,
  // 天空
  stars: [] as StarState[],
  clouds: [
    { x: 0.12, y: 40, s: 1 },
    { x: 0.45, y: 70, s: 0.8 },
    { x: 0.78, y: 30, s: 1.1 },
  ] as CloudState[],
  // 白天飞艇
  blimpX: -1,
  blimpTimer: 25,
  blimpDir: -1,
  lamp: new Array(EQ_BANDS).fill(0),
  lampPeak: new Array(EQ_BANDS).fill(0),
  // 夜晚迪斯科球
  discoT: -1,
  discoTimer: 30,
  spotGlow: 0,
  spots: [] as { x: number; y: number }[],
  // 小猫
  catT: -1,
  catTimer: 40,
  // 鸟群
  birdsX: -1,
  birdsTimer: 15,
  birdsY: 60,
  // UFO
  ufoT: -1,
  ufoTimer: 70,
  // 帧时钟
  last: 0,
};

const beatTracker = new BeatTracker();
const rand = () => Math.random();

// ---------- 工具 ----------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const lerpColor = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const rgb = (c: RGB, alpha = 1) =>
  alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

/** 昼夜程度 0（白天）..1（夜晚），smoothstep 平滑过渡。 */
function nightFactor(clockSeconds: number): number {
  let t = clockSeconds % CYCLE_SECONDS;
  if (t < 0) t += CYCLE_SECONDS;
  if (t < DAY_SECONDS) return 0;
  t -= DAY_SECONDS;
  if (t < TRANSITION_SECONDS) return smooth(t / TRANSITION_SECONDS);
  t -= TRANSITION_SECONDS;
  if (t < NIGHT_SECONDS) return 1;
  t -= NIGHT_SECONDS;
  return 1 - smooth(t / TRANSITION_SECONDS);
}

/** 拍点脉冲：拍点处为 1，拍与拍中间为 0，平滑无跳变。 */
const pulse = (beatPos: number) => {
  const c = Math.cos(Math.PI * beatPos);
  return c * c;
};

function fillOvalRect(ctx: CanvasRenderingContext2D, l: number, t: number, r: number, b: number) {
  ctx.beginPath();
  ctx.ellipse((l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function strokeOvalRect(ctx: CanvasRenderingContext2D, l: number, t: number, r: number, b: number) {
  ctx.beginPath();
  ctx.ellipse((l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D, l: number, t: number, r: number, b: number, rad: number,
) {
  ctx.beginPath();
  const rr = Math.min(rad, (r - l) / 2, (b - t) / 2);
  if (ctx.roundRect) ctx.roundRect(l, t, r - l, b - t, rr);
  else ctx.rect(l, t, r - l, b - t);
  ctx.fill();
}

// ---------- 音频分析 ----------

let spectrumBuf = new Float32Array(0);

interface Analysis {
  hasAudio: boolean;
  bass: number;
  treble: number;
  volume: number;
  peak: boolean;
  spectrum: Float32Array;
}

/** Web getByteFrequencyData（128 bin）→ 频段能量，语义与 Java 版 AudioAnalyzer 一致。 */
function analyze(data: Uint8Array | null): Analysis {
  const n = data ? data.length : 0;
  if (spectrumBuf.length !== n) spectrumBuf = new Float32Array(n);
  for (let i = 0; i < n; i++) spectrumBuf[i] = data![i] / 255;

  const avg = (from: number, to: number) => {
    const end = Math.min(to, n);
    if (end <= from) return 0;
    let sum = 0;
    for (let i = from; i < end; i++) sum += spectrumBuf[i];
    return sum / (end - from);
  };

  const volume = avg(0, n);
  let peak = false;
  if (S.peakCooldown > 0) S.peakCooldown--;
  else if (volume > 0.65 && volume - S.prevVolume > 0.15) {
    peak = true;
    S.peakCooldown = 8;
  }
  S.prevVolume = volume;

  return {
    hasAudio: n > 0 && volume > 0.002,
    bass: avg(0, 6),
    treble: avg(32, n),
    volume,
    peak,
    spectrum: spectrumBuf,
  };
}

// ---------- 场景事件 ----------

function shuffleSpots() {
  for (const s of S.spots) { s.x = rand(); s.y = rand(); }
}

function ensureScene() {
  if (!S.stars.length) {
    for (let i = 0; i < 60; i++) {
      S.stars.push({ x: rand(), y: 8 + rand() * 150, phase: rand() * 6.28 });
    }
  }
  if (!S.spots.length) {
    for (let i = 0; i < 14; i++) S.spots.push({ x: rand(), y: rand() });
  }
}

/** 腾空 n 拍时的最高点（场景单位）。 */
function apexFor(airBeats: number): number {
  const t = airBeats * S.secondsPerBeat;
  return (GRAVITY * t * t) / 8;
}

/** 预约下一拍起跳（当前拍用于下蹲蓄力）。 */
function scheduleJump(big: boolean) {
  let n = big ? 2 : 1;
  if (big && apexFor(2) > MAX_JUMP) n = 1;   // 慢歌：2 拍腾空会飞太高
  if (!big && apexFor(1) < 10) n = 2;        // 快歌：1 拍腾空几乎看不出
  S.jumpStart = (S.lastBeat ?? 0) + 1;
  S.jumpAirBeats = n;
  S.jumpPhase = 'prep';
}

/**
 * 上抛运动：蓄力 → 腾空（恒定重力）→ 落地缓冲。
 * 起跳时机取自拍点；腾空和缓冲按真实时间积分——节拍估计的抖动不会让重力忽大忽小。
 */
function updateJump(dt: number) {
  S.jumpLift = 0;
  let squash = 0;
  switch (S.jumpPhase) {
    case 'prep': {
      const toTakeoff = S.jumpStart - S.beatPos;
      if (S.activity < 0.3) { S.jumpPhase = 'ground'; break; }
      if (toTakeoff <= 0) {
        S.jumpPhase = 'air';
        S.jumpAirSeconds = S.jumpAirBeats * S.secondsPerBeat;
        // 进入腾空时补上已越过拍点的那一小段时间
        S.jumpT = Math.min(-toTakeoff * S.secondsPerBeat, dt);
        // fall through 到 air：本帧已起跳
        const t = S.jumpT;
        if (t >= S.jumpAirSeconds) { S.jumpPhase = 'land'; S.jumpT = 0; break; }
        S.jumpLift = (GRAVITY * t * (S.jumpAirSeconds - t)) / 2;
        squash = Math.max(0, 1 - t / 0.06);
        S.jumpT += dt;
      } else {
        if (toTakeoff < PREP_BEATS) squash = Math.sin((1 - toTakeoff / PREP_BEATS) * Math.PI / 2);
      }
      break;
    }
    case 'air': {
      if (S.jumpT >= S.jumpAirSeconds) {
        S.jumpPhase = 'land';
        S.jumpT = 0;
      } else {
        const t = S.jumpT;
        S.jumpLift = (GRAVITY * t * (S.jumpAirSeconds - t)) / 2;   // h = v0·t − g·t²/2
        squash = Math.max(0, 1 - t / 0.06);                        // 蹬地瞬间释放蓄力
        S.jumpT += dt;
      }
      break;
    }
    case 'land': {
      // 落地缓冲：冲击后迅速压到最低，再弹回站姿
      const v = S.jumpT / LAND_SECONDS;
      if (v >= 1) { S.jumpPhase = 'ground'; break; }
      squash = Math.sin(Math.PI * Math.min(1, v * 1.6 + 0.25)) * (1 - v) * 1.1;
      S.jumpT += dt;
      break;
    }
    default:
      break;
  }
  const scale = S.jumpAirBeats >= 2 ? 1 : 0.6;   // 小跳只轻微屈膝
  S.jumpSquash = Math.max(0, squash) * scale;
}

/** 每个拍点触发一次：小节边界切换舞步，安排跳跃，偶尔在拍点上做鬼脸。 */
function onBeat() {
  const grounded = S.jumpPhase === 'ground';
  if (grounded && S.beatConfidence > 0.5) {
    if (((S.lastBeat ?? 0) % 4 + 4) % 4 === 3 && --S.barsUntilJump <= 0) {
      scheduleJump(true);                        // 大跳：下一小节第一拍起跳
      S.barsUntilJump = 2 + Math.floor(rand() * 4);
    } else if (S.move === 'hop' && ((S.lastBeat ?? 0) % 2 + 2) % 2 === 1) {
      scheduleJump(false);                       // 原地小跳：每两拍一跳
    }
  }
  if (--S.moveBeats <= 0 && ((S.lastBeat ?? 0) % 4 + 4) % 4 === 0) {
    const moves: Move[] = ['bob', 'hop', 'lunge', 'crouch', 'tap'];
    let next: Move;
    do { next = moves[Math.floor(rand() * moves.length)]; } while (next === S.move);
    S.move = next;
    S.moveBeats = rand() < 0.5 ? 4 : 8;
  }
  if (S.faceT <= 0 && S.faceTimer <= 0) {
    const faces: Face[] = ['bigeye', 'wink', 'cross', 'grin', 'tongue'];
    S.face = faces[Math.floor(rand() * faces.length)];
    S.faceT = 1.6 + rand() * 1.2;
    S.faceTimer = 7 + rand() * 9;
  }
}

/**
 * 根据当前舞步和拍位置计算目标姿态并平滑逼近；amp 为 0 时所有姿态回到站立。
 * pulse 每拍一次（拍点=1），alt 每拍换向，sway 四拍一个来回。
 */
function updatePose(amp: number, dt: number) {
  const p = pulse(S.beatPos);
  const alt = Math.cos(Math.PI * S.beatPos);
  const sway = Math.sin((Math.PI * S.beatPos) / 2);
  let tLift = 0, tShift = 0, tTilt = 0, tCrouch = 0, tAngle = 0, tDrop = 0, tFeet = 0, tTap = 0;
  switch (S.move) {
    case 'bob':      // 拍点上大幅低头，身体同时下沉
      tAngle = p * 34 - 6; tDrop = p * 18; tLift = (1 - p) * 8; tCrouch = p * 0.15;
      break;
    case 'hop':      // 原地小跳（腾空由 updateJump 计算），落地时点头
      tAngle = p * 14 - 4; tDrop = p * 6; tTilt = -alt * 3;
      break;
    case 'lunge':    // 偶数拍向前冲、奇数拍后撤，腿斜成一排
      tShift = alt * 26; tTilt = -alt * 6; tAngle = alt * 14 + 6; tDrop = p * 6; tCrouch = 0.12;
      break;
    case 'crouch':   // 拍点上蹲到最低、头点到底
      tCrouch = 0.35 + p * 0.35; tAngle = p * 30; tDrop = p * 14;
      break;
    case 'tap':      // 每拍换脚高抬，身体四拍左右摇一次
      tShift = sway * 14; tTilt = sway * 6; tTap = alt * 18; tAngle = sway * 22 + p * 8; tLift = p * 6;
      break;
  }
  const k = Math.min(1, dt * 20);   // 平滑时间常数约 50ms
  S.bodyLift += (tLift * amp - S.bodyLift) * k;
  S.bodyShift += (tShift * amp - S.bodyShift) * k;
  S.bodyTilt += (tTilt * amp - S.bodyTilt) * k;
  S.crouch += (tCrouch * amp - S.crouch) * k;
  S.headAngle += (tAngle * amp - S.headAngle) * k;
  S.headDrop += (tDrop * amp - S.headDrop) * k;
  S.feetLift += (tFeet * amp - S.feetLift) * k;
  S.legTap += (tTap * amp - S.legTap) * k;
}

/** 把 FFT 幅度按对数频率分成 EQ_BANDS 段（低频在左），快升慢落，峰值帽缓慢下坠。 */
function updateEqualizer(spectrum: Float32Array, activity: number, dt: number) {
  const n = spectrum.length;
  for (let i = 0; i < EQ_BANDS; i++) {
    let target = 0;
    if (n > 1) {
      let from = 1 + Math.floor(Math.pow(n - 1, i / EQ_BANDS)) - 1;
      let to = Math.max(from + 1, Math.floor(Math.pow(n - 1, (i + 1) / EQ_BANDS)));
      from = Math.max(1, from);
      to = Math.min(n, Math.max(from + 1, to));
      let max = 0;
      for (let j = from; j < to; j++) max = Math.max(max, spectrum[j]);
      // 高频能量天然偏小，逐段加权；再做压缩让中等音量也能点亮多节
      const tilt = 1 + i * 0.22;
      target = Math.min(1, Math.sqrt(Math.min(1, max * tilt * 1.6)));
    }
    target *= activity;
    S.lamp[i] += (target - S.lamp[i]) * (target > S.lamp[i] ? 0.6 : 0.18);
    if (S.lamp[i] >= S.lampPeak[i]) S.lampPeak[i] = S.lamp[i];
    else S.lampPeak[i] = Math.max(S.lamp[i], S.lampPeak[i] - dt * 0.6);
  }
}

// ---------- 更新 ----------

function update(data: Uint8Array | null, dtReal: number, nowMs: number) {
  const a = analyze(data);
  const hasAudio = a.hasAudio;

  S.activity += ((hasAudio ? 1 : 0) - S.activity) * Math.min(1, dtReal * (hasAudio ? 6 : 3));
  if (!hasAudio && S.activity < 0.01) S.activity = 0;
  const k = hasAudio ? 0.5 : Math.min(1, dtReal * 6);
  S.bass += (a.bass - S.bass) * k;
  S.treble += (a.treble - S.treble) * k;
  S.volume += (a.volume - S.volume) * k;

  const dt = dtReal * S.activity;   // 场景时间：暂停后平滑静止
  S.clock += dt;

  // 舞蹈：姿态由音乐的拍位置驱动——落拍时点头/落地/下蹲；舞步在小节边界切换。
  const beat = beatTracker.peek(nowMs + LATENCY_MS);
  S.beatPos = beat.position;
  S.beatConfidence = beat.confidence;
  const perSecond = beatTracker.peek(nowMs + LATENCY_MS + 1000).position - S.beatPos;
  if (perSecond > 0.5 && perSecond < 5) S.secondsPerBeat = 1 / perSecond;

  const beatIndex = Math.floor(S.beatPos);
  if (S.lastBeat === null) S.lastBeat = beatIndex;
  else if (beatIndex !== S.lastBeat) {
    S.lastBeat = beatIndex;
    if (S.activity > 0.5) onBeat();
  }

  // 节拍不确定时（安静段落、无鼓点）动作收敛为轻微律动，不乱跳
  const sync = 0.35 + 0.65 * S.beatConfidence;
  updateJump(dtReal);
  updatePose(S.activity * sync * Math.min(1.3, 0.75 + S.bass * 0.9), dtReal);
  S.breathe += (S.volume * S.activity - S.breathe) * Math.min(1, dtReal * 4);

  // 鬼脸：持续约 2 秒后恢复
  if (S.faceT > 0) {
    S.faceT -= dt;
    if (S.faceT <= 0) { S.faceT = 0; S.face = 'normal'; }
  } else {
    S.faceTimer -= dt;
  }

  // 慵懒眨眼
  S.blinkTimer -= dt;
  if (S.blinkTimer <= 0) { S.blink = 1; S.blinkTimer = 2.5 + rand() * 4; }
  S.blink = Math.max(0, S.blink - dtReal * 6);

  // 装扮轮换：大约一半时间不戴任何装扮
  S.outfitTimer -= dt;
  if (S.outfitTimer <= 0) {
    let next: Outfit;
    if (S.outfit !== 'none' && rand() < 0.55) next = 'none';
    else {
      const all: Outfit[] = ['cowboy', 'tophat', 'redcap', 'shades', 'punk', 'bow'];
      do { next = all[Math.floor(rand() * all.length)]; } while (next === S.outfit);
    }
    S.outfit = next;
    S.peace = next === 'shades' || (next === 'none' && rand() < 0.25);
    S.outfitTimer = 18 + rand() * 18;
  }

  const night = nightFactor(S.clock);
  for (const c of S.clouds) {
    c.x += dt * 0.006;
    if (c.x > 1.15) c.x = -0.15;
  }

  // 飞艇：仅白天出现
  updateEqualizer(a.spectrum, S.activity, dtReal);
  if (S.blimpX < 0) {
    S.blimpTimer -= dt;
    if (S.blimpTimer <= 0 && night < 0.2) { S.blimpX = 0; S.blimpDir = rand() < 0.5 ? 1 : -1; }
  } else {
    S.blimpX += dt * 0.025;
    if (S.blimpX > 1) { S.blimpX = -1; S.blimpTimer = 40 + rand() * 30; }
  }

  // 迪斯科球：仅深夜，降下 3s → 停留 20s → 升起 3s
  if (S.discoT < 0) {
    S.discoTimer -= dt;
    if (S.discoTimer <= 0 && night > 0.9) S.discoT = 0;
  } else {
    S.discoT += dt;
    if (S.discoT > 26) { S.discoT = -1; S.discoTimer = 45 + rand() * 30; }
  }
  const discoOn = S.discoT > 3 && S.discoT < 23;
  if (discoOn && a.peak && S.activity > 0.5) { shuffleSpots(); S.spotGlow = 1; }
  S.spotGlow += ((discoOn ? 0.8 + S.bass * 0.2 : 0) * S.activity - S.spotGlow) * Math.min(1, dtReal * 4);

  // 小猫：偶尔坐在草地上一段时间
  if (S.catT < 0) {
    S.catTimer -= dt;
    if (S.catTimer <= 0) S.catT = 0;
  } else {
    S.catT += dt;
    if (S.catT > CAT_SECONDS) { S.catT = -1; S.catTimer = 60 + rand() * 60; }
  }

  // 鸟群
  if (S.birdsX < 0) {
    S.birdsTimer -= dt;
    if (S.birdsTimer <= 0) { S.birdsX = 0; S.birdsY = 40 + rand() * 50; }
  } else {
    S.birdsX += dt * 0.06;
    if (S.birdsX > 1) { S.birdsX = -1; S.birdsTimer = 35 + rand() * 40; }
  }

  // UFO：深夜且没有迪斯科球时
  if (S.ufoT < 0) {
    S.ufoTimer -= dt;
    if (S.ufoTimer <= 0 && night > 0.9 && S.discoT < 0) S.ufoT = 0;
  } else {
    S.ufoT += dt;
    if (S.ufoT > UFO_SECONDS) { S.ufoT = -1; S.ufoTimer = 80 + rand() * 60; }
  }
}

// ---------- 绘制 ----------

function drawNightSky(ctx: CanvasRenderingContext2D, w: number, night: number, skyBot: RGB) {
  for (const s of S.stars) {
    const tw = 0.55 + 0.45 * Math.sin(S.clock * 2.4 + s.phase);
    ctx.fillStyle = `rgba(255,255,230,${255 * night * tw / 255})`;
    const x = s.x * w, y = s.y;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  // 弯月：黄圆减去偏移的天空色圆
  const mx = w * 0.86, my = 46, r = 22;
  ctx.fillStyle = `rgba(255,240,74,${night})`;
  ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgb(lerpColor(skyBot, NIGHT_SKY_TOP, 0.7), night);
  ctx.beginPath(); ctx.arc(mx - 9, my - 4, r * 0.92, 0, Math.PI * 2); ctx.fill();
}

function drawClouds(ctx: CanvasRenderingContext2D, w: number, night: number) {
  ctx.fillStyle = rgb(lerpColor(DAY_CLOUD, NIGHT_CLOUD, night));
  for (const cl of S.clouds) {
    const x = cl.x * w, y = cl.y, s = cl.s;
    ctx.beginPath(); ctx.ellipse(x - 34 * s, y, 34 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 2 * s, y - 5 * s, 18 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 11 * s, y - 3.5 * s, 15 * s, 7.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/** 飞艇：艇身按飞行方向镜像，侧面均衡器始终正向绘制（低频在左）。 */
function drawBlimp(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number) {
  ctx.save();
  if (dir > 0) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }  // 机头朝前进方向
  ctx.fillStyle = '#d8d8d8';
  fillOvalRect(ctx, x - 52, y - 22, x + 52, y + 22);
  ctx.fillStyle = '#bdbdbd';
  fillOvalRect(ctx, x - 48, y + 4, x + 48, y + 21);
  // 尾翼
  ctx.fillStyle = '#c4c4c4';
  ctx.beginPath();
  ctx.moveTo(x + 40, y - 6); ctx.lineTo(x + 66, y - 26); ctx.lineTo(x + 66, y - 4); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 40, y + 6); ctx.lineTo(x + 66, y + 26); ctx.lineTo(x + 66, y + 4); ctx.closePath();
  ctx.fill();
  // 吊舱
  ctx.fillStyle = '#9a9a9a';
  fillRoundRect(ctx, x - 12, y + 21, x + 10, y + 28, 3);
  ctx.restore();

  // 均衡器屏幕（不随镜像翻转）
  const left = x - 36, right = x + 30, top = y - 14, bottom = y + 13;
  ctx.fillStyle = '#101010';
  fillRoundRect(ctx, left - 2, top - 2, right + 2, bottom + 2, 3);
  const bandW = (right - left) / EQ_BANDS, segH = (bottom - top) / EQ_SEGS;
  for (let i = 0; i < EQ_BANDS; i++) {
    const bx = left + i * bandW;
    const lit = Math.round(S.lamp[i] * EQ_SEGS);
    for (let s = 0; s < EQ_SEGS; s++) {
      const color = s >= EQ_SEGS - 1 ? EQ_RED : s >= EQ_SEGS - 3 ? EQ_YELLOW : EQ_GREEN;
      ctx.fillStyle = rgb(color, s < lit ? 1 : 0.15);   // 未点亮的 LED 保留暗格
      const sy = bottom - (s + 1) * segH;
      ctx.fillRect(bx + 0.8, sy + 0.8, bandW - 1.6, segH - 1.6);
    }
    const peak = Math.min(EQ_SEGS - 1, Math.floor(S.lampPeak[i] * EQ_SEGS));
    if (S.lampPeak[i] > 0.02 && peak >= lit) {
      ctx.fillStyle = '#fff';
      const py = bottom - (peak + 1) * segH;
      ctx.fillRect(bx + 0.8, py + segH - 2.2, bandW - 1.6, 1.4);
    }
  }
}

/** 前景草丛：随小猫出现从右侧长到小猫身边，小猫离开时从左侧收回。 */
function drawTufts(ctx: CanvasRenderingContext2D, w: number, h: number, night: number, leftEnd: number) {
  const grow = Math.min(1, S.catT / 2), shrink = Math.min(1, (CAT_SECONDS - S.catT) / 2);
  const from = w - (w - leftEnd) * grow + (w - leftEnd) * (1 - shrink);
  if (from >= w) return;
  ctx.strokeStyle = rgb(lerpColor([20, 180, 20], [10, 112, 10], night));
  ctx.lineWidth = 2;
  const y = h * 0.96;
  ctx.beginPath();
  for (let x = leftEnd; x < w; x += 16) {
    if (x < from) continue;
    ctx.moveTo(x + 8, y - 8);
    ctx.ellipse(x + 8, y, 8, 8, 0, Math.PI, Math.PI * 2);
  }
  ctx.stroke();
}

function drawBirds(ctx: CanvasRenderingContext2D, w: number, night: number) {
  ctx.strokeStyle = rgb(lerpColor([255, 255, 255], [154, 154, 168], night));
  ctx.lineWidth = 1.6;
  const flap = Math.sin(S.clock * 9) * 3;
  const flock = [[0, 0], [26, -10], [44, 6], [70, -4]];
  for (const b of flock) {
    const x = w * (1.05 - S.birdsX * 1.2) + b[0];
    const y = S.birdsY + b[1] + Math.sin(S.clock * 1.3 + b[0]) * 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - flap); ctx.lineTo(x, y); ctx.lineTo(x + 6, y - flap);
    ctx.stroke();
  }
}

function ufoBeaming() { return S.ufoT > 2.5 && S.ufoT < UFO_SECONDS - 2; }

function drawUfo(ctx: CanvasRenderingContext2D, x: number, ground: number) {
  const t = S.ufoT;
  const hover = 34 + Math.sin(S.clock * 3) * 3;
  let y: number;
  if (t < 2.5) y = -30 + (hover + 30) * smooth(t / 2.5);
  else if (t > UFO_SECONDS - 2) y = hover - (hover + 30) * smooth((t - (UFO_SECONDS - 2)) / 2);
  else y = hover;
  if (ufoBeaming()) {
    const a = Math.min(1, Math.min(t - 2.5, UFO_SECONDS - 2 - t) * 2);
    ctx.fillStyle = `rgba(60,230,40,${0.67 * a})`;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 6); ctx.lineTo(x + 7, y + 6);
    ctx.lineTo(x + 34, ground - 70); ctx.lineTo(x - 34, ground - 70);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#b8b8c0';
  fillOvalRect(ctx, x - 22, y - 5, x + 22, y + 7);
  ctx.fillStyle = '#e8e8f0';
  ctx.beginPath();
  ctx.ellipse(x - 0, y - 4, 10, 8, 0, Math.PI, Math.PI * 2);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = (Math.floor(S.clock * 4) + i) % 3 === 0 ? '#7cff5a' : '#3a8a2a';
    ctx.beginPath(); ctx.arc(x - 12 + i * 12, y + 2, 2, 0, Math.PI * 2); ctx.fill();
  }
}

/** 左侧斜向透视栅栏。 */
function drawFence(ctx: CanvasRenderingContext2D, horizon: number, night: number) {
  ctx.strokeStyle = rgb(lerpColor([255, 255, 255], [200, 200, 216], night));
  ctx.lineCap = 'square';
  ctx.lineWidth = 5;
  const x0 = 14, y0 = horizon + 80, x1 = 74, y1 = horizon - 20;
  for (let i = 0; i < 3; i++) {
    const t = i / 2, x = x0 + (x1 - x0) * t, top = y0 + (y1 - y0) * t;
    ctx.beginPath();
    ctx.moveTo(x, top - 6);
    ctx.lineTo(x, top + 52 - 18 * t);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y0 + 4); ctx.lineTo(x1 + 6, y1 - 2);
  ctx.moveTo(x0 - 6, y0 + 24); ctx.lineTo(x1 + 6, y1 + 12);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawDisco(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number) {
  const drop = S.discoT < 3 ? S.discoT / 3 : S.discoT > 23 ? Math.max(0, (26 - S.discoT) / 3) : 1;
  const x = w * 0.42, y = -30 + drop * 80;
  ctx.strokeStyle = '#9a9a9a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - 18); ctx.stroke();
  ctx.fillStyle = '#dcdcdc';
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
  // 镜面小格随时钟闪烁
  for (let i = 0; i < 25; i++) {
    const gx = x - 17 + (i % 5) * 7, gy = y - 17 + Math.floor(i / 5) * 7;
    if (Math.hypot(gx + 2.5 - x, gy + 2.5 - y) > 19) continue;
    const f = 0.5 + 0.5 * Math.sin(S.clock * 6 + i * 1.7);
    ctx.fillStyle = rgb(lerpColor([154, 154, 154], [255, 255, 255], f));
    ctx.fillRect(gx, gy, 5, 5);
  }
  if (S.spotGlow > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, S.spotGlow)})`;
    for (const s of S.spots) {
      const sx = s.x * w, sy = horizon + 20 + s.y * (h - horizon - 30);
      ctx.beginPath(); ctx.ellipse(sx, sy, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const enter = Math.min(1, S.catT / 0.6) * Math.min(1, (15 - S.catT) / 0.6);
  const alpha = Math.max(0, Math.min(1, enter));
  ctx.fillStyle = `rgba(240,138,36,${alpha})`;
  fillOvalRect(ctx, x - 14, y - 26, x + 14, y + 6);
  ctx.beginPath(); ctx.arc(x, y - 32, 11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 38); ctx.lineTo(x - 8, y - 48); ctx.lineTo(x - 2, y - 41);
  ctx.moveTo(x + 10, y - 38); ctx.lineTo(x + 8, y - 48); ctx.lineTo(x + 2, y - 41);
  ctx.fill();
  ctx.fillStyle = `rgba(184,90,16,${alpha})`;
  ctx.fillRect(x - 8, y - 4, 5, 10);
  ctx.fillRect(x + 3, y - 4, 5, 10);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath(); ctx.arc(x - 4, y - 33, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, y - 33, 1.6, 0, Math.PI * 2); ctx.fill();
}

/** 两段式腿：髋到脚距离小于腿长时膝盖弯曲（前腿膝盖朝前、后腿朝后）。 */
function drawLeg(
  ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, front: boolean,
) {
  const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
  const half = LEG / 2;
  ctx.beginPath();
  if (d >= LEG - 0.5 || d < 1) {
    ctx.moveTo(hx, hy); ctx.lineTo(fx, fy);
    ctx.stroke();
    return;
  }
  const bend = Math.sqrt(half * half - (d / 2) * (d / 2));
  let nx = -dy / d, ny = dx / d;   // 垂直方向
  const dir = front ? -1 : 1;
  if (nx * dir < 0) { nx = -nx; ny = -ny; }   // 膝盖朝前（左）或朝后（右）
  const kx = hx + dx / 2 + nx * bend, ky = hy + dy / 2 + ny * bend;
  ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
  ctx.stroke();
}

function drawPeace(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  const r = 10;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
  ctx.moveTo(x, y); ctx.lineTo(x - r * 0.7, y + r * 0.7);
  ctx.moveTo(x, y); ctx.lineTo(x + r * 0.7, y + r * 0.7);
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number) {
  if (S.face === 'grin' && !ufoBeaming()) {
    // 咧嘴笑露出牙齿
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 6, y - 4, 22, 7);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let tx = x - 1; tx < x + 16; tx += 5) { ctx.moveTo(tx, y - 4); ctx.lineTo(tx, y + 3); }
    ctx.moveTo(x - 6, y); ctx.lineTo(x + 16, y);
    ctx.stroke();
  }
  if (S.face === 'tongue' || ufoBeaming()) {
    const out = ufoBeaming() ? 1 : Math.min(1, S.faceT * 4);
    ctx.fillStyle = '#ff7aa0';
    fillRoundRect(ctx, x - 2, y - 2, x + 9, y + 6 + out * 10, 5);
  }
}

function drawFunnyEyes(ctx: CanvasRenderingContext2D, x: number, y: number) {
  switch (S.face) {
    case 'bigeye': {   // 一只眼睛瞪得巨大，另一只照旧慵懒
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 9, y + 1, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 6, y + 2, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 9, y + 1, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      fillOvalRect(ctx, x + 5, y - 6, x + 17, y + 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 4, y - 7, 14, 6);
      ctx.beginPath(); ctx.arc(x + 11, y + 2, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wink': {     // 一只眼闭成弧线
      ctx.fillStyle = '#fff';
      fillOvalRect(ctx, x - 17, y - 8, x - 1, y + 7);
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 9, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(x + 10, y + 1, 7, 5, 0, (200 / 180) * Math.PI, (340 / 180) * Math.PI);
      ctx.stroke();
      break;
    }
    case 'cross': {    // 斗鸡眼
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 9, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 10, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 4, y + 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y + 2, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default:
      break;
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number) {
  if (ufoBeaming()) {
    // 被 UFO 照到：瞪大眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 9, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 11, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x - 9, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 11, y, 3, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const funny = S.face === 'bigeye' || S.face === 'wink' || S.face === 'cross';
  if (S.outfit !== 'shades' && S.outfit !== 'punk' && funny) {
    drawFunnyEyes(ctx, x, y);
    return;
  }
  if (S.outfit === 'shades' || S.outfit === 'punk') {
    ctx.fillStyle = '#8a8a8a';
    fillRoundRect(ctx, x - 18, y - 6, x - 2, y + 7, 4);
    fillRoundRect(ctx, x + 2, y - 6, x + 18, y + 7, 4);
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + 2, y - 2); ctx.stroke();
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(x - 15, y - 4, 4, 3);
    ctx.fillRect(x + 5, y - 4, 4, 3);
    return;
  }
  ctx.fillStyle = '#fff';
  fillOvalRect(ctx, x - 17, y - 7, x - 3, y + 6);
  fillOvalRect(ctx, x + 3, y - 7, x + 17, y + 6);
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(x - 9, y + 2, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 11, y + 2, 2.4, 0, Math.PI * 2); ctx.fill();
  // 慵懒的半闭眼皮 + 眨眼
  const lid = 0.45 + S.blink * 0.55;
  ctx.fillRect(x - 18, y - 8, 16, 14 * lid);
  ctx.fillRect(x + 2, y - 8, 16, 14 * lid);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 17, y - 8 + 14 * lid); ctx.lineTo(x - 3, y - 8 + 14 * lid);
  ctx.moveTo(x + 3, y - 8 + 14 * lid); ctx.lineTo(x + 17, y - 8 + 14 * lid);
  ctx.stroke();
}

function drawHat(ctx: CanvasRenderingContext2D, x: number, y: number) {
  switch (S.outfit) {
    case 'cowboy':
      ctx.fillStyle = '#8b4a1c';
      fillRoundRect(ctx, x - 16, y - 22, x + 18, y + 2, 8);
      fillOvalRect(ctx, x - 36, y - 4, x + 38, y + 6);
      ctx.fillStyle = '#5e3010';
      ctx.fillRect(x - 16, y - 6, 34, 4);
      break;
    case 'tophat':
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 13, y - 34, 28, 34);
      fillOvalRect(ctx, x - 26, y - 4, x + 28, y + 4);
      ctx.fillStyle = '#444444';
      ctx.fillRect(x - 13, y - 8, 28, 4);
      break;
    case 'punk': {
      // 粉色莫西干 + 金色耳环
      ctx.fillStyle = '#ff3aa8';
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 4); ctx.lineTo(x - 6, y - 16); ctx.lineTo(x - 1, y + 2);
      ctx.lineTo(x + 3, y - 20); ctx.lineTo(x + 7, y + 2); ctx.lineTo(x + 12, y - 14);
      ctx.lineTo(x + 14, y + 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x - 30, y + 20, 4, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'bow':
      ctx.fillStyle = '#ff8ac8';
      ctx.beginPath();
      ctx.moveTo(x, y + 2); ctx.lineTo(x - 14, y - 8); ctx.lineTo(x - 14, y + 12);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y + 2); ctx.lineTo(x + 14, y - 8); ctx.lineTo(x + 14, y + 12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e04a9a';
      ctx.beginPath(); ctx.arc(x, y + 2, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'redcap':
      ctx.fillStyle = '#e0222a';
      ctx.beginPath();
      ctx.ellipse(x, y, 20, 14, 0, Math.PI, Math.PI * 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a8141a';
      fillOvalRect(ctx, x - 38, y - 3, x - 6, y + 4);
      break;
    default:
      break;
  }
}

function drawSheep(ctx: CanvasRenderingContext2D, cx: number, ground: number) {
  const rx = 62 * (1 + S.breathe * 0.04), ry = 38;
  const baseX = cx + 24;
  const bx = baseX + S.bodyShift;
  const by = ground - 74 - S.bodyLift - S.jumpLift + (S.crouch + S.jumpSquash * 0.5) * 30;

  // 腿：脚掌落地点固定（跳起时整体离地），髋部随身体移动 → 前冲时腿斜、下蹲时屈膝
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const legX = [-36, -20, 30, 46];
  const hipY = by + ry * 0.55;
  const tilt = (S.bodyTilt * Math.PI) / 180;
  for (let i = 0; i < 4; i++) {
    const hipX = bx + legX[i] * Math.cos(tilt);
    const hy = hipY - legX[i] * Math.sin(tilt);
    const tap = (i === 0 || i === 3) ? Math.max(0, S.legTap) : Math.max(0, -S.legTap);
    const footX = baseX + legX[i] + (S.feetLift > 1 ? S.bodyShift : 0) - tap * 0.4;
    // 腾空时脚掌比髋部上升得少一些 → 收腿；落地瞬间脚掌正好回到地面
    const footY = ground - S.feetLift - tap - S.jumpLift * 0.82;
    drawLeg(ctx, hipX, hy, footX, footY, i < 2);
    if (S.outfit === 'cowboy' || S.outfit === 'punk') {
      ctx.fillStyle = S.outfit === 'punk' ? '#e0308a' : '#8b4a1c';
      ctx.fillRect(footX - 4, footY - 9, 10, 10);
      ctx.fillStyle = '#000';
    }
  }
  ctx.lineCap = 'butt';

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate((S.bodyTilt * Math.PI) / 180);
  ctx.translate(-bx, -by);

  // 羊毛：扇贝描边 + 填充
  const n = 22;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(bx + Math.cos(ang) * rx, by + Math.sin(ang) * ry, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = S.outfit === 'punk' ? '#ff8cf0' : '#fff';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(bx + Math.cos(ang) * rx, by + Math.sin(ang) * ry, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  fillOvalRect(ctx, bx - rx, by - ry, bx + rx, by + ry);
  if (S.peace) drawPeace(ctx, bx + 26, by - 4);

  // 头：绕脖子大幅甩动
  const neckX = bx - rx + 24, neckY = by - 20;
  const hx = bx - rx + 4, hy = by - 16 + S.headDrop;
  ctx.save();
  ctx.translate(neckX, neckY);
  ctx.rotate(((4 - S.headAngle) * Math.PI) / 180);   // headAngle 为正 → 低头
  ctx.translate(-neckX, -neckY);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy - 18);
  ctx.quadraticCurveTo(hx + 44, hy - 14, hx + 40, hy + 18);
  ctx.quadraticCurveTo(hx + 30, hy + 4, hx + 8, hy - 6);
  ctx.closePath();
  ctx.fill();
  fillOvalRect(ctx, hx - 30, hy - 24, hx + 24, hy + 22);
  fillOvalRect(ctx, hx - 40, hy - 6, hx - 6, hy + 26);
  drawMouth(ctx, hx - 24, hy + 14);
  drawEyes(ctx, hx - 10, hy - 6);
  drawHat(ctx, hx - 4, hy - 22);
  ctx.restore();

  ctx.restore();
}

function render(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (width <= 0 || height <= 0) return;
  // 等比缩放：按高度适配，宽度方向扩展场景；很窄时按宽度适配。
  const scale = Math.min(height / SCENE_H, width / 360);
  const w = width / scale, h = height / scale;
  ctx.save();
  ctx.scale(scale, scale);

  const night = nightFactor(S.clock);
  const horizon = h * 0.5, ground = h * 0.86;
  const skyBot = lerpColor(DAY_SKY_BOT, NIGHT_SKY_BOT, night);

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, rgb(lerpColor(DAY_SKY_TOP, NIGHT_SKY_TOP, night)));
  sky.addColorStop(1, rgb(skyBot));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  if (night > 0) drawNightSky(ctx, w, night, skyBot);
  drawClouds(ctx, w, night);
  if (S.blimpX >= 0) {
    // 进出画面各留 70 单位，保证整艇完全飞出后才消失
    const span = w + 140;
    const bx = S.blimpDir < 0 ? w + 70 - S.blimpX * span : -70 + S.blimpX * span;
    drawBlimp(ctx, bx, 50, S.blimpDir > 0 ? 1 : -1);
  }

  ctx.fillStyle = rgb(lerpColor(DAY_GRASS, NIGHT_GRASS, night));
  ctx.fillRect(0, horizon, w, h - horizon);
  if (S.birdsX >= 0) drawBirds(ctx, w, night);
  drawFence(ctx, horizon, night);

  if (S.discoT >= 0) drawDisco(ctx, w, h, horizon);
  if (S.catT >= 0) {
    const catX = w * 0.5 - 190;
    drawTufts(ctx, w, h, night, catX + 18);
    drawCat(ctx, catX, h * 0.96);
  }
  if (S.ufoT >= 0) drawUfo(ctx, w * 0.5 + 30, ground);
  drawSheep(ctx, w * 0.5, ground);

  ctx.restore();
}

// ---------- 导出 ----------

export const resetDancingSheep = () => {
  beatTracker.reset();
  S.clock = 0;
  S.activity = S.bass = S.treble = S.volume = 0;
  S.prevVolume = 0;
  S.peakCooldown = 0;
  S.beatPos = 0;
  S.beatConfidence = 0;
  S.secondsPerBeat = 0.5;
  S.lastBeat = null;
  S.bodyLift = S.bodyShift = S.bodyTilt = S.crouch = 0;
  S.headAngle = S.headDrop = S.feetLift = S.legTap = 0;
  S.breathe = 0;
  S.jumpPhase = 'ground';
  S.jumpStart = 0;
  S.jumpAirBeats = 1;
  S.jumpAirSeconds = 0;
  S.jumpT = 0;
  S.jumpLift = S.jumpSquash = 0;
  S.barsUntilJump = 3;
  S.move = 'bob';
  S.moveBeats = 8;
  S.face = 'normal';
  S.faceT = 0;
  S.faceTimer = 6;
  S.blinkTimer = 3;
  S.blink = 0;
  S.outfit = 'none';
  S.peace = false;
  S.outfitTimer = 20;
  S.blimpX = -1;
  S.blimpTimer = 25;
  S.blimpDir = -1;
  S.lamp.fill(0);
  S.lampPeak.fill(0);
  S.discoT = -1;
  S.discoTimer = 30;
  S.spotGlow = 0;
  S.catT = -1;
  S.catTimer = 40;
  S.birdsX = -1;
  S.birdsTimer = 15;
  S.birdsY = 60;
  S.ufoT = -1;
  S.ufoTimer = 70;
  S.last = 0;
};

export const drawDancingSheep = (
  ctx: CanvasRenderingContext2D,
  data: Uint8Array | null,
  width: number,
  height: number,
) => {
  ensureScene();
  const now = performance.now();
  const dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 1 / 60;
  S.last = now;
  update(data, dt, now);
  render(ctx, width, height);
};

/** 测试辅助：强制场景时钟与事件（与 Java 版 setClockForTest/triggerForTest 对应）。 */
export const sheepDebug = {
  setClock(seconds: number) { S.clock = seconds; },
  setOutfit(o: Outfit) { S.outfit = o; S.peace = o === 'shades'; S.outfitTimer = 999; },
  setFace(f: Face) { S.face = f; S.faceT = f === 'normal' ? 0 : 999; S.faceTimer = 999; },
  trigger(event: 'cat' | 'ufo' | 'disco' | 'birds' | 'blimp') {
    switch (event) {
      case 'cat': S.catT = 8; break;
      case 'ufo': S.ufoT = 4; S.discoT = -1; break;
      case 'disco': S.discoT = 10; S.ufoT = -1; break;
      case 'birds': S.birdsX = 0.4; break;
      case 'blimp': S.blimpX = 0.3; break;
    }
  },
};
