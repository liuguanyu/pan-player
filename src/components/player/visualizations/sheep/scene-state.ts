import type { SceneState, AudioAnalysis, TimedEffect, BackgroundSheep } from './types';

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const triggerEffect = (effect: TimedEffect, now: number, duration: number) => {
  effect.active = true;
  effect.until = now + duration;
};

const updateTimedEffect = (effect: TimedEffect, now: number) => {
  if (effect.active && now >= effect.until) {
    effect.active = false;
  }
};

const maybeTriggerMinuteChance = (
  now: number,
  lastTrigger: number,
  chancePerMinute: number,
  minimumGapMs: number
): boolean => {
  if (now - lastTrigger < minimumGapMs) {
    return false;
  }
  const framesPerMinute = 60 * 60;
  return Math.random() < chancePerMinute / framesPerMinute;
};

const spawnBirds = (state: SceneState, width: number, height: number) => {
  state.birds = [0, 1, 2].map((index) => ({
    x: width + index * 24,
    y: height * (0.2 + index * 0.015),
    speed: 1.8 + index * 0.35,
    wingPhase: index * 0.8
  }));
};

export const createSceneState = (): SceneState => ({
  initialized: false,
  startTime: 0,
  lastFrameTime: 0,
  beatPulse: 0,
  sheepPulse: 0,
  legPhase: 0,
  tongueValue: 0,
  headNod: 0,
  headSwing: 0,
  bodyTilt: 0,
  bodyBob: 0,
  bodyStretch: 0,
  eyeWide: 0,
  eyelid: 0,
  spinAngle: 0,
  swaggerPhase: 0,
  farSheepKick: 0,
  isNight: false,
  pinkMode: false,
  debugCycle: 0,
  goofyType: 0,
  goofy: { active: false, until: 0 },
  spin: { active: false, until: 0 },
  swagger: { active: false, until: 0 },
  disco: { active: false, until: 0 },
  microphone: { active: false, until: 0 },
  spectrumLamp: { active: false, until: 0 },
  birds: [],
  farSheep: [],
  lastGoofyTrigger: 0,
  lastSpinTrigger: 0,
  lastSwaggerTrigger: 0,
  lastFarHopTrigger: 0,
  lastBirdTrigger: 0,
  lastLampTrigger: 0
});

const initializeScene = (state: SceneState, width: number, height: number, now: number) => {
  if (state.initialized) {
    return;
  }
  state.initialized = true;
  state.startTime = now;
  state.lastFrameTime = now;
  state.birds = [];
  state.farSheep = [
    { x: width * 0.79, y: height * 0.585, scale: 0.34, hopOffset: 0, hopUntil: 0, phase: 0.7 },
    { x: width * 0.93, y: height * 0.582, scale: 0.3, hopOffset: 0, hopUntil: 0, phase: 2.2 }
  ];
};

