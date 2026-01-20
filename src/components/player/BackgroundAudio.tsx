import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { baiduAPI } from '@/services/baidu-api.service';
import { parseLRC } from '@/lib/lrc-parser';

// 辅助函数：检查是否需要转码
// 仅对明确不支持的格式（如 ape）返回 true
// m4a 可能包含 aac（支持）或 alac（不支持），需要先尝试播放
const needsTranscoding = (filename: string) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['alac', 'ape'].includes(ext || '');
};

export const BackgroundAudio = () => {
  const {
    isPlaying,
    currentTime,
    volume,
    currentSong,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    playNext,
    setParsedLyrics,
    updatePlaylistItemDuration
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [activePlayer, setActivePlayer] = useState<'html5' | 'transcoded'>('html5');
  const transcodedUrlRef = useRef<string | null>(null);
  
  const lastCurrentTimeRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);
  const transcodingCleanupRef = useRef<(() => void) | null>(null);

  // 监听歌曲变化，决定使用哪个播放器并加载
  useEffect(() => {
    if (!currentSong) return;

    const loadSong = async () => {
      // 重置状态
      lastCurrentTimeRef.current = 0;
      setCurrentTime(0);
      setDuration(0);
      isSeekingRef.current = false;

      try {
        const link = await baiduAPI.getDownloadLink(currentSong.fs_id);
        if (!link) {
          console.error("无法获取下载链接");
          return;
        }

        const filename = currentSong.server_filename;
        // 对于 M4A 文件，先尝试直接播放，出错后再检测编码
        const useTranscoding = needsTranscoding(filename);

        if (useTranscoding) {
          console.log(`[播放器] 需要转码: ${filename}`);
          setActivePlayer('transcoded');
          
          // 清理之前的转码文件
          if (transcodedUrlRef.current) {
            window.electronAPI.cleanupTempAudio(transcodedUrlRef.current);
            transcodedUrlRef.current = null;
          }
          
          // 移除之前的事件监听器
          if (transcodingCleanupRef.current) {
            transcodingCleanupRef.current();
            transcodingCleanupRef.current = null;
          }
          
          // 确保 HTML5 播放器停止
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
          }
          
          // 设置转码完成的回调
          const onTranscodeComplete = (result: { success: boolean; outputPath: string }) => {
            if (!result.success) {
              console.error(`[播放器] 转码失败`);
              // 转码失败时尝试播放下一首
              setTimeout(playNext, 3000);
              return;
            }
            
            console.log(`[播放器] 转码完成: ${result.outputPath}`);
            transcodedUrlRef.current = result.outputPath;
            
            if (audioRef.current) {
              // 使用自定义协议访问本地文件
              audioRef.current.src = `local-audio://${encodeURIComponent(result.outputPath)}`;
              // 自动播放（如果 store 状态是 playing）
              if (isPlaying) {
                audioRef.current.play().catch(e => {
                  if (e.name !== 'AbortError') console.error("转码后播放失败:", e);
                });
              }
            }
          };
          
          // 设置转码失败的回调
          const onTranscodeFail = (error: string) => {
            console.error(`[播放器] 转码失败:`, error);
            // 转码失败时尝试播放下一首，等待时间延长到5秒以提供更多反馈时间
            setTimeout(playNext, 5000);
          };
          
          // 添加事件监听器
          const cleanupComplete = window.electronAPI.onTranscodeComplete(currentSong.fs_id.toString(), onTranscodeComplete);
          const cleanupFail = window.electronAPI.onTranscodeFail(currentSong.fs_id.toString(), onTranscodeFail);
          
          // 保存清理函数
          transcodingCleanupRef.current = () => {
            cleanupComplete();
            cleanupFail();
          };
          
          // 开始转码
          window.electronAPI.transcodeAlac(link, currentSong.fs_id.toString());
        } else {
          console.log(`[播放器] 直接播放: ${filename}`);
          setActivePlayer('html5');
          
          // 清理转码相关的资源
          if (transcodedUrlRef.current) {
            window.electronAPI.cleanupTempAudio(transcodedUrlRef.current);
            transcodedUrlRef.current = null;
          }
          
          if (transcodingCleanupRef.current) {
            transcodingCleanupRef.current();
            transcodingCleanupRef.current = null;
          }
          
          if (audioRef.current) {
            audioRef.current.src = link;
            // HTML5 的 play 会在 onCanPlay 中触发
          }
        }
      } catch (error) {
        console.error('加载歌曲流程出错:', error);
        setTimeout(playNext, 3000);
      }
    };

    loadSong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.fs_id]);

  // 监听播放/暂停状态变化
  useEffect(() => {
    const handlePlayState = async () => {
      if (activePlayer === 'html5' || activePlayer === 'transcoded') {
        if (audioRef.current) {
          if (isPlaying) {
            // 捕获播放错误，避免未加载完成时报错
            await audioRef.current.play().catch(e => {
              if (e.name !== 'AbortError') console.error("HTML5 播放失败:", e);
            });
          } else {
            audioRef.current.pause();
          }
        }
      }
    };
    handlePlayState();
  }, [isPlaying, activePlayer]);

  // 监听音量变化
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // 监听进度拖拽/跳转 (Store -> Player)
  useEffect(() => {
    // 只有当 store 中的时间与内部记录的时间差异较大时，才认为是用户拖拽或跳转
    if (Math.abs(currentTime - lastCurrentTimeRef.current) > 1.0) {
      // 标记正在跳转，避免 handleTimeUpdate 回写旧时间
      isSeekingRef.current = true;
      
      console.log(`[播放器] 跳转到: ${currentTime}`);
      
      if ((activePlayer === 'html5' || activePlayer === 'transcoded') && audioRef.current) {
        // 检查 audio 是否就绪
        if (audioRef.current.readyState > 0) {
          audioRef.current.currentTime = currentTime;
        }
      }
      
      lastCurrentTimeRef.current = currentTime;
      
      // 延迟重置跳转标记
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 200);
    }
  }, [currentTime, activePlayer]);

  // HTML5 事件处理
  const handleCanPlay = () => {
    if ((activePlayer === 'html5' || activePlayer === 'transcoded') && audioRef.current) {
      audioRef.current.volume = volume;
      if (isPlaying) {
        audioRef.current.play().catch(e => {
          if (e.name !== 'AbortError') console.error("HTML5 Play error", e);
        });
      }
    }
  };

  const handleTimeUpdate = () => {
    if ((activePlayer === 'html5' || activePlayer === 'transcoded') && audioRef.current && !isSeekingRef.current) {
      const newTime = audioRef.current.currentTime;
      if (Math.abs(newTime - lastCurrentTimeRef.current) > 0.5) {
        setCurrentTime(newTime);
        lastCurrentTimeRef.current = newTime;
      }
    }
  };

  const handleEnded = () => {
    if (activePlayer === 'html5' || activePlayer === 'transcoded') {
      console.log('播放结束');
      playNext();
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    // 处理播放错误
    const error = e.currentTarget.error;
    console.error("播放错误:", error);

    // 如果是 HTML5 播放失败，且错误码为 4 (MEDIA_ERR_SRC_NOT_SUPPORTED)，尝试转码播放
    // 这通常发生在 .m4a 文件实际上是 ALAC 编码时，或者浏览器不支持该格式
    if (activePlayer === 'html5' && error && error.code === 4 && currentSong) {
      console.log(`[播放器] HTML5 播放失败 (code 4)，检查是否需要转码: ${currentSong.server_filename}`);
      
      // 切换到转码模式
      const startTranscoding = async () => {
        try {
           const link = await baiduAPI.getDownloadLink(currentSong.fs_id);
           if (!link) return;

           // 检测音频编码
           console.log('[播放器] 检测音频编码...');
           const codecResult = await window.electronAPI.detectAudioCodec(link);
           if (codecResult.success && codecResult.codec) {
             console.log(`[播放器] 音频编码: ${codecResult.codec}`);
             // 如果是 AAC 编码但播放失败，可能是其他问题，不建议强制转码
             // 但为了最大兼容性，只要不是明确支持的格式，都尝试转码
             // HTML5 audio 明确支持: mp3, wav, ogg, aac (在 m4a 容器中)
             const supportedCodecs = ['mp3', 'wav', 'ogg', 'aac'];
             if (supportedCodecs.includes(codecResult.codec.toLowerCase())) {
               console.warn(`[播放器] 格式 ${codecResult.codec} 应该被支持，但播放失败。尝试转码作为后备方案。`);
             }
           }

           setActivePlayer('transcoded');
           
           // 清理之前的转码资源
           if (transcodedUrlRef.current) {
             window.electronAPI.cleanupTempAudio(transcodedUrlRef.current);
             transcodedUrlRef.current = null;
           }
           
           if (transcodingCleanupRef.current) {
             transcodingCleanupRef.current();
           }

           // 设置转码回调
           const onTranscodeComplete = (result: { success: boolean; outputPath: string }) => {
             if (!result.success) {
               console.error(`[播放器] 转码失败 (Fallback)`);
               setTimeout(playNext, 3000);
               return;
             }
             
             console.log(`[播放器] 转码完成 (Fallback): ${result.outputPath}`);
             transcodedUrlRef.current = result.outputPath;
             
             if (audioRef.current) {
               // 使用自定义协议访问本地文件
               audioRef.current.src = `local-audio://${encodeURIComponent(result.outputPath)}`;
               if (isPlaying) {
                 audioRef.current.play().catch(e => console.error("转码后播放失败:", e));
               }
             }
           };

           const onTranscodeFail = (err: string) => {
             console.error(`[播放器] 转码失败 (Fallback):`, err);
             // 转码失败时尝试播放下一首，等待时间延长到5秒
             setTimeout(playNext, 5000);
           };

           const cleanupComplete = window.electronAPI.onTranscodeComplete(currentSong.fs_id.toString(), onTranscodeComplete);
           const cleanupFail = window.electronAPI.onTranscodeFail(currentSong.fs_id.toString(), onTranscodeFail);

           transcodingCleanupRef.current = () => {
             cleanupComplete();
             cleanupFail();
           };

           window.electronAPI.transcodeAlac(link, currentSong.fs_id.toString());
        } catch (err) {
           console.error("启动转码失败:", err);
        }
      };

      startTranscoding();
      return;
    }
    
    // 其他错误，直接跳过
    // 如果是转码模式，不要跳过，等待转码完成
    if (activePlayer === 'transcoded') {
      console.log("[播放器] 转码模式下的错误，等待转码完成...");
      return;
    }
    
    console.log("3秒后跳过...");
    setTimeout(playNext, 3000);
  };

  const handlePause = () => {
    if ((activePlayer === 'html5' || activePlayer === 'transcoded') && audioRef.current && !audioRef.current.ended) {
      // 如果系统自动暂停（如拔出耳机），且我们状态是播放中，则同步状态
      if (isPlaying) {
        console.log("检测到外部暂停（设备拔出?），更新状态");
        setIsPlaying(false);
      }
    }
  };

  // 监听音频输出设备变化
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log('音频设备发生变化');
      if (isPlaying) {
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.pause();
      }
    };
    
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [isPlaying, setIsPlaying]);

  // 自动加载歌词
  useEffect(() => {
    const loadAutoLyrics = async () => {
      if (!currentSong) {
        setParsedLyrics(null);
        return;
      }
      
      const audioPath = currentSong.path;
      const lrcPath = audioPath.substring(0, audioPath.lastIndexOf('.')) + '.lrc';
      
      try {
        const lrcContent = await baiduAPI.getFileContent(lrcPath);
        if (lrcContent) {
          const parsed = parseLRC(lrcContent);
          setParsedLyrics(parsed.length > 0 ? parsed : null);
        } else {
          setParsedLyrics(null);
        }
      } catch (error) {
        // 静默失败，不要打扰用户
        setParsedLyrics(null);
      }
    };
    
    loadAutoLyrics();
  }, [currentSong?.fs_id, setParsedLyrics]);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      // 清理转码相关的资源
      if (transcodedUrlRef.current) {
        window.electronAPI.cleanupTempAudio(transcodedUrlRef.current);
        transcodedUrlRef.current = null;
      }
      
      if (transcodingCleanupRef.current) {
        transcodingCleanupRef.current();
        transcodingCleanupRef.current = null;
      }
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      crossOrigin="anonymous"
      onLoadedMetadata={(e: React.SyntheticEvent<HTMLAudioElement>) => {
        const d = e.currentTarget.duration;
        setDuration(d);
        if (currentSong && isFinite(d)) updatePlaylistItemDuration(currentSong.fs_id, d);
      }}
      onTimeUpdate={handleTimeUpdate}
      onCanPlay={handleCanPlay}
      onError={handleError}
      onEnded={handleEnded}
      onPause={handlePause}
      style={{ display: 'none' }}
    />
  );
};

export default BackgroundAudio;