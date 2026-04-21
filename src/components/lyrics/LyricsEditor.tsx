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
  CloudUpload,
  Search,
  ListChecks
} from 'lucide-react';
import { parsePlainText, generateLRC, formatLRCTime, parseLRC, parseLRCTimeTag } from '@/lib/lrc-parser';
import { baiduAPI } from '@/services/baidu-api.service';
import { lyricsService, LyricSearchResult } from '@/services/lyrics.service';
import { useDownloadStore } from '@/store/downloadStore';
import { DownloadManager } from '@/components/lyrics/DownloadManager';
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
    lrcMetadata,
    setLrcMetadata,
    currentTime,
    updateLyricLine,
    addLyricLine,
    insertLyricLine,
    deleteLyricLine,
    currentSong
  } = usePlayerStore();

  // 选中状态（单击高亮，不触发编辑）
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  // 编辑状态（双击进入，与选中状态完全分离）
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingUploadPath, setPendingUploadPath] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LyricSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string>('');
  const [selectedSearchId, setSelectedSearchId] = useState<string>('');

  const addTask = useDownloadStore(state => state.addTask);
  const updateTask = useDownloadStore(state => state.updateTask);
  const setShowManager = useDownloadStore(state => state.setShowManager);

  // 非受控输入 ref —— 直接读取 DOM 值，彻底避免受控输入 + IME 冲突
  const editTextRef = useRef<HTMLInputElement>(null);
  const editTimeRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // editingLineId 变化时延迟聚焦文本输入框
  // 使用双重 requestAnimationFrame 确保 React DOM 完全渲染后再 focus
  useEffect(() => {
    if (editingLineId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (editTextRef.current) {
            editTextRef.current.focus();
            editTextRef.current.select();
          }
        });
      });
    }
  }, [editingLineId]);

  // ---------- 文件操作 ----------

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
        setParsedLyrics(lyrics.lines);
        setLrcMetadata(lyrics.metadata);
        alert('LRC文件导入成功！可以进行二次编辑。');
      } catch (error) {
        console.error('导入LRC文件失败:', error);
        alert('导入LRC文件失败');
      }
    };

    input.click();
  };

  const handleClear = () => {
    if (window.confirm('确定要清空所有歌词吗？')) {
      setParsedLyrics([]);
      setLrcMetadata(null);
    }
  };

  const handleExport = () => {
    if (!parsedLyrics || parsedLyrics.length === 0) {
      alert('没有可导出的歌词');
      return;
    }
    const lrcContent = generateLRC(parsedLyrics, lrcMetadata || undefined);
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

  const handleUploadToCloud = async () => {
    if (!currentSong) {
      alert('请先选择一首歌曲');
      return;
    }
    if (!parsedLyrics || parsedLyrics.length === 0) {
      alert('没有可上传的歌词');
      return;
    }
    const audioPath = currentSong.path;
    const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc');
    if (lrcPath === audioPath) {
      alert('无法生成LRC文件路径');
      return;
    }
    try {
      const exists = await baiduAPI.checkLrcFileExists(lrcPath);
      if (exists) {
        setPendingUploadPath(lrcPath);
        setShowOverwriteDialog(true);
      } else {
        await performUpload(lrcPath);
      }
    } catch (error) {
      console.error('检查LRC文件失败:', error);
      alert('检查LRC文件失败，请重试');
    }
  };

  const performUpload = async (lrcPath: string) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const lrcContent = generateLRC(parsedLyrics!, lrcMetadata || undefined);
      const result = await baiduAPI.uploadLrcFile(
        lrcPath,
        lrcContent,
        (progress) => setUploadProgress(progress)
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

  const handleConfirmOverwrite = async () => {
    setShowOverwriteDialog(false);
    await performUpload(pendingUploadPath);
    setPendingUploadPath('');
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteDialog(false);
    setPendingUploadPath('');
  };

  const handleImportFromText = () => {
    if (!textInput.trim()) {
      alert('请先输入歌词文本');
      return;
    }
    const lyrics = parsePlainText(textInput);
    setParsedLyrics(lyrics);
    setTextInput('');
    setShowTextInput(false);
    alert('歌词导入成功！请为每句歌词设置时间。');
  };

  // ---------- 搜索相关 ----------
  const [showSearchDialog, setShowSearchDialog] = useState(false);

  const handleSearchOpen = () => {
    if (currentSong) {
      // 预填歌曲名，去掉扩展名
      setSearchKeyword(currentSong.server_filename.replace(/\.[^/.]+$/, ''));
    }
    setShowSearchDialog(true);
    setSearchResults([]);
    setSearchError('');
    setSelectedSearchId('');
  };

  const executeSearch = async () => {
    if (!searchKeyword.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const results = await lyricsService.search(searchKeyword);
      setSearchResults(results);
    } catch (err: any) {
      setSearchError(err.message || '搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const handleDownloadLyric = async () => {
    if (!selectedSearchId || !currentSong) return;

    const audioPath = currentSong.path;
    const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc');
    const songName = currentSong.server_filename;

    const taskId = addTask({
      type: 'lyrics',
      songName,
      lrcContent: '',
      targetPanPath: lrcPath,
    });
    
    setShowManager(true);
    setShowSearchDialog(false);

    try {
      updateTask(taskId, { status: 'downloading', progress: 10 });
      // 1. 从歌词源拉取歌词
      const lrcText = await lyricsService.getLyric(selectedSearchId);
      updateTask(taskId, { progress: 30, lrcContent: lrcText });

      // 如果当前没有歌词，直接展示
      if (!parsedLyrics || parsedLyrics.length === 0) {
        const lyricsObj = parseLRC(lrcText);
        setParsedLyrics(lyricsObj.lines);
        setLrcMetadata(lyricsObj.metadata);
      }

      // 2. 上传网盘
      const exists = await baiduAPI.checkLrcFileExists(lrcPath);
      updateTask(taskId, { progress: 50 });
      
      const result = await baiduAPI.uploadLrcFile(lrcPath, lrcText, (prog) => {
        updateTask(taskId, { progress: 50 + prog * 0.5 });
      });

      if (result.success) {
        updateTask(taskId, { status: 'success', progress: 100, completedAt: Date.now() });
      } else {
        updateTask(taskId, { status: 'failed', error: result.error || '上传失败' });
      }
    } catch (err: any) {
      updateTask(taskId, { status: 'failed', error: err.message || '下载失败' });
    }
  };

  // ---------- 行操作 ----------

  const handleAddInterlude = () => {
    const offsetInSeconds = (lrcMetadata?.offset || 0) / 1000;
    const tagTime = currentTime + offsetInSeconds;
    
    if (selectedLineId) {
      const selectedIndex = parsedLyrics?.findIndex(line => line.id === selectedLineId) ?? -1;
      if (selectedIndex >= 0) {
        const id = insertLyricLine(selectedIndex + 1, tagTime, '♪ 间奏 ♪');
        updateLyricLine(id, { isInterlude: true });
        return;
      }
    }
    const id = addLyricLine(tagTime, '♪ 间奏 ♪');
    updateLyricLine(id, { isInterlude: true });
  };

  const handleAddEmptyLine = () => {
    const offsetInSeconds = (lrcMetadata?.offset || 0) / 1000;
    const tagTime = currentTime + offsetInSeconds;

    if (selectedLineId) {
      const selectedIndex = parsedLyrics?.findIndex(line => line.id === selectedLineId) ?? -1;
      if (selectedIndex >= 0) {
        insertLyricLine(selectedIndex + 1, tagTime, '');
        return;
      }
    }
    addLyricLine(tagTime, '');
  };

  const handleSetCurrentTime = (id: string) => {
    const offsetInSeconds = (lrcMetadata?.offset || 0) / 1000;
    updateLyricLine(id, { time: currentTime + offsetInSeconds });
  };

  const handleJumpToTime = (time: number) => {
    const audio = document.querySelector('audio');
    if (audio) {
      const offsetInSeconds = (lrcMetadata?.offset || 0) / 1000;
      audio.currentTime = Math.max(0, time - offsetInSeconds);
    }
  };

  // ---------- 编辑模式（核心重构部分）----------

  /**
   * 进入编辑模式（双击触发）。
   * editingLineId 与 selectedLineId 完全独立。
   * 不依赖任何受控状态来存储输入中间值——使用非受控 ref 直接读取 DOM。
   */
  const handleStartEdit = (lineId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡，防止触发行容器的 onClick（setSelectedLineId）
    setEditingLineId(lineId);
    setSelectedLineId(lineId);
    // 聚焦在 useEffect 中延迟执行，确保 DOM 已渲染
  };

  /**
   * 保存编辑：从非受控 ref 读取当前值并写入 store。
   */
  const handleSaveEdit = (lineId: string, isInterlude?: boolean) => {
    // 文本：间奏行不修改文本
    if (!isInterlude) {
      const text = editTextRef.current?.value ?? '';
      if (text.trim()) {
        updateLyricLine(lineId, { text: text.trim() });
      }
    }

    // 时间戳
    const timeStr = editTimeRef.current?.value ?? '';
    if (timeStr.trim()) {
      const timeInSeconds = parseLRCTimeTag(timeStr.trim());
      if (timeInSeconds >= 0) {
        updateLyricLine(lineId, { time: timeInSeconds });
      }
    }

    setEditingLineId(null);
  };

  /**
   * 取消编辑，不保存任何修改。
   */
  const handleCancelEdit = () => {
    setEditingLineId(null);
  };

  /**
   * 文本输入框 keyDown 处理。
   */
  const handleTextKeyDown = (e: React.KeyboardEvent, lineId: string, isInterlude?: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(lineId, isInterlude);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  /**
   * 时间输入框 keyDown 处理。
   */
  const handleTimeKeyDown = (e: React.KeyboardEvent, lineId: string, isInterlude?: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(lineId, isInterlude);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const filteredLyrics = parsedLyrics || [];

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
            onClick={() => setShowMetadata(!showMetadata)}
            className="gap-1"
          >
            <FileText className="h-4 w-4" />
            {showMetadata ? '隐藏元数据' : '编辑元数据'}
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

          <Button
            variant="outline"
            size="sm"
            onClick={handleSearchOpen}
            className="gap-1"
            disabled={!currentSong}
            title="搜索歌词并自动上传到百度网盘"
          >
            <Search className="h-4 w-4" />
            搜索歌词
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManager(true)}
            className="gap-1"
          >
            <ListChecks className="h-4 w-4" />
            下载管理
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

          <Button
            variant="outline"
            size="sm"
            onClick={handleAddEmptyLine}
            className="gap-1"
          >
            <Type className="h-4 w-4" />
            添加空行
          </Button>
        </div>
      </div>

      {/* 元数据编辑区 */}
      {showMetadata && (
        <div className="mb-4 p-4 border rounded bg-muted/30 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <h5 className="text-sm font-medium mb-2">LRC 元数据</h5>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">歌曲名 (ti)</label>
            <Input 
              value={lrcMetadata?.ti || ''} 
              onChange={e => setLrcMetadata({ ...lrcMetadata, ti: e.target.value })} 
              placeholder="例如: 稻香" 
              className="h-8"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">歌手 (ar)</label>
            <Input 
              value={lrcMetadata?.ar || ''} 
              onChange={e => setLrcMetadata({ ...lrcMetadata, ar: e.target.value })} 
              placeholder="例如: 周杰伦" 
              className="h-8"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">专辑 (al)</label>
            <Input 
              value={lrcMetadata?.al || ''} 
              onChange={e => setLrcMetadata({ ...lrcMetadata, al: e.target.value })} 
              placeholder="例如: 魔杰座" 
              className="h-8"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">歌词制作者 (by)</label>
            <Input 
              value={lrcMetadata?.by || ''} 
              onChange={e => setLrcMetadata({ ...lrcMetadata, by: e.target.value })} 
              placeholder="例如: 某某某" 
              className="h-8"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">时间补偿 offset (毫秒)</label>
            <Input 
              type="number"
              value={lrcMetadata?.offset || ''} 
              onChange={e => setLrcMetadata({ ...lrcMetadata, offset: parseInt(e.target.value, 10) || undefined })} 
              placeholder="例如: 0" 
              className="h-8 w-1/2"
            />
          </div>
        </div>
      )}

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
            onCompositionEnd={(e) => setTextInput(e.currentTarget.value)}
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
            {filteredLyrics.map((line) => {
              const isEditing = editingLineId === line.id;

              // 行的背景色
              const rowBg = line.time === -1
                ? 'bg-orange-50 dark:bg-orange-950/20'
                : line.isInterlude
                ? 'bg-purple-50 dark:bg-purple-950/20'
                : line.text === ''
                ? 'bg-gray-50 dark:bg-gray-950/20'
                : 'bg-green-50 dark:bg-green-950/20';

              const selectedRing = selectedLineId === line.id
                ? 'ring-2 ring-primary bg-primary/5 dark:bg-primary/10'
                : '';

              return (
                <div
                  key={line.id}
                  className={`border-b p-3 hover:bg-muted/50 transition-colors cursor-pointer ${rowBg} ${selectedRing}`}
                  onClick={() => {
                    // 单击仅设置选中行，不影响 editingLineId
                    if (!isEditing) {
                      setSelectedLineId(line.id!);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* 歌词内容区 */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        /**
                         * 编辑模式容器：
                         * - onClick stopPropagation 阻止冒泡到行容器（防止 setSelectedLineId 触发）
                         * - 不使用 onMouseDown stopPropagation，避免干扰输入框原生聚焦
                         */
                        <div
                          className="flex gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex-1 space-y-2">
                            {/* 文本编辑框（非受控）*/}
                            {line.isInterlude ? (
                              <div className="text-sm text-purple-600 font-medium py-2">
                                ♪ 间奏 ♪ (不可编辑文本)
                              </div>
                            ) : (
                              <input
                                ref={editTextRef}
                                defaultValue={line.text}
                                onKeyDown={(e) => handleTextKeyDown(e, line.id!, line.isInterlude)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                placeholder="输入歌词文本"
                                autoComplete="off"
                              />
                            )}

                            {/* 时间编辑框（非受控）*/}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">时间:</span>
                              <input
                                ref={editTimeRef}
                                defaultValue={line.time === -1 ? '' : formatLRCTime(line.time).slice(1, -1)}
                                onKeyDown={(e) => handleTimeKeyDown(e, line.id!, line.isInterlude)}
                                className="flex rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-32 h-8 font-mono"
                                placeholder="mm:ss.xx"
                                autoComplete="off"
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleSaveEdit(line.id!, line.isInterlude)}
                                >
                                  保存
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelEdit}
                                >
                                  取消
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Enter保存 / ESC取消
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* 非编辑模式：双击进入编辑 */
                        <div>
                          <div
                            className="text-sm font-medium cursor-pointer hover:text-primary min-h-[1.25rem]"
                            onDoubleClick={(e) => handleStartEdit(line.id!, e)}
                            title="双击编辑文本和时间"
                          >
                            {line.isInterlude
                              ? '♪ 间奏 ♪'
                              : (line.text || (
                                <span className="text-muted-foreground italic text-xs">(空行)</span>
                              ))
                            }
                          </div>
                          <div
                            className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-primary w-fit"
                            onDoubleClick={(e) => handleStartEdit(line.id!, e)}
                            title="双击编辑时间"
                          >
                            {line.isInterlude && (
                              <span className="text-purple-600">[间奏] </span>
                            )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetCurrentTime(line.id!);
                        }}
                        disabled={line.isInterlude}
                      >
                        设为当前时间
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJumpToTime(line.time);
                        }}
                        disabled={line.time === -1}
                      >
                        跳转播放
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLyricLine(line.id!);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
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
            <Button variant="outline" onClick={handleCancelOverwrite}>
              取消
            </Button>
            <Button variant="default" onClick={handleConfirmOverwrite}>
              确认覆盖
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 搜索歌词对话框 */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>搜索歌词</DialogTitle>
            <DialogDescription>
              从 lrc.64h.cn 搜索歌词，下载后将自动应用并上传到百度网盘同目录。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && executeSearch()}
              placeholder="输入歌曲名或歌手名..."
              className="flex-1"
            />
            <Button onClick={executeSearch} disabled={searching || !searchKeyword.trim()}>
              {searching ? '搜索中...' : '搜索'}
            </Button>
          </div>

          {searchError && (
            <div className="text-sm text-red-500 mt-2">{searchError}</div>
          )}

          <div className="mt-4 max-h-[40vh] overflow-y-auto border rounded-md">
            {searchResults.length === 0 && !searching && !searchError ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                暂无搜索结果
              </div>
            ) : (
              <div className="divide-y">
                {searchResults.map(res => (
                  <div
                    key={res.id}
                    className={`p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors ${selectedSearchId === res.id ? 'bg-primary/10' : ''}`}
                    onClick={() => setSelectedSearchId(res.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{res.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                        <span>歌手: {res.artist || '未知'}</span>
                        <span>时长: {res.duration || '未知'}</span>
                        <span>来源: {res.source}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowSearchDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleDownloadLyric}
              disabled={!selectedSearchId || searching}
            >
              下载并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DownloadManager />
    </div>
  );
};