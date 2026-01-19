// Electron API 类型定义

export interface ElectronAPI {
  // HTTP请求
  httpRequest: (config: any) => Promise<any>;
  
  // 下载文件（用于音频转换）
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
  
  // 示例API
  sendMessage: (message: string) => Promise<any>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}