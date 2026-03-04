import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { parseLRC, getCurrentLyricIndex, LyricLine } from '@/lib/lrc-parser';
import { Button } from '@/components/ui/button';
import { Upload, X, Edit, Eye } from 'lucide-react';
import { LyricsEditor } from './LyricsEditor';

interface LyricsDisplayProps {
  onClose: () => void;
}

export const LyricsDisplay: React.FC<LyricsDisplayProps> = ({ onClose }) => {
  const {
    currentTime,
    parsedLyrics,
    setParsedLyrics,
    lrcMetadata,
    setLrcMetadata,
    isEditingLyrics,
    setIsEditingLyrics
  } = usePlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [lyrics, setLyrics] = React.useState<LyricLine[]>(parsedLyrics || []);
  const [currentIndex, setCurrentIndex] = React.useState(-1);
  const lastScrollIndexRef = useRef(-1);

  // 当 store 中的 parsedLyrics 变化时，更新本地状态
  useEffect(() => {
    setLyrics(parsedLyrics || []);
    lastScrollIndexRef.current = -1; // 重置滚动索引
  }, [parsedLyrics]);

  // 根据当前播放时间更新当前歌词索引 - 优化性能，减少计算频率
  useEffect(() => {
    if (lyrics.length > 0) {
      const offsetInSeconds = (lrcMetadata?.offset || 0) / 1000;
      // offset为正，歌词提前显示，即对应的实际时间为 line.time - offset
      // 反过来想，如果当前时间是 currentTime，相当于匹配的标签时间是 currentTime + offset
      const index = getCurrentLyricIndex(lyrics, currentTime + offsetInSeconds);
      // 只有当索引真正变化时才更新状态
      if (index !== currentIndex) {
        setCurrentIndex(index);
      }
    }
  }, [currentTime, lyrics, currentIndex, lrcMetadata?.offset]);

  // 自动滚动到当前歌词 - 优化性能，只在索引变化时滚动
  useEffect(() => {
    // 只有当索引变化时才滚动，避免频繁的 DOM 操作
    if (currentIndex >= 0 && currentIndex !== lastScrollIndexRef.current && containerRef.current) {
      lastScrollIndexRef.current = currentIndex;
      
      // 使用 requestAnimationFrame 来优化滚动性能
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        
        // 获取歌词容器（containerRef.current.children[0] 是内部的 max-w-2xl div）
        const lyricsContainer = containerRef.current.children[0];
        
        // 查找所有包含 data-index 属性的歌词行元素
        const lyricElements = Array.from(lyricsContainer.querySelectorAll('[data-index]'));
        const currentElement = lyricElements[currentIndex] as HTMLElement;
        
        if (currentElement) {
          currentElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      });
    }
  }, [currentIndex]);

  // 手动选择LRC文件
  const handleSelectLRCFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lrc';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const parsed = parseLRC(content);
        setLyrics(parsed.lines);
        setParsedLyrics(parsed.lines);
        setLrcMetadata(parsed.metadata);
      } catch (error) {
        console.error('解析LRC文件失败:', error);
        alert('解析LRC文件失败');
      }
    };

    input.click();
  };

  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 flex flex-col">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">
            {isEditingLyrics ? '歌词编辑' : '歌词显示'}
          </h3>
          {lyrics.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingLyrics(!isEditingLyrics)}
              className="gap-2"
            >
              {isEditingLyrics ? (
                <>
                  <Eye className="h-4 w-4" />
                  预览模式
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4" />
                  编辑模式
                </>
              )}
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* 歌词内容或编辑器 */}
      {isEditingLyrics ? (
        <div className="flex-1 overflow-hidden p-4">
          <LyricsEditor />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" ref={containerRef}>
        <div className="max-w-2xl mx-auto space-y-6 py-[50vh]">
          {lyrics.length > 0 ? (
            <>
              {lrcMetadata && (lrcMetadata.ti || lrcMetadata.ar || lrcMetadata.al || lrcMetadata.by) && (
                <div className="text-center space-y-2 mb-12 text-muted-foreground/70">
                  {lrcMetadata.ti && <div className="text-2xl font-bold text-foreground/80">{lrcMetadata.ti}</div>}
                  {lrcMetadata.ar && <div className="text-sm">歌手: {lrcMetadata.ar}</div>}
                  {lrcMetadata.al && <div className="text-sm">专辑: {lrcMetadata.al}</div>}
                  {lrcMetadata.by && <div className="text-xs opacity-60">作词: {lrcMetadata.by}</div>}
                </div>
              )}
              {lyrics.map((line, index) => (
              <div
                key={index}
                data-index={index}
                className={`text-center transition-all duration-300 cursor-pointer hover:text-primary ${
                  index === currentIndex
                    ? 'text-2xl font-bold text-primary scale-110'
                    : 'text-lg text-muted-foreground opacity-50 hover:opacity-100'
                }`}
                onClick={() => {
                  const player = usePlayerStore.getState();
                  if (player.currentSong) {
                    const audio = document.querySelector('audio');
                    if (audio) {
                      const offsetInSeconds = (player.lrcMetadata?.offset || 0) / 1000;
                      audio.currentTime = Math.max(0, line.time - offsetInSeconds);
                    }
                  }
                }}
              >
                {line.text}
              </div>
            ))}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <p className="text-lg text-muted-foreground">暂无歌词</p>
              <Button
                variant="outline"
                onClick={handleSelectLRCFile}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                选择LRC文件
              </Button>
              <p className="text-sm text-muted-foreground">
                支持自动关联同文件夹下的.lrc文件
              </p>
            </div>
          )}
        </div>
        </div>
      )}

      {/* 底部操作栏 - 仅在显示模式且有歌词时显示 */}
      {!isEditingLyrics && lyrics.length > 0 && (
        <div className="border-t p-4 flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={handleSelectLRCFile}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            更换歌词文件
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsEditingLyrics(true)}
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            编辑歌词
          </Button>
        </div>
      )}
      
      {/* 底部操作栏 - 仅在显示模式且无歌词时显示 */}
      {!isEditingLyrics && lyrics.length === 0 && (
        <div className="border-t p-4 flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={handleSelectLRCFile}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            选择LRC文件
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsEditingLyrics(true)}
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            导入文本编辑
          </Button>
        </div>
      )}
    </div>
  );
};