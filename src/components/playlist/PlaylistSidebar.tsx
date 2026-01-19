import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { usePlayerStore } from '@/store/playerStore';
import { Plus, Trash2 } from 'lucide-react';
import { AddPlaylistDialog } from './AddPlaylistDialog';
import { playlistService } from '@/services/playlist.service';
import { useAuth } from '@/hooks/useAuth';

export const PlaylistSidebar: React.FC = () => {
  // 优化状态选择，只订阅需要的状态
  const playlists = usePlayerStore(state => state.playlists);
  const currentPlaylist = usePlayerStore(state => state.currentPlaylist);
  const setCurrentPlaylist = usePlayerStore(state => state.setCurrentPlaylist);
  const recentSongs = usePlayerStore(state => state.recentSongs);
  const setShowLyrics = usePlayerStore(state => state.setShowLyrics);
  const { isAuthenticated } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);

  // 如果没有用户创建的播放列表，且已登录，自动弹出新建对话框
  useEffect(() => {
    if (!isAuthenticated) return;

    const userPlaylists = playlists.filter(p => p.name !== '最近播放');
    if (userPlaylists.length === 0) {
      // 稍微延迟一下，避免与初始化冲突
      const timer = setTimeout(() => {
        setShowAddDialog(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]); // 依赖 isAuthenticated

  const handleDeletePlaylist = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (confirm(`确定要删除播放列表 "${name}" 吗？`)) {
      playlistService.deletePlaylist(name);
      if (currentPlaylist === name) {
        setCurrentPlaylist('recent');
      }
    }
  };

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold mb-2">我的列表</h2>
        <Button
          variant="secondary"
          className="w-full justify-start text-sm"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          新建列表
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* 最近播放 */}
        <div
          className={`px-2 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${
            currentPlaylist === 'recent'
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          }`}
          onClick={() => {
            setCurrentPlaylist('recent');
            setShowLyrics(false); // 切换列表时隐藏歌词
          }}
        >
          最近播放
          <span className="ml-2 text-xs text-muted-foreground">
            ({recentSongs.length})
          </span>
        </div>
        
        {/* 播放列表 */}
        {playlists
          .filter(playlist => playlist.name !== '最近播放') // 过滤掉"最近播放"列表，因为它已经在顶部硬编码显示
          .map((playlist) => (
            <div
              key={playlist.name}
              className={`group px-2 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors flex items-center justify-between ${
                currentPlaylist === playlist.name
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              }`}
              onClick={() => {
                setCurrentPlaylist(playlist.name);
                setShowLyrics(false); // 切换列表时隐藏歌词
              }}
            >
              <div className="flex-1 truncate">
                {playlist.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({playlist.items.length})
                </span>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDeletePlaylist(e, playlist.name)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
      </div>
      
      {/* 添加播放列表对话框 */}
      <AddPlaylistDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
    </div>
  );
};