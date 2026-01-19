import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { baiduAPI } from '@/services/baidu-api.service';
import { playlistService } from '@/services/playlist.service';
import { useAuth } from '@/hooks/useAuth';
import { FileInfo } from '@/types/file';
import { FolderOpen, FileAudio, Loader2 } from 'lucide-react';

interface AddPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddPlaylistDialog: React.FC<AddPlaylistDialogProps> = ({ open, onOpenChange }) => {
  const { isAuthenticated } = useAuth();
  const [playlistName, setPlaylistName] = useState('');
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [_expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));

  // 加载当前路径的文件
  const loadFiles = async (path: string) => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    try {
      console.log('开始加载文件列表，路径:', path);
      const fileList = await baiduAPI.getFileList(path);
      console.log('文件列表加载完成，结果:', fileList);
      if (fileList) {
        setFiles(fileList);
      } else {
        setFiles([]); // 确保在没有文件时也清空列表
      }
    } catch (error) {
      console.error('加载文件列表失败:', error);
      setFiles([]); // 出错时也清空列表
    } finally {
      setLoading(false);
    }
  };

  // 当对话框打开时，加载根目录
  useEffect(() => {
    if (open && isAuthenticated) {
      loadFiles('/');
    }
  }, [open, isAuthenticated]);

  // 进入文件夹
  const enterFolder = (path: string) => {
    setCurrentPath(path);
    loadFiles(path);
  };

  // 返回上一级
  const goBack = () => {
    if (currentPath === '/') return;
    
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    setCurrentPath(parentPath);
    loadFiles(parentPath);
  };

  // 选择/取消选择文件
  const toggleFileSelection = (file: FileInfo) => {
    setSelectedFiles(prev => {
      const exists = prev.find(f => f.fs_id === file.fs_id);
      if (exists) {
        return prev.filter(f => f.fs_id !== file.fs_id);
      } else {
        return [...prev, file];
      }
    });
  };

  // 递归添加文件夹中的音频文件
  const addFolderRecursive = async (folder: FileInfo) => {
    setLoading(true);
    try {
      const audioFiles = await baiduAPI.getAudioFilesRecursive(folder.path);
      if (audioFiles) {
        // 按路径排序：先文件夹，后文件
        const sortedFiles = [...audioFiles].sort((a, b) => {
          const partsA = a.path.split('/').filter(Boolean);
          const partsB = b.path.split('/').filter(Boolean);
          
          const len = Math.min(partsA.length, partsB.length);
          for (let i = 0; i < len; i++) {
            if (partsA[i] === partsB[i]) continue;
            
            // 检查当前部分是否为文件名（即路径的最后一部分）
            const isFileA = (i === partsA.length - 1);
            const isFileB = (i === partsB.length - 1);
            
            // 如果一个是文件，一个是文件夹（还有后续路径），文件夹排在前面
            if (isFileA && !isFileB) return 1; // A是文件，B是文件夹 -> A排后面
            if (!isFileA && isFileB) return -1; // A是文件夹，B是文件 -> A排前面
            
            // 都是文件夹或都是文件，按名称排序
            return partsA[i].localeCompare(partsB[i]);
          }
          
          return partsA.length - partsB.length;
        });
        
        setSelectedFiles(prev => {
          const newFiles = sortedFiles.filter(
            af => !prev.find(pf => pf.fs_id === af.fs_id)
          );
          return [...prev, ...newFiles];
        });
      }
    } catch (error) {
      console.error('递归添加文件夹失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建播放列表
  const handleCreatePlaylist = () => {
    if (!playlistName.trim()) {
      alert('请输入播放列表名称');
      return;
    }

    if (selectedFiles.length === 0) {
      alert('请至少选择一个文件');
      return;
    }

    // 使用 PlaylistService 创建播放列表
    if (playlistService.createPlaylist(playlistName)) {
      // 批量添加文件到播放列表
      playlistService.addBatchToPlaylist(playlistName, selectedFiles);
      
      // 重置状态
      setPlaylistName('');
      setSelectedFiles([]);
      setCurrentPath('/');
      setExpandedFolders(new Set(['/']));
      
      onOpenChange(false);
    } else {
      alert('播放列表创建失败，可能是名称已存在');
    }
  };

  /*
    createPlaylist(playlistName, selectedFiles);
    
    // 重置状态
    setPlaylistName('');
    setSelectedFiles([]);
  */

  // 过滤音频文件
  const audioFiles = files.filter(file => {
    const ext = file.server_filename.substring(file.server_filename.lastIndexOf('.')).toLowerCase();
    return ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma'].includes(ext);
  });

  const folders = files.filter(file => file.isdir === 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>创建播放列表</DialogTitle>
          <DialogDescription>
            从百度网盘选择音频文件添加到播放列表
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* 播放列表名称输入 */}
          <div className="space-y-2 px-1">
            <Label htmlFor="playlist-name">播放列表名称</Label>
            <Input
              id="playlist-name"
              placeholder="输入播放列表名称"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
            />
          </div>

          {/* 文件浏览器 */}
          <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
            {/* 路径导航 */}
            <div className="border-b p-2 flex items-center gap-2 bg-muted/30">
              <Button variant="ghost" size="sm" onClick={goBack} disabled={currentPath === '/'}>
                返回上一级
              </Button>
              <span className="text-sm text-muted-foreground flex-1 truncate">
                当前路径: {currentPath || '/'}
              </span>
            </div>

            {/* 文件列表 */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="divide-y">
                  {/* 文件夹 */}
                  {folders.map(folder => (
                    <div
                      key={folder.fs_id}
                      className="flex items-center gap-2 p-2 hover:bg-accent/50 cursor-pointer"
                      onDoubleClick={() => enterFolder(folder.path)}
                    >
                      <FolderOpen className="h-5 w-5 text-blue-500" />
                      <span className="flex-1 truncate">{folder.server_filename}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addFolderRecursive(folder)}
                        title="递归添加此文件夹中的所有音频文件"
                      >
                        添加全部
                      </Button>
                    </div>
                  ))}

                  {/* 音频文件 */}
                  {audioFiles.map(file => {
                    const isSelected = selectedFiles.some(f => f.fs_id === file.fs_id);
                    return (
                      <div
                        key={file.fs_id}
                        className={`flex items-center gap-2 p-2 hover:bg-accent/50 cursor-pointer ${
                          isSelected ? 'bg-accent' : ''
                        }`}
                        onClick={() => toggleFileSelection(file)}
                      >
                        <FileAudio className="h-5 w-5 text-green-500" />
                        <span className="flex-1 truncate">{file.server_filename}</span>
                        <span className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    );
                  })}

                  {folders.length === 0 && audioFiles.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      此文件夹中没有音频文件
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 已选择的文件 */}
          {selectedFiles.length > 0 && (
            <div className="border rounded-lg p-2">
              <div className="text-sm font-medium mb-2">
                已选择 {selectedFiles.length} 个文件
              </div>
              <div className="max-h-20 overflow-y-auto text-sm text-muted-foreground">
                {selectedFiles.map(file => (
                  <div key={file.fs_id} className="truncate">
                    {file.server_filename}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleCreatePlaylist} disabled={!playlistName.trim() || selectedFiles.length === 0}>
            创建播放列表
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};