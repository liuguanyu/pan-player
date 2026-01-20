// 跳舞小羊可视化效果
// 根据音乐节拍和强度来控制小羊的动画

// 小羊状态
interface SheepState {
  x: number;
  y: number;
  rotation: number;
  jumpHeight: number;
  headBob: number;
  legMovement: number;
  earMovement: number;
}

// 装饰元素状态
interface DecorationState {
  clouds: Array<{ x: number; y: number; speed: number }>;
  sun: { x: number; y: number; rotation: number };
}

// 全局状态
let sheepState: SheepState = {
  x: 0,
  y: 0,
  rotation: 0,
  jumpHeight: 0,
  headBob: 0,
  legMovement: 0,
  earMovement: 0
};

let decorationState: DecorationState = {
  clouds: [],
  sun: { x: 0, y: 0, rotation: 0 }
};

// 初始化装饰元素
const initializeDecorations = (width: number, height: number) => {
  // 初始化云朵
  if (decorationState.clouds.length === 0) {
    decorationState.clouds = [
      { x: width * 0.2, y: height * 0.15, speed: 0.2 },
      { x: width * 0.5, y: height * 0.1, speed: 0.1 },
      { x: width * 0.8, y: height * 0.2, speed: 0.15 }
    ];
  }
  
  // 初始化太阳
  if (decorationState.sun.x === 0 && decorationState.sun.y === 0) {
    decorationState.sun = { 
      x: width * 0.85, 
      y: height * 0.15, 
      rotation: 0 
    };
  }
};

// 更新小羊状态
const updateSheepState = (bassEnergy: number, trebleEnergy: number, width: number, height: number) => {
  // 根据低频能量调整跳跃高度
  sheepState.jumpHeight = (bassEnergy / 255) * 30;
  
  // 根据高频能量调整头部摆动
  sheepState.headBob = (trebleEnergy / 255) * 10;
  
  // 根据整体能量调整腿部运动
  const totalEnergy = (bassEnergy + trebleEnergy) / 2;
  sheepState.legMovement = (totalEnergy / 255) * 15;
  
  // 耳朵运动（快速摆动）
  sheepState.earMovement = Math.sin(Date.now() / 100) * 5;
  
  // 旋转（根据音乐节拍）
  if (bassEnergy > 200) {
    sheepState.rotation = (Math.sin(Date.now() / 200) * 10);
  }
  
  // 水平位置（轻微移动）
  sheepState.x = width / 2 + Math.sin(Date.now() / 1000) * 20;
  sheepState.y = height * 0.7 - sheepState.jumpHeight;
};

// 更新装饰元素
const updateDecorations = (width: number, height: number) => {
  // 更新云朵位置
  decorationState.clouds.forEach(cloud => {
    cloud.x += cloud.speed;
    if (cloud.x > width + 50) {
      cloud.x = -50;
    }
  });
  
  // 更新太阳旋转
  decorationState.sun.rotation += 0.5;
  if (decorationState.sun.rotation > 360) {
    decorationState.sun.rotation = 0;
  }
};

// 绘制草地背景
const drawGrassBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  // 天空渐变
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  skyGradient.addColorStop(0, '#87CEEB');
  skyGradient.addColorStop(1, '#E0F7FA');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height * 0.7);
  
  // 草地
  ctx.fillStyle = '#7CFC00';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  
  // 草地纹理
  ctx.strokeStyle = '#32CD32';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 10) {
    const grassHeight = 5 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(i, height * 0.7);
    ctx.lineTo(i, height * 0.7 - grassHeight);
    ctx.stroke();
  }
};

// 绘制太阳
const drawSun = (ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  
  // 太阳主体
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.fill();
  
  // 太阳光芒
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI / 4);
    const startX = Math.cos(angle) * 30;
    const startY = Math.sin(angle) * 30;
    const endX = Math.cos(angle) * 40;
    const endY = Math.sin(angle) * 40;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  
  ctx.restore();
};

// 绘制云朵
const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.arc(x + 15, y - 10, 15, 0, Math.PI * 2);
  ctx.arc(x + 30, y, 20, 0, Math.PI * 2);
  ctx.arc(x + 15, y + 10, 15, 0, Math.PI * 2);
  ctx.fill();
};

