import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { PlaylistItem } from '@/types/file';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Search, X } from 'lucide-react';
import { playlistService } from '@/services/playlist.service';

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatDuration = (seconds: number | undefined): string => {
  if (!seconds || seconds <= 0) return '--:--';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface SongRowProps {
  song: PlaylistItem;
  index: number;
  isPlaying: boolean;
  isSearchResult?: boolean;
  isCurrentSearchResult?: boolean;
  onDoubleClick: (song: PlaylistItem) => void;
  onRemove: (e: React.MouseEvent, song: PlaylistItem) => void;
  rowRef?: ((el: HTMLTableRowElement | null) => void) | React.RefObject<HTMLTableRowElement>;
}

// 单个歌曲行组件 - 使用 memo 优化性能
const SongRow = memo(({
  song,
  index,
  isPlaying,
  isSearchResult,
  isCurrentSearchResult,
  onDoubleClick,
  onRemove,
  rowRef
}: SongRowProps) => {
  return (
    <tr
      ref={rowRef}
      key={song.fs_id}
      className={`group border-b hover:bg-accent/50 cursor-pointer transition-colors ${
        isPlaying ? 'bg-accent' : ''
      } ${isCurrentSearchResult ? 'bg-yellow-200/50 dark:bg-yellow-900/30' : ''} ${
        isSearchResult && !isCurrentSearchResult ? 'bg-yellow-100/30 dark:bg-yellow-900/10' : ''
      }`}
      onDoubleClick={() => onDoubleClick(song)}
    >
      <td className="py-2 px-2 text-center text-sm text-muted-foreground w-12">
        {isPlaying ? '▶' : index + 1}
      </td>
      <td className="py-2 px-2 overflow-hidden">
        <div className="truncate font-medium" title={song.server_filename}>{song.server_filename}</div>
        <div className="text-xs text-muted-foreground truncate">
          {new Date(song.server_mtime * 1000).toLocaleDateString()}
        </div>
      </td>
      <td className="py-2 px-2 text-center text-sm text-muted-foreground w-16">
        {formatDuration(song.duration)}
      </td>
      <td className="py-2 px-2 text-right text-sm text-muted-foreground w-20">
        {formatFileSize(song.size)}
      </td>
      <td className="py-2 px-2 text-center w-8">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => onRemove(e, song)}
          title="从列表移除"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </td>
    </tr>
  );
});

SongRow.displayName = 'SongRow';

