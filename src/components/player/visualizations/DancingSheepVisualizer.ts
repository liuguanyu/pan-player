// RealPlayer 经典跳舞小羊可视化效果 (Annabelle the Sheep)
// 复刻自 2000 年代初期 RealPlayer 经典插件

// 颜色常量 - 严格遵循原版配色
const COLORS = {
  SKY: '#4A4AFF',      // 纯蓝天空
  GRASS: '#00CC33',    // 纯绿草地
  SHEEP_BODY: '#FFFFFF',
  SHEEP_HEAD: '#000000', // 黑色头部
  FENCE: '#FFFFFF',    // 白色栅栏
  SPOTLIGHT: 'rgba(255, 255, 200, 0.4)', // 半透明黄色聚光灯
  TONGUE: '#FF69B4'    // 粉色舌头
};

// 小羊状态接口
interface SheepState {
  bounceY: number;      // 垂直跳动位移
  scaleX: number;       // 水平缩放（呼吸感）
  scaleY: number;       // 垂直缩放（呼吸感）
  headRotation: number; // 头部旋转角度
  headOffsetX: number;  // 头部水平晃动
  headOffsetY: number;  // 头部垂直晃动
  spotlightOpacity: number; // 聚光灯亮度
  tongueOut: boolean;   // 是否吐舌头
  tongueLength: number; // 舌头长度
  legBend: number;      // 腿部弯曲程度
}

// 背景小羊状态
interface BackgroundSheep {
  x: number;
  y: number;
  scale: number;
  bounceY: number;
  bouncePhase: number;
}

// 装饰元素状态
interface DecorationState {
  clouds: Array<{ x: number; y: number; width: number; speed: number }>;
  backgroundSheep: BackgroundSheep[];
}

// 全局状态
let sheepState: SheepState = {
  bounceY: 0,
  scaleX: 1,
  scaleY: 1,
  headRotation: 0,
  headOffsetX: 0,
  headOffsetY: 0,
  spotlightOpacity: 0.3,
  tongueOut: false,
  tongueLength: 0,
  legBend: 0
};

