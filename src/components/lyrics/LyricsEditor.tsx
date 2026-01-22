import React, { useState, useRef, useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Download,
  Upload,
  Trash2,
  FileText,
  Music,
  Type,
  Cloud,
  CloudUpload
} from 'lucide-react';
import { parsePlainText, generateLRC, formatLRCTime, parseLRC } from '@/lib/lrc-parser';
import { baiduAPI } from '@/services/baidu-api.service';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const LyricsEditor: React.FC = () => {
  const {
    parsedLyrics,
    setParsedLyrics,
    currentTime,
    updateLyricLine,
    addLyricLine,
    deleteLyricLine,
    currentSong
  } = usePlayerStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingUploadPath, setPendingUploadPath] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 当进入编辑状态时自动聚焦输入框
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // 打开纯文本文件
  const handleImportText = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const lyrics = parsePlainText(content);
        setParsedLyrics(lyrics);
        alert('纯文本歌词导入成功！请为每行设置时间。');
      } catch (error) {
        console.error('导入纯文本失败:', error);
        alert('导入纯文本失败');
      }
    };

    input.click();
  };

  // 打开LRC文件进行二次编辑
  const handleImportLRC = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lrc';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const lyrics = parseLRC(content);
        setParsedLyrics(lyrics);
        alert('LRC文件导入成功！可以进行二次编辑。');
      } catch (error) {
        console.error('导入LRC文件失败:', error);
        alert('导入LRC文件失败');
      }
    };

    input.click();
  };

  // 清空所有歌词
  const handleClear = () => {
    if (window.confirm('确定要清空所有歌词吗？')) {
      setParsedLyrics([]);
    }
  };

  // 导出LRC文件
  const handleExport = () => {
    if (!parsedLyrics || parsedLyrics.length === 0) {
      alert('没有可导出的歌词');
      return;
    }

    const lrcContent = generateLRC(parsedLyrics);
    const blob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics.lrc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 上传LRC到百度云盘
  const handleUploadToCloud = async () => {
    if (!currentSong) {
      alert('请先选择一首歌曲');
      return;
    }

    if (!parsedLyrics || parsedLyrics.length === 0) {
      alert('没有可上传的歌词');
      return;
    }

    // 生成LRC文件路径（与音频文件同目录，同名但扩展名为.lrc）
    const audioPath = currentSong.path;
    const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc');

    if (lrcPath === audioPath) {
      alert('无法生成LRC文件路径');
      return;
    }

    try {
      // 检查LRC文件是否已存在
      const exists = await baiduAPI.checkLrcFileExists(lrcPath);
      
      if (exists) {
        // 如果存在，显示覆盖确认对话框
        setPendingUploadPath(lrcPath);
        setShowOverwriteDialog(true);
      } else {
        // 如果不存在，直接上传
        await performUpload(lrcPath);
      }
    } catch (error) {
      console.error('检查LRC文件失败:', error);
      alert('检查LRC文件失败，请重试');
    }
  };

  // 执行实际的上传操作
  const performUpload = async (lrcPath: string) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const lrcContent = generateLRC(parsedLyrics!);
      
      const result = await baiduAPI.uploadLrcFile(
        lrcPath,
        lrcContent,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      if (result.success) {
        alert('LRC歌词上传成功！');
      } else {
        console.error('上传LRC失败:', result.error);
        alert(`上传LRC失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('上传LRC失败:', error);
      alert(`上传LRC失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 确认覆盖并上传
  const handleConfirmOverwrite = async () => {
    setShowOverwriteDialog(false);
    await performUpload(pendingUploadPath);
    setPendingUploadPath('');
  };

  // 取消覆盖
  const handleCancelOverwrite = () => {
    setShowOverwriteDialog(false);
    setPendingUploadPath('');
  };

  // 从文本框导入歌词
  const handleImportFromText = () => {
    if (!textInput.trim()) {
      alert('请先输入歌词文本');
      return;
    }
    
    const lyrics = parsePlainText(textInput);
    setParsedLyrics(lyrics);
    setTextInput('');
    setShowTextInput(false);
    alert('歌词导入成功！请为每行设置时间。');
  };

  // 添加间奏
  const handleAddInterlude = () => {
    const id = addLyricLine(currentTime, '♪ 间奏 ♪');
    updateLyricLine(id, { isInterlude: true });
  };

  // 设置当前行为当前播放时间
  const handleSetCurrentTime = (id: string) => {
    updateLyricLine(id, { time: currentTime });
  };

  // 跳转到指定时间
  const handleJumpToTime = (time: number) => {
    const audio = document.querySelector('audio');
    if (audio) {
      audio.currentTime = time;
    }
  };

  // 开始编辑歌词文本
  const handleStartEdit = (id: string, text: string, isInterlude?: boolean) => {
    if (isInterlude) return; // 间奏不允许编辑文本
    setEditingId(id);
    setEditingText(text);
  };

  // 保存编辑的歌词文本
  const handleSaveEdit = () => {
    if (editingId && editingText.trim()) {
      updateLyricLine(editingId, { text: editingText.trim() });
    }
    setEditingId(null);
    setEditingText('');
  };

  // 按键处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingText('');
    }
  };

  // 过滤掉空行
  const filteredLyrics = parsedLyrics?.filter(line => line.text.trim() !== '') || [];

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-3">歌词编辑</h4>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTextInput(!showTextInput)}
            className="gap-1"
          >
            <Type className="h-4 w-4" />
            {showTextInput ? '隐藏输入框' : '显示输入框'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportText}
            className="gap-1"
          >
            <FileText className="h-4 w-4" />
            导入文本文件
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportLRC}
            className="gap-1"
          >
            <Upload className="h-4 w-4" />
            导入LRC文件
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="gap-1"
            disabled={filteredLyrics.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            清空
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-1"
            disabled={filteredLyrics.length === 0}
          >
            <Download className="h-4 w-4" />
            导出LRC
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleUploadToCloud}
            className="gap-1"
            disabled={filteredLyrics.length === 0 || isUploading || !currentSong}
          >
            {isUploading ? (
              <>
                <CloudUpload className="h-4 w-4 animate-pulse" />
                上传中 {uploadProgress}%
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4" />
                上传到云端
              </>
            )}
          </Button>
          
          <div className="w-px bg-border mx-1" />
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddInterlude}
            className="gap-1"
          >
            <Music className="h-4 w-4" />
            添加间奏
          </Button>
        </div>
      </div>

      {/* 文本输入区 */}
      {showTextInput && (
        <div className="mb-4 p-4 border rounded bg-muted/30">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">
              直接输入或粘贴歌词文本（每行一句歌词）
            </label>
            <Button
              size="sm"
              onClick={handleImportFromText}
              disabled={!textInput.trim()}
            >
              导入
            </Button>
          </div>
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="在此粘贴或输入歌词文本，每行一句歌词...&#10;&#10;例如：&#10;第一句歌词&#10;第二句歌词&#10;第三句歌词"
            className="min-h-[120px] font-mono"
          />
          <p className="text-xs text-muted-foreground mt-2">
            支持多行文本，每行将被识别为一句歌词。导入后可以为每句歌词设置时间轴。
          </p>
        </div>
      )}

      {/* 歌词编辑区 */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-background rounded border"
      >
        {filteredLyrics.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            请先导入歌词文本文件
          </div>
        ) : (
          <div className="space-y-0">
            {filteredLyrics.map((line) => (
              <div
                key={line.id}
                className={`border-b p-3 hover:bg-muted/50 transition-colors ${
                  line.time === -1
                    ? 'bg-orange-50 dark:bg-orange-950/20'
                    : line.isInterlude
                    ? 'bg-purple-50 dark:bg-purple-950/20'
                    : 'bg-green-50 dark:bg-green-950/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* 歌词文本 */}
                  <div className="flex-1 min-w-0">
                    {editingId === line.id ? (
                      <div>
                        <Input
                          ref={editInputRef}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleSaveEdit}
                          className="text-sm"
                          disabled={line.isInterlude}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          按回车保存或ESC取消
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div
                          className="text-sm font-medium cursor-pointer hover:text-primary"
                          onDoubleClick={() => handleStartEdit(line.id!, line.text, line.isInterlude)}
                        >
                          {line.isInterlude ? '♪ 间奏 ♪' : line.text}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {line.isInterlude && <span className="text-purple-600">[间奏] </span>}
                          {line.time === -1 ? '未设置时间' : formatLRCTime(line.time)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetCurrentTime(line.id!)}
                      disabled={line.isInterlude}
                    >
                      设为当前时间
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleJumpToTime(line.time)}
                      disabled={line.time === -1}
                    >
                      跳转播放
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteLyricLine(line.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 覆盖确认对话框 */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认覆盖</DialogTitle>
            <DialogDescription>
              云端已存在同名的LRC歌词文件，是否要覆盖？
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              文件路径: {pendingUploadPath}
            </p>
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ 覆盖后原有歌词文件将被永久替换，无法恢复。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelOverwrite}
            >
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmOverwrite}
            >
              确认覆盖
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};