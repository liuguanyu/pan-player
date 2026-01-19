import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

class AudioConverter {
  private static instance: AudioConverter;
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private isLoading = false;

  private constructor() {}

  public static getInstance(): AudioConverter {
    if (!AudioConverter.instance) {
      AudioConverter.instance = new AudioConverter();
    }
    return AudioConverter.instance;
  }

  public async load() {
    if (this.isLoaded) return;
    if (this.isLoading) return;

    this.isLoading = true;
    try {
      this.ffmpeg = new FFmpeg();
      
      // 加载 FFmpeg 核心文件
      // 使用 unpkg CDN 加载，虽然在离线环境下会有问题，但这是目前最简单的集成方式
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      this.isLoaded = true;
      console.log('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 将音频转换为浏览器可播放的格式 (mp3)
   * @param url 音频文件URL
   * @param filename 文件名
   * @returns 转换后的Blob URL
   */
  public async convertToPlayableFormat(url: string, filename: string): Promise<string> {
    if (!this.isLoaded) {
      await this.load();
    }

    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');

    const ext = filename.split('.').pop()?.toLowerCase() || 'm4a';
    const inputName = `input.${ext}`;
    const outputName = 'output.mp3';

    try {
      // 1. 下载文件（通过 Electron 主进程，避免 CORS 问题）
      console.log('Downloading file for conversion:', url);
      const result = await window.electronAPI.downloadFile(url);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || '下载文件失败');
      }
      
      // 2. 写入文件到 FFmpeg 文件系统
      await this.ffmpeg.writeFile(inputName, new Uint8Array(result.data));
      
      // 3. 执行转换命令
      console.log('Starting conversion...');
      await this.ffmpeg.exec(['-i', inputName, outputName]);
      
      // 4. 读取转换后的文件
      const data = await this.ffmpeg.readFile(outputName);
      
      // 5. 创建 Blob URL
      // 需要创建一个新的 Uint8Array 副本，以解决 SharedArrayBuffer 类型问题
      const uint8Data = data as Uint8Array;
      const buffer = new Uint8Array(uint8Data);
      const blob = new Blob([buffer], { type: 'audio/mp3' });
      const blobUrl = URL.createObjectURL(blob);
      
      console.log('Conversion successful:', blobUrl);
      
      // 清理文件系统
      // await this.ffmpeg.deleteFile(inputName);
      // await this.ffmpeg.deleteFile(outputName);
      
      return blobUrl;
    } catch (error) {
      console.error('Conversion failed:', error);
      throw error;
    }
  }

  public isReady(): boolean {
    return this.isLoaded;
  }
}

export const audioConverter = AudioConverter.getInstance();