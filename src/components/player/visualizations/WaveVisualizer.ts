// 绘制波形图
export const drawWave = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#60efff';
  ctx.beginPath();

  const sliceWidth = width * 1.0 / data.length;
  let x = 0;

  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 128.0;
    const y = v * height / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();
};