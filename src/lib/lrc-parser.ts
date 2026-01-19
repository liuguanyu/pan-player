export interface LyricLine {
  time: number; // 时间（秒）
  text: string; // 歌词文本
}

/**
 * 解析LRC歌词
 * @param lrcContent LRC文件内容
 * @returns 解析后的歌词行数组
 */
export const parseLRC = (lrcContent: string): LyricLine[] => {
  if (!lrcContent) return [];

  const lines: LyricLine[] = [];
  const lrcLines = lrcContent.split('\n');

  // LRC时间标签正则表达式: [mm:ss.xx] 或 [mm:ss]
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lrcLines) {
    const matches = [...line.matchAll(timeRegex)];
    
    if (matches.length > 0) {
      // 提取歌词文本（移除所有时间标签）
      const text = line.replace(timeRegex, '').trim();
      
      if (text) {
        // 为每个时间标签创建一行歌词
        for (const match of matches) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
          
          const time = minutes * 60 + seconds + milliseconds / 1000;
          
          lines.push({ time, text });
        }
      }
    }
  }

  // 按时间排序
  lines.sort((a, b) => a.time - b.time);

  return lines;
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