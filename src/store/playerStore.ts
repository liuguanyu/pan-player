import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Playlist, PlaylistItem } from '@/types/file';
import { LyricLine } from '@/lib/lrc-parser';

export type PlaybackMode = 'order' | 'random' | 'single';

// Fisher-Yates 洗牌算法
function fisherYatesShuffle(arr: number[]): number[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 生成洗牌队列，确保队列开头不是当前曲目索引
function generateShuffleQueue(length: number, currentIndex: number): number[] {
  if (length <= 0) return [];
  const indices = Array.from({ length }, (_, i) => i);
  const shuffled = fisherYatesShuffle(indices);
  // 若队列第一个恰好是当前曲目，则将其移到末尾，避免"换歌"后还是同一首
  if (shuffled.length > 1 && shuffled[0] === currentIndex) {
    shuffled.push(shuffled.shift()!);
  }
  return shuffled;
}

interface PlayerState {
  // 播放状态
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackMode: PlaybackMode;
  playbackRate: number; // 播放速度
  
  // 随机播放队列
  shuffleQueue: number[];   // 存储随机排列的索引列表
  shuffleIndex: number;     // 当前在洗牌队列中的位置
  
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
  isEditingLyrics: boolean; // 是否处于歌词编辑模式
  
  // 音频可视化
  showVisualizer: boolean;
  visualizationType: 'particles' | 'bars' | 'wave' | 'sheep' | 'none';
  
  // 播放控制方法
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setPlaybackRate: (rate: number) => void;
  
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
  reorderPlaylists: (fromIndex: number, toIndex: number) => void; // 拖拽排序
  renamePlaylist: (oldName: string, newName: string) => void; // 重命名列表
  
  // 最近播放方法
  addRecentSong: (song: PlaylistItem) => void;
  removeRecentSong: (fs_id: number) => void;
  
  // 歌词方法
  setLyrics: (lyrics: string | null) => void;
  setParsedLyrics: (parsedLyrics: LyricLine[] | null) => void;
  setShowLyrics: (show: boolean) => void;
  setIsEditingLyrics: (isEditing: boolean) => void;
  updateLyricLine: (id: string, updates: Partial<LyricLine>) => void;
  addLyricLine: (time: number, text?: string) => string;
  insertLyricLine: (index: number, time: number, text?: string) => string;
  deleteLyricLine: (id: string) => void;
  
  // 音频可视化方法
  setShowVisualizer: (show: boolean) => void;
  setVisualizationType: (type: 'particles' | 'bars' | 'wave' | 'sheep' | 'none') => void;
  
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
      playbackRate: 1.0,
      shuffleQueue: [],
      shuffleIndex: -1,
      currentSong: null,
      playlists: [],
      currentPlaylist: null,
      recentSongs: [],
      lyrics: null,
      parsedLyrics: null,
      showLyrics: false,
      isEditingLyrics: false,
      showVisualizer: false,
      visualizationType: 'bars',
      
      // 播放控制方法
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setPlaybackMode: (playbackMode) => {
        const { currentPlaylist, playlists, currentSong } = get();
        // 切换到随机模式时，初始化洗牌队列
        if (playbackMode === 'random') {
          const playlist = playlists.find(p => p.name === currentPlaylist);
          if (playlist && playlist.items.length > 0) {
            const currentIndex = currentSong
              ? playlist.items.findIndex(item => item.fs_id === currentSong.fs_id)
              : -1;
            const shuffleQueue = generateShuffleQueue(playlist.items.length, currentIndex);
            set({ playbackMode, shuffleQueue, shuffleIndex: -1 });
            return;
          }
        }
        set({ playbackMode });
      },
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      
      // 歌曲控制方法
      setCurrentSong: (currentSong) => {
        set({
          currentSong,
          parsedLyrics: null, // 切换歌曲时清空歌词
          lyrics: null
        });
        
        // 通知主进程更新当前歌曲（用于系统托盘显示）
        if (currentSong && window.electronAPI?.updateCurrentSong) {
          window.electronAPI.updateCurrentSong(currentSong.server_filename);
        } else if (!currentSong && window.electronAPI?.updateCurrentSong) {
          window.electronAPI.updateCurrentSong('');
        }
      },
      playNext: () => {
        const { currentPlaylist, playlists, currentSong, playbackMode, shuffleQueue, shuffleIndex } = get();
        
        if (!currentPlaylist || !currentSong) return;
        
        const playlist = playlists.find(p => p.name === currentPlaylist);
        if (!playlist) return;
        
        const currentIndex = playlist.items.findIndex(item => item.fs_id === currentSong.fs_id);
        if (currentIndex === -1) return;
        
        let nextIndex: number;
        let newShuffleIndex = shuffleIndex;
        let newShuffleQueue = shuffleQueue;
        
        // 随机播放模式：使用洗牌队列按顺序取下一首
        if (playbackMode === 'random') {
          // 确保洗牌队列有效
          if (newShuffleQueue.length !== playlist.items.length) {
            newShuffleQueue = generateShuffleQueue(playlist.items.length, currentIndex);
            newShuffleIndex = -1;
          }
          const nextShuffleIndex = newShuffleIndex + 1;
          if (nextShuffleIndex >= newShuffleQueue.length) {
            // 队列播放完毕，重新生成洗牌队列
            newShuffleQueue = generateShuffleQueue(playlist.items.length, currentIndex);
            newShuffleIndex = 0;
          } else {
            newShuffleIndex = nextShuffleIndex;
          }
          nextIndex = newShuffleQueue[newShuffleIndex];
        }
        // 单曲循环模式保持当前索引不变
        else if (playbackMode === 'single') {
          nextIndex = currentIndex;
        }
        // 顺序播放模式，如果到末尾则回到开头
        else {
          nextIndex = currentIndex + 1;
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
            lyrics: null,
            shuffleQueue: newShuffleQueue,
            shuffleIndex: newShuffleIndex
          });
          // 添加到最近播放
          get().addRecentSong(nextSong);
          // 通知主进程更新当前歌曲
          if (window.electronAPI?.updateCurrentSong) {
            window.electronAPI.updateCurrentSong(nextSong.server_filename);
          }
        }
      },
      playPrevious: () => {
        const { currentPlaylist, playlists, currentSong, playbackMode, shuffleQueue, shuffleIndex } = get();
        
        if (!currentPlaylist || !currentSong) return;
        
        const playlist = playlists.find(p => p.name === currentPlaylist);
        if (!playlist) return;
        
        const currentIndex = playlist.items.findIndex(item => item.fs_id === currentSong.fs_id);
        if (currentIndex === -1) return;
        
        let prevIndex: number;
        let newShuffleIndex = shuffleIndex;
        let newShuffleQueue = shuffleQueue;
        
        // 随机播放模式：使用洗牌队列按顺序取上一首
        if (playbackMode === 'random') {
          // 确保洗牌队列有效
          if (newShuffleQueue.length !== playlist.items.length) {
            newShuffleQueue = generateShuffleQueue(playlist.items.length, currentIndex);
            newShuffleIndex = 0;
          }
          const prevShuffleIndex = newShuffleIndex - 1;
          if (prevShuffleIndex < 0) {
            // 已在队列开头，保持在第一个
            newShuffleIndex = 0;
          } else {
            newShuffleIndex = prevShuffleIndex;
          }
          prevIndex = newShuffleQueue[newShuffleIndex];
        }
        // 单曲循环模式保持当前索引不变
        else if (playbackMode === 'single') {
          prevIndex = currentIndex;
        }
        // 顺序播放模式，如果到开头则回到末尾
        else {
          prevIndex = currentIndex - 1;
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
            lyrics: null,
            shuffleQueue: newShuffleQueue,
            shuffleIndex: newShuffleIndex
          });
          // 添加到最近播放
          get().addRecentSong(prevSong);
          // 通知主进程更新当前歌曲
          if (window.electronAPI?.updateCurrentSong) {
            window.electronAPI.updateCurrentSong(prevSong.server_filename);
          }
        }
      },
      
      // 播放列表方法
      addPlaylist: (playlist) => set((state) => ({
        playlists: [...state.playlists, playlist]
      })),
      createPlaylist: (name, items) => set((state) => {
        // 检查是否存在同名列表
        const exists = state.playlists.some(p => p.name === name);
        // 播放列表内容变化时重置洗牌队列
        const shuffleReset = state.playbackMode === 'random' && state.currentPlaylist === name
          ? { shuffleQueue: generateShuffleQueue(items.length, -1), shuffleIndex: -1 }
          : {};
        if (exists) {
          // 如果存在，更新项目
          return {
            playlists: state.playlists.map(p =>
              p.name === name
                ? { ...p, items, update_time: Math.floor(Date.now() / 1000) }
                : p
            ),
            currentPlaylist: name,
            ...shuffleReset
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
      updatePlaylist: (playlist) => set((state) => {
        // 播放列表内容变化时重置洗牌队列
        const shuffleReset = state.playbackMode === 'random' && state.currentPlaylist === playlist.name
          ? { shuffleQueue: generateShuffleQueue(playlist.items.length, -1), shuffleIndex: -1 }
          : {};
        return {
          playlists: state.playlists.map(p => p.name === playlist.name ? playlist : p),
          ...shuffleReset
        };
      }),
      setCurrentPlaylist: (name) => set({ currentPlaylist: name }),
      updatePlaylistItemDuration: (fs_id, duration) => set((state) => ({
        playlists: state.playlists.map(playlist => ({
          ...playlist,
          items: playlist.items.map(item =>
            item.fs_id === fs_id ? { ...item, duration } : item
          )
        }))
      })),
      
      // 播放列表拖拽排序
      reorderPlaylists: (fromIndex, toIndex) => set((state) => {
        // 过滤掉"最近播放"，只对用户创建的播放列表进行排序
        const userPlaylists = state.playlists.filter(p => p.name !== '最近播放');
        const recentPlaylist = state.playlists.find(p => p.name === '最近播放');
        
        // 调整索引，因为"最近播放"始终在顶部
        const adjustedFromIndex = fromIndex;
        const adjustedToIndex = toIndex;
        
        // 创建新的播放列表数组
        const newPlaylists = [...userPlaylists];
        const [movedPlaylist] = newPlaylists.splice(adjustedFromIndex, 1);
        newPlaylists.splice(adjustedToIndex, 0, movedPlaylist);
        
        // 如果有"最近播放"，把它放在最前面
        if (recentPlaylist) {
          return { playlists: [recentPlaylist, ...newPlaylists] };
        }
        
        return { playlists: newPlaylists };
      }),
      
      // 重命名播放列表
      renamePlaylist: (oldName, newName) => set((state) => {
        // 检查新名称是否已存在
        if (state.playlists.some(p => p.name === newName)) {
          console.warn(`播放列表 ${newName} 已存在`);
          return state;
        }
        
        return {
          playlists: state.playlists.map(playlist =>
            playlist.name === oldName
              ? { ...playlist, name: newName }
              : playlist
          ),
          // 如果当前播放列表是被重命名的列表，更新当前播放列表名称
          currentPlaylist: state.currentPlaylist === oldName ? newName : state.currentPlaylist
        };
      }),
      
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
      setIsEditingLyrics: (isEditingLyrics) => set({ isEditingLyrics }),
      
      // 更新单个歌词行
      updateLyricLine: (id, updates) => set((state) => {
        if (!state.parsedLyrics) return {};

        // 查找要更新的行
        const currentLyrics = [...state.parsedLyrics];
        const lineIndex = currentLyrics.findIndex(line => line.id === id);
        
        if (lineIndex === -1) return {};
        
        // 原地更新该行，不改变其在数组中的位置
        currentLyrics[lineIndex] = { ...currentLyrics[lineIndex], ...updates };
        
        return { parsedLyrics: currentLyrics };
      }),
      
      // 添加新歌词行
      addLyricLine: (time, text = '') => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        set((state) => {
          const newLine = { id, time, text, isInterlude: false };
          const currentLyrics = state.parsedLyrics || [];
          
          // 优化：插入排序而不是全量排序
          // 找到第一个时间戳大于新行时间的位置
          const insertIndex = currentLyrics.findIndex(line => line.time > time);
          
          let updatedLyrics: LyricLine[];
          
          if (insertIndex === -1) {
            // 如果没找到（说明新行时间最大，或者列表为空），添加到末尾
            updatedLyrics = [...currentLyrics, newLine];
          } else {
            // 插入到找到的位置之前
            updatedLyrics = [
              ...currentLyrics.slice(0, insertIndex),
              newLine,
              ...currentLyrics.slice(insertIndex)
            ];
          }
          
          return {
            parsedLyrics: updatedLyrics
          };
        });
        return id;
      },
      
      // 在指定位置插入歌词行
      insertLyricLine: (index, time, text = '') => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        set((state) => {
          const newLine = { id, time, text, isInterlude: false };
          const currentLyrics = state.parsedLyrics || [];
          
          // 确保索引在有效范围内
          const safeIndex = Math.max(0, Math.min(index, currentLyrics.length));
          
          // 在指定位置插入
          const updatedLyrics = [
            ...currentLyrics.slice(0, safeIndex),
            newLine,
            ...currentLyrics.slice(safeIndex)
          ];
          
          return {
            parsedLyrics: updatedLyrics
          };
        });
        return id;
      },
      
      // 删除歌词行
      deleteLyricLine: (id) => set((state) => ({
        parsedLyrics: state.parsedLyrics?.filter(line => line.id !== id) || null
      })),
      
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
        playbackRate: state.playbackRate,
        playlists: state.playlists,
        recentSongs: state.recentSongs,
        showVisualizer: state.showVisualizer,
        visualizationType: state.visualizationType
      })
    }
  )
);