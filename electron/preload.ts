// Electron预加载脚本
// 在渲染进程之前执行，可以安全地访问Node.js API

import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // HTTP请求
  httpRequest: (config: any) => ipcRenderer.invoke('http-request', config),
  
  // 下载文件（保留以兼容旧代码）
  downloadFile: (url: string) => ipcRenderer.invoke('download-file', url),
  
  // 设备码授权轮询
  pollDeviceCode: (deviceCode: string) => ipcRenderer.invoke('poll-device-code', deviceCode),
  
  // 监听授权成功事件
  onAuthSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on('auth-success', (_event, data) => callback(data));
  },
  
  // 移除授权成功事件监听器
  removeAuthSuccessListener: (callback: (data: any) => void) => {
    ipcRenderer.removeListener('auth-success', (_event, data) => callback(data));
  },
  
  // 切换迷你模式
  toggleMiniMode: (isMini: boolean) => ipcRenderer.send('toggle-mini-mode', isMini),
  
  // 监听迷你模式变化
  onMiniModeChange: (callback: (isMini: boolean) => void) => {
    // 包装回调函数以处理事件对象
    const handler = (_event: any, isMini: boolean) => callback(isMini);
    ipcRenderer.on('mini-mode-changed', handler);
    // 返回清理函数
    return () => ipcRenderer.removeListener('mini-mode-changed', handler);
  },
  
  // 监听播放控制命令
  onPlayerControl: (callback: (action: string) => void) => {
    // 包装回调函数以处理事件对象
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('player-control', handler);
    // 返回清理函数
    return () => ipcRenderer.removeListener('player-control', handler);
  },

  // 示例API（保留以兼容旧代码）
  sendMessage: (message: string) => ipcRenderer.invoke('send-message', message),
  
  // ALAC 转码
  transcodeAlac: (url: string, fileId: string) => {
    ipcRenderer.send('transcode-alac', { url, fileId });
  },
  
  // 监听转码完成
  onTranscodeComplete: (fileId: string, callback: (result: { success: boolean; outputPath: string }) => void) => {
    const handler = (_event: any, result: { success: boolean; outputPath: string }) => callback(result);
    ipcRenderer.on(`transcode-complete-${fileId}`, handler);
    return () => ipcRenderer.removeListener(`transcode-complete-${fileId}`, handler);
  },
  
  // 监听转码失败
  onTranscodeFail: (fileId: string, callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error);
    ipcRenderer.on(`transcode-fail-${fileId}`, handler);
    return () => ipcRenderer.removeListener(`transcode-fail-${fileId}`, handler);
  },
  
  // 监听转码进度
  onTranscodeProgress: (fileId: string, callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on(`transcode-progress-${fileId}`, handler);
    return () => ipcRenderer.removeListener(`transcode-progress-${fileId}`, handler);
  },
  
  // 清理临时文件
  cleanupTempAudio: (filePath: string) => {
    ipcRenderer.send('cleanup-temp-audio', filePath);
  },

  // 检测音频编码
  detectAudioCodec: (url: string) => ipcRenderer.invoke('detect-audio-codec', url),
});