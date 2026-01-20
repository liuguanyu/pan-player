import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { audioContextService } from '@/services/audio-context.service';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuCheckboxItem,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface AudioVisualizerProps {
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const { visualizationType, setVisualizationType, isPlaying, showVisualizer } = usePlayerStore();
  
  // 粒子系统状态
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    life: number;
  }>>([]);

  useEffect(() => {
    if (!showVisualizer || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // 清空画布
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 设置画布尺寸（如果需要自适应）
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      // 获取音频数据
      const audioData = audioContextService.getAudioData();
      if (!audioData) {
        // 如果没有音频数据，绘制空状态或保持上一帧
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (visualizationType === 'bars') {
        drawBars(ctx, audioData, width, height);
      } else if (visualizationType === 'wave') {
        const waveformData = audioContextService.getWaveformData();
        if (waveformData) {
          drawWave(ctx, waveformData, width, height);
        }
      } else if (visualizationType === 'particles') {
        drawParticles(ctx, audioData, width, height, centerX, centerY);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [visualizationType, isPlaying, showVisualizer]);

  // 绘制柱形图（频谱）
  const drawBars = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
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

  // 绘制波形图
  const drawWave = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
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

    ctx.lineTo(canvasRef.current!.width, canvasRef.current!.height / 2);
    ctx.stroke();
  };

  // 绘制粒子效果（基于低频能量发射粒子）
  const drawParticles = (
    ctx: CanvasRenderingContext2D, 
    data: Uint8Array, 
    width: number, 
    height: number,
    centerX: number,
    centerY: number
  ) => {
    // 计算低频能量（前10个频段）
    let bassEnergy = 0;
    for (let i = 0; i < 10 && i < data.length; i++) {
      bassEnergy += data[i];
    }
    bassEnergy /= 10; // 平均值 0-255

    // 根据低频能量发射新粒子
    if (bassEnergy > 150) { // 阈值
      const count = Math.floor((bassEnergy - 150) / 20);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 1;
        particlesRef.current.push({
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

    // 更新和绘制粒子
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.01;

      if (p.life <= 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        particlesRef.current.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('0.8)', `${p.life})`);
      ctx.fill();
    }
    
    // 绘制中心圆，随音乐律动
    const radius = 20 + (bassEnergy / 255) * 30;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(200, 100%, 70%, 0.5)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  if (!showVisualizer) return null;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className={cn("relative w-full h-full min-h-[100px] overflow-hidden rounded-md bg-black/20 backdrop-blur-sm border border-white/10", className)}>
          <canvas 
            ref={canvasRef} 
            className="w-full h-full block"
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel>可视化效果</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem 
          checked={visualizationType === 'particles'}
          onCheckedChange={() => setVisualizationType('particles')}
        >
          粒子分散
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem 
          checked={visualizationType === 'bars'}
          onCheckedChange={() => setVisualizationType('bars')}
        >
          柱形频谱
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={visualizationType === 'wave'}
          onCheckedChange={() => setVisualizationType('wave')}
        >
          波形图
        </ContextMenuCheckboxItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};