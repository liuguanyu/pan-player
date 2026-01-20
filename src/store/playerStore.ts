import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Playlist, PlaylistItem } from '@/types/file';
import { LyricLine } from '@/lib/lrc-parser';

export type PlaybackMode = 'order' | 'random' | 'single';

interface PlayerState {
  // 播放状态
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackMode: PlaybackMode;
  
  // 当前播放的歌曲
  currentSong: PlaylistItem | null;
  
  // 播放列表
  playlists: Playlist[];
  currentPlaylist: string | null; // 当前播放列表名称
  
  // 最近播放
  recentSongs: PlaylistItem[];
  
  // 歌词
  lyrics: string | null;
  parsedLyrics: LyricLine[] | null;
  showLyrics: boolean;
  
  // 音频可视化
  showVisualizer: boolean;
  visualizationType: 'particles' | 'bars' | 'wave' | 'sheep' | 'none';
  
  // 播放控制方法
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  
  // 歌曲控制方法
  setCurrentSong: (song: PlaylistItem | null) => void;
  playNext: () => void;
  playPrevious: () => void;
  
  // 播放列表方法
  addPlaylist: (playlist: Playlist) => void;
  createPlaylist: (name: string, items: PlaylistItem[]) => void;
  removePlaylist: (name: string) => void;
  updatePlaylist: (playlist: Playlist) => void;
  setCurrentPlaylist: (name: string) => void;
  updatePlaylistItemDuration: (fs_id: number, duration: number) => void;
  
  // 最近播放方法
  addRecentSong: (song: PlaylistItem) => void;
  removeRecentSong: (fs_id: number) => void;
  
  // 歌词方法
  setLyrics: (lyrics: string | null) => void;
  setParsedLyrics: (parsedLyrics: LyricLine[] | null) => void;
  setShowLyrics: (show: boolean) => void;
  
  // 音频可视化方法
  setShowVisualizer: (show: boolean) => void;
  setVisualizationType: (type: 'particles' | 'bars' | 'wave' | 'none') => void;
  
  // 重置播放器
  reset: () => void;
}

