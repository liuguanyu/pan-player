import React, { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { usePlayerStore } from '@/store/playerStore';
import { formatTime } from '@/lib/utils';
import { PlaybackMode } from '@/store/playerStore';
import { useAuth } from '@/hooks/useAuth';
import { FileText, LogOut, Minimize2, Repeat, Repeat1, Shuffle, Waves, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PlayerControlsProps {
  onToggleLyrics?: () => void;
  onToggleVisualizer?: () => void;
}

// 使用 memo 包装 PlayerControls 组件，避免不必要的重渲染
const PlayerControls: React.FC<PlayerControlsProps> = memo(({ onToggleLyrics, onToggleVisualizer }) => {
  const { userInfo, logout } = useAuth();
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackMode,
    playbackRate,
    currentSong,
    showVisualizer,
    setIsPlaying,
    setCurrentTime,
    setVolume,
    setPlaybackMode,
    setPlaybackRate,
    playNext,
    playPrevious,
    lrcMetadata
  } = usePlayerStore();
  
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  // 可用的播放速度选项
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
  
  // 格式化时间显示
  const formattedCurrentTime = formatTime(currentTime);
  const formattedDuration = formatTime(duration);
  
  // 播放模式图标组件映射
  const getPlaybackModeIcon = (mode: PlaybackMode) => {
    switch (mode) {
      case 'order':
        return <Repeat className="h-4 w-4" />;
      case 'random':
        return <Shuffle className="h-4 w-4" />;
      case 'single':
        return <Repeat1 className="h-4 w-4" />;
      default:
        return <Repeat className="h-4 w-4" />;
    }
  };
  
  // 播放模式提示文本
  const playbackModeTitles = {
    order: '顺序播放',
    random: '随机播放',
    single: '单曲循环'
  };
  
  // 切换播放模式
  const togglePlaybackMode = () => {
    const modes: PlaybackMode[] = ['order', 'random', 'single'];
    const currentIndex = modes.indexOf(playbackMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setPlaybackMode(modes[nextIndex]);
  };
  
  // 播放/暂停切换
  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };
  
  // 处理进度条变化
  const handleProgressChange = (value: number[]) => {
    setCurrentTime(value[0]);
  };
  
  // 处理音量变化
  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };
  
  const displayTitle = lrcMetadata && (lrcMetadata.ti || lrcMetadata.ar) 
    ? `${lrcMetadata.ti || ''}${lrcMetadata.ar ? ` - ${lrcMetadata.ar}` : ''}`
    : (currentSong ? currentSong.server_filename : '未播放音乐');

  return (
    <div className="flex flex-col h-full">
        {/* 歌曲信息和控制按钮 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 overflow-hidden">
            <h2
              className="text-lg font-semibold whitespace-nowrap text-white drop-shadow-md"
              style={{
                animation: currentSong && displayTitle.length > 20 ? 'scroll 10s linear infinite' : 'none'
              }}
            >
              {displayTitle}
            </h2>
            <style>{`
              @keyframes scroll {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
            `}</style>
          </div>
          
          <div className="flex items-center space-x-4 mx-4 text-white">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:text-white/80 hover:bg-white/10"
              onClick={playPrevious}
              disabled={!currentSong}
            >
              ⏮
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-14 w-14 text-white hover:text-white/80 hover:bg-white/10"
              onClick={togglePlayPause}
              disabled={!currentSong}
            >
              {isPlaying ? (
                '⏸'
              ) : (
                '▶'
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:text-white/80 hover:bg-white/10"
              onClick={playNext}
              disabled={!currentSong}
            >
              ⏭
            </Button>
          </div>
          
          <div className="flex justify-end items-center space-x-2 bg-black/20 px-3 py-1 rounded-lg backdrop-blur-sm">
            {userInfo && (
              <>
                <span className="text-sm text-white font-medium">
                  {userInfo.netdisk_name || userInfo.baidu_name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  title="退出登录"
                  className="text-white hover:text-white/80 hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        
        {/* 进度条和音量控制 */}
        <div className="flex items-center space-x-4">
          <span className="text-xs text-white/80 w-10 text-right font-medium">
            {formattedCurrentTime}
          </span>
          
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleProgressChange}
            className="flex-1"
            disabled={!currentSong}
          />
          
          <span className="text-xs text-white/80 w-10 font-medium">
            {formattedDuration}
          </span>
          
          <div className="w-32 flex items-center space-x-2 text-white/90">
            <span className="text-xs">🔊</span>
            <Slider
              value={[volume]}
              max={1}
              step={0.01}
              onValueChange={handleVolumeChange}
              className="flex-1"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-white hover:text-white/80 hover:bg-white/10 flex items-center gap-0.5 min-w-[3.5rem]"
                title={`播放速度: ${playbackRate}x`}
                disabled={!currentSong}
              >
                <span className="text-xs font-bold">{playbackRate}x</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {playbackRates.map((rate) => (
                <DropdownMenuItem
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={playbackRate === rate ? 'bg-accent' : ''}
                >
                  <span className="flex items-center justify-between w-full">
                    <span>{rate}x</span>
                    {rate === 1 && <span className="text-xs text-muted-foreground ml-2">(正常)</span>}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 hover:text-white/80 hover:bg-white/10 ${showVisualizer ? 'text-white' : 'text-white/60'}`}
            onClick={onToggleVisualizer}
            title="显示可视化"
            disabled={!currentSong}
          >
            <Waves className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-white/80 hover:bg-white/10"
            onClick={onToggleLyrics}
            title="显示歌词"
            disabled={!currentSong}
          >
            <FileText className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-white/80 hover:bg-white/10"
            onClick={togglePlaybackMode}
            title={playbackModeTitles[playbackMode]}
          >
            {getPlaybackModeIcon(playbackMode)}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-white/80 hover:bg-white/10"
            onClick={() => {
              if (window.electronAPI && window.electronAPI.toggleMiniMode) {
                window.electronAPI.toggleMiniMode(true);
              }
            }}
            title="迷你模式"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
    </div>
  );
});

// 为 memo 组件设置显示名称
PlayerControls.displayName = 'PlayerControls';

export default PlayerControls;