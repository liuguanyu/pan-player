import { app, ipcMain, IpcMainEvent } from 'electron';
import { unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// 设置 ffmpeg 二进制路径
let ffmpegPath = ffmpegStatic;

// 修复 Electron 开发环境下的路径问题
// 在开发模式下，ffmpeg-static 返回的路径可能不正确，我们需要指向 node_modules 中的实际路径
// 添加保护措施，确保 app 对象存在
if (app && !app.isPackaged) {
    // 尝试在 node_modules 中找到 ffmpeg-static
    // 注意：这里的路径解析假设项目根目录结构
    const devFfmpegPath = resolve(__dirname, '../../node_modules/ffmpeg-static/ffmpeg.exe');
    if (existsSync(devFfmpegPath)) {
        ffmpegPath = devFfmpegPath;
    } else {
        // 如果找不到，尝试另外一种常见的结构
        const altDevFfmpegPath = resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe');
        if (existsSync(altDevFfmpegPath)) {
            ffmpegPath = altDevFfmpegPath;
        }
    }
} else {
    // 生产环境处理 (asar)
    if (ffmpegPath && ffmpegPath.includes('app.asar')) {
        ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
}

if (ffmpegPath) {
  console.log('[Transcoder] Setting ffmpeg path:', ffmpegPath);
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.error('[Transcoder] Failed to find ffmpeg path');
}

// 存储临时文件路径,便于清理
const tempFiles = new Set<string>();

/**
 * 检测音频编码类型
 */
function detectAudioCodec(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(url, (err, metadata) => {
      if (err) {
        console.error('[编码检测失败]', err.message);
        resolve(null);
        return;
      }

      // 查找音频流
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      if (audioStream && audioStream.codec_name) {
        console.log('[检测到音频编码]', audioStream.codec_name);
        resolve(audioStream.codec_name);
      } else {
        console.warn('[未找到音频流]');
        resolve(null);
      }
    });
  });
}

/**
 * 注册 ALAC 流式转码 IPC 处理器
 */
export function setupAudioStreamTranscoder() {
  // 处理音频编码检测请求
  ipcMain.handle('detect-audio-codec', async (_event: IpcMainEvent, url: string) => {
    try {
      const codec = await detectAudioCodec(url);
      return { success: true, codec };
    } catch (error) {
      console.error('[编码检测异常]', error);
      return { success: false, codec: null };
    }
  });

  // 处理 ALAC 转码请求
  ipcMain.on('transcode-alac', (event: IpcMainEvent, { url, fileId }: { url: string; fileId: string }) => {
    const tempWavPath = join(tmpdir(), `dupan-alac-${fileId}-${Date.now()}.wav`);
    tempFiles.add(tempWavPath);

    console.log('[转码开始]', { url: url.substring(0, 100), tempWavPath });

    try {
      // 创建 ffmpeg 命令 - 使用 WAV 格式，兼容性最好
      const command = ffmpeg(url)
        .audioCodec('pcm_s16le')  // WAV PCM 编码
        .audioBitrate('192k')
        .audioFrequency(44100)
        .audioChannels(2)
        .format('wav')
        .on('start', (commandLine: string) => {
          console.log('[FFmpeg 命令]', commandLine);
        })
        .on('progress', (progress: any) => {
          // 发送转码进度
          if (progress.percent) {
            event.reply(`transcode-progress-${fileId}`, {
              percent: Math.min(progress.percent || 0, 99),
              timemark: progress.timemark
            });
          }
        })
        .on('end', () => {
          console.log('[转码完成]', tempWavPath);
          event.reply(`transcode-complete-${fileId}`, {
            success: true,
            outputPath: tempWavPath
          });
        })
        .on('error', (err: Error) => {
          console.error('[转码失败]', err.message);
          event.reply(`transcode-fail-${fileId}`, err.message);
          
          // 清理失败的临时文件
          try {
            if (existsSync(tempWavPath)) {
              unlinkSync(tempWavPath);
            }
            tempFiles.delete(tempWavPath);
          } catch (cleanupErr) {
            console.error('[清理失败]', cleanupErr);
          }
        });

      // 保存到临时文件
      command.save(tempWavPath);

    } catch (error) {
      console.error('[转码启动失败]', error);
      event.reply(`transcode-fail-${fileId}`, (error as Error).message);
    }
  });

  // 清理临时文件
  ipcMain.on('cleanup-temp-audio', (_event: IpcMainEvent, filePath: string) => {
    try {
      if (tempFiles.has(filePath) && existsSync(filePath)) {
        unlinkSync(filePath);
        tempFiles.delete(filePath);
        console.log('[已清理临时文件]', filePath);
      }
    } catch (error) {
      console.error('[清理临时文件失败]', filePath, error);
    }
  });
}

/**
 * 清理所有临时文件（应用退出时调用）
 */
export function cleanupAllTempFiles() {
  for (const filePath of tempFiles) {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log('[退出时清理临时文件]', filePath);
      }
    } catch (error) {
      console.error('[退出时清理失败]', filePath, error);
    }
  }
  tempFiles.clear();
}