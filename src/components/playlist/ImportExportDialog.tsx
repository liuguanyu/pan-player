import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Download, FileJson, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { playlistService } from '@/services/playlist.service';
import { usePlayerStore } from '@/store/playerStore';

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = 'export' | 'import';

interface ImportResult {
  success: boolean;
  message: string;
  imported?: number;
}

export const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  open,
  onOpenChange
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('export');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playlists = usePlayerStore(state => state.playlists);

  const handleClose = () => {
    setActiveTab('export');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  const handleExportAll = () => {
    try {
      const content = playlistService.exportAllPlaylists();
      const filename = `playlists-backup-${new Date().toISOString().slice(0, 10)}.json`;
      playlistService.downloadExportFile(content, filename);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
  };

  const handleExportPlaylist = (playlistName: string) => {
    try {
      const content = playlistService.exportPlaylist(playlistName);
      if (content) {
        const filename = `playlist-${playlistName}-${new Date().toISOString().slice(0, 10)}.json`;
        playlistService.downloadExportFile(content, filename);
      } else {
        alert('导出失败，歌单不存在');
      }
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        console.log('读取到的文件内容:', content.substring(0, 200)); // 打印前200个字符
        const result = playlistService.importFromJSON(content);
        setImportResult(result);
      } catch (error) {
        console.error('处理文件失败:', error);
        setImportResult({
          success: false,
          message: `处理文件失败: ${error instanceof Error ? error.message : '未知错误'}`
        });
      }
    };
    reader.onerror = () => {
      setImportResult({
        success: false,
        message: '读取文件失败'
      });
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const userPlaylists = playlists.filter(p => p.name !== '最近播放');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>歌单导入/导出</DialogTitle>
          <DialogDescription>
            备份或恢复您的播放列表
          </DialogDescription>
        </DialogHeader>

        {/* 标签切换 */}
        <div className="flex border-b mb-4">
          <button
            className={`flex-1 py-2 px-4 font-medium transition-colors ${
              activeTab === 'export'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('export')}
          >
            <Download className="w-4 h-4 inline mr-2" />
            导出歌单
          </button>
          <button
            className={`flex-1 py-2 px-4 font-medium transition-colors ${
              activeTab === 'import'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('import')}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            导入歌单
          </button>
        </div>

        {/* 导出标签 */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium text-sm">全部导出</h3>
              <p className="text-xs text-muted-foreground">
                导出所有播放列表和最近播放记录
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleExportAll}
              >
                <FileJson className="w-4 h-4 mr-2" />
                导出全部歌单 (JSON)
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium text-sm">单个导出</h3>
              <p className="text-xs text-muted-foreground">
                仅导出选定的播放列表
              </p>
              <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-1">
                {userPlaylists.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无播放列表
                  </p>
                ) : (
                  userPlaylists.map((playlist) => (
                    <div
                      key={playlist.name}
                      className="flex items-center justify-between p-2 hover:bg-accent rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {playlist.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {playlist.items.length} 首歌曲
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportPlaylist(playlist.name)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 导入标签 */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium text-sm">从文件导入</h3>
              <p className="text-xs text-muted-foreground">
                选择之前导出的 JSON 文件来恢复播放列表
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleImportClick}
                disabled={!!importResult}
              >
                <FileJson className="w-4 h-4 mr-2" />
                选择 JSON 文件
              </Button>
            </div>

            {/* 导入结果 */}
            {importResult && (
              <div className={`p-4 rounded-md border ${
                importResult.success
                  ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
              }`}>
                <div className="flex items-start gap-3">
                  {importResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      importResult.success
                        ? 'text-green-900 dark:text-green-100'
                        : 'text-red-900 dark:text-red-100'
                    }`}>
                      {importResult.message}
                    </p>
                    {importResult.success && importResult.imported && (
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        已导入 {importResult.imported} 个播放列表
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-current/20">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    重复的歌单会被合并，相同歌曲不会重复添加
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
