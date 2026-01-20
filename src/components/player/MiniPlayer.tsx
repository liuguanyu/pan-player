import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { Button } from '@/components/ui/button';
import { Play, Pause, SkipBack, SkipForward, Maximize2 } from 'lucide-react';
import { getCurrentLyricIndex } from '@/lib/lrc-parser';

export const MiniPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    setIsPlaying,
    currentTime,
    playbackRate,
    parsedLyrics,
    playNext,
    playPrevious
  } = usePlayerStore();
  
  const [isHovered, setIsHovered] = useState(false);
  const [currentLyricText, setCurrentLyricText] = useState('');

  // 更新当前歌词
  useEffect(() => {
    if (parsedLyrics && parsedLyrics.length > 0) {
      const index = getCurrentLyricIndex(parsedLyrics, currentTime);
      if (index >= 0 && index < parsedLyrics.length) {
        setCurrentLyricText(parsedLyrics[index].text);
      }
    } else if (currentSong) {
      setCurrentLyricText(currentSong.server_filename);
    } else {
      setCurrentLyricText('暂无播放');
    }
  }, [parsedLyrics, currentTime, currentSong]);

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
      className="relative w-full h-full bg-gradient-to-r from-blue-900 via-blue-800 to-gray-100 flex items-center justify-between px-4 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 歌词/歌名显示 */}
      <div className="flex-1 flex items-center gap-2">
        <div
          className={`flex-1 text-white text-sm font-medium truncate transition-opacity duration-300 ${
            isHovered ? 'opacity-30' : 'opacity-100'
          }`}
        >
          {currentLyricText}
        </div>
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
          className="h-8 w-8 text-white hover:bg-white/20"
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        {/* 播放/暂停 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          className="h-10 w-10 text-white hover:bg-white/20"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current" />
          )}
        </Button>

        {/* 下一曲 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={playNext}
          className="h-8 w-8 text-white hover:bg-white/20"
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* 切换回大窗口 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleMiniMode}
          className="h-8 w-8 text-white hover:bg-white/20 ml-2"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};