import React, { useState, useEffect } from 'react';
import { LoginDialog } from '@/components/auth/LoginDialog';
import PlayerControls from '@/components/player/PlayerControls';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { BackgroundAudio } from '@/components/player/BackgroundAudio';
import { PlaylistSidebar } from '@/components/playlist/PlaylistSidebar';
import { SongList } from '@/components/playlist/SongList';
import { LyricsDisplay } from '@/components/lyrics/LyricsDisplay';
import { AudioVisualizer } from '@/components/player/AudioVisualizer';
import { usePlayerStore, PlaybackMode } from '@/store/playerStore';

const App: React.FC = () => {
  // 优化状态选择，避免不必要的重渲染
  // 只选择需要的状态
  const showLyrics = usePlayerStore(state => state.showLyrics);
  const setShowLyrics = usePlayerStore(state => state.setShowLyrics);
  const showVisualizer = usePlayerStore(state => state.showVisualizer);
  const setShowVisualizer = usePlayerStore(state => state.setShowVisualizer);
  const currentSong = usePlayerStore(state => state.currentSong);
  const playNext = usePlayerStore(state => state.playNext);
  const playPrevious = usePlayerStore(state => state.playPrevious);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying);
  const volume = usePlayerStore(state => state.volume);
  const setVolume = usePlayerStore(state => state.setVolume);
  const playbackMode = usePlayerStore(state => state.playbackMode);
  const setPlaybackMode = usePlayerStore(state => state.setPlaybackMode);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(0.7);

  // 应用启动时重置可视化状态
  useEffect(() => {
    setShowVisualizer(false);
  }, [setShowVisualizer]);

  // 更新窗口标题
  useEffect(() => {
    if (currentSong) {
      // 获取歌曲名（去除文件扩展名）
      const songName = currentSong.server_filename.replace(/\.[^/.]+$/, '');
      document.title = `${songName} - 度盘播放器`;
    } else {
      document.title = '度盘播放器';
    }
  }, [currentSong]);

  // 监听迷你模式变化（通过 IPC 事件）
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onMiniModeChange) {
      const cleanup = window.electronAPI.onMiniModeChange((isMini: boolean) => {
        setIsMiniMode(isMini);
      });
      return cleanup;
    }
  }, []);

  // 同时也监听窗口大小变化作为备用
  useEffect(() => {
    const checkMiniMode = () => {
      // 如果窗口高度小于200px，认为是迷你模式
      setIsMiniMode(window.innerHeight < 200);
    };

    checkMiniMode();
    window.addEventListener('resize', checkMiniMode);
    return () => window.removeEventListener('resize', checkMiniMode);
  }, []);

  // 监听来自托盘和快捷键的播放控制消息
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onPlayerControl) {
      const cleanup = window.electronAPI.onPlayerControl((action: string) => {
        console.log('[App] 收到播放控制命令:', action);
        switch (action) {
          case 'next':
            playNext();
            break;
          case 'previous':
            playPrevious();
            break;
          case 'play-pause':
            setIsPlaying(!isPlaying);
            break;
          case 'mute':
            // 切换静音状态
            const newMutedState = !isMuted;
            if (newMutedState) {
              // 静音，保存当前音量并设置为0
              setPreviousVolume(volume);
              setVolume(0);
            } else {
              // 取消静音，恢复之前的音量
              setVolume(previousVolume);
            }
            setIsMuted(newMutedState);
            break;
          case 'volume-up':
            setVolume(Math.min(1, volume + 0.1)); // 增加音量
            break;
          case 'volume-down':
            setVolume(Math.max(0, volume - 0.1)); // 减少音量
            break;
          case 'toggle-playback-mode':
            // 切换播放模式: order -> random -> single -> order
            const modes: PlaybackMode[] = ['order', 'random', 'single'];
            const currentIndex = modes.indexOf(playbackMode);
            const nextIndex = (currentIndex + 1) % modes.length;
            setPlaybackMode(modes[nextIndex]);
            break;
          default:
            console.log('[App] 未知的播放控制命令:', action);
        }
      });
      return cleanup;
    }
  }, [playNext, playPrevious, isPlaying, setIsPlaying, volume, setVolume, playbackMode, setPlaybackMode, isMuted, previousVolume]);

  // 当isMuted状态改变时，同步到主进程
  useEffect(() => {
    if (window.electronAPI?.updateMuteState) {
      window.electronAPI.updateMuteState(isMuted);
    }
  }, [isMuted]);

  // 监听来自主进程的静音状态变化
  useEffect(() => {
    if (window.electronAPI?.onMuteChange) {
      const cleanup = window.electronAPI.onMuteChange((muted: boolean) => {
        if (muted !== isMuted) {
          if (muted) {
            setPreviousVolume(volume);
            setVolume(0);
            setIsMuted(true);
          } else {
            setVolume(previousVolume);
            setIsMuted(false);
          }
        }
      });
      return cleanup;
    }
  }, [isMuted, volume, previousVolume, setVolume]);

  // 迷你模式下直接渲染 MiniPlayer
  if (isMiniMode) {
    return (
      <div className="h-screen w-full">
        <BackgroundAudio />
        <MiniPlayer />
      </div>
    );
  }

  // 正常模式渲染完整界面
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col h-screen overflow-hidden">
      {/* Background Audio - Always present to maintain playback continuity */}
      <BackgroundAudio />
      
      {/* Login Dialog - Always rendered but controlled by internal state */}
      <LoginDialog />

      {/* Header / Player Area */}
      <header className="border-b h-[120px] flex-shrink-0 bg-gradient-to-r from-blue-900 via-blue-800 to-gray-100 z-10">
        <div className="h-full px-4 py-2 w-full">
          <PlayerControls
            onToggleLyrics={() => setShowLyrics(!showLyrics)}
            onToggleVisualizer={() => setShowVisualizer(!showVisualizer)}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Playlists */}
        <PlaylistSidebar />

        {/* Content: Song List */}
        <div className="flex-1 bg-background flex flex-col overflow-hidden relative">
          {/* Song List with Header */}
          <SongList />
          
          {/* Audio Visualizer Overlay */}
          {showVisualizer && <AudioVisualizer className="absolute inset-0 z-10" />}
          
          {/* Lyrics Overlay */}
          {showLyrics && <LyricsDisplay onClose={() => setShowLyrics(false)} />}
        </div>
      </main>
    </div>
  );
};

export default App;