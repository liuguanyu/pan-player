// Electron API 类型定义

export interface ElectronAPI {
  // HTTP请求
  httpRequest: (config: any) => Promise<any>;
  
  // 下载文件
  downloadFile: (url: string) => Promise<{ success: boolean; data?: number[]; error?: string }>;
  
  // 设备码授权轮询
  pollDeviceCode: (deviceCode: string) => Promise<any>;
  
  // 监听授权成功事件
  onAuthSuccess: (callback: (data: any) => void) => void;
  
  // 移除授权成功事件监听器
  removeAuthSuccessListener?: (callback: (data: any) => void) => void;
  
  // 切换迷你模式
  toggleMiniMode: (isMini: boolean) => void;
  
  // 监听迷你模式变化（返回清理函数）
  onMiniModeChange: (callback: (isMini: boolean) => void) => () => void;
  
  // 监听播放控制命令（返回清理函数）
  onPlayerControl: (callback: (action: string) => void) => () => void;
  
  // 示例API
  sendMessage: (message: string) => Promise<any>;

  // ALAC/APE 转码相关
  transcodeAlac: (url: string, fileId: string) => void;
  onTranscodeComplete: (fileId: string, callback: (result: { success: boolean; outputPath: string }) => void) => () => void;
  onTranscodeFail: (fileId: string, callback: (error: string) => void) => () => void;
  onTranscodeProgress: (fileId: string, callback: (progress: any) => void) => () => void;
  cleanupTempAudio: (filePath: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}