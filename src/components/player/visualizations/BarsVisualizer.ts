// 绘制柱形图（频谱）
export const drawBars = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
  const barWidth = (width / data.length) * 2.5;
  let barHeight;
  let x = 0;

  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, '#00ff87');
  gradient.addColorStop(0.5, '#60efff');
  gradient.addColorStop(1, '#0061ff');

  ctx.fillStyle = gradient;

  for (let i = 0; i < data.length; i++) {
    barHeight = (data[i] / 255) * height;
    
    // 使得柱状图底部对齐
    ctx.fillRect(x, height - barHeight, barWidth, barHeight);

    x += barWidth + 1;
  }
};