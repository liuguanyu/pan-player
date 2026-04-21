import { httpClient } from '@/lib/http-client';

export interface LyricSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  source: string;
}

export class LyricsService {
  private static instance: LyricsService;
  private readonly baseUrl = 'https://lrc.64h.cn';

  private constructor() {}

  public static getInstance(): LyricsService {
    if (!LyricsService.instance) {
      LyricsService.instance = new LyricsService();
    }
    return LyricsService.instance;
  }

  /**
   * 搜索歌词
   * @param keyword 搜索关键词
   */
  public async search(keyword: string): Promise<LyricSearchResult[]> {
    try {
      const url = `${this.baseUrl}/search/${encodeURIComponent(keyword)}`;
      const response = await httpClient.get(url, { responseType: 'text' });
      
      if ('error' in response || !response.data) {
        throw new Error('搜索请求失败');
      }

      return this.parseSearchResults(response.data);
    } catch (error) {
      console.error('歌词搜索失败:', error);
      throw error;
    }
  }

  /**
   * 获取歌词详情
   * @param id 歌词ID
   */
  public async getLyric(id: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/view/${id}.html`;
      const response = await httpClient.get(url, { responseType: 'text' });
      
      if ('error' in response || !response.data) {
        throw new Error('获取歌词请求失败');
      }

      return this.parseLyricDetail(response.data);
    } catch (error) {
      console.error('获取歌词详情失败:', error);
      throw error;
    }
  }

  private parseSearchResults(html: string): LyricSearchResult[] {
    const results: LyricSearchResult[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const rows = doc.querySelectorAll('table tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 6) return;

      const detailLink = cells[5].querySelector('a');
      const href = detailLink?.getAttribute('href');
      if (!href) return;

      const idMatch = href.match(/\/view\/(\d+)\.html/);
      if (!idMatch || idMatch.length < 2) return;
      
      const id = idMatch[1];
      const songInfo = cells[0].textContent?.trim() || '';
      
      // 解析歌名和歌手 (假设格式为 "歌手 - 歌名")
      let title = songInfo;
      let artist = '';
      const parts = songInfo.split('-');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }

      const duration = cells[2].textContent?.trim() || '';

      results.push({
        id,
        title,
        artist,
        album: '',
        duration,
        source: 'lrc64h'
      });
    });

    return results;
  }

  private parseLyricDetail(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const lines: string[] = [];
    const lyricElements = doc.querySelectorAll('.lyrics-container .lyrics-text .line');
    
    lyricElements.forEach(el => {
      const line = el.textContent?.trim();
      if (line) {
        lines.push(line);
      }
    });

    if (lines.length === 0) {
      throw new Error('未在详情页找到歌词');
    }

    return lines.join('\n');
  }
}

export const lyricsService = LyricsService.getInstance();
