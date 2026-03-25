import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlayerStore } from '@/store/playerStore';
import { Plus, Trash2, Edit2, GripVertical, Download } from 'lucide-react';
import { AddPlaylistDialog } from './AddPlaylistDialog';
import { ImportExportDialog } from './ImportExportDialog';
import { playlistService } from '@/services/playlist.service';
import { useAuth } from '@/hooks/useAuth';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortablePlaylistItemProps {
  playlist: { name: string; items: any[] };
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename: (newName: string) => void;
}

const SortablePlaylistItem: React.FC<SortablePlaylistItemProps> = ({
  playlist,
  isActive,
  onSelect,
  onDelete,
  onRename
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: playlist.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(playlist.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleRenameSubmit = () => {
    if (editName.trim() && editName !== playlist.name) {
      onRename(editName.trim());
    } else {
      setEditName(playlist.name); // 恢复原名
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditName(playlist.name);
      setIsEditing(false);
    }
    e.stopPropagation(); // 防止触发快捷键
  };

  if (isEditing) {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        className="px-2 py-1.5 flex items-center"
      >
        <Input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          className="h-7 text-sm"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group px-2 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors flex items-center justify-between ${
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center flex-1 overflow-hidden">
        <div 
          {...attributes} 
          {...listeners}
          className="mr-2 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1 truncate">
          {playlist.name}
          <span className="ml-2 text-xs text-muted-foreground">
            ({playlist.items.length})
          </span>
        </div>
      </div>
      
      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 mr-1"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
        >
          <Edit2 className="h-3 w-3 text-muted-foreground hover:text-primary" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </div>
  );
};

export const PlaylistSidebar: React.FC = () => {
  // 优化状态选择，只订阅需要的状态
  const playlists = usePlayerStore(state => state.playlists);
  const currentPlaylist = usePlayerStore(state => state.currentPlaylist);
  const setCurrentPlaylist = usePlayerStore(state => state.setCurrentPlaylist);
  const recentSongs = usePlayerStore(state => state.recentSongs);
  const setShowLyrics = usePlayerStore(state => state.setShowLyrics);
  const setShowVisualizer = usePlayerStore(state => state.setShowVisualizer);
  const reorderPlaylists = usePlayerStore(state => state.reorderPlaylists);
  const renamePlaylist = usePlayerStore(state => state.renamePlaylist);
  
  const { isAuthenticated } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportExportDialog, setShowImportExportDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 拖动8像素才触发排序，防止点击时误触发
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const userPlaylists = playlists.filter(p => p.name !== '最近播放');
      const oldIndex = userPlaylists.findIndex((p) => p.name === active.id);
      const newIndex = userPlaylists.findIndex((p) => p.name === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderPlaylists(oldIndex, newIndex);
      }
    }
  };

  const userPlaylists = playlists.filter(playlist => playlist.name !== '最近播放');

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold mb-2">我的列表</h2>
        <div className="space-y-2">
          <Button
            variant="secondary"
            className="w-full justify-start text-sm"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            新建列表
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-sm"
            onClick={() => setShowImportExportDialog(true)}
          >
            <Download className="h-4 w-4 mr-2" />
            导入/导出
          </Button>
        </div>
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
            setShowVisualizer(false); // 切换列表时关闭可视化
          }}
        >
          最近播放
          <span className="ml-2 text-xs text-muted-foreground">
            ({recentSongs.length})
          </span>
        </div>
        
        {/* 可拖拽的播放列表 */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={userPlaylists.map(p => p.name)}
            strategy={verticalListSortingStrategy}
          >
            {userPlaylists.map((playlist) => (
              <SortablePlaylistItem
                key={playlist.name}
                playlist={playlist}
                isActive={currentPlaylist === playlist.name}
                onSelect={() => {
                  setCurrentPlaylist(playlist.name);
                  setShowLyrics(false);
                  setShowVisualizer(false);
                }}
                onDelete={(e) => handleDeletePlaylist(e, playlist.name)}
                onRename={(newName) => renamePlaylist(playlist.name, newName)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      
      {/* 添加播放列表对话框 */}
      <AddPlaylistDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />

      {/* 导入导出对话框 */}
      <ImportExportDialog
        open={showImportExportDialog}
        onOpenChange={setShowImportExportDialog}
      />
    </div>
  );
};