let decorationState: DecorationState = {
  clouds: [],
  backgroundSheep: []
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

  // 初始化背景小羊
  if (decorationState.backgroundSheep.length === 0) {
    decorationState.backgroundSheep = [
      { x: width * 0.15, y: height * 0.68, scale: 0.4, bounceY: 0, bouncePhase: 0 },
      { x: width * 0.25, y: height * 0.70, scale: 0.3, bounceY: 0, bouncePhase: 2 },
      { x: width * 0.85, y: height * 0.67, scale: 0.35, bounceY: 0, bouncePhase: 4 }
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
  const baseBounce = Math.sin(now * 0.01) * 5; 
  const beatBounce = bassEnergy > 0.4 ? bassEnergy * 40 : 0;
  sheepState.bounceY = -(Math.abs(baseBounce) + beatBounce);

  // 2. 拉伸压缩 (Squash) - 产生呼吸感
  const breatheSpeed = now * 0.015;
  const deformity = averageVolume * 0.3;
  sheepState.scaleX = 1 + Math.sin(breatheSpeed) * deformity;
  sheepState.scaleY = 1 - Math.sin(breatheSpeed) * deformity;

  // 3. 疯狂摇头 (Shake) - 随高频摆动
  const baseShake = Math.sin(now * 0.005) * 5;
  const crazyShake = trebleEnergy > 0.3 ? (Math.random() - 0.5) * trebleEnergy * 60 : 0;
  sheepState.headRotation = baseShake + crazyShake;
  
  // 头部晃动 (Head Bobbing)
  sheepState.headOffsetX = Math.sin(now * 0.01) * 3 + (trebleEnergy > 0.4 ? (Math.random() - 0.5) * 10 : 0);
  sheepState.headOffsetY = Math.sin(now * 0.015) * 3 + (bassEnergy > 0.4 ? bassEnergy * 5 : 0);

  // 腿部弯曲 (Leg Bending)
  // 当身体向下压时腿部弯曲
  sheepState.legBend = Math.max(0, -sheepState.bounceY * 0.5);

  // 4. 聚光灯闪烁
  sheepState.spotlightOpacity = 0.2 + averageVolume * 0.6;

  // 5. 吐舌头效果 - 随机触发，特别是在高音量时
  // 使用随机数和音量来决定是否吐舌头
  const tongueChance = averageVolume > 0.5 ? 0.02 : 0.005;
  if (Math.random() < tongueChance) {
    sheepState.tongueOut = true;
    sheepState.tongueLength = 0;
  }
  
  // 舌头动画
  if (sheepState.tongueOut) {
    sheepState.tongueLength += 2;
    if (sheepState.tongueLength > 20) {
      sheepState.tongueOut = false;
      sheepState.tongueLength = 0;
    }
  }
};

// 更新背景小羊
const updateBackgroundSheep = (bassEnergy: number, now: number) => {
  decorationState.backgroundSheep.forEach(sheep => {
    // 背景小羊也会随低频跳动，但幅度较小
    const bounce = Math.sin(now * 0.01 + sheep.bouncePhase) * 5;
    const beatBounce = bassEnergy > 0.5 ? bassEnergy * 15 : 0;
    sheep.bounceY = -(Math.abs(bounce) + beatBounce);
  });
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

// 绘图辅助函数：绘制云朵状物体
const drawCloudShape = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  
  const puffs = 5;
  const step = Math.PI * 2 / puffs;
  
  ctx.ellipse(x, y, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  
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
  ctx.fillRect(0, 0, width, height * 0.6);

  // 2. 草地
  ctx.fillStyle = COLORS.GRASS;
  ctx.fillRect(0, height * 0.6, width, height * 0.4);

  // 3. 云朵
  decorationState.clouds.forEach(cloud => {
    drawCloudShape(ctx, cloud.x, cloud.y, cloud.width, cloud.width * 0.6, 'white');
  });

  // 4. 左侧栅栏
  ctx.strokeStyle = COLORS.FENCE;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  const fenceStartX = 20;
  const fenceStartY = height * 0.55;
  
  for(let i = 0; i < 4; i++) {
    const x = fenceStartX + i * 40;
    const y = fenceStartY + i * 15;
    const h = 40 + i * 5;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(fenceStartX, fenceStartY + 10);
  ctx.lineTo(fenceStartX + 120, fenceStartY + 55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(fenceStartX, fenceStartY + 30);
  ctx.lineTo(fenceStartX + 120, fenceStartY + 75);
  ctx.stroke();
};

// 绘制背景小羊（简化版）
const drawBackgroundSheep = (ctx: CanvasRenderingContext2D, sheep: BackgroundSheep) => {
  ctx.save();
  ctx.translate(sheep.x, sheep.y + sheep.bounceY);
  ctx.scale(sheep.scale, sheep.scale);

  // 身体
  ctx.fillStyle = COLORS.SHEEP_BODY;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // 头部
  ctx.fillStyle = COLORS.SHEEP_HEAD;
  ctx.beginPath();
  ctx.ellipse(-15, -10, 12, 18, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(-18, -12, 3, 0, Math.PI * 2);
  ctx.arc(-12, -12, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

// 绘制小羊
const drawSheep = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const centerX = width / 2;
  const centerY = height * 0.65;

  const { bounceY, scaleX, scaleY, headRotation, headOffsetX, headOffsetY, spotlightOpacity, tongueOut, tongueLength, legBend } = sheepState;

  // 1. 聚光灯
  ctx.save();
  ctx.translate(centerX, centerY + 60);
  ctx.scale(1 + scaleX * 0.1, 1);
  ctx.fillStyle = COLORS.SPOTLIGHT;
  ctx.globalAlpha = spotlightOpacity;
  ctx.beginPath();
  ctx.ellipse(0, 0, 80, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 应用整体变换
  ctx.save();
  ctx.translate(centerX, centerY + bounceY);
  
  // 2. 四肢（考虑腿部弯曲）
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 4;
  const legLength = 40;
  const legSpread = 25;
  const bendOffset = legBend * 0.3; // 腿部弯曲偏移
  
  // 前腿
  ctx.beginPath();
  ctx.moveTo(-legSpread, 10);
  ctx.lineTo(-legSpread, legLength - bendOffset);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(legSpread, 10);
  ctx.lineTo(legSpread, legLength - bendOffset);
  ctx.stroke();

  // 后腿
  ctx.beginPath();
  ctx.moveTo(-legSpread + 10, 15);
  ctx.lineTo(-legSpread + 10, legLength + 5 - bendOffset);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(legSpread - 10, 15);
  ctx.lineTo(legSpread - 10, legLength + 5 - bendOffset);
  ctx.stroke();

  // 应用身体缩放
  ctx.scale(scaleX, scaleY);

  // 3. 身体（更接近截图的椭圆形）
  ctx.fillStyle = COLORS.SHEEP_BODY;
  ctx.beginPath();
  ctx.ellipse(0, 0, 45, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // 身体轮廓
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 4. 头部（考虑头部晃动）
  ctx.save();
  ctx.translate(-35 + headOffsetX, -20 + headOffsetY);
  ctx.scale(1/scaleX, 1/scaleY);
  ctx.rotate(headRotation * Math.PI / 180);

  // 黑色头部（椭圆形）
  ctx.fillStyle = COLORS.SHEEP_HEAD;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 28, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 耳朵（向两侧倾斜）
  ctx.fillStyle = COLORS.SHEEP_HEAD;
  // 左耳
  ctx.save();
  ctx.translate(-18, -15);
  ctx.rotate(-0.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  // 右耳
  ctx.save();
  ctx.translate(18, -15);
  ctx.rotate(0.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 眼睛（白色圆形）
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(-10, -3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -3, 6, 0, Math.PI * 2);
  ctx.fill();

  // 眼珠（黑色小点）
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(-10, -3, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -3, 2, 0, Math.PI * 2);
  ctx.fill();

  // 嘴巴（简单弧线）
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 5, 8, 0, Math.PI);
  ctx.stroke();

  // 舌头（粉色，从嘴巴伸出）
  if (tongueOut && tongueLength > 0) {
    ctx.fillStyle = COLORS.TONGUE;
    ctx.beginPath();
    ctx.ellipse(0, 15, 4, tongueLength * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.restore();
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
  updateBackgroundSheep(audioAnalysis.bassEnergy, Date.now());
  updateDecorations(width);
  
  // 4. 清空画布
  ctx.clearRect(0, 0, width, height);
  
  // 5. 绘制背景层
  drawBackground(ctx, width, height);
  
  // 6. 绘制背景小羊
  decorationState.backgroundSheep.forEach(sheep => {
    drawBackgroundSheep(ctx, sheep);
  });
  
  // 7. 绘制主体小羊
  drawSheep(ctx, width, height);
};