// 绘制小羊身体
const drawSheepBody = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  // 身体（椭圆）
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
};

// 绘制小羊头部
const drawSheepHead = (ctx: CanvasRenderingContext2D, x: number, y: number, headBob: number) => {
  ctx.save();
  ctx.translate(x, y + headBob);
  
  // 头部
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // 眼睛
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(-5, -3, 2, 0, Math.PI * 2);
  ctx.arc(5, -3, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // 嘴巴
  ctx.beginPath();
  ctx.arc(0, 3, 5, 0, Math.PI);
  ctx.stroke();
  
  ctx.restore();
};

// 绘制小羊耳朵
const drawSheepEars = (ctx: CanvasRenderingContext2D, x: number, y: number, earMovement: number) => {
  ctx.save();
  ctx.translate(x, y);
  
  // 左耳
  ctx.rotate(-Math.PI/6 + earMovement * Math.PI/180);
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, -15);
  ctx.lineTo(0, -10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  
  // 右耳
  ctx.rotate(Math.PI/6 - earMovement * Math.PI/180);
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, -15);
  ctx.lineTo(0, -10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.restore();
};

// 绘制小羊腿部
const drawSheepLegs = (ctx: CanvasRenderingContext2D, x: number, y: number, legMovement: number) => {
  ctx.save();
  ctx.translate(x, y);
  
  // 前腿
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(-15 + Math.sin(legMovement * Math.PI/180) * 5, 15);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(15 + Math.sin(legMovement * Math.PI/180) * 5, 15);
  ctx.stroke();
  
  // 后腿
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-10 - Math.sin(legMovement * Math.PI/180) * 5, 15);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(10 - Math.sin(legMovement * Math.PI/180) * 5, 15);
  ctx.stroke();
  
  ctx.restore();
};

// 绘制小羊尾巴
const drawSheepTail = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x + 30, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
};

// 绘制小羊
const drawSheep = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  headBob: number,
  legMovement: number,
  earMovement: number
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  
  // 绘制小羊各部分
  drawSheepBody(ctx, 0, 0);
  drawSheepHead(ctx, 0, -25, headBob);
  drawSheepEars(ctx, 0, -35, earMovement);
  drawSheepLegs(ctx, 0, 20, legMovement);
  drawSheepTail(ctx, 0, 0);
  
  ctx.restore();
};

// 计算音频能量
const calculateAudioEnergy = (data: Uint8Array) => {
  // 计算低频能量（前1/3）
  let bassEnergy = 0;
  const bassEnd = Math.floor(data.length / 3);
  for (let i = 0; i < bassEnd; i++) {
    bassEnergy += data[i];
  }
  bassEnergy /= bassEnd;
  
  // 计算高频能量（后1/3）
  let trebleEnergy = 0;
  const trebleStart = Math.floor(data.length * 2 / 3);
  for (let i = trebleStart; i < data.length; i++) {
    trebleEnergy += data[i];
  }
  trebleEnergy /= (data.length - trebleStart);
  
  return { bassEnergy, trebleEnergy };
};

// 绘制跳舞小羊效果
export const drawDancingSheep = (
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number
) => {
  // 初始化装饰元素
  initializeDecorations(width, height);
  
  // 计算音频能量
  const { bassEnergy, trebleEnergy } = calculateAudioEnergy(data);
  
  // 更新状态
  updateSheepState(bassEnergy, trebleEnergy, width, height);
  updateDecorations(width, height);
  
  // 绘制背景
  drawGrassBackground(ctx, width, height);
  
  // 绘制太阳
  drawSun(ctx, decorationState.sun.x, decorationState.sun.y, decorationState.sun.rotation);
  
  // 绘制云朵
  decorationState.clouds.forEach(cloud => {
    drawCloud(ctx, cloud.x, cloud.y);
  });
  
  // 绘制小羊
  drawSheep(
    ctx,
    sheepState.x,
    sheepState.y,
    sheepState.rotation,
    sheepState.headBob,
    sheepState.legMovement,
    sheepState.earMovement
  );
};