import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { baiduAPI } from '@/services/baidu-api.service';
import { parseLRC } from '@/lib/lrc-parser';
import { audioContextService } from '@/services/audio-context.service';

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
    playbackRate,
    currentSong,
    isEditingLyrics,
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
  const streamSessionIdRef = useRef<string | null>(null);
  
  const lastCurrentTimeRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);
  const transcodingCleanupRef = useRef<(() => void) | null>(null);
  const durationRef = useRef<number>(0);
  
  // 流式转码的基准时间（用于 Seek 后正确计算绝对时间）
  const baseTimeRef = useRef<number>(0);
  
  // 标记是否正在缓冲（网络等待），避免将缓冲暂停误判为用户暂停
  const isBufferingRef = useRef<boolean>(false);
  
  // 标记 loadSong 正在执行中，此时 isPlaying effect 不应操作 audio，避免竞态
  const isLoadingRef = useRef<boolean>(false);

  // 用 ref 持有最新的 isPlaying、currentSong、activePlayer，供各 effect 使用
  // 避免将它们加入依赖数组，防止状态变化时误触发 seek 或其他副作用
  const isPlayingRef = useRef<boolean>(isPlaying);
  const currentSongRef = useRef(currentSong);
  const activePlayerRef = useRef<'html5' | 'transcoded'>('html5');
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { activePlayerRef.current = activePlayer; }, [activePlayer]);

  // 降级到旧的临时文件转码方式
  const fallbackToLegacyTranscode = async (url: string, fileId: string) => {
    console.warn('[播放器] 降级到旧的临时文件转码方式');

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

    const onTranscodeComplete = (result: { success: boolean; outputPath: string }) => {
      if (!result.success) {
        console.error(`[播放器] 降级转码失败`);
        setTimeout(playNext, 3000);
        return;
      }

      console.log(`[播放器] 降级转码完成: ${result.outputPath}`);
      transcodedUrlRef.current = result.outputPath;

      if (audioRef.current) {
        audioRef.current.src = `local-audio://${encodeURIComponent(result.outputPath)}`;
        if (isPlaying) {
          audioRef.current.play().catch(e => {
            if (e.name !== 'AbortError') console.error("降级转码后播放失败:", e);
          });
        }
      }
    };

    const onTranscodeFail = (error: string) => {
      console.error(`[播放器] 降级转码失败:`, error);
      setTimeout(playNext, 5000);
    };

    const cleanupComplete = window.electronAPI.onTranscodeComplete(fileId, onTranscodeComplete);
    const cleanupFail = window.electronAPI.onTranscodeFail(fileId, onTranscodeFail);

    transcodingCleanupRef.current = () => {
      cleanupComplete();
      cleanupFail();
    };

    window.electronAPI.transcodeAlac(url, fileId);
  };

  // 清理流式转码会话及相关事件监听
  const cleanupStreamSession = () => {
    if (streamSessionIdRef.current) {
      console.log(`[播放器] 清理流式会话: ${streamSessionIdRef.current}`);
      window.electronAPI.streamTranscodeDestroy(streamSessionIdRef.current);
      streamSessionIdRef.current = null;
    }
  };

  // 清理所有转码相关资源（流式 + 旧方式）
  const cleanupAllTranscodeResources = () => {
    cleanupStreamSession();

    if (transcodedUrlRef.current) {
      window.electronAPI.cleanupTempAudio(transcodedUrlRef.current);
      transcodedUrlRef.current = null;
    }

    if (transcodingCleanupRef.current) {
      transcodingCleanupRef.current();
      transcodingCleanupRef.current = null;
    }
  };

  // 监听歌曲变化，决定使用哪个播放器并加载
  useEffect(() => {
    if (!currentSong) return;

    const loadSong = async () => {
      // 标记正在加载，阻止 isPlaying effect 在加载过程中操作 audio
      isLoadingRef.current = true;
      
      // 重置状态
      lastCurrentTimeRef.current = 0;
      baseTimeRef.current = 0; // 重置基准时间
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

          // 清理之前所有转码资源
          cleanupAllTranscodeResources();
          
          // 确保 HTML5 播放器停止
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
          }

          // 使用流式转码
          const sessionId = currentSong.fs_id.toString();
          
          // 修复问题2：初始时间显示 Infinity
          // 在启动流式转码前，使用文件的元数据（如 currentSong.duration）预设 duration
          console.log(`[BackgroundAudio] Loading song: ${currentSong.server_filename}, currentSong.duration=${currentSong.duration}`);
          if (currentSong.duration) {
            console.log(`[BackgroundAudio] Setting initial duration from song metadata: ${currentSong.duration}`);
            durationRef.current = currentSong.duration;
            setDuration(currentSong.duration);
            console.log(`[BackgroundAudio] durationRef.current set to: ${durationRef.current}, playerStore.setDuration called with: ${currentSong.duration}`);
          } else {
            console.warn(`[BackgroundAudio] currentSong.duration is missing or zero: ${currentSong.duration}`);
          }

          try {
            const result = await window.electronAPI.streamTranscodeStart(sessionId, link);
            streamSessionIdRef.current = sessionId;
            console.log(`[播放器] 流式转码已启动, streamUrl: ${result.streamUrl}`);

            // 设置流式 URL 为音频源
            if (audioRef.current) {
              audioRef.current.src = result.streamUrl;
              audioRef.current.load();
              
              // 修复问题1：播放按钮状态不一致
              audioRef.current.play()
                .then(() => {
                  // 播放成功，同步 Store 状态
                  setIsPlaying(true);
                })
                .catch(err => {
                  console.error('流式转码自动播放失败:', err);
                  // 播放失败，确保 Store 状态正确
                  setIsPlaying(false);
                });
            }

            // 监听流式转码事件
            const cleanupProgress = window.electronAPI.onStreamProgress(sessionId, (progress) => {
              console.log(`[播放器] 流式转码进度: ${progress}%`);
            });

            const cleanupComplete = window.electronAPI.onStreamComplete(sessionId, (duration: number) => {
              console.log(`[BackgroundAudio] Stream complete event received, duration from IPC: ${duration}`);
              
              // 修复问题1：直接设置 duration，不重新加载音频（避免中断播放）
              if (duration > 0) {
                console.log(`[BackgroundAudio] Updating durationRef.current: ${durationRef.current} -> ${duration}`);
                durationRef.current = duration;
                setDuration(duration);
                console.log(`[BackgroundAudio] playerStore.setDuration called with: ${duration}`);
                if (currentSong) {
                  updatePlaylistItemDuration(currentSong.fs_id, duration);
                }
              } else {
                console.warn(`[BackgroundAudio] Stream complete but duration is invalid: ${duration}, keeping durationRef.current=${durationRef.current}`);
              }
            });

            const cleanupError = window.electronAPI.onStreamError(sessionId, (error) => {
              console.error('[播放器] 流式转码错误:', error);
              // 降级到旧的临时文件转码方式
              cleanupStreamSession();
              fallbackToLegacyTranscode(link, sessionId);
            });

            // 保存清理函数（包含流式事件监听器）
            transcodingCleanupRef.current = () => {
              cleanupProgress();
              cleanupComplete();
              cleanupError();
            };
          } catch (streamError) {
            console.error('[播放器] 流式转码启动失败:', streamError);
            // 降级到旧的临时文件转码方式
            await fallbackToLegacyTranscode(link, sessionId);
          }
        } else {
          console.log(`[播放器] 直接播放: ${filename}`);
          setActivePlayer('html5');
          
          // 清理所有转码相关资源
          cleanupAllTranscodeResources();
          
          if (audioRef.current) {
            // 先停止当前播放，避免旧 src 继续播放
            audioRef.current.pause();
            audioRef.current.src = link;
            audioRef.current.load();
            // 加载完成后，由 loadSong 自己发起播放，不依赖 isPlaying effect
            // 使用 isPlayingRef 读取最新值，避免闭包捕获过时的 isPlaying
            if (isPlayingRef.current) {
              audioRef.current.play().catch(e => {
                if (e.name !== 'AbortError') console.error("HTML5 直接播放失败:", e);
              });
            }
          }
        }
      } catch (error) {
        console.error('加载歌曲流程出错:', error);
        setTimeout(playNext, 3000);
      } finally {
        // 无论成功还是失败，加载完成后清除标志
        isLoadingRef.current = false;
      }
    };

    loadSong();

    // 切换歌曲时清理上一个流式会话
    return () => {
      cleanupAllTranscodeResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.fs_id]);

  // 监听播放/暂停状态变化
  // 注意：只依赖 isPlaying，activePlayer 通过 ref 读取
  // loadSong 执行期间（isLoadingRef=true），此 effect 不应操作 audio，避免竞态：
  //   - loadSong 负责设置 src、load()、play()
  //   - 如果此 effect 在 loadSong 完成前触发，会对旧 src 发起 play()，被后续 load() abort
  useEffect(() => {
    const handlePlayState = async () => {
      // 如果正在加载新歌，跳过——loadSong 自己负责播放
      if (isLoadingRef.current) {
        console.log('[播放器] loadSong 进行中，跳过 isPlaying effect 的 play/pause 操作');
        return;
      }
      if (audioRef.current) {
        if (isPlaying) {
          // 恢复音频上下文（如果是挂起状态）
          audioContextService.resume();
          
          // 只有 src 已经设置（不为空）才播放，避免加载过程中调用 play()
          if (audioRef.current.src && audioRef.current.src !== window.location.href) {
            await audioRef.current.play().catch(e => {
              if (e.name !== 'AbortError') console.error("HTML5 播放失败:", e);
            });
          }
        } else {
          audioRef.current.pause();
        }
      }
    };
    handlePlayState();
  }, [isPlaying]);

  // 监听音量变化
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // 监听播放速度变化
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // 监听进度拖拽/跳转 (Store -> Player)
  // 注意：依赖数组只包含 currentTime
  // activePlayer、isPlaying、currentSong 全部通过 ref 读取，避免它们变化时误触发 seek
  useEffect(() => {
    // 只有当 store 中的时间与内部记录的时间差异较大时，才认为是用户拖拽或跳转
    if (Math.abs(currentTime - lastCurrentTimeRef.current) > 1.0) {
      // 标记正在跳转，避免 handleTimeUpdate 回写旧时间
      isSeekingRef.current = true;
      
      console.log(`[播放器] 跳转到: ${currentTime}`);
      
      const handleSeek = async () => {
        if (!audioRef.current) return;
        
        // 通过 ref 读取最新值，不依赖闭包捕获（避免将它们加入依赖数组）
        const currentIsPlaying = isPlayingRef.current;
        const currentSongSnap = currentSongRef.current;
        const currentActivePlayer = activePlayerRef.current;
        
        // 如果是流式转码模式，需要特殊处理 Seek
        if (currentActivePlayer === 'transcoded' && currentSongSnap) {
          console.log(`[播放器] 流式转码 Seek 到: ${currentTime}`);
          
          try {
            const sessionId = currentSongSnap.fs_id.toString();
            const link = await baiduAPI.getDownloadLink(currentSongSnap.fs_id);
            
            if (link) {
              // 更新基准时间为目标时间
              baseTimeRef.current = currentTime;
              
              // 重新启动流式转码，从目标时间开始
              const result = await window.electronAPI.streamTranscodeStart(sessionId, link, currentTime);
              
              if (audioRef.current) {
                audioRef.current.src = result.streamUrl;
                audioRef.current.load();

                // 立即恢复 duration（防止显示 Infinity）
                if (durationRef.current > 0) {
                  setDuration(durationRef.current);
                }
                
                // 恢复播放
                if (currentIsPlaying) {
                  audioRef.current.play().catch(err => console.error('Seek play failed:', err));
                }
              }
            }
          } catch (err) {
            console.error('[播放器] 流式转码 Seek 失败:', err);
          }
        } else if (currentActivePlayer === 'html5') {
          // 普通 HTML5 播放器 Seek
          if (audioRef.current.readyState > 0) {
            audioRef.current.currentTime = currentTime;
          }
        }
      };

      handleSeek().finally(() => {
        // 延迟重置跳转标记，防止快速连续触发
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 500);
      });
      
      lastCurrentTimeRef.current = currentTime;
    }
  }, [currentTime]);

  // HTML5 事件处理
  const handleCanPlay = () => {
    if ((activePlayer === 'html5' || activePlayer === 'transcoded') && audioRef.current) {
      // 初始化音频上下文
      audioContextService.init(audioRef.current);
      
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = playbackRate; // 保持播放速率
      // 仅在音频当前处于暂停且 Store 认为应该播放时触发 play()
      // 避免在已播放的状态下重复调用 play() 导致打断
      if (isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(e => {
          if (e.name !== 'AbortError') console.error("HTML5 Play error", e);
        });
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeekingRef.current) {
      // 在流式转码模式下，audio.currentTime 是从流开始的时间
      // 如果发生过 Seek，我们需要加上偏移量
      // 但由于我们的实现是每次 Seek 都重启流，所以流的开始就是 Seek 的目标时间
      // 实际上这里有个问题：audio.currentTime 是从 0 开始计时的
      // 我们需要加上 Seek 的基准时间
      // 不过，目前的实现是：UI 拖动 -> 更新 Store currentTime -> 触发 useEffect -> 重启流
      // 重启流后，audio.currentTime 从 0 开始
      // 这会导致进度条跳回 0，然后随着播放增加
      // 这不是预期的行为。预期是进度条显示 absolute time。
      
      // 修正方案：
      // 对于流式转码，我们需要维护一个 baseTime
      // 当发生 Seek 时，更新 baseTime = targetTime
      // handleTimeUpdate 时，reportTime = baseTime + audio.currentTime
      
      // 但由于这是一个较大的改动，且当前任务只要求"实现 Seek 功能"
      // 简单的实现是：
      // 1. Seek 时，Store currentTime 更新为 targetTime
      // 2. 流重启，audio.currentTime = 0
      // 3. 此时 handleTimeUpdate 报告的时间是 0 + small_delta
      // 4. 这会导致 Store currentTime 被重置为 0
      
      // 所以我们需要在流式转码模式下，正确计算 absolute time
      // 让我们引入一个 ref 来存储 baseTime
      
      let reportTime = audioRef.current.currentTime;
      
      // 在流式转码模式下，需要加上基准时间来得到绝对时间
      if (activePlayer === 'transcoded') {
        reportTime = baseTimeRef.current + audioRef.current.currentTime;
      }
      
      // 确保计算结果有效
      if (isFinite(reportTime)) {
        if (Math.abs(reportTime - lastCurrentTimeRef.current) > 0.5) {
          setCurrentTime(reportTime);
          lastCurrentTimeRef.current = reportTime;
        }
      }
    }
  };

  const handleEnded = () => {
    if (activePlayer === 'html5' || activePlayer === 'transcoded') {
      console.log('播放结束');
      // 如果正在编辑歌词，则不自动切换歌曲
      if (isEditingLyrics) {
        console.log('歌词编辑模式下，暂停自动切换歌曲');
        setIsPlaying(false);
        return;
      }
      
      // 获取当前播放模式
      const { playbackMode } = usePlayerStore.getState();
      
      // 单曲循环模式：直接重播当前歌曲
      if (playbackMode === 'single') {
        console.log('单曲循环模式：重播当前歌曲');
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => {
            if (e.name !== 'AbortError') console.error("重播失败:", e);
          });
        }
      } else {
        // 其他模式：播放下一首
        playNext();
      }
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
             const supportedCodecs = ['mp3', 'wav', 'ogg', 'aac'];
             if (supportedCodecs.includes(codecResult.codec.toLowerCase())) {
               console.warn(`[播放器] 格式 ${codecResult.codec} 应该被支持，但播放失败。尝试转码作为后备方案。`);
             }
           }

           setActivePlayer('transcoded');
           
           // 清理之前的所有转码资源
           cleanupAllTranscodeResources();

           const sessionId = currentSong.fs_id.toString();

           // 优先尝试流式转码
           try {
             // 修复问题2：初始时间显示 Infinity (错误恢复场景)
             console.log(`[BackgroundAudio] Error recovery: currentSong.duration=${currentSong.duration}`);
             if (currentSong.duration) {
               console.log(`[BackgroundAudio] Error recovery: setting initial duration from song metadata: ${currentSong.duration}`);
               durationRef.current = currentSong.duration;
               setDuration(currentSong.duration);
               console.log(`[BackgroundAudio] Error recovery: durationRef.current=${durationRef.current}, playerStore.setDuration called with: ${currentSong.duration}`);
             } else {
               console.warn(`[BackgroundAudio] Error recovery: currentSong.duration is missing or zero: ${currentSong.duration}`);
             }

             const result = await window.electronAPI.streamTranscodeStart(sessionId, link);
             streamSessionIdRef.current = sessionId;
             console.log(`[播放器] 流式转码已启动 (错误恢复), streamUrl: ${result.streamUrl}`);

             if (audioRef.current) {
               audioRef.current.src = result.streamUrl;
               audioRef.current.load();
               
               // 修复问题1：播放按钮状态不一致 (错误恢复场景)
               audioRef.current.play()
                 .then(() => setIsPlaying(true))
                 .catch(err => {
                   console.error('流式转码自动播放失败 (错误恢复):', err);
                   setIsPlaying(false);
                 });
             }

             const cleanupProgress = window.electronAPI.onStreamProgress(sessionId, (progress) => {
               console.log(`[播放器] 流式转码进度 (错误恢复): ${progress}%`);
             });

             const cleanupStreamComplete = window.electronAPI.onStreamComplete(sessionId, (duration: number) => {
               console.log(`[BackgroundAudio] Error recovery: stream complete event received, duration from IPC: ${duration}`);
               
               // 修复问题1：直接设置 duration，不重新加载音频（避免中断播放）
               if (duration > 0) {
                 console.log(`[BackgroundAudio] Error recovery: updating durationRef.current: ${durationRef.current} -> ${duration}`);
                 durationRef.current = duration;
                 setDuration(duration);
                 console.log(`[BackgroundAudio] Error recovery: playerStore.setDuration called with: ${duration}`);
                 if (currentSong) {
                   updatePlaylistItemDuration(currentSong.fs_id, duration);
                 }
               } else {
                 console.warn(`[BackgroundAudio] Error recovery: stream complete but duration is invalid: ${duration}, keeping durationRef.current=${durationRef.current}`);
               }
             });

             const cleanupStreamError = window.electronAPI.onStreamError(sessionId, (streamErr) => {
               console.error('[播放器] 流式转码错误 (错误恢复):', streamErr);
               cleanupStreamSession();
               fallbackToLegacyTranscode(link, sessionId);
             });

             transcodingCleanupRef.current = () => {
               cleanupProgress();
               cleanupStreamComplete();
               cleanupStreamError();
             };
           } catch (streamError) {
             console.error('[播放器] 流式转码启动失败 (错误恢复):', streamError);
             // 降级到旧的临时文件转码方式
             await fallbackToLegacyTranscode(link, sessionId);
           }
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
      // 如果正在加载新歌，pause 是 loadSong 的 pause() 调用，不是外部暂停
      if (isLoadingRef.current) {
        console.log("检测到加载中的暂停（loadSong 操作），忽略此次 pause 事件");
        return;
      }
      // 如果正在缓冲，pause 事件是由网络等待触发的，不是用户/系统操作，不应同步到 Store
      if (isBufferingRef.current) {
        console.log("检测到缓冲暂停（网络等待），忽略此次 pause 事件");
        return;
      }
      // 如果正在 Seek，也忽略 pause 事件（Seek 操作会先触发 pause 再恢复播放）
      if (isSeekingRef.current) {
        console.log("检测到 Seek 中的暂停，忽略此次 pause 事件");
        return;
      }
      // 如果系统真正外部暂停（如拔出耳机），且我们状态是播放中，则同步状态
      if (isPlaying) {
        console.log("检测到外部暂停（设备拔出?），更新状态");
        setIsPlaying(false);
      }
    }
  };

  // 处理缓冲等待（网络加载中）
  const handleWaiting = () => {
    console.log("[播放器] 网络缓冲中（waiting）...");
    isBufferingRef.current = true;
  };

  // 缓冲完成，可以继续播放
  const handlePlaying = () => {
    console.log("[播放器] 缓冲完成，恢复播放（playing）");
    isBufferingRef.current = false;
    // 如果 Store 认为应该在播放，但音频由于缓冲暂停了，在这里确保它恢复
    if (isPlaying && audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(e => {
        if (e.name !== 'AbortError') console.error("缓冲后恢复播放失败:", e);
      });
    }
  };

  // 监听音频输出设备变化
  // 注意：使用 isPlayingRef 避免将 isPlaying 加入依赖数组
  // isPlaying 变化不应导致重新注册 devicechange 监听器
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log('音频设备发生变化');
      if (isPlayingRef.current) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      cleanupAllTranscodeResources();
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      crossOrigin="anonymous"
      onWaiting={handleWaiting}
      onPlaying={handlePlaying}
      onLoadedMetadata={(e: React.SyntheticEvent<HTMLAudioElement>) => {
        const d = e.currentTarget.duration;
        console.log(`[BackgroundAudio] onLoadedMetadata: audio element duration=${d}, isFinite=${isFinite(d)}, activePlayer=${activePlayer}, durationRef.current=${durationRef.current}`);

        // Bug 1 修复：流式转码模式下 audio.duration 可能是 Infinity（流式响应无 Content-Length）
        // 此时不能用 Infinity 覆盖正确的 duration
        if (activePlayer === 'transcoded' && !isFinite(d)) {
          console.log(`[BackgroundAudio] onLoadedMetadata: streaming mode, audio.duration=Infinity, using durationRef=${durationRef.current}`);
          if (durationRef.current > 0) {
            setDuration(durationRef.current);
            console.log(`[BackgroundAudio] onLoadedMetadata: playerStore.setDuration called with durationRef: ${durationRef.current}`);
          }
          // durationRef.current === 0 时什么都不做，等待 IPC 传来真实 duration
          return;
        }

        // 正常模式：使用 audio.duration
        if (isFinite(d) && d > 0) {
          setDuration(d);
          console.log(`[BackgroundAudio] onLoadedMetadata: playerStore.setDuration called with: ${d}`);
          if (currentSong) updatePlaylistItemDuration(currentSong.fs_id, d);
        }
      }}
      onTimeUpdate={handleTimeUpdate}
      onCanPlay={handleCanPlay}
      onEnded={handleEnded}
      onPause={handlePause}
      onError={handleError}
      style={{ display: 'none' }}
    />
  );
};

export default BackgroundAudio;