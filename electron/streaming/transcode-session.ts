import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg';
import logger from '../logger';

/**
 * 转码会话状态枚举
 */
export type SessionState = 'idle' | 'transcoding' | 'completed' | 'error';

/**
 * TranscodeSession 构造参数
 */
export interface TranscodeSessionOptions {
  sessionId: string;
  sourceUrl: string;
  startTimeSeconds?: number;
}

/**
 * TranscodeSession - 管理单个 FFmpeg 转码进程和内存缓冲
 *
 * 职责：
 * - 启动 FFmpeg 将远程音频源转码为 FLAC 格式
 * - 通过管道输出收集转码数据到内存缓冲
 * - 提供按范围读取已缓冲数据的接口
 * - 发出 data / progress / complete / error 事件
 */
export class TranscodeSession extends EventEmitter {
  public readonly sessionId: string;
  public readonly sourceUrl: string;
  public readonly startTimeSeconds: number;

  /** 当前会话状态 */
  private _state: SessionState = 'idle';

  /** 已转码的数据块列表 */
  private chunks: Buffer[] = [];

  /** 已缓冲的总字节数 */
  private _totalBytes: number = 0;

  /** 转码后的音频时长（秒） */
  private _duration: number = 0;

  /** 合并后的完整 Buffer（转码完成后生成，用于快速随机访问） */
  private _mergedBuffer: Buffer | null = null;

  /** FFmpeg 进程实例 */
  private ffmpegCommand: FfmpegCommand | null = null;

  /** 用于接收 FFmpeg stdout 数据的 PassThrough 流 */
  private outputStream: PassThrough | null = null;

  /** 会话创建时间戳（用于 LRU 策略） */
  public readonly createdAt: number = Date.now();

  /** 最后访问时间戳（用于 LRU 策略） */
  public lastAccessedAt: number = Date.now();

  constructor(options: TranscodeSessionOptions) {
    super();
    this.sessionId = options.sessionId;
    this.sourceUrl = options.sourceUrl;
    this.startTimeSeconds = options.startTimeSeconds ?? 0;
  }

  // ─── 公共属性访问 ────────────────────────────────────────────

  /** 获取当前状态 */
  get state(): SessionState {
    return this._state;
  }

  /** 是否转码完成 */
  get isComplete(): boolean {
    return this._state === 'completed';
  }

  /** 已缓冲的总字节数 */
  get totalBytes(): number {
    return this._totalBytes;
  }

  /** 获取音频时长（秒） */
  get duration(): number {
    return this._duration;
  }

  // ─── 核心方法 ────────────────────────────────────────────────

