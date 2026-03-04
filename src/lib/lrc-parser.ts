export interface LyricLine {
  id?: string; // 唯一标识符
  time: number; // 时间（秒）
  text: string; // 歌词文本
  isInterlude?: boolean; // 是否为间奏
}

export interface LRCMetadata {
  ti?: string; // 歌曲名
  ar?: string; // 歌手名
  al?: string; // 专辑名
  by?: string; // 歌词制作者
  offset?: number; // 时间补偿值，单位毫秒
}

export interface ParseResult {
  lines: LyricLine[];
  metadata: LRCMetadata;
}

/**
 * 解析LRC歌词
 * @param lrcContent LRC文件内容
 * @returns 解析后的歌词行数组
 */
export const parseLRC = (lrcContent: string): ParseResult => {
  if (!lrcContent) return { lines: [], metadata: {} };

  const lines: LyricLine[] = [];
  const metadata: LRCMetadata = {};
  const lrcLines = lrcContent.split('\n');

  // LRC时间标签正则表达式: [mm:ss.xx] 或 [mm:ss]
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  
  // LRC元数据标签正则表达式: [ti:title]
  const metadataRegex = /^\[(ti|ar|al|by|offset):(.*)\]$/i;

  for (const line of lrcLines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // 检查元数据标签
    const metaMatch = trimmedLine.match(metadataRegex);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase() as keyof LRCMetadata;
      const value = metaMatch[2].trim();
      if (key === 'offset') {
        const offsetVal = parseInt(value, 10);
        if (!isNaN(offsetVal)) {
          metadata.offset = offsetVal;
        }
      } else {
        metadata[key] = value as any;
      }
      continue;
    }

    const matches = [...trimmedLine.matchAll(timeRegex)];
    
    if (matches.length > 0) {
      // 提取歌词文本（移除所有时间标签）
      const text = trimmedLine.replace(timeRegex, '').trim();
      
      if (text || true) { // 允许空行
        // 为每个时间标签创建一行歌词
        for (const match of matches) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
          
          let time = minutes * 60 + seconds + milliseconds / 1000;
          
          lines.push({
            id: generateLyricId(),
            time,
            text,
            isInterlude: false
          });
        }
      }
    }
  }

  // 按时间排序
  lines.sort((a, b) => a.time - b.time);

  return { lines, metadata };
};

/**
 * 根据当前播放时间获取当前应该显示的歌词行索引
 * @param lyrics 歌词数组
 * @param currentTime 当前播放时间（秒）
 * @returns 当前歌词行索引，如果没有匹配的返回-1
 */
export const getCurrentLyricIndex = (lyrics: LyricLine[], currentTime: number): number => {
  if (lyrics.length === 0) return -1;

  // 找到最后一个时间小于等于当前时间的歌词行
  let currentIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime) {
      currentIndex = i;
    } else {
      break;
    }
  }

  return currentIndex;
};

/**
 * 格式化时间为LRC时间标签格式 [mm:ss.xx]
 * @param seconds 时间（秒）
 * @returns LRC时间标签
 */
export const formatLRCTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  return `[${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}]`;
};

/**
 * 生成唯一ID
 */
export const generateLyricId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * 从纯文本生成歌词行数组（每行一条歌词，时间初始为null）
 * @param textContent 纯文本内容
 * @returns 歌词行数组
 */
export const parsePlainText = (textContent: string): LyricLine[] => {
  if (!textContent) return [];
  
  const lines: LyricLine[] = [];
  const textLines = textContent.split('\n');
  
  for (const line of textLines) {
    const trimmed = line.trim();
    // 保留空行，不再过滤
    lines.push({
      id: generateLyricId(),
      time: -1, // 使用-1表示未设置时间
      text: trimmed, // 可以是空字符串
      isInterlude: false
    });
  }
  
  return lines;
};

/**
 * 解析 LRC 时间标签字符串为秒数
 * @param timeStr 时间字符串，格式: "mm:ss.xx" 或 "mm:ss"
 * @returns 时间（秒）
 */
export const parseLRCTimeTag = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return -1;
  
  const minutes = parseInt(parts[0], 10);
  const secParts = parts[1].split('.');
  const seconds = parseInt(secParts[0], 10);
  const milliseconds = secParts[1] ? parseInt(secParts[1].padEnd(3, '0'), 10) : 0;
  
  if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) return -1;
  
  return minutes * 60 + seconds + milliseconds / 1000;
};

/**
 * 生成LRC文件内容
 * @param lyrics 歌词数组
 * @param metadata LRC元数据
 * @returns LRC格式的字符串
 */
export const generateLRC = (lyrics: LyricLine[], metadata?: LRCMetadata): string => {
  let result = '';

  // 写入元数据
  if (metadata) {
    if (metadata.ti) result += `[ti:${metadata.ti}]\n`;
    if (metadata.ar) result += `[ar:${metadata.ar}]\n`;
    if (metadata.al) result += `[al:${metadata.al}]\n`;
    if (metadata.by) result += `[by:${metadata.by}]\n`;
    if (metadata.offset !== undefined) result += `[offset:${metadata.offset}]\n`;
  }

  // 只包含有时间标记的歌词
  const validLyrics = lyrics.filter(line => line.time >= 0);
  
  // 按时间排序
  const sorted = [...validLyrics].sort((a, b) => a.time - b.time);
  
  result += sorted.map(line => {
    const timeTag = formatLRCTime(line.time);
    return `${timeTag}${line.text}`;
  }).join('\n');

  return result;
};