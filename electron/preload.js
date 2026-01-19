// Electron预加载脚本
// 在渲染进程之前执行，可以安全地访问Node.js API
import { contextBridge, ipcRenderer } from 'electron';
// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // HTTP请求
    httpRequest: (config) => ipcRenderer.invoke('http-request', config),
    // 示例API（保留以兼容旧代码）
    sendMessage: (message) => ipcRenderer.invoke('send-message', message),
});
//# sourceMappingURL=preload.js.map