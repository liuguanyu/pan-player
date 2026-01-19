// Electron预加载脚本
// 在渲染进程之前执行，可以安全地访问Node.js API

import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // HTTP请求
  httpRequest: (config: any) => ipcRenderer.invoke('http-request', config),
  
  // 下载文件（用于音频转换）
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

  // 示例API（保留以兼容旧代码）
  sendMessage: (message: string) => ipcRenderer.invoke('send-message', message),
});