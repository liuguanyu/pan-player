import { analyzeSheepAudio } from './sheep/audio-analyzer';
import { createSceneState, updateSceneState } from './sheep/scene-state';
import { setPixelMode } from './sheep/draw-utils';
import { drawSheepBackground } from './sheep/draw-background';
import {
  drawClouds,
  drawBirds,
  drawStars,
  drawMoon,
  drawFence
} from './sheep/draw-decorations';
import { drawDiscoBall, drawSpectrumLamp } from './sheep/draw-effects';
import { drawFarSheep } from './sheep/draw-far-sheep';
import { drawMainSheep } from './sheep/draw-sheep';

const globalSceneState = createSceneState();

export const togglePinkMode2 = () => {
  globalSceneState.pinkMode = !globalSceneState.pinkMode;
};

export const drawDancingSheep2 = (
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number
) => {
  const now = performance.now();

  const analysis = analyzeSheepAudio(data);
  updateSceneState(globalSceneState, analysis, width, height, now);

  ctx.clearRect(0, 0, width, height);
  setPixelMode(ctx);

  drawSheepBackground(ctx, width, height, globalSceneState);

  if (globalSceneState.isNight) {
    drawStars(ctx, width, height);
    drawMoon(ctx, width, height);
  } else {
    drawClouds(ctx, width, height, globalSceneState);
    drawBirds(ctx, globalSceneState);
  }

  if (globalSceneState.disco.active) {
    drawDiscoBall(ctx, width, height, analysis.beat);
  }
  if (globalSceneState.spectrumLamp.active) {
    drawSpectrumLamp(ctx, width * 0.1, height * 0.2, width / 640, analysis);
  }
  drawFence(ctx, width, height);

  globalSceneState.farSheep.forEach((sheep) => {
    drawFarSheep(ctx, sheep, globalSceneState.pinkMode);
  });

  drawMainSheep(ctx, width, height, analysis, globalSceneState);
};