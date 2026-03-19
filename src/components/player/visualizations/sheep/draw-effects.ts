import { COLORS, type AudioAnalysis } from './types';
import { fillPixelRect, strokePixelLine } from './draw-utils';

/** 迪斯科球 */
export const drawDiscoBall = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  beat: number
) => {
  const x = Math.round(width * 0.52);
  const y = Math.round(height * 0.14);
  const radius = Math.round(height * 0.07);

  // 吊线
  strokePixelLine(ctx, x, 0, x, y - radius, 3, COLORS.discoWire);

  // 球体
  ctx.fillStyle = COLORS.discoBall;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // 像素格子贴图
  const cellSize = Math.max(3, Math.round(radius / 4));
  for (let row = -3; row <= 3; row += 1) {
    for (let col = -3; col <= 3; col += 1) {
      const cx = x + col * cellSize;
      const cy = y + row * cellSize;
      const dist = Math.sqrt(col * col + row * row);
      if (dist < 3.6) {
        const shade = row === col || (row + col) % 3 === 0 ? '#ffffff' : '#dcdcdc';
        fillPixelRect(ctx, cx, cy, cellSize - 1, cellSize - 1, shade);
      }
    }
  }

  // 地面光斑
  ctx.save();
  ctx.globalAlpha = 0.25 + beat * 0.35;
  for (let index = 0; index < 9; index += 1) {
    const px = width * (0.1 + index * 0.1);
    const py = height * (0.7 + ((index % 3) - 1) * 0.04);
    const spotSize = 12 + (index % 2) * 4 + beat * 6;
    ctx.beginPath();
    ctx.ellipse(px, py, spotSize, spotSize * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.cloud;
    ctx.fill();
  }
  ctx.restore();
};

/** 麦克风 */
export const drawMicrophone = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) => {
  const headW = 10 * scale;
  const headH = 12 * scale;
  const stickH = 36 * scale;

  // 麦克风头
  ctx.fillStyle = COLORS.microphoneHead;
  ctx.beginPath();
  ctx.arc(x + headW / 2, y + headH / 2, headW / 2, 0, Math.PI * 2);
  ctx.fill();

  // 支柱
  strokePixelLine(ctx, x + headW / 2, y + headH, x + headW / 2, y + headH + stickH, 3 * scale, COLORS.microphoneBody);

  // 底座
  fillPixelRect(ctx, x - 2 * scale, y + headH + stickH, headW + 4 * scale, 4 * scale, COLORS.microphoneBody);
};

/** 频谱灯 (像素风飞艇造型) */
export const drawSpectrumLamp = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  analysis: AudioAnalysis
) => {
  // 飞艇外壳 (椭圆)
  const shellW = 36 * scale;
  const shellH = 22 * scale;
  ctx.fillStyle = COLORS.spectrumShell;
  ctx.beginPath();
  ctx.ellipse(x + shellW / 2, y + shellH / 2, shellW / 2, shellH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 显示窗
  fillPixelRect(ctx, x + 8 * scale, y + 5 * scale, 18 * scale, 12 * scale, '#191919');

  // 尾翼
  fillPixelRect(ctx, x - 5 * scale, y + 6 * scale, 6 * scale, 8 * scale, COLORS.spectrumShell);

  // 吊舱
  fillPixelRect(ctx, x + 11 * scale, y + shellH, 8 * scale, 4 * scale, COLORS.spectrumShell);

  // 频谱柱
  const bars = [analysis.bassEnergy, analysis.averageVolume, analysis.trebleEnergy, analysis.beat];
  const colors = ['#38f93e', '#c8ff33', '#ff9b1e', '#ff3131'];
  bars.forEach((value, index) => {
    const barHeight = Math.max(3, Math.round(value * 10));
    fillPixelRect(
      ctx,
      x + 10 * scale + index * 4 * scale,
      y + (16 - barHeight) * scale,
      3 * scale,
      barHeight * scale,
      colors[index]
    );
  });
};

/** 聚光灯/小羊阴影 */
export const drawSpotlight = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  active: boolean
) => {
  ctx.save();
  ctx.globalAlpha = active ? 0.92 : 0.55;
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, 90 * scale, 32 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};