export const SongList = () => {
  // 优化状态选择，只订阅需要的状态
  const playlists = usePlayerStore(state => state.playlists);
  const currentPlaylist = usePlayerStore(state => state.currentPlaylist);
  const recentSongs = usePlayerStore(state => state.recentSongs);
  const currentSong = usePlayerStore(state => state.currentSong);
  const setCurrentSong = usePlayerStore(state => state.setCurrentSong);
  const addRecentSong = usePlayerStore(state => state.addRecentSong);
  const removeRecentSong = usePlayerStore(state => state.removeRecentSong);
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying);

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaylistItem[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 用于引用当前播放歌曲的行元素
  const currentSongRowRef = useRef<HTMLTableRowElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchResultRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // 获取当前显示的歌曲列表
  const getSongs = (): PlaylistItem[] => {
    if (currentPlaylist === 'recent') {
      return recentSongs;
    }
    
    const playlist = playlists.find(p => p.name === currentPlaylist);
    return playlist?.items || [];
  };

  const songs = getSongs();

  // 模糊搜索歌曲
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = songs.filter(song =>
      song.server_filename.toLowerCase().includes(lowerQuery)
    );
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
  }, [songs]);

  // 处理搜索输入变化
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    performSearch(query);
  };

  // 切换到下一个搜索结果
  const goToNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
  }, [searchResults.length, currentSearchIndex]);

  // 切换到上一个搜索结果
  const goToPrevResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex === 0
      ? searchResults.length - 1
      : currentSearchIndex - 1;
    setCurrentSearchIndex(prevIndex);
  }, [searchResults.length, currentSearchIndex]);

  // 关闭搜索
  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentSearchIndex(0);
  }, []);

  // 监听 Ctrl/Cmd+F 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F 打开搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      
      // ESC 关闭搜索
      if (e.key === 'Escape' && showSearch) {
        closeSearch();
      }
      
      // 上下键切换搜索结果
      if (showSearch && searchResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          goToNextResult();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          goToPrevResult();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, searchResults.length, goToNextResult, goToPrevResult, closeSearch]);

  // 滚动到当前搜索结果
  useEffect(() => {
    if (searchResults.length > 0 && containerRef.current) {
      const currentResult = searchResults[currentSearchIndex];
      const rowElement = searchResultRefs.current.get(currentResult.fs_id);
      
      if (rowElement) {
        const container = containerRef.current;
        const rowRect = rowElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        const isVisible =
          rowRect.top >= containerRect.top &&
          rowRect.bottom <= containerRect.bottom;
        
        if (!isVisible) {
          const scrollTop = rowElement.offsetTop - container.offsetTop - (container.clientHeight / 2) + (rowElement.clientHeight / 2);
          container.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [currentSearchIndex, searchResults]);

  // 当当前歌曲变化时，自动滚动到视口
  useEffect(() => {
    if (currentSongRowRef.current && containerRef.current) {
      const row = currentSongRowRef.current;
      const container = containerRef.current;
      
      // 获取行和容器的位置信息
      const rowRect = row.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // 检查行是否在视口内
      const isVisible =
        rowRect.top >= containerRect.top &&
        rowRect.bottom <= containerRect.bottom;
      
      // 如果不在视口内，滚动到视口中心
      if (!isVisible) {
        const scrollTop = row.offsetTop - container.offsetTop - (container.clientHeight / 2) + (row.clientHeight / 2);
        container.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [currentSong?.fs_id]);

  // 双击播放歌曲
  const handleSongDoubleClick = (song: PlaylistItem) => {
    setCurrentSong(song);
    addRecentSong(song);
    setIsPlaying(true);
  };

  // 从列表移除歌曲
  const handleRemoveSong = (e: React.MouseEvent, song: PlaylistItem) => {
    e.stopPropagation();
    
    if (currentPlaylist === 'recent') {
      removeRecentSong(song.fs_id);
    } else if (currentPlaylist) {
      playlistService.removeFromPlaylist(currentPlaylist, song.fs_id);
    }
  };

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p>暂无歌曲</p>
        <p className="text-sm">请选择或创建一个列表</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      {showSearch && (
        <div className="flex items-center gap-2 p-2 border-b bg-background/95 backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="搜索歌曲..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="flex-1 h-8"
          />
          {searchResults.length > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentSearchIndex + 1} / {searchResults.length}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={closeSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <table className="w-full border-collapse table-fixed">
        <thead className="sticky top-0 bg-background border-b z-10">
          <tr className="text-sm text-muted-foreground">
            <th className="w-12 py-2 px-2 text-center font-medium">#</th>
            <th className="py-2 px-2 text-left font-medium" style={{ width: 'calc(100% - 14rem)' }}>标题</th>
            <th className="w-16 py-2 px-2 text-center font-medium">时长</th>
            <th className="w-20 py-2 px-2 text-right font-medium">大小</th>
            <th className="w-8 py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>
          {songs.map((song, index) => {
            const isPlaying = currentSong?.fs_id === song.fs_id;
            const isSearchResult = searchResults.some(r => r.fs_id === song.fs_id);
            const isCurrentSearchResult = searchResults.length > 0 &&
              searchResults[currentSearchIndex]?.fs_id === song.fs_id;
            
            return (
              <SongRow
                key={song.fs_id}
                song={song}
                index={index}
                isPlaying={isPlaying}
                isSearchResult={isSearchResult}
                isCurrentSearchResult={isCurrentSearchResult}
                onDoubleClick={handleSongDoubleClick}
                onRemove={handleRemoveSong}
                rowRef={(el: HTMLTableRowElement | null) => {
                  if (isPlaying && el) {
                    (currentSongRowRef as React.MutableRefObject<HTMLTableRowElement | null>).current = el;
                  }
                  if (isSearchResult && el) {
                    searchResultRefs.current.set(song.fs_id, el);
                  }
                }}
              />
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};