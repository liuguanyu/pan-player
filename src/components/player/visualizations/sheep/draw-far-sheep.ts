import { COLORS, type BackgroundSheep } from './types';
import { fillPixelRect, strokePixelLine } from './draw-utils';

/** 远处小羊绘制 — 简化版轮廓 */
export const drawFarSheep = (
  ctx: CanvasRenderingContext2D,
  sheep: BackgroundSheep,
  pinkMode: boolean
) => {
  const wool = pinkMode ? COLORS.sheepWoolPink : COLORS.sheepWool;
  const leg = pinkMode ? COLORS.sheepWoolPink : COLORS.sheepHead;
  const x = sheep.x;
  const y = sheep.y + sheep.hopOffset;
  const s = sheep.scale;

  // 身体
  fillPixelRect(ctx, x - 20 * s, y - 10 * s, 28 * s, 18 * s, wool);
  // 头部
  fillPixelRect(ctx, x - 30 * s, y - 12 * s, 12 * s, 14 * s, COLORS.sheepHead);
  // 腿
  strokePixelLine(ctx, x - 10 * s, y + 8 * s, x - 10 * s, y + 24 * s, 2 * s, leg);
  strokePixelLine(ctx, x + 2 * s, y + 8 * s, x + 2 * s, y + 24 * s, 2 * s, leg);
};
