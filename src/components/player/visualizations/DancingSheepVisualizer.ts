// RealPlayer 经典跳舞小羊可视化效果 (Annabelle the Sheep)
// 复刻自 2000 年代初期 RealPlayer 经典插件

// 颜色常量 - 严格遵循原版配色
const COLORS = {
  SKY: '#4A4AFF',      // 纯蓝天空
  GRASS: '#00CC33',    // 纯绿草地
  SHEEP_BODY: '#FFFFFF',
  SHEEP_HEAD: '#000000', // 黑色头部
  FENCE: '#FFFFFF',    // 白色栅栏
  SPOTLIGHT: 'rgba(255, 255, 200, 0.4)' // 半透明黄色聚光灯
};

// 小羊状态接口
interface SheepState {
  bounceY: number;      // 垂直跳动位移
  scaleX: number;       // 水平缩放（呼吸感）
  scaleY: number;       // 垂直缩放（呼吸感）
  headRotation: number; // 头部旋转角度
  spotlightOpacity: number; // 聚光灯亮度
}

// 装饰元素状态
interface DecorationState {
  clouds: Array<{ x: number; y: number; width: number; speed: number }>;
}

// 全局状态
let sheepState: SheepState = {
  bounceY: 0,
  scaleX: 1,
  scaleY: 1,
  headRotation: 0,
  spotlightOpacity: 0.3
};

let decorationState: DecorationState = {
  clouds: []
};

// 初始化装饰元素
const initializeDecorations = (width: number, height: number) => {
  if (decorationState.clouds.length === 0) {
    decorationState.clouds = [
      { x: width * 0.2, y: height * 0.15, width: 60, speed: 0.2 },
      { x: width * 0.6, y: height * 0.1, width: 80, speed: 0.15 },
      { x: width * 0.9, y: height * 0.2, width: 50, speed: 0.25 }
    ];
  }
};

// 计算音频能量和特征
const analyzeAudio = (data: Uint8Array) => {
  const bufferLength = data.length;
  
  // 1. 计算平均音量 (0-1)
  let sum = 0;
  for(let i = 0; i < bufferLength; i++) {
    sum += data[i];
  }
  const averageVolume = sum / bufferLength / 255;

  // 2. 计算低频能量 (Bass) - 用于跳跃
  let bassSum = 0;
  const bassLimit = Math.floor(bufferLength * 0.1); // 取前10%作为低频
  for(let i = 0; i < bassLimit; i++) {
    bassSum += data[i];
  }
  const bassEnergy = bassSum / bassLimit / 255;

  // 3. 计算高频能量 (Treble) - 用于摇头
  let trebleSum = 0;
  const trebleStart = Math.floor(bufferLength * 0.7); // 取后30%作为高频
  for(let i = trebleStart; i < bufferLength; i++) {
    trebleSum += data[i];
  }
  const trebleEnergy = trebleSum / (bufferLength - trebleStart) / 255;

  return { averageVolume, bassEnergy, trebleEnergy };
};

// 更新小羊状态
const updateSheepState = (analysis: { averageVolume: number, bassEnergy: number, trebleEnergy: number }) => {
  const { averageVolume, bassEnergy, trebleEnergy } = analysis;
  const now = Date.now();

  // 1. 节奏跳动 (Beat) - 随低频跳动
  // 基础律动 + 低频冲击
  const baseBounce = Math.sin(now * 0.01) * 5; 
  const beatBounce = bassEnergy > 0.4 ? bassEnergy * 40 : 0;
  sheepState.bounceY = -(Math.abs(baseBounce) + beatBounce);

  // 2. 拉伸压缩 (Squash) - 产生呼吸感
  // 能量越高，变形越明显
  const breatheSpeed = now * 0.015;
  const deformity = averageVolume * 0.3; // 变形程度
  sheepState.scaleX = 1 + Math.sin(breatheSpeed) * deformity;
  sheepState.scaleY = 1 - Math.sin(breatheSpeed) * deformity;

  // 3. 疯狂摇头 (Shake) - 随高频摆动
  // 基础摆动 + 高频剧烈摆动
  const baseShake = Math.sin(now * 0.005) * 5;
  const crazyShake = trebleEnergy > 0.3 ? (Math.random() - 0.5) * trebleEnergy * 60 : 0;
  sheepState.headRotation = baseShake + crazyShake;

  // 4. 聚光灯闪烁
  sheepState.spotlightOpacity = 0.2 + averageVolume * 0.6;
};

// 更新装饰
const updateDecorations = (width: number) => {
  decorationState.clouds.forEach(cloud => {
    cloud.x += cloud.speed;
    if (cloud.x > width + 50) {
      cloud.x = -50;
    }
  });
};

// 绘图辅助函数：绘制云朵状物体 (用于身体和云)
const drawCloudShape = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  
  const puffs = 5;
  const step = Math.PI * 2 / puffs;
  
  // 绘制中心填充
  ctx.ellipse(x, y, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  
  // 绘制周围的圆球
  for (let i = 0; i < puffs; i++) {
    const angle = i * step;
    const px = x + Math.cos(angle) * (width * 0.4);
    const py = y + Math.sin(angle) * (height * 0.4);
    const radius = width * 0.25;
    
    ctx.moveTo(px + radius, py);
    ctx.arc(px, py, radius, 0, Math.PI * 2);
  }
  
  ctx.fill();
};