const MAX_RECENT_SONGS = 30;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 0.7,
      playbackMode: 'order',
      currentSong: null,
      playlists: [],
      currentPlaylist: null,
      recentSongs: [],
      lyrics: null,
      parsedLyrics: null,
      showLyrics: false,
      showVisualizer: false,
      visualizationType: 'bars',
      
      // 播放控制方法
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setPlaybackMode: (playbackMode) => set({ playbackMode }),
      
      // 歌曲控制方法
      setCurrentSong: (currentSong) => set({
        currentSong,
        parsedLyrics: null, // 切换歌曲时清空歌词
        lyrics: null
      }),
      playNext: () => {
        const { currentPlaylist, playlists, currentSong, playbackMode } = get();
        
        if (!currentPlaylist || !currentSong) return;
        
        const playlist = playlists.find(p => p.name === currentPlaylist);
        if (!playlist) return;
        
        const currentIndex = playlist.items.findIndex(item => item.fs_id === currentSong.fs_id);
        if (currentIndex === -1) return;
        
        let nextIndex = currentIndex + 1;
        
        // 随机播放模式
        if (playbackMode === 'random') {
          nextIndex = Math.floor(Math.random() * playlist.items.length);
        }
        // 单曲循环模式保持当前索引不变
        else if (playbackMode === 'single') {
          nextIndex = currentIndex;
        }
        // 顺序播放模式，如果到末尾则回到开头
        else if (playbackMode === 'order') {
          if (nextIndex >= playlist.items.length) {
            nextIndex = 0;
          }
        }
        
        const nextSong = playlist.items[nextIndex];
        if (nextSong) {
          set({
            currentSong: nextSong,
            isPlaying: true,
            parsedLyrics: null,
            lyrics: null
          });
          // 添加到最近播放
          get().addRecentSong(nextSong);
        }
      },
      playPrevious: () => {
        const { currentPlaylist, playlists, currentSong, playbackMode } = get();
        
        if (!currentPlaylist || !currentSong) return;
        
        const playlist = playlists.find(p => p.name === currentPlaylist);
        if (!playlist) return;
        
        const currentIndex = playlist.items.findIndex(item => item.fs_id === currentSong.fs_id);
        if (currentIndex === -1) return;
        
        let prevIndex = currentIndex - 1;
        
        // 随机播放模式
        if (playbackMode === 'random') {
          prevIndex = Math.floor(Math.random() * playlist.items.length);
        }
        // 单曲循环模式保持当前索引不变
        else if (playbackMode === 'single') {
          prevIndex = currentIndex;
        }
        // 顺序播放模式，如果到开头则回到末尾
        else if (playbackMode === 'order') {
          if (prevIndex < 0) {
            prevIndex = playlist.items.length - 1;
          }
        }
        
        const prevSong = playlist.items[prevIndex];
        if (prevSong) {
          set({
            currentSong: prevSong,
            isPlaying: true,
            parsedLyrics: null,
            lyrics: null
          });
          // 添加到最近播放
          get().addRecentSong(prevSong);
        }
      },
      
      // 播放列表方法
      addPlaylist: (playlist) => set((state) => ({
        playlists: [...state.playlists, playlist]
      })),
      createPlaylist: (name, items) => set((state) => {
        // 检查是否存在同名列表
        const exists = state.playlists.some(p => p.name === name);
        if (exists) {
          // 如果存在，更新项目
          return {
            playlists: state.playlists.map(p =>
              p.name === name
                ? { ...p, items, update_time: Math.floor(Date.now() / 1000) }
                : p
            ),
            currentPlaylist: name
          };
        } else {
          // 如果不存在，创建新列表
          const newPlaylist: Playlist = {
            name,
            description: 'Created from web interface',
            items,
            create_time: Math.floor(Date.now() / 1000),
            update_time: Math.floor(Date.now() / 1000)
          };
          return {
            playlists: [...state.playlists, newPlaylist],
            currentPlaylist: name
          };
        }
      }),
      removePlaylist: (name) => set((state) => ({
        playlists: state.playlists.filter(p => p.name !== name)
      })),
      updatePlaylist: (playlist) => set((state) => ({
        playlists: state.playlists.map(p => p.name === playlist.name ? playlist : p)
      })),
      setCurrentPlaylist: (name) => set({ currentPlaylist: name }),
      updatePlaylistItemDuration: (fs_id, duration) => set((state) => ({
        playlists: state.playlists.map(playlist => ({
          ...playlist,
          items: playlist.items.map(item =>
            item.fs_id === fs_id ? { ...item, duration } : item
          )
        }))
      })),
      
      // 最近播放方法
      addRecentSong: (song) => set((state) => {
        // 检查是否已存在
        const existingIndex = state.recentSongs.findIndex(s => s.fs_id === song.fs_id);
        let newRecentSongs = [...state.recentSongs];
        
        if (existingIndex !== -1) {
          // 如果已存在，移到开头
          newRecentSongs.splice(existingIndex, 1);
          newRecentSongs.unshift(song);
        } else {
          // 如果不存在，添加到开头
          newRecentSongs.unshift(song);
          
          // 如果超过最大数量，移除最后一个
          if (newRecentSongs.length > MAX_RECENT_SONGS) {
            newRecentSongs = newRecentSongs.slice(0, MAX_RECENT_SONGS);
          }
        }
        
        return { recentSongs: newRecentSongs };
      }),
      removeRecentSong: (fs_id) => set((state) => ({
        recentSongs: state.recentSongs.filter(s => s.fs_id !== fs_id)
      })),
      
      // 歌词方法
      setLyrics: (lyrics) => set({ lyrics }),
      setParsedLyrics: (parsedLyrics) => set({ parsedLyrics }),
      setShowLyrics: (showLyrics) => set({ showLyrics }),
      
      // 音频可视化方法
      setShowVisualizer: (showVisualizer) => set((state) => {
        // 如果开启可视化且当前类型为 none，则默认设置为 bars
        if (showVisualizer && state.visualizationType === 'none') {
          return { showVisualizer, visualizationType: 'bars' };
        }
        return { showVisualizer };
      }),
      setVisualizationType: (visualizationType) => set({ visualizationType }),
      
      // 重置播放器
      reset: () => set({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        currentSong: null,
        lyrics: null,
        showLyrics: false
      })
    }),
    {
      name: 'player-storage',
      partialize: (state) => ({
        volume: state.volume,
        playbackMode: state.playbackMode,
        playlists: state.playlists,
        recentSongs: state.recentSongs,
        showVisualizer: state.showVisualizer,
        visualizationType: state.visualizationType
      })
    }
  )
);