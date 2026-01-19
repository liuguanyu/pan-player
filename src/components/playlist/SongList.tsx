import React, { memo } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { PlaylistItem } from '@/types/file';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { playlistService } from '@/services/playlist.service';

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

// 单个歌曲行组件 - 使用 memo 优化性能
const SongRow = memo(({
  song,
  index,
  isPlaying,
  onDoubleClick,
  onRemove
}: {
  song: PlaylistItem;
  index: number;
  isPlaying: boolean;
  onDoubleClick: (song: PlaylistItem) => void;
  onRemove: (e: React.MouseEvent, song: PlaylistItem) => void;
}) => {
  return (
    <tr
      key={song.fs_id}
      className={`group border-b hover:bg-accent/50 cursor-pointer transition-colors ${
        isPlaying ? 'bg-accent' : ''
      }`}
      onDoubleClick={() => onDoubleClick(song)}
    >
      <td className="w-12 text-center py-2 text-sm text-muted-foreground">
        {isPlaying ? '▶' : index + 1}
      </td>
      <td className="flex-1 py-2 px-2">
        <div className="truncate font-medium">{song.server_filename}</div>
        <div className="text-xs text-muted-foreground truncate">
          {new Date(song.server_mtime * 1000).toLocaleDateString()}
        </div>
      </td>
      <td className="w-24 text-right py-2 px-2 text-sm text-muted-foreground">
        {/* 时长暂时显示为 -- */}
        --:--
      </td>
      <td className="w-32 text-right py-2 px-4 text-sm text-muted-foreground">
        {formatFileSize(song.size)}
      </td>
      <td className="w-10 text-center py-2">
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

export const SongList: React.FC = () => {
  // 优化状态选择，只订阅需要的状态
  const playlists = usePlayerStore(state => state.playlists);
  const currentPlaylist = usePlayerStore(state => state.currentPlaylist);
  const recentSongs = usePlayerStore(state => state.recentSongs);
  const currentSong = usePlayerStore(state => state.currentSong);
  const setCurrentSong = usePlayerStore(state => state.setCurrentSong);
  const addRecentSong = usePlayerStore(state => state.addRecentSong);
  const removeRecentSong = usePlayerStore(state => state.removeRecentSong);
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying);

  // 获取当前显示的歌曲列表
  const getSongs = (): PlaylistItem[] => {
    if (currentPlaylist === 'recent') {
      return recentSongs;
    }
    
    const playlist = playlists.find(p => p.name === currentPlaylist);
    return playlist?.items || [];
  };

  const songs = getSongs();

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
    <div className="flex-1 overflow-y-auto">
      <table className="w-full">
        <tbody>
          {songs.map((song, index) => (
            <SongRow
              key={song.fs_id}
              song={song}
              index={index}
              isPlaying={currentSong?.fs_id === song.fs_id}
              onDoubleClick={handleSongDoubleClick}
              onRemove={handleRemoveSong}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};