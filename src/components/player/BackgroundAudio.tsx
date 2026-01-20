import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { baiduAPI } from '@/services/baidu-api.service';
import { audioConverter } from '@/services/audio-converter';
import { parseLRC } from '@/lib/lrc-parser';

export const BackgroundAudio: React.FC = () => {
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
  const lastCurrentTimeRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);
  
  // 处理音频可以播放
  const handleCanPlay = () => {
    if (audioRef.current) {
      // 设置音量
      audioRef.current.volume = volume;
      
      // 如果正在播放状态，开始播放
      if (isPlaying) {
        audioRef.current.play().catch(error => {
          console.error('播放失败:', error);
        });
      }
    }
  };
  
  // 处理播放时间更新 - 优化性能，减少不必要的状态更新
  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeekingRef.current) {
      const newTime = audioRef.current.currentTime;
      // 只有当时间变化超过0.5秒时才更新状态，减少频繁更新
      if (Math.abs(newTime - lastCurrentTimeRef.current) > 0.5) {
        setCurrentTime(newTime);
        lastCurrentTimeRef.current = newTime;
      }
    }
  };
  
  // 处理音频加载错误
  const handleError = async (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const audio = e.currentTarget;
    const error = audio.error;
    
    let isFormatError = false;
    
    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_DECODE:
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          isFormatError = true;
          break;
      }
      console.error('音频加载错误:', error.message || '无详细信息');
      console.error('当前文件:', currentSong?.server_filename);
    }
    
    // 如果是格式错误，尝试使用 FFmpeg 转换
    if (isFormatError && currentSong) {
      console.log('检测到格式错误，尝试使用 FFmpeg 转换...');
      
      try {
        // 获取下载链接
        const downloadLink = await baiduAPI.getDownloadLink(currentSong.fs_id);
        if (!downloadLink) {
          throw new Error('无法获取下载链接');
        }
        
        // 转换音频
        const convertedUrl = await audioConverter.convertToPlayableFormat(
          downloadLink,
          currentSong.server_filename
        );
        
        // 更新 audio 元素的 src
        if (audioRef.current) {
          audioRef.current.src = convertedUrl;
          audioRef.current.load();
          
          // 如果之前是播放状态，则开始播放
          if (isPlaying) {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                if (error.name !== 'AbortError') {
                  console.error('播放转换后的音频失败:', error);
                }
              });
            }
          }
        }
      } catch (conversionError) {
        console.error('音频转换失败:', conversionError);
        // 转换失败则跳到下一首
        console.log('音频转换失败，3秒后自动跳到下一首...');
        setTimeout(() => {
          playNext();
        }, 3000);
      }
    } else if (isFormatError) {
      // 如果没有当前歌曲信息，直接跳到下一首
      console.log('检测到格式错误，3秒后自动跳到下一首...');
      setTimeout(() => {
        playNext();
      }, 3000);
    }
  };
  
  // 处理音频播放结束
  const handleEnded = () => {
    playNext();
  };
  
  // 处理音频暂停（包括设备变化导致的暂停）
  const handlePause = () => {
    // 当音频被暂停时（包括设备变化如拔出耳机），同步更新状态
    // 但要排除我们主动暂停的情况
    if (audioRef.current && !audioRef.current.ended) {
      // 只有在非主动暂停且非播放结束的情况下才更新状态
      // 这样可以捕获设备变化等系统级别的暂停
      const store = usePlayerStore.getState();
      if (store.isPlaying) {
        console.log('检测到音频被暂停（可能是设备变化），更新播放状态');
        setIsPlaying(false);
      }
    }
  };
  
  // 监听音频输出设备变化
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log('音频设备发生变化');
      // 设备变化时，如果正在播放，暂停播放以防止意外外放
      if (audioRef.current && !audioRef.current.paused) {
        console.log('设备变化导致播放暂停');
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    
    // 监听设备变化
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [setIsPlaying]);
  
  // 当前歌曲变化时，加载新的音频
  useEffect(() => {
    if (currentSong && audioRef.current) {
      // 重置进度跟踪
      lastCurrentTimeRef.current = 0;
      isSeekingRef.current = false;
      
      // 检查是否需要预转码（ALAC等不支持的格式）
      const needsPreConversion = () => {
        if (!currentSong) return false;
        
        // 获取文件扩展名
        const filename = currentSong.server_filename.toLowerCase();
        const ext = filename.split('.').pop();
        
        // 浏览器原生支持：mp3, wav, ogg, m4a(AAC编码)
        // 不支持的无损格式：flac, ape, alac
        // ALAC 文件通常使用 .m4a 扩展名
        const unsupportedFormats = ['ape', 'alac'];
        
        // 只对确定不支持的格式进行转码
        // FLAC 实际上在现代浏览器中是支持的，不需要转码
        // 对于 m4a，只有当文件较大时才可能是 ALAC 编码需要转码
        return unsupportedFormats.includes(ext || '') ||
               (ext === 'm4a' && currentSong.size > 10000000); // 大于10MB的m4a文件可能包含ALAC
      };
      
      if (needsPreConversion()) {
        // 直接进行转码
        console.log('检测到可能不支持的音频格式，预转码中...');
        
        baiduAPI.getDownloadLink(currentSong.fs_id).then(downloadLink => {
          if (!downloadLink) {
            throw new Error('无法获取下载链接');
          }
          
          return audioConverter.convertToPlayableFormat(
            downloadLink,
            currentSong.server_filename
          );
        }).then(convertedUrl => {
          if (audioRef.current) {
            audioRef.current.src = convertedUrl;
            // 重置进度和时长
            setCurrentTime(0);
            setDuration(0);
            
            // 如果是切换歌曲，且原本就是播放状态，则应该自动播放
            if (isPlaying) {
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  if (error.name !== 'AbortError') {
                    console.error('播放失败:', error);
                  }
                });
              }
            }
          }
        }).catch(error => {
          console.error('预转码失败:', error);
          // 转码失败则跳到下一首
          setTimeout(() => {
            playNext();
          }, 3000);
        });
      } else {
        // 正常加载
        baiduAPI.getDownloadLink(currentSong.fs_id).then(downloadLink => {
          if (downloadLink && audioRef.current) {
            audioRef.current.src = downloadLink;
            // 重置进度和时长
            setCurrentTime(0);
            setDuration(0);
            
            // 如果是切换歌曲，且原本就是播放状态，则应该自动播放
            if (isPlaying) {
              // 不需要再次调用 setIsPlaying(true)，因为状态已经是 true
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  if (error.name !== 'AbortError') {
                    console.error('播放失败:', error);
                  }
                });
              }
            }
          }
        }).catch(error => {
          console.error('获取下载链接失败:', error);
        });
      }
    }
  }, [currentSong, isPlaying, setCurrentTime]);
  
  // 当播放状态变化时，控制音频播放/暂停
  useEffect(() => {
    if (audioRef.current && audioRef.current.src) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            if (error.name !== 'AbortError') {
              console.error('播放失败:', error);
            }
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);
  
  // 当音量变化时，更新音频音量
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);
  
  // 当进度变化时，更新音频进度 - 优化性能
  useEffect(() => {
    if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.1) {
      isSeekingRef.current = true;
      audioRef.current.currentTime = currentTime;
      // 延迟重置 isSeeking 状态，避免时间更新冲突
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 100);
    }
  }, [currentTime]);
  
  // 当歌曲变化时，自动加载歌词
  useEffect(() => {
    const loadAutoLyrics = async () => {
      if (!currentSong) {
        // 如果没有歌曲，清空歌词
        setParsedLyrics(null);
        return;
      }
      
      // 构建可能的LRC文件路径
      const audioPath = currentSong.path;
      const lrcPath = audioPath.substring(0, audioPath.lastIndexOf('.')) + '.lrc';
      
      try {
        console.log('尝试加载歌词:', lrcPath, '当前歌曲:', currentSong.server_filename);
        
        // 从百度网盘获取LRC文件内容
        const lrcContent = await baiduAPI.getFileContent(lrcPath);
        
        if (lrcContent) {
          // 解析LRC歌词
          const parsed = parseLRC(lrcContent);
          if (parsed.length > 0) {
            setParsedLyrics(parsed);
            console.log('歌词加载成功，共', parsed.length, '行');
          } else {
            console.log('LRC文件为空或格式不正确');
            setParsedLyrics(null);
          }
        } else {
          console.log('未找到LRC文件:', lrcPath);
          setParsedLyrics(null);
        }
      } catch (error) {
        console.error('自动加载歌词失败:', error);
        setParsedLyrics(null);
      }
    };
    
    // 当歌曲变化时触发加载歌词
    loadAutoLyrics();
  }, [currentSong?.fs_id, setParsedLyrics]); // 使用 fs_id 作为依赖，确保歌曲真正改变时才触发
  
  return (
    <audio
      ref={audioRef}
      preload="auto"
      crossOrigin="anonymous"
      onLoadedMetadata={() => {
        if (audioRef.current) {
          const duration = audioRef.current.duration;
          setDuration(duration);
          
          // 更新播放列表中歌曲的时长
          if (currentSong && duration && isFinite(duration)) {
            updatePlaylistItemDuration(currentSong.fs_id, duration);
          }
        }
      }}
      onTimeUpdate={handleTimeUpdate}
      onCanPlay={handleCanPlay}
      onError={handleError}
      onEnded={handleEnded}
      onPause={handlePause}
    />
  );
};