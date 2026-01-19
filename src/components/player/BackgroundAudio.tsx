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
    playNext
  } = usePlayerStore();
  
  const audioRef = useRef<HTMLAudioElement>(null);
  
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
  
  // 处理播放时间更新
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
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
      // 获取下载链接
      baiduAPI.getDownloadLink(currentSong.fs_id).then(downloadLink => {
        if (downloadLink && audioRef.current) {
          audioRef.current.src = downloadLink;
          // 重置进度
          setCurrentTime(0);
          
          // 如果是切换歌曲，且原本就是播放状态，则应该自动播放
          if (isPlaying) {
            setIsPlaying(true);
          }
        }
      }).catch(error => {
        console.error('获取下载链接失败:', error);
      });
    }
  }, [currentSong]);
  
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
  
  // 当进度变化时，更新音频进度
  useEffect(() => {
    if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.1) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime]);
  
  // 当歌曲变化时，自动加载歌词
  useEffect(() => {
    const loadAutoLyrics = async () => {
      if (!currentSong) {
        // 如果没有歌曲，清空歌词
        usePlayerStore.getState().setParsedLyrics(null);
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
            usePlayerStore.getState().setParsedLyrics(parsed);
            console.log('歌词加载成功，共', parsed.length, '行');
          } else {
            console.log('LRC文件为空或格式不正确');
            usePlayerStore.getState().setParsedLyrics(null);
          }
        } else {
          console.log('未找到LRC文件:', lrcPath);
          usePlayerStore.getState().setParsedLyrics(null);
        }
      } catch (error) {
        console.error('自动加载歌词失败:', error);
        usePlayerStore.getState().setParsedLyrics(null);
      }
    };
    
    // 当歌曲变化时触发加载歌词
    loadAutoLyrics();
  }, [currentSong?.fs_id]); // 使用 fs_id 作为依赖，确保歌曲真正改变时才触发
  
  return (
    <audio
      ref={audioRef}
      preload="auto"
      crossOrigin="anonymous"
      onLoadedMetadata={() => {
        if (audioRef.current) {
          usePlayerStore.getState().setDuration(audioRef.current.duration);
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