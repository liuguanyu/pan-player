import React from 'react';
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

export const SongList: React.FC = () => {
  const {
    playlists,
    currentPlaylist,
    recentSongs,
    currentSong,
    setCurrentSong,
    addRecentSong,
    removeRecentSong,
    setIsPlaying
  } = usePlayerStore();

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
            <tr
              key={song.fs_id}
              className={`group border-b hover:bg-accent/50 cursor-pointer transition-colors ${
                currentSong?.fs_id === song.fs_id ? 'bg-accent' : ''
              }`}
              onDoubleClick={() => handleSongDoubleClick(song)}
            >
              <td className="w-12 text-center py-2 text-sm text-muted-foreground">
                {currentSong?.fs_id === song.fs_id ? '▶' : index + 1}
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
                  onClick={(e) => handleRemoveSong(e, song)}
                  title="从列表移除"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};