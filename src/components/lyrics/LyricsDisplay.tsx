import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { parseLRC, getCurrentLyricIndex, LyricLine } from '@/lib/lrc-parser';
import { Button } from '@/components/ui/button';
import { Upload, X } from 'lucide-react';
interface LyricsDisplayProps {
  onClose: () => void;
}

export const LyricsDisplay: React.FC<LyricsDisplayProps> = ({ onClose }) => {
  const { currentTime, parsedLyrics, setParsedLyrics } = usePlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [lyrics, setLyrics] = React.useState<LyricLine[]>(parsedLyrics || []);
  const [currentIndex, setCurrentIndex] = React.useState(-1);
  const lastScrollIndexRef = useRef(-1);

  // 当 store 中的 parsedLyrics 变化时，更新本地状态
  useEffect(() => {
    setLyrics(parsedLyrics || []);
    lastScrollIndexRef.current = -1; // 重置滚动索引
  }, [parsedLyrics]);

  // 根据当前播放时间更新当前歌词索引 - 优化性能，减少计算频率
  useEffect(() => {
    if (lyrics.length > 0) {
      const index = getCurrentLyricIndex(lyrics, currentTime);
      // 只有当索引真正变化时才更新状态
      if (index !== currentIndex) {
        setCurrentIndex(index);
      }
    }
  }, [currentTime, lyrics, currentIndex]);

  // 自动滚动到当前歌词 - 优化性能，只在索引变化时滚动
  useEffect(() => {
    // 只有当索引变化时才滚动，避免频繁的 DOM 操作
    if (currentIndex >= 0 && currentIndex !== lastScrollIndexRef.current && containerRef.current) {
      lastScrollIndexRef.current = currentIndex;
      
      // 使用 requestAnimationFrame 来优化滚动性能
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        
        // 获取歌词容器（containerRef.current.children[0] 是内部的 max-w-2xl div）
        const lyricsContainer = containerRef.current.children[0];
        const currentElement = lyricsContainer.children[currentIndex] as HTMLElement;
        
        if (currentElement) {
          currentElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      });
    }
  }, [currentIndex]);

  // 手动选择LRC文件
  const handleSelectLRCFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lrc';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const parsed = parseLRC(content);
        setLyrics(parsed);
        setParsedLyrics(parsed);
      } catch (error) {
        console.error('解析LRC文件失败:', error);
        alert('解析LRC文件失败');
      }
    };

    input.click();
  };

  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 flex flex-col">
      {/* 关闭按钮 */}
      <div className="absolute top-4 right-4 z-10">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* 歌词内容 */}
      <div className="flex-1 overflow-y-auto" ref={containerRef}>
        <div className="max-w-2xl mx-auto space-y-6 py-[50vh]">
          {lyrics.length > 0 ? (
            lyrics.map((line, index) => (
              <div
                key={index}
                className={`text-center transition-all duration-300 cursor-pointer hover:text-primary ${
                  index === currentIndex
                    ? 'text-2xl font-bold text-primary scale-110'
                    : 'text-lg text-muted-foreground opacity-50 hover:opacity-100'
                }`}
                onClick={() => {
                  const player = usePlayerStore.getState();
                  if (player.currentSong) {
                    const audio = document.querySelector('audio');
                    if (audio) {
                      audio.currentTime = line.time;
                    }
                  }
                }}
              >
                {line.text}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <p className="text-lg text-muted-foreground">暂无歌词</p>
              <Button
                variant="outline"
                onClick={handleSelectLRCFile}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                选择LRC文件
              </Button>
              <p className="text-sm text-muted-foreground">
                支持自动关联同文件夹下的.lrc文件
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      {lyrics.length > 0 && (
        <div className="border-t p-4 flex justify-center">
          <Button
            variant="outline"
            onClick={handleSelectLRCFile}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            更换歌词文件
          </Button>
        </div>
      )}
    </div>
  );
};