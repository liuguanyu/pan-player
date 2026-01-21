import React, { useState, useRef, useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Download,
  Upload,
  Trash2,
  FileText,
  Music
} from 'lucide-react';
import { parsePlainText, generateLRC, formatLRCTime, parseLRC } from '@/lib/lrc-parser';

export const LyricsEditor: React.FC = () => {
  const { 
    parsedLyrics, 
    setParsedLyrics,
    currentTime,
    updateLyricLine,
    addLyricLine,
    deleteLyricLine
  } = usePlayerStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
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
            onClick={handleImportText}
            className="gap-1"
          >
            <FileText className="h-4 w-4" />
            导入文本
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportLRC}
            className="gap-1"
          >
            <Upload className="h-4 w-4" />
            导入LRC
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
    </div>
  );
};