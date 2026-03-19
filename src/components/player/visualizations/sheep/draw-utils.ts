/** 像素风格绘图辅助函数 */

export const fillPixelRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

export const strokePixelLine = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
};

export const createGradient = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  top: string,
  bottom: string
) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  return gradient;
};

export const setPixelMode = (ctx: CanvasRenderingContext2D) => {
  ctx.imageSmoothingEnabled = false;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
};