// 绘制背景
const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  // 1. 天空
  ctx.fillStyle = COLORS.SKY;
  ctx.fillRect(0, 0, width, height * 0.6); // 天空占 60%

  // 2. 草地
  ctx.fillStyle = COLORS.GRASS;
  ctx.fillRect(0, height * 0.6, width, height * 0.4); // 草地占 40%

  // 3. 云朵
  decorationState.clouds.forEach(cloud => {
    drawCloudShape(ctx, cloud.x, cloud.y, cloud.width, cloud.width * 0.6, 'white');
  });

  // 4. 左侧栅栏 (简单透视线条)
  ctx.strokeStyle = COLORS.FENCE;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  const fenceStartX = 20;
  const fenceStartY = height * 0.55;
  
  // 竖桩
  for(let i = 0; i < 4; i++) {
    const x = fenceStartX + i * 40;
    const y = fenceStartY + i * 15;
    const h = 40 + i * 5;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }

  // 横梁
  ctx.beginPath();
  ctx.moveTo(fenceStartX, fenceStartY + 10);
  ctx.lineTo(fenceStartX + 120, fenceStartY + 55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(fenceStartX, fenceStartY + 30);
  ctx.lineTo(fenceStartX + 120, fenceStartY + 75);
  ctx.stroke();
};

// 绘制小羊
const drawSheep = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const centerX = width / 2;
  const centerY = height * 0.65; // 站在草地上

  const { bounceY, scaleX, scaleY, headRotation, spotlightOpacity } = sheepState;

  // 1. 聚光灯 (在地面的投影)
  ctx.save();
  ctx.translate(centerX, centerY + 60);
  ctx.scale(1 + scaleX * 0.1, 1); // 聚光灯也稍微随节奏缩放
  ctx.fillStyle = COLORS.SPOTLIGHT;
  ctx.globalAlpha = spotlightOpacity;
  ctx.beginPath();
  ctx.ellipse(0, 0, 80, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 应用整体变换 (跳跃 + 缩放)
  ctx.save();
  ctx.translate(centerX, centerY + bounceY);
  
  // 2. 四肢 (简单的黑色直线，随身体上下移动但不缩放)
  // 为了让腿看起来像插在地上或者随身体动，我们稍微做一点处理
  // 这里简化处理：腿固定在身体下方，随身体跳动
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 4;
  const legLength = 40;
  const legSpread = 25;
  
  // 后腿
  ctx.beginPath(); ctx.moveTo(-legSpread, 10); ctx.lineTo(-legSpread, legLength); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(legSpread, 10); ctx.lineTo(legSpread, legLength); ctx.stroke();
  // 前腿
  ctx.beginPath(); ctx.moveTo(-legSpread + 10, 15); ctx.lineTo(-legSpread + 10, legLength + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(legSpread - 10, 15); ctx.lineTo(legSpread - 10, legLength + 5); ctx.stroke();

  // 应用身体缩放 (Scale) - 此时原点在身体中心
  ctx.scale(scaleX, scaleY);

  // 3. 身体 (白色云朵状)
  drawCloudShape(ctx, 0, 0, 90, 70, COLORS.SHEEP_BODY);
  // 身体轮廓描边
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  // 注意：drawCloudShape 没有描边路径，这里简化画一个椭圆描边或者略过
  // 原版主要是色块，这里简单勾勒一下
  ctx.beginPath();
  ctx.ellipse(0, 0, 45, 35, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 4. 头部 (黑色椭圆 + 脸部特征)
  // 头部独立于身体缩放，可能有自己的旋转
  ctx.save();
  ctx.translate(-35, -20); // 头部位置在身体左上方
  // 反向抵消身体的缩放，以免头部变形奇怪，或者保留变形产生喜剧效果
  // RealPlayer 的羊头通常比较硬，我们抵消一部分缩放
  ctx.scale(1/scaleX, 1/scaleY); 
  ctx.rotate(headRotation * Math.PI / 180);

  // 黑头
  ctx.fillStyle = COLORS.SHEEP_HEAD;
  ctx.beginPath();
  ctx.ellipse(0, 0, 25, 35, -0.2, 0, Math.PI * 2); // 稍微倾斜的椭圆
  ctx.fill();

  // 大白眼
  const drawEye = (x: number, y: number) => {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    // 瞳孔
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(x + 2, y, 2, 0, Math.PI * 2);
    ctx.fill();
  };
  drawEye(-8, -5);
  drawEye(8, -5);

  // 标志性大白牙笑脸
  ctx.fillStyle = 'white';
  ctx.beginPath();
  // 嘴巴形状：半圆/长方形
  ctx.rect(-10, 10, 20, 10);
  ctx.fill();
  
  // 牙齿线
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, 15);
  ctx.lineTo(10, 15); // 横线
  ctx.moveTo(0, 10);
  ctx.lineTo(0, 20); // 竖线
  ctx.stroke();
  
  // 嘴巴边框
  ctx.strokeStyle = 'white';
  ctx.strokeRect(-10, 10, 20, 10);

  // 耳朵 (简单的黑色椭圆)
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.ellipse(-25, -10, 15, 6, 0.5, 0, Math.PI * 2); // 左耳
  ctx.fill();
  
  ctx.restore(); // 恢复头部变换

  ctx.restore(); // 恢复整体变换
};


export const drawDancingSheep = (
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number
) => {
  // 1. 初始化
  initializeDecorations(width, height);
  
  // 2. 音频分析
  const audioAnalysis = analyzeAudio(data);
  
  // 3. 更新状态
  updateSheepState(audioAnalysis);
  updateDecorations(width);
  
  // 4. 清空画布
  ctx.clearRect(0, 0, width, height);
  
  // 5. 绘制背景层
  drawBackground(ctx, width, height);
  
  // 6. 绘制主体层 (小羊)
  drawSheep(ctx, width, height);
};