import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { PlaylistItem } from '@/types/file';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Search, X, Download, RefreshCw, Scissors } from 'lucide-react';
import { playlistService } from '@/services/playlist.service';
import { baiduAPI } from '@/services/baidu-api.service';
import { baiduAuth } from '@/services/auth.service';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { CueSplitDialog } from './CueSplitDialog';

// 无损音频格式
const LOSSLESS_FORMATS = ['.wav', '.flac', '.ape', '.wv', '.tak', '.tta', '.aiff', '.aif'];

function isLosslessFormat(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return LOSSLESS_FORMATS.includes(ext);
}

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
  onDownload: (e: React.MouseEvent, song: PlaylistItem) => void;
  onCueSplit: (song: PlaylistItem) => void;
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
  onDownload,
  onCueSplit,
  rowRef
}: SongRowProps) => {
  const isLossless = isLosslessFormat(song.server_filename);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate flex-1" title={song.path}>{song.path}</span>
              <span className="shrink-0 text-right min-w-[80px]">
                {new Date(song.server_mtime * 1000).toLocaleDateString()}
              </span>
            </div>
          </td>
          <td className="py-2 px-2 text-center text-sm text-muted-foreground w-16">
            {formatDuration(song.duration)}
          </td>
          <td className="py-2 px-2 text-right text-sm text-muted-foreground w-20">
            {formatFileSize(song.size)}
          </td>
          <td className="py-2 px-2 text-center w-16">
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => onDownload(e, song)}
                title="下载到本地"
              >
                <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => onRemove(e, song)}
                title="从列表移除"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          </td>
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onDoubleClick(song)}>
          播放
        </ContextMenuItem>
        <ContextMenuItem onSelect={(e) => onDownload(e as any, song)}>
          下载到本地
        </ContextMenuItem>
        <ContextMenuItem onSelect={(e) => onRemove(e as any, song)} className="text-destructive focus:text-destructive">
          从列表移除
        </ContextMenuItem>
        {isLossless && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => onCueSplit(song)}
              className="gap-2"
            >
              <Scissors className="h-4 w-4" />
              无损分轨
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
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
  const updatePlaylist = usePlayerStore(state => state.updatePlaylist);
  
  // 同步相关状态
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // CUE 分轨相关状态
  const [cueSplitSong, setCueSplitSong] = useState<PlaylistItem | null>(null);
  const [cueSplitPath, setCueSplitPath] = useState('');
  const [cueSplitFsId, setCueSplitFsId] = useState(0);
  const [cueChecking, setCueChecking] = useState<number | null>(null); // 正在检查CUE的 fs_id

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaylistItem[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 下载相关状态
  const [downloadingFiles, setDownloadingFiles] = useState<Set<number>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());

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

  // 处理 CUE 分轨右键菜单点击
  const handleCueSplit = useCallback(async (song: PlaylistItem) => {
    if (cueChecking === song.fs_id) return; // 防重入

    const accessToken = baiduAuth.getAccessToken();
    if (!accessToken) {
      alert('无法获取访问令牌，请重新登录');
      return;
    }

    setCueChecking(song.fs_id);
    try {
      const result = await window.electronAPI.cueCheck(song.path, accessToken);
      if (result.hasCue && result.cuePath && result.cueFs_id !== undefined) {
        setCueSplitSong(song);
        setCueSplitPath(result.cuePath);
        setCueSplitFsId(result.cueFs_id);
      } else {
        alert('在同目录下未找到同名的 CUE 文件，无法进行分轨。\n\n请确保 CUE 文件与无损音频文件同名且在同一目录。');
      }
    } catch (err: any) {
      console.error('CUE检查失败:', err);
      alert(`检查 CUE 文件失败: ${err.message}`);
    } finally {
      setCueChecking(null);
    }
  }, [cueChecking]);

  // 从列表移除歌曲
  const handleRemoveSong = (e: React.MouseEvent, song: PlaylistItem) => {
    e.stopPropagation();
    
    if (currentPlaylist === 'recent') {
      removeRecentSong(song.fs_id);
    } else if (currentPlaylist) {
      playlistService.removeFromPlaylist(currentPlaylist, song.fs_id);
    }
  };

  // 下载歌曲到本地
  const handleDownloadSong = async (e: React.MouseEvent, song: PlaylistItem) => {
    e.stopPropagation();
    
    // 检查是否正在下载
    if (downloadingFiles.has(song.fs_id)) {
      console.log('文件正在下载中:', song.server_filename);
      return;
    }

    try {
      // 标记为正在下载
      setDownloadingFiles(prev => new Set(prev).add(song.fs_id));
      
      // 获取下载链接
      const downloadLink = await baiduAPI.getDownloadLink(song.fs_id);
      if (!downloadLink) {
        console.error('无法获取下载链接');
        alert('获取下载链接失败，请重试');
        return;
      }

      // 监听下载进度
      const cleanup = window.electronAPI.onDownloadProgress((progress) => {
        if (progress.fileName === song.server_filename) {
          setDownloadProgress(prev => new Map(prev).set(song.server_filename, progress.progress));
        }
      });

      // 调用下载API
      const result = await window.electronAPI.downloadFileToLocal(downloadLink, song.server_filename);
      
      // 清理进度监听
      cleanup();
      
      if (result.success) {
        console.log('文件下载成功:', result.filePath);
        alert(`文件已保存到: ${result.filePath}`);
      } else if (result.canceled) {
        console.log('用户取消下载');
      } else {
        console.error('下载失败:', result.error);
        alert(`下载失败: ${result.error}`);
      }
    } catch (error) {
      console.error('下载过程出错:', error);
      alert('下载过程出错，请重试');
    } finally {
      // 移除下载标记
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(song.fs_id);
        return newSet;
      });
      
      // 清除进度
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(song.server_filename);
        return newMap;
      });
    }
   };
  
  // 深度同步播放列表
  const handleSyncPlaylist = async () => {
    if (!currentPlaylist || currentPlaylist === 'recent') {
      alert('无法同步"最近播放"列表');
      return;
    }
    
    const playlist = playlists.find(p => p.name === currentPlaylist);
    if (!playlist) {
      alert('播放列表不存在');
      return;
    }
    
    if (!confirm(`确定要深度同步播放列表 "${currentPlaylist}" 吗？\n\n这将根据列表中的文件路径重新扫描百度网盘，重建播放列表。`)) {
      return;
    }
    
    setSyncing(true);
    setSyncProgress('开始同步...');
    
    try {
      // 1. 收集所有文件路径
      const filePaths = playlist.items.map(item => item.path);
      
      if (filePaths.length === 0) {
        alert('播放列表为空，无法进行同步');
        setSyncing(false);
        setSyncProgress('');
        return;
      }
      
      // 2. 计算最大公共父目录
      // 将所有路径分割成部分
      const pathParts = filePaths.map(path => path.split('/').filter(Boolean));
      
      // 找到最短的路径长度
      const minLength = Math.min(...pathParts.map(parts => parts.length));
      
      let commonPathParts: string[] = [];
      
      // 逐层比较
      for (let i = 0; i < minLength; i++) {
        const currentPart = pathParts[0][i];
        const allMatch = pathParts.every(parts => parts[i] === currentPart);
        
        if (allMatch) {
          commonPathParts.push(currentPart);
        } else {
          break;
        }
      }
      
      // 3. 确定要扫描的根目录
      // 如果有公共路径，就用公共路径；否则使用根目录
      // 注意：commonPathParts 包含的是文件名之前的路径部分，最后一部分可能是共同的父文件夹
      // 由于我们是在文件路径上比较，最后一部分可能是文件名（如果所有文件同名，但这不可能）或者文件夹
      // 所以我们需要判断commonPathParts是否指向一个具体的文件
      
      // 更简单的方法：提取所有文件的目录，然后找目录的公共前缀
      const dirPaths = playlist.items.map(item => {
        const parts = item.path.split('/');
        parts.pop(); // 移除文件名
        return parts.join('/') || '/';
      });
      
      const dirPathParts = dirPaths.map(path => path.split('/').filter(Boolean));
      const minDirLength = Math.min(...dirPathParts.map(parts => parts.length));
      
      let commonDirParts: string[] = [];
      for (let i = 0; i < minDirLength; i++) {
        const currentPart = dirPathParts[0][i];
        const allMatch = dirPathParts.every(parts => parts[i] === currentPart);
        if (allMatch) {
          commonDirParts.push(currentPart);
        } else {
          break;
        }
      }
      
      const rootScanPath = '/' + commonDirParts.join('/');
      console.log('计算出的最大公共父目录:', rootScanPath);
      
      setSyncProgress(`正在扫描目录: ${rootScanPath}`);
      
      // 递归扫描最大公共父目录
      let allAudioFiles: any[] = [];
      try {
        const audioFiles = await baiduAPI.getAudioFilesRecursive(rootScanPath);
        if (audioFiles && audioFiles.length > 0) {
          console.log(`目录 ${rootScanPath} 找到 ${audioFiles.length} 个音频文件`);
          allAudioFiles = audioFiles;
        } else {
          console.log(`目录 ${rootScanPath} 没有找到音频文件`);
        }
      } catch (error) {
        console.error(`扫描目录 ${rootScanPath} 失败:`, error);
        alert(`扫描目录 ${rootScanPath} 失败: ${error}`);
        setSyncing(false);
        setSyncProgress('');
        return;
      }
      
      console.log(`总共找到 ${allAudioFiles.length} 个音频文件`);
      
      // 保护措施：如果没有找到任何文件，不更新列表
      if (allAudioFiles.length === 0) {
        alert('扫描完成，但没有找到任何音频文件。播放列表保持不变。');
        setSyncProgress('');
        setSyncing(false);
        return;
      }

      // 去重：以fs_id为准
      const uniqueFilesMap = new Map();
      allAudioFiles.forEach(file => {
          uniqueFilesMap.set(file.fs_id, file);
      });
      const uniqueFiles = Array.from(uniqueFilesMap.values());
      
      // 按路径排序：先文件夹，后文件
      const sortedFiles = [...uniqueFiles].sort((a, b) => {
        const partsA = a.path.split('/').filter(Boolean);
        const partsB = b.path.split('/').filter(Boolean);
        
        const len = Math.min(partsA.length, partsB.length);
        for (let i = 0; i < len; i++) {
          if (partsA[i] === partsB[i]) continue;
          
          const isFileA = (i === partsA.length - 1);
          const isFileB = (i === partsB.length - 1);
          
          if (isFileA && !isFileB) return 1;
          if (!isFileA && isFileB) return -1;
          
          return partsA[i].localeCompare(partsB[i]);
        }
        
        return partsA.length - partsB.length;
      });
      
      // 转换为 PlaylistItem 格式
      const newItems = sortedFiles.map(file => ({
        fs_id: file.fs_id,
        server_filename: file.server_filename,
        path: file.path,
        size: file.size,
        category: file.category,
        isdir: file.isdir,
        local_mtime: file.local_mtime,
        server_mtime: file.server_mtime,
        md5: file.md5,
        add_time: Math.floor(Date.now() / 1000)
      }));
      
      // 更新播放列表（重建而非增量更新）
      const updatedPlaylist = {
        ...playlist,
        items: newItems,
        update_time: Math.floor(Date.now() / 1000)
      };
      
      updatePlaylist(updatedPlaylist);
      
      setSyncProgress(`同步完成！找到 ${newItems.length} 个文件`);
      
      setTimeout(() => {
        setSyncProgress('');
      }, 3000);
      
    } catch (error) {
      console.error('同步播放列表失败:', error);
      alert('同步失败，请查看控制台了解详情');
      setSyncProgress('');
    } finally {
      setSyncing(false);
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
       {/* 工具栏 */}
       <div className="flex items-center justify-between p-2 border-b bg-background/95 backdrop-blur">
         <div className="flex items-center gap-2">
           {currentPlaylist && currentPlaylist !== 'recent' && (
             <Button
               variant="outline"
               size="sm"
               onClick={handleSyncPlaylist}
               disabled={syncing}
               className="gap-2"
             >
               <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
               {syncing ? '同步中...' : '深度同步'}
             </Button>
           )}
           {syncProgress && (
             <span className="text-sm text-muted-foreground">{syncProgress}</span>
           )}
         </div>
         
         <Button
           variant="ghost"
           size="icon"
           className="h-8 w-8"
           onClick={() => setShowSearch(true)}
           title="搜索歌曲 (Ctrl+F)"
         >
           <Search className="h-4 w-4" />
         </Button>
       </div>
       
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
            <th className="py-2 px-2 text-left font-medium" style={{ width: 'calc(100% - 16rem)' }}>标题</th>
            <th className="w-16 py-2 px-2 text-center font-medium">时长</th>
            <th className="w-20 py-2 px-2 text-right font-medium">大小</th>
            <th className="w-16 py-2 px-2 text-center font-medium">操作</th>
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
                onDownload={handleDownloadSong}
                onCueSplit={handleCueSplit}
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

      {/* CUE 分轨对话框 */}
      {cueSplitSong && (
        <CueSplitDialog
          song={cueSplitSong}
          cuePath={cueSplitPath}
          cueFsId={cueSplitFsId}
          onClose={() => {
            setCueSplitSong(null);
            setCueSplitPath('');
            setCueSplitFsId(0);
          }}
        />
      )}

      {/* CUE 检查中提示 */}
      {cueChecking !== null && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg px-4 py-2 text-sm flex items-center gap-2 z-50">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          正在检查 CUE 文件...
        </div>
      )}
    </div>
  );
};