import React, { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { Button } from '@/components/ui/button';
import { Play, Pause, SkipBack, SkipForward, Maximize2 } from 'lucide-react';
import { getCurrentLyricIndex } from '@/lib/lrc-parser';

const MarqueeText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [scrollAmount, setScrollAmount] = useState(0);

  useEffect(() => {
    const checkScroll = () => {
      if (containerRef.current && textRef.current) {
        // 先移除动画以便准确测量
        textRef.current.style.transition = 'none';
        textRef.current.style.transform = 'none';
        
        requestAnimationFrame(() => {
          if (!containerRef.current || !textRef.current) return;
          const containerWidth = containerRef.current.clientWidth;
          const textWidth = textRef.current.scrollWidth;
          
          if (textWidth > containerWidth) {
            setScrollAmount(textWidth - containerWidth);
          } else {
            setScrollAmount(0);
          }
        });
      }
    };
    
    checkScroll();
    window.addEventListener('resize', checkScroll);
    
    const timer = setTimeout(checkScroll, 100);
    return () => {
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    if (scrollAmount > 0 && textRef.current) {
      const el = textRef.current;
      el.style.transform = 'translateX(0px)';
      el.style.transition = 'none';
      
      const timer = setTimeout(() => {
        if (!el) return;
        // 根据滚动距离动态计算时间，这里假设速度是每秒30像素
        const duration = Math.max(2000, scrollAmount * 30);
        el.style.transition = `transform ${duration}ms linear`;
        el.style.transform = `translateX(-${scrollAmount}px)`;
      }, 1000); // 停顿1秒后开始滚动
      
      return () => clearTimeout(timer);
    } else if (textRef.current) {
      textRef.current.style.transition = 'none';
      textRef.current.style.transform = 'none';
    }
  }, [scrollAmount, text]);

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className || ''}`}>
      <span ref={textRef} className="block pr-1 w-max" style={{ minWidth: '100%' }}>
        {text}
      </span>
    </div>
  );
};

export const MiniPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    setIsPlaying,
    currentTime,
    playbackRate,
    parsedLyrics,
    lrcMetadata,
    playNext,
    playPrevious
  } = usePlayerStore();
  
  const [isHovered, setIsHovered] = useState(false);
  const [currentLyricText, setCurrentLyricText] = useState('');

  // 更新当前歌词
  useEffect(() => {
    if (parsedLyrics && parsedLyrics.length > 0) {
      const offsetInSeconds = (lrcMetadata?.offset || 0) / 1000;
      const index = getCurrentLyricIndex(parsedLyrics, currentTime + offsetInSeconds);
      
      if (index >= 0 && index < parsedLyrics.length) {
        setCurrentLyricText(parsedLyrics[index].text);
      } else {
        if (lrcMetadata && (lrcMetadata.ti || lrcMetadata.ar)) {
          const title = lrcMetadata.ti || '';
          const artist = lrcMetadata.ar ? ` - ${lrcMetadata.ar}` : '';
          setCurrentLyricText(`${title}${artist}`);
        } else if (currentSong) {
          setCurrentLyricText(currentSong.server_filename);
        } else {
          setCurrentLyricText('暂无播放');
        }
      }
    } else if (currentSong) {
      if (lrcMetadata && (lrcMetadata.ti || lrcMetadata.ar)) {
        const title = lrcMetadata.ti || '';
        const artist = lrcMetadata.ar ? ` - ${lrcMetadata.ar}` : '';
        setCurrentLyricText(`${title}${artist}`);
      } else {
        setCurrentLyricText(currentSong.server_filename);
      }
    } else {
      setCurrentLyricText('暂无播放');
    }
  }, [parsedLyrics, lrcMetadata, currentTime, currentSong]);

  const handleToggleMiniMode = () => {
    if (window.electronAPI && window.electronAPI.toggleMiniMode) {
      window.electronAPI.toggleMiniMode(false);
    }
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div
      className="relative flex items-center justify-between w-full h-full px-4 overflow-hidden bg-gradient-to-r from-blue-900 via-blue-800 to-gray-100"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 歌词/歌名显示 */}
      <div className="flex items-center flex-1 gap-2 overflow-hidden">
        <MarqueeText
          text={currentLyricText}
          className={`flex-1 text-white text-sm font-medium transition-opacity duration-300 ${
            isHovered ? 'opacity-30' : 'opacity-100'
          }`}
        />
        {playbackRate !== 1 && (
          <div
            className={`text-xs text-white/80 font-bold bg-white/20 px-2 py-0.5 rounded transition-opacity duration-300 ${
              isHovered ? 'opacity-30' : 'opacity-100'
            }`}
          >
            {playbackRate}x
          </div>
        )}
      </div>

      {/* 控制按钮 - 鼠标悬停时显示 */}
      <div
        className={`absolute inset-0 flex items-center justify-center gap-2 bg-gray-900/90 transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 上一曲 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={playPrevious}
          className="w-8 h-8 text-white hover:bg-white/20"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        {/* 播放/暂停 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          className="w-10 h-10 text-white hover:bg-white/20"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current" />
          )}
        </Button>

        {/* 下一曲 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={playNext}
          className="w-8 h-8 text-white hover:bg-white/20"
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        {/* 切换回大窗口 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleMiniMode}
          className="w-8 h-8 ml-2 text-white hover:bg-white/20"
        >
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};