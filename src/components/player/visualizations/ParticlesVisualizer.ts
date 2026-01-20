interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

// 全局粒子数组，在绘制函数之间共享
let particles: Particle[] = [];

// 计算低频能量（前10个频段）
const calculateBassEnergy = (data: Uint8Array): number => {
  let bassEnergy = 0;
  for (let i = 0; i < 10 && i < data.length; i++) {
    bassEnergy += data[i];
  }
  return bassEnergy / 10; // 平均值 0-255
};

// 根据低频能量发射新粒子
const emitParticles = (bassEnergy: number, centerX: number, centerY: number) => {
  if (bassEnergy > 150) { // 阈值
    const count = Math.floor((bassEnergy - 150) / 20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 1,
        color: `hsla(${Math.random() * 60 + 180}, 100%, 70%, 0.8)`, // 蓝色/青色系
        life: 1.0
      });
    }
  }
};

// 更新和绘制粒子
const updateAndDrawParticles = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.01;

    if (p.life <= 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      particles.splice(i, 1);
      continue;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color.replace('0.8)', `${p.life})`);
    ctx.fill();
  }
};

// 绘制中心圆，随音乐律动
const drawCenterCircle = (
  ctx: CanvasRenderingContext2D,
  bassEnergy: number,
  centerX: number,
  centerY: number
) => {
  const radius = 20 + (bassEnergy / 255) * 30;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(200, 100%, 70%, 0.5)`;
  ctx.lineWidth = 2;
  ctx.stroke();
};

// 绘制粒子效果（基于低频能量发射粒子）
export const drawParticles = (
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number
) => {
  const bassEnergy = calculateBassEnergy(data);
  
  // 根据低频能量发射新粒子
  emitParticles(bassEnergy, centerX, centerY);
  
  // 更新和绘制粒子
  updateAndDrawParticles(ctx, width, height);
  
  // 绘制中心圆，随音乐律动
  drawCenterCircle(ctx, bassEnergy, centerX, centerY);
};

// 清除所有粒子
export const clearParticles = () => {
  particles = [];
};