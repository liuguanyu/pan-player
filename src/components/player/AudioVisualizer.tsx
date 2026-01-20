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
import { drawBars } from './visualizations/BarsVisualizer';
import { drawWave } from './visualizations/WaveVisualizer';
import { drawParticles, clearParticles } from './visualizations/ParticlesVisualizer';

interface AudioVisualizerProps {
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const { visualizationType, setVisualizationType, isPlaying, showVisualizer } = usePlayerStore();

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
      // 清除粒子
      clearParticles();
    };
  }, [visualizationType, isPlaying, showVisualizer]);

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