  /**
   * 启动 FFmpeg 转码进程
   *
   * FFmpeg 参数：
   * - 输入：sourceUrl（HTTP URL）
   * - 编码：flac
   * - 采样率：44100
   * - 声道：2
   * - 如果有 startTimeSeconds，使用 -ss 参数
   * - 输出到管道（pipe）
   */
  start(): void {
    if (this._state !== 'idle') {
      logger.warn(`[TranscodeSession] Session ${this.sessionId} is already in state: ${this._state}, cannot start`);
      return;
    }

    logger.log(`[TranscodeSession] Starting session ${this.sessionId}`, {
      sourceUrl: this.sourceUrl.substring(0, 100) + '...',
      startTimeSeconds: this.startTimeSeconds,
    });

    this._state = 'transcoding';
    this.outputStream = new PassThrough();

    try {
      // 构建 FFmpeg 命令
      let command = ffmpeg(this.sourceUrl);

      // 如果有 seek 时间，添加 -ss 参数（放在输入之前更高效，但 fluent-ffmpeg 的 seekInput 已处理）
      if (this.startTimeSeconds > 0) {
        command = command.seekInput(this.startTimeSeconds);
      }

      command = command
        .audioCodec('flac')
        .audioFrequency(44100)
        .audioChannels(2)
        .format('flac')
        .outputOptions(['-compression_level', '0']); // 最快压缩，减少延迟

      // 事件处理
      command.on('start', (commandLine: string) => {
        logger.log(`[TranscodeSession] FFmpeg started for ${this.sessionId}:`, commandLine);
      });

      command.on('progress', (progress: { percent?: number; timemark?: string }) => {
        const percent = Math.min(progress.percent ?? 0, 100);
        
        // 解析 timemark (格式: "HH:MM:SS.mmm") 为秒数
        if (progress.timemark) {
          const parts = progress.timemark.split(':');
          if (parts.length === 3) {
            const hours = parseFloat(parts[0]);
            const minutes = parseFloat(parts[1]);
            const seconds = parseFloat(parts[2]);
            this._duration = hours * 3600 + minutes * 60 + seconds;
          }
        }
        
        this.emit('progress', {
          percent,
          timemark: progress.timemark,
          totalBytes: this._totalBytes,
          duration: this._duration,
        });
      });

      command.on('end', () => {
        logger.log(`[TranscodeSession] Transcode completed for ${this.sessionId}, total bytes: ${this._totalBytes}, duration: ${this._duration}s`);
        this._state = 'completed';
        this._mergePendingChunks();
        this.emit('complete', { totalBytes: this._totalBytes, duration: this._duration });
      });

      command.on('error', (err: Error) => {
        // FFmpeg 进程被 kill 时也会触发 error，需区分
        if (this._state === 'idle') {
          // 已被 destroy，忽略
          return;
        }
        logger.error(`[TranscodeSession] FFmpeg error for ${this.sessionId}:`, err.message);
        this._state = 'error';
        this.emit('error', err);
      });

      // 通过管道输出到 PassThrough 流
      command.pipe(this.outputStream, { end: true });

      // 监听数据块
      this.outputStream.on('data', (chunk: Buffer) => {
        this.chunks.push(chunk);
        this._totalBytes += chunk.length;
        // 清除合并缓存，因为有新数据
        this._mergedBuffer = null;
        this.emit('data', {
          chunk,
          totalBytes: this._totalBytes,
        });
      });

      this.outputStream.on('error', (err: Error) => {
        if (this._state === 'idle') return;
        logger.error(`[TranscodeSession] Output stream error for ${this.sessionId}:`, err.message);
        this._state = 'error';
        this.emit('error', err);
      });

      this.ffmpegCommand = command;
    } catch (err) {
      logger.error(`[TranscodeSession] Failed to start FFmpeg for ${this.sessionId}:`, err);
      this._state = 'error';
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * 获取指定范围的已缓冲数据
   *
   * @param start - 起始字节偏移（默认 0）
   * @param end - 结束字节偏移（不含，默认为全部已缓冲数据）
   * @returns 指定范围的 Buffer，如果请求范围超出已缓冲大小，返回可用部分
   */
  getBufferedData(start?: number, end?: number): Buffer {
    this.lastAccessedAt = Date.now();

    const effectiveStart = start ?? 0;
    const effectiveEnd = end ?? this._totalBytes;

    // 边界校验
    if (effectiveStart >= this._totalBytes || effectiveStart < 0) {
      return Buffer.alloc(0);
    }

    const clampedEnd = Math.min(effectiveEnd, this._totalBytes);

    if (effectiveStart === 0 && clampedEnd === this._totalBytes) {
      // 请求全部数据，返回完整 buffer
      return this._getFullBuffer();
    }

    // 从完整 buffer 中切片
    const full = this._getFullBuffer();
    return full.subarray(effectiveStart, clampedEnd);
  }

  /**
   * 获取完整的合并 Buffer
   */
  getFullBuffer(): Buffer {
    this.lastAccessedAt = Date.now();
    return this._getFullBuffer();
  }

  /**
   * 获取指定范围的切片数据（用于 Range 请求）
   *
   * @param start - 起始字节偏移（含）
   * @param end - 结束字节偏移（含）
   * @returns 切片 Buffer
   */
  getSlice(start: number, end: number): Buffer {
    this.lastAccessedAt = Date.now();
    const full = this._getFullBuffer();
    return full.subarray(start, end + 1);
  }

  /**
   * 终止 FFmpeg 进程并释放所有资源
   */
  destroy(): void {
    logger.log(`[TranscodeSession] Destroying session ${this.sessionId}`);

    const previousState = this._state;
    this._state = 'idle';

    // 终止 FFmpeg 进程
    if (this.ffmpegCommand) {
      try {
        (this.ffmpegCommand as any).kill('SIGKILL');
      } catch (err) {
        logger.warn(`[TranscodeSession] Error killing FFmpeg process for ${this.sessionId}:`, err);
      }
      this.ffmpegCommand = null;
    }

    // 关闭输出流
    if (this.outputStream) {
      try {
        this.outputStream.destroy();
      } catch (err) {
        logger.warn(`[TranscodeSession] Error destroying output stream for ${this.sessionId}:`, err);
      }
      this.outputStream = null;
    }

    // 释放内存缓冲
    this.chunks = [];
    this._mergedBuffer = null;
    this._totalBytes = 0;

    // 移除所有监听器
    this.removeAllListeners();

    if (previousState === 'transcoding') {
      logger.log(`[TranscodeSession] Session ${this.sessionId} was transcoding when destroyed (aborted)`);
    }
  }

  // ─── 内部方法 ────────────────────────────────────────────────

  /**
   * 获取或创建合并后的完整 Buffer
   */
  private _getFullBuffer(): Buffer {
    if (this._mergedBuffer && this._mergedBuffer.length === this._totalBytes) {
      return this._mergedBuffer;
    }
    this._mergePendingChunks();
    return this._mergedBuffer!;
  }

  /**
   * 合并所有 chunks 为一个 Buffer
   * 转码完成后自动调用，也可在需要时手动调用
   */
  private _mergePendingChunks(): void {
    if (this.chunks.length === 0) {
      this._mergedBuffer = Buffer.alloc(0);
      return;
    }

    if (this.chunks.length === 1) {
      this._mergedBuffer = this.chunks[0];
      return;
    }

    this._mergedBuffer = Buffer.concat(this.chunks, this._totalBytes);

    // 转码完成后，用合并的 buffer 替换 chunks 数组以释放引用
    if (this._state === 'completed') {
      this.chunks = [this._mergedBuffer];
    }
  }

  /**
   * 等待缓冲区达到指定字节数
   * 用于协议处理器在数据尚未就绪时等待 FFmpeg 产出数据
   *
   * @param minBytes 最少需要的字节数
   * @param timeoutMs 超时毫秒数，默认 30 秒
   * @returns true 如果数据到达，false 如果超时或出错
   */
  waitForData(minBytes: number, timeoutMs: number = 30000): Promise<boolean> {
    return new Promise((resolve) => {
      // 如果已经有足够数据
      if (this._totalBytes >= minBytes) {
        resolve(true);
        return;
      }
      // 如果已完成或出错，检查当前数据是否满足
      if (this._state === 'completed' || this._state === 'error') {
        resolve(this._totalBytes >= minBytes);
        return;
      }

      let settled = false;
      const settle = (result: boolean) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(result);
        }
      };

      const onData = () => {
        if (this._totalBytes >= minBytes) {
          settle(true);
        }
      };
      const onComplete = () => settle(this._totalBytes >= minBytes);
      const onError = () => settle(false);
      const timer = setTimeout(() => settle(false), timeoutMs);

      const cleanup = () => {
        this.removeListener('data', onData);
        this.removeListener('complete', onComplete);
        this.removeListener('error', onError);
        clearTimeout(timer);
      };

      this.on('data', onData);
      this.on('complete', onComplete);
      this.on('error', onError);
    });
  }

  /**
   * 获取当前内存占用（字节）
   */
  getMemoryUsage(): number {
    return this._totalBytes;
  }
}