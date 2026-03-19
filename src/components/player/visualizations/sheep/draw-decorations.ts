import { COLORS, type SceneState, type Bird } from './types';
import { fillPixelRect, strokePixelLine } from './draw-utils';

/** 像素风云朵 */
export const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
  const u = scale;
  fillPixelRect(ctx, x, y + u, u * 7, u * 2, COLORS.cloud);
  fillPixelRect(ctx, x + u, y, u * 4, u * 3, COLORS.cloud);
  fillPixelRect(ctx, x + u * 6, y + u, u * 2, u * 2, COLORS.cloud);
  fillPixelRect(ctx, x - u, y + u * 2, u * 2, u, COLORS.cloud);
  fillPixelRect(ctx, x + u * 8, y + u * 2, u * 2, u, COLORS.cloud);
};

/** 绘制多朵云 */
export const drawClouds = (ctx: CanvasRenderingContext2D, width: number, height: number, _state: SceneState) => {
  const unit = Math.max(4, Math.round(width / 150));
  drawCloud(ctx, width * 0.08, height * 0.06, unit);
  drawCloud(ctx, width * 0.72, height * 0.1, unit * 0.9);
  drawCloud(ctx, width * 0.86, height * 0.14, unit * 0.7);
};

/** 飞鸟 */
export const drawBird = (ctx: CanvasRenderingContext2D, bird: Bird) => {
  const wingLift = Math.sin(bird.wingPhase) > 0 ? -3 : 2;
  strokePixelLine(ctx, bird.x, bird.y, bird.x + 6, bird.y + wingLift, 2, COLORS.cloud);
  strokePixelLine(ctx, bird.x + 6, bird.y + wingLift, bird.x + 12, bird.y, 2, COLORS.cloud);
};

export const drawBirds = (ctx: CanvasRenderingContext2D, state: SceneState) => {
  state.birds.forEach((bird) => drawBird(ctx, bird));
};

/** 星空 */
export const drawStars = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const stars = [
    [0.1, 0.08], [0.18, 0.13], [0.32, 0.09], [0.42, 0.16],
    [0.56, 0.11], [0.68, 0.18], [0.82, 0.09], [0.24, 0.22],
    [0.48, 0.05], [0.73, 0.07], [0.91, 0.19], [0.14, 0.17],
    [0.38, 0.21], [0.62, 0.04], [0.85, 0.23]
  ];
  stars.forEach(([px, py], index) => {
    const twinkle = index % 3 === 0 ? 2 : 1;
    fillPixelRect(ctx, width * px, height * py, twinkle, twinkle, COLORS.star);
  });
};

/** 弯月 */
export const drawMoon = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const moonX = width * 0.88;
  const moonY = height * 0.1;
  const moonR = Math.round(height * 0.045);
  ctx.fillStyle = COLORS.moon;
  ctx.beginPath();
  ctx.arc(Math.round(moonX), Math.round(moonY), moonR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.skyTopNight;
  ctx.beginPath();
  ctx.arc(Math.round(moonX + moonR * 0.4), Math.round(moonY - moonR * 0.13), Math.round(moonR * 0.88), 0, Math.PI * 2);
  ctx.fill();
};

/** 白色木栅栏 — 透视消失 */
export const drawFence = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const fenceX = width * 0.045;
  const fenceY = height * 0.49;

  // 竖桩 (由近到远透视缩小，倾斜)
  const posts = [
    { dx: 0, dy: 0, h: 58 },
    { dx: 18, dy: -6, h: 52 },
    { dx: 34, dy: -12, h: 46 },
    { dx: 48, dy: -18, h: 40 }
  ];

  posts.forEach((post) => {
    const px = fenceX + post.dx;
    const py = fenceY + post.dy;
    strokePixelLine(ctx, px, py, px, py + post.h, 5, COLORS.fence);
  });

  // 横栏 (两条倾斜横杆)
  const rail1Y = fenceY + 12;
  const rail2Y = fenceY + 32;
  strokePixelLine(ctx, fenceX, rail1Y, fenceX + 48, rail1Y - 18, 5, COLORS.fence);
  strokePixelLine(ctx, fenceX, rail2Y, fenceX + 48, rail2Y - 18, 5, COLORS.fence);
};
