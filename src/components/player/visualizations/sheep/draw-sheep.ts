import { COLORS, type AudioAnalysis, type SceneState } from './types';
import { fillPixelRect, strokePixelLine } from './draw-utils';
import { drawSpotlight, drawMicrophone } from './draw-effects';

/**
 * 绘制羊毛身体 — 截图风格：蓬松圆弧外轮廓 + 白色填充
 * 坐标空间：小羊本体（ctx 已 translate 到 centerX, centerY）
 */
const drawWoolBody = (ctx: CanvasRenderingContext2D, woolColor: string) => {
  ctx.fillStyle = woolColor;

  // 用多个重叠圆形模拟蓬松外轮廓（顺时针排列）
  ctx.beginPath();
  // 使用多段圆弧围绕中心生成蓬松效果
  const puffCount = 16;
  const radiusX = 48; // 更宽
  const radiusY = 30;
  const puffRadius = 10;
  
  for (let i = 0; i < puffCount; i++) {
    const angle = (i / puffCount) * Math.PI * 2;
    const px = Math.cos(angle) * radiusX;
    const py = Math.sin(angle) * radiusY;
    ctx.moveTo(px + puffRadius, py);
    ctx.arc(px, py, puffRadius, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.strokeStyle = COLORS.sheepHead;
  ctx.lineWidth = 1;
  for (let i = 0; i < puffCount; i++) {
    const angle = (i / puffCount) * Math.PI * 2;
    const px = Math.cos(angle) * radiusX;
    const py = Math.sin(angle) * radiusY;
    ctx.beginPath();
    ctx.arc(px, py, puffRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX + 2, radiusY + 2, 0, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * 绘制小羊头部
 * goofyType: 0=瞪眼吐舌 1=眯眼歪嘴 2=鼓腮瞪眼
 */
const drawSheepHead = (
  ctx: CanvasRenderingContext2D,
  tongueValue: number,
  eyeWide: number,
  eyelid: number,
  pinkMode: boolean,
  goofy: boolean,
  goofyType: number
) => {
  // 头部主体（黑色椭圆，长轴横向偏斜）
  ctx.fillStyle = COLORS.sheepHead;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 18, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // 左耳（向左下倾斜）
  ctx.beginPath();
  ctx.moveTo(-18, -2);
  ctx.lineTo(-44, 4);
  ctx.lineTo(-16, 6);
  ctx.fill();

  // 右耳（向右下倾斜）
  ctx.beginPath();
  ctx.moveTo(18, -2);
  ctx.lineTo(38, 18);
  ctx.lineTo(14, 12);
  ctx.fill();

  // 粉色朋克装饰：头顶呆毛
  if (pinkMode) {
    strokePixelLine(ctx, -2, -16, -6, -30, 3, COLORS.sheepWoolPink);
    strokePixelLine(ctx, 2, -15, 4, -28, 3, COLORS.sheepWoolPink);
  }

  // ===== 眼睛绘制（根据 goofyType 差异化）=====
  const isGoofySquint = goofy && goofyType === 1;
  const isGoofyPuff = goofy && goofyType === 2;

  let eyeW = 8;
  let eyeH = 8 + eyeWide * 2;
  if (goofy && goofyType === 0) { eyeW = 9; eyeH = 11; }
  if (isGoofyPuff) { eyeW = 9; eyeH = 10; }
  if (isGoofySquint) { eyeW = 10; eyeH = 3; }

  // 眼白
  ctx.fillStyle = COLORS.sheepEye;
  ctx.fillRect(-12, -8, eyeW, eyeH);
  ctx.fillRect(4, -8, eyeW, eyeH);

  // 瞳孔
  let pupilY = -3;
  if (goofy && goofyType === 0) pupilY = -6;
  if (isGoofySquint) pupilY = -7;

  ctx.fillStyle = COLORS.sheepPupil;
  ctx.fillRect(-9, pupilY, 2, 2);
  ctx.fillRect(7, pupilY, 2, 2);

  // 眼皮线
  const lidOffset = isGoofySquint ? 1 : goofy ? -4 : eyelid * 4;
  ctx.strokeStyle = COLORS.sheepPupil;
  ctx.lineWidth = 1;
  strokePixelLine(ctx, -14, -9 + lidOffset, -2, -9 + lidOffset, 1, COLORS.sheepPupil);
  strokePixelLine(ctx, 2, -9 + lidOffset, 14, -9 + lidOffset, 1, COLORS.sheepPupil);

  // ===== 嘴巴/腮帮绘制 =====
  if (isGoofyPuff) {
    ctx.fillStyle = COLORS.sheepHead;
    ctx.beginPath();
    ctx.ellipse(-6, 10, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60, 60, 60, 0.4)';
    ctx.beginPath();
    ctx.ellipse(-6, 8, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== 舌头 =====
  if (tongueValue > 0.05) {
    let tongueX = -2;
    let tongueAngle = 0.2;
    let tongueExtraLen = 0;

    if (isGoofySquint) {
      tongueX = 8;
      tongueAngle = -0.3;
      tongueExtraLen = -4;
    }
    if (goofy && goofyType === 0) {
      tongueExtraLen = 5;
    }

    ctx.fillStyle = COLORS.tongue;
    ctx.beginPath();
    ctx.ellipse(
      tongueX,
      12 + tongueValue * 5 + tongueExtraLen,
      5,
      5 + tongueValue * 8,
      tongueAngle,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
};

/**
 * 绘制主体小羊（近景）
 */
export const drawMainSheep = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  analysis: AudioAnalysis,
  state: SceneState
) => {
  const centerX = width * 0.44;
  const centerY = height * 0.57 + state.bodyBob;
  const woolColor = state.pinkMode ? COLORS.sheepWoolPink : COLORS.sheepWool;
  const legColor = state.pinkMode ? COLORS.sheepWoolPink : COLORS.sheepHead;
  const goofy = state.goofy.active;
  const goofyType = state.goofyType;
  const swaggerStride = state.swagger.active ? Math.sin(state.swaggerPhase) * 6 : 0;
  const legLift = Math.sin(state.legPhase) * (
    analysis.intensity === 'high' ? 8 : analysis.intensity === 'mid' ? 5 : 2
  );

  // 阴影 / 聚光灯
  drawSpotlight(
    ctx,
    centerX + width * 0.03,
    height * 0.74,
    width / 640,
    state.disco.active || state.microphone.active
  );

  // 麦克风
  if (state.microphone.active) {
    drawMicrophone(ctx, centerX - 92, height * 0.67, width / 640);
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(state.spinAngle + state.bodyTilt);
  ctx.scale(1 + state.bodyStretch, 1 - state.bodyStretch * 0.35);

  // ===== 腿部（参考原图：细直腿，挂在身体下缘）=====
  strokePixelLine(ctx, -18 + swaggerStride, 20, -18 + swaggerStride, 68 - Math.max(0, legLift), 4, legColor);
  strokePixelLine(ctx, -4 - swaggerStride * 0.25, 20, -4 - swaggerStride * 0.25, 66 - Math.max(0, -legLift), 4, legColor);
  strokePixelLine(ctx, 18 + swaggerStride * 0.15, 22, 18 + swaggerStride * 0.15, 70 - Math.max(0, -legLift * 0.6), 4, legColor);
  strokePixelLine(ctx, 34 - swaggerStride, 22, 34 - swaggerStride, 68 - Math.max(0, legLift * 0.6), 4, legColor);

  // ===== 身体 =====
  drawWoolBody(ctx, woolColor);

  // ===== 头部 =====
  // 头部在身体左侧偏上
  ctx.save();
  const headTiltExtra = (goofy && goofyType === 1) ? 0.08 : 0;
  ctx.translate(-56 + state.headSwing * 0.8, -6 + state.headNod * 0.8);
  ctx.rotate(state.headSwing * 0.012 + headTiltExtra);
  drawSheepHead(ctx, state.tongueValue, state.eyeWide, state.eyelid, state.pinkMode, goofy, goofyType);
  ctx.restore();

  // 粉色蝴蝶结装饰
  if (state.pinkMode) {
    fillPixelRect(ctx, -38, -12, 8, 4, COLORS.tongue);
    fillPixelRect(ctx, -34, -16, 4, 12, COLORS.tongue);
  }

  ctx.restore();
};