export const updateSceneState = (
  state: SceneState,
  analysis: AudioAnalysis,
  width: number,
  height: number,
  now: number
) => {
  initializeScene(state, width, height, now);

  const deltaMs = Math.min(50, Math.max(16, now - state.lastFrameTime || 16));
  state.lastFrameTime = now;
  const delta = deltaMs / 16.6667;

  updateTimedEffect(state.goofy, now);
  updateTimedEffect(state.spin, now);
  updateTimedEffect(state.swagger, now);
  updateTimedEffect(state.disco, now);
  updateTimedEffect(state.microphone, now);
  updateTimedEffect(state.spectrumLamp, now);

  const playbackTime = now - state.startTime;
  state.isNight = playbackTime > 5 * 60 * 1000;

  if (!state.disco.active && analysis.peak) {
    triggerEffect(state.disco, now, 5200);
  }

  if (!state.microphone.active && analysis.intensity === 'high' && analysis.trebleEnergy > 0.58) {
    triggerEffect(state.microphone, now, 2600);
  }

  if (!state.spectrumLamp.active && maybeTriggerMinuteChance(now, state.lastLampTrigger, 12, 6000)) {
    state.lastLampTrigger = now;
    triggerEffect(state.spectrumLamp, now, 4200);
  }

  if (!state.goofy.active && maybeTriggerMinuteChance(now, state.lastGoofyTrigger, analysis.intensity === 'high' ? 10 : 5, 7000)) {
    state.lastGoofyTrigger = now;
    state.goofyType = Math.floor(Math.random() * 3);
    triggerEffect(state.goofy, now, 2300);
  }

  if (!state.spin.active && maybeTriggerMinuteChance(now, state.lastSpinTrigger, 3, 10000)) {
    state.lastSpinTrigger = now;
    triggerEffect(state.spin, now, 1500);
  }

  if (!state.swagger.active && maybeTriggerMinuteChance(now, state.lastSwaggerTrigger, 4, 9000)) {
    state.lastSwaggerTrigger = now;
    triggerEffect(state.swagger, now, 2600);
  }

  if (!state.birds.length && !state.isNight && maybeTriggerMinuteChance(now, state.lastBirdTrigger, 16, 5000)) {
    state.lastBirdTrigger = now;
    spawnBirds(state, width, height);
  }

  if (analysis.intensity === 'high' && Math.random() < 0.02) {
    state.farSheep.forEach((sheep, index) => {
      sheep.hopUntil = now + 520 + index * 60;
    });
  } else if (maybeTriggerMinuteChance(now, state.lastFarHopTrigger, 2, 10000)) {
    state.lastFarHopTrigger = now;
    state.farSheep.forEach((sheep, index) => {
      sheep.hopUntil = now + 420 + index * 90;
    });
  }

  state.debugCycle = (state.debugCycle + delta) % 1400;
  state.beatPulse = lerp(state.beatPulse, analysis.beat, 0.18 * delta);
  state.sheepPulse = lerp(
    state.sheepPulse,
    analysis.intensity === 'high' ? 1 : analysis.intensity === 'mid' ? 0.55 : 0.18,
    0.12 * delta
  );

  const legSpeed = analysis.intensity === 'high' ? 0.42 : analysis.intensity === 'mid' ? 0.22 : 0.1;
  state.legPhase += legSpeed * delta;
  state.swaggerPhase += (state.swagger.active ? 0.24 : 0.08) * delta;

  // 垂直弹跳（往上为负值），限制最大幅度
  const baseBob = Math.abs(Math.sin(state.legPhase)) * (analysis.intensity === 'high' ? 10 : analysis.intensity === 'mid' ? 6 : 2);
  state.bodyBob = lerp(state.bodyBob, -baseBob - analysis.bassEnergy * 6, 0.24 * delta);
  // 身体挤压拉伸，限制在很小范围
  state.bodyStretch = lerp(state.bodyStretch, analysis.intensity === 'high' ? 0.04 : analysis.intensity === 'mid' ? 0.02 : 0.005, 0.16 * delta);
  // 头部点头幅度
  state.headNod = lerp(state.headNod, Math.sin(state.legPhase * 1.3) * (analysis.intensity === 'high' ? 6 : analysis.intensity === 'mid' ? 3 : 1), 0.28 * delta);
  // 头部左右摇摆幅度
  state.headSwing = lerp(state.headSwing, Math.sin(state.legPhase * 0.82) * (analysis.trebleEnergy * 8 + 1), 0.2 * delta);
  // bodyTilt 限制在很小范围内，防止翻转
  state.bodyTilt = lerp(state.bodyTilt, Math.sin(state.legPhase * 0.65) * (analysis.intensity === 'high' ? 0.03 : 0.015), 0.18 * delta);

  const goofyActive = state.goofy.active;
  const goofyType = state.goofyType;

  if (goofyActive && goofyType === 0) {
    state.eyeWide = lerp(state.eyeWide, 1, 0.3 * delta);
  } else if (goofyActive && goofyType === 1) {
    state.eyeWide = lerp(state.eyeWide, -0.5, 0.3 * delta);
  } else if (goofyActive && goofyType === 2) {
    state.eyeWide = lerp(state.eyeWide, 0.8, 0.3 * delta);
  } else {
    state.eyeWide = lerp(state.eyeWide, analysis.intensity === 'high' ? 0.6 : 0, 0.2 * delta);
  }

  state.eyelid = lerp(state.eyelid, analysis.intensity === 'low' ? 1 : 0.22, 0.18 * delta);

  let tongueTarget = 0;
  if (goofyActive && (goofyType === 0 || goofyType === 1)) {
    tongueTarget = goofyType === 0 ? 1 : 0.5;
  } else if (state.microphone.active || analysis.intensity === 'high') {
    tongueTarget = 0.8;
  } else if (analysis.intensity === 'mid') {
    tongueTarget = 0.25;
  }
  state.tongueValue = lerp(state.tongueValue, tongueTarget, 0.24 * delta);

  // 旋转彩蛋：小幅度左右摇摆（不会翻转），最大约30度
  if (state.spin.active) {
    const progress = 1 - (state.spin.until - now) / 1500;
    const wobble = Math.sin(progress * Math.PI * 3) * 0.5; // 左右摇摆，最大约30度
    state.spinAngle = wobble;
  } else {
    state.spinAngle = lerp(state.spinAngle, 0, 0.35 * delta);
  }

  state.farSheepKick = lerp(state.farSheepKick, analysis.intensity === 'high' ? 1 : 0, 0.2 * delta);

  state.birds = state.birds
    .map((bird) => ({ ...bird, x: bird.x - bird.speed * delta, wingPhase: bird.wingPhase + 0.18 * delta }))
    .filter((bird) => bird.x > -40);

  state.farSheep.forEach((sheep) => {
    if (sheep.hopUntil > now) {
      const progress = 1 - (sheep.hopUntil - now) / 520;
      sheep.hopOffset = -Math.sin(progress * Math.PI) * (12 + analysis.beat * 8);
    } else {
      sheep.hopOffset = lerp(sheep.hopOffset, 0, 0.24 * delta);
    }
  });
};
