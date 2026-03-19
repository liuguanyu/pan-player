import { COLORS, type SceneState } from './types';
import { createGradient, fillPixelRect } from './draw-utils';

export const drawSheepBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState
) => {
  const skyGradient = state.isNight
    ? createGradient(ctx, width, height * 0.6, COLORS.skyTopNight, COLORS.skyBottomNight)
    : createGradient(ctx, width, height * 0.6, COLORS.skyTopDay, COLORS.skyBottomDay);

  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height * 0.6);
  fillPixelRect(ctx, 0, height * 0.6, width, height * 0.4, COLORS.grass);
};
