import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, powerSaveBlocker, IpcMainInvokeEvent, protocol, globalShortcut, dialog } from 'electron';
import path from 'path';
import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import { setupAudioStreamTranscoder, cleanupAllTempFiles } from './audio-stream-transcoder';
import { registerStreamAudioScheme, registerStreamAudioProtocol, SessionManager } from './streaming';
import logger from './logger';
import iconv from 'iconv-lite';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import CryptoJS from 'crypto-js';

// 设置 ffmpeg 路径
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let configPath: string = '';
let currentSongName: string = '';
let marqueeTimer: NodeJS.Timeout | null = null;
let marqueeOffset: number = 0;
let isMuted: boolean = false;
// 设备码轮询控制标志
let isPollingDeviceCode = false;
let stopPollingFlag = false;

// 初始化配置路径
function initConfigPath() {
  configPath = path.join(app.getPath('userData'), 'window-config.json');
}

// 保存窗口配置
function saveWindowConfig(config: any) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    logger.error('保存窗口配置失败:', error);
  }
}

// 读取窗口配置
function loadWindowConfig(): any {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('读取窗口配置失败:', error);
  }
  return null;
}

// 获取跑马灯显示文本（最多显示30个字符，超出部分滚动）
function getMarqueeText(text: string, maxLength: number = 30): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // 添加间隔符
  const fullText = text + '    ';
  const textLength = fullText.length;
  
  // 循环滚动
  const displayText = fullText.substring(marqueeOffset) + fullText.substring(0, marqueeOffset);
  
  return displayText.substring(0, maxLength);
}

// 更新托盘菜单
function updateTrayMenu() {
  if (!tray) return;
  
  const songDisplay = currentSongName
    ? `正在播放: ${getMarqueeText(currentSongName)}`
    : '度盘播放器';
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: songDisplay,
      enabled: false,
      icon: currentSongName ? undefined : undefined
    },
    {
      type: 'separator'
    },
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '隐藏窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '上一曲',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('player-control', 'previous');
        }
      }
    },
    {
      label: '播放/暂停',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('player-control', 'play-pause');
        }
      }
    },
    {
      label: '下一曲',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('player-control', 'next');
        }
      }
    },
    {
      label: isMuted ? '取消静音' : '静音',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('player-control', 'mute');
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// 创建系统托盘
function createTray() {
  // 创建托盘图标
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../public/icon.ico')
    : path.join(__dirname, '../public/icon.png');
  
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAICSURBVFhH7ZbPK0RhFMaf8WMkC2VhYWFhYWNhY2VhYWFjY2NlZWVlZWVlZWVlZWNjY2NlZWVlY2NjY2VlZWFhYWFhYWFhYeH7nHPvzJ25d+69M2bB4lNP5z3vec973nPu3Dv/iYiIiIiIiP4XVVVVWl5eVnt7u7q7u9Xb26v+/n4NDAxocHBQQ0NDGh4e1sjIiEZHRzU2Nqbx8XFNTExocnJSU1NTmp6e1szMjGZnZzU3N6f5+XktLCxocXFRS0tLWl5e1srKilarq6taX1/X5uamtra2tL29rZ2dHe3u7mpvb0/7+/s6ODjQ4eGhjo6OdHx8rJOTE52enurs7Ezn5+e6uLjQ5eWlrq6udH19rZubG93e3uru7k739/d6eHjQ4+Ojnp6e9Pz8rJeXF72+vurt7U3v7+/6+PjQ5+enXKAL5HdCuoDugO6B7oMehB6FHoeeRJ6lO6V7pfulB6aHpoemx6bHp8enR5AjyJHkWHI0OZ4c8XsE/w8gRAAiChARiKhARAYiQxAZishSRJoiWRRpisRRJI4idRSpo8gdRfIoEkmRTIp0UiSUIqUUSaZINCmiTRFxiihUvgdVuKjCRRUuqnBRhYsqXFThogrnVbiv4oGKJyqeqXiu4qWK1yreqniv4qOKLyr+qPir4r+K/yre/xERERERERH9ND4BEcN3yPIIZykAAAAASUVORK5CYII=');
    }
  } catch (error) {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAICSURBVFhH7ZbPK0RhFMaf8WMkC2VhYWFhYWNhY2VhYWFjY2NlZWVlZWVlZWVlZWNjY2NlZWVlY2NjY2VlZWFhYWFhYWFhYeH7nHPvzJ25d+69M2bB4lNP5z3vec973nPu3Dv/iYiIiIiIiP4XVVVVWl5eVnt7u7q7u9Xb26v+/n4NDAxocHBQQ0NDGh4e1sjIiEZHRzU2Nqbx8XFNTExocnJSU1NTmp6e1szMjGZnZzU3N6f5+XktLCxocXFRS0tLWl5e1srKilarq6taX1/X5uamtra2tL29rZ2dHe3u7mpvb0/7+/s6ODjQ4eGhjo6OdHx8rJOTE52enurs7Ezn5+e6uLjQ5eWlrq6udH19rZubG93e3uru7k739/d6eHjQ4+Ojnp6e9Pz8rJeXF72+vurt7U3v7+/6+PjQ5+enXKAL5HdCuoDugO6B7oMehB6FHoeeRJ6lO6V7pfulB6aHpoemx6bHp8enR5AjyJHkWHI0OZ4c8XsE/w8gRAAiChARiKhARAYiQxAZishSRJoiWRRpisRRJI4idRSpo8gdRfIoEkmRTIp0UiSUIqUUSaZINCmiTRFxiihUvgdVuKjCRRUuqnBRhYsqXFThogrnVbiv4oGKJyqeqXiu4qWK1yreqniv4qOKLyr+qPir4r+K/yre/xERERERERH9ND4BEcN3yPIIZykAAAAASUVORK5CYII=');
  }

  tray = new Tray(icon);
  tray.setToolTip('百度网盘播放器');

  // 初始化菜单
  updateTrayMenu();

  // 双击托盘图标显示/隐藏窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // macOS 特殊处理：单击显示窗口
  if (process.platform === 'darwin') {
    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
}

function createWindow() {
  // 读取窗口配置
  const config = loadWindowConfig() || {};
  
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  };

  // 如果有保存的正常模式位置，应用它
  if (config.normalMode) {
    windowOptions.x = config.normalMode.x;
    windowOptions.y = config.normalMode.y;
    windowOptions.width = config.normalMode.width;
    windowOptions.height = config.normalMode.height;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // 隐藏菜单栏
  mainWindow.setMenu(null);
  Menu.setApplicationMenu(null);

  // 开发环境加载Vite服务器，生产环境加载构建文件
  if (process.env.NODE_ENV === 'development') {
    // 尝试连接到Vite开发服务器
    const vitePort = process.env.VITE_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${vitePort}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 窗口关闭时的处理
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      // 如果不是真正退出，阻止默认关闭行为并隐藏窗口
      event.preventDefault();
      mainWindow?.hide();
      
      // Windows 系统显示通知
      if (process.platform === 'win32') {
        // 可以在这里添加系统通知，告知用户应用已最小化到托盘
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 监听切换迷你模式的请求
  ipcMain.on('toggle-mini-mode', (_event, isMini: boolean) => {
    if (!mainWindow) return;

    if (isMini) {
      // 切换到迷你模式
      // 先解除大小限制，防止 setSize 被当前的 minimumSize 阻挡
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(9999, 9999);
      
      // 保存当前正常模式的位置，同时保留现有配置
      const [x, y] = mainWindow.getPosition();
      const [width, height] = mainWindow.getSize();
      const currentConfig = loadWindowConfig() || {};
      
      saveWindowConfig({
        ...currentConfig,
        normalMode: { x, y, width, height }
      });
      
      // 读取配置（包含刚才保存的 normalMode 和之前的 miniMode）
      const config = loadWindowConfig();
      if (config && config.miniMode) {
        // 恢复上次迷你模式的位置
        mainWindow.setPosition(config.miniMode.x, config.miniMode.y);
        mainWindow.setSize(300, 100);
      } else {
        // 如果没有保存的位置，使用默认大小
        mainWindow.setSize(300, 100);
      }
      
      // 锁定大小
      mainWindow.setMinimumSize(300, 100);
      mainWindow.setMaximumSize(300, 100);
      
      // 设置置顶
      mainWindow.setAlwaysOnTop(true);
      
      // 通知渲染进程模式已切换
      mainWindow.webContents.send('mini-mode-changed', true);
    } else {
      // 恢复正常模式
      // 先解除大小限制
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(9999, 9999);
      
      // 保存当前迷你模式的位置
      const [x, y] = mainWindow.getPosition();
      const config = loadWindowConfig() || {};
      saveWindowConfig({
        ...config,
        miniMode: { x, y, width: 300, height: 100 }
      });
      
      // 读取上次正常模式的位置
      const savedConfig = loadWindowConfig();
      if (savedConfig && savedConfig.normalMode) {
        // 恢复上次正常模式的位置
        mainWindow.setPosition(savedConfig.normalMode.x, savedConfig.normalMode.y);
        mainWindow.setSize(savedConfig.normalMode.width, savedConfig.normalMode.height);
      } else {
        // 如果没有保存的位置，使用默认大小并居中
        mainWindow.setSize(1200, 800);
        mainWindow.center();
      }
      
      // 设置正常模式的最小限制
      mainWindow.setMinimumSize(800, 600);
      
      // 取消置顶
      mainWindow.setAlwaysOnTop(false);
      
      // 通知渲染进程模式已切换
      mainWindow.webContents.send('mini-mode-changed', false);
    }
  });

  // 监听当前播放歌曲更新
  ipcMain.on('update-current-song', (_event, songName: string) => {
    currentSongName = songName;
    marqueeOffset = 0;
    
    // 清除旧的定时器
    if (marqueeTimer) {
      clearInterval(marqueeTimer);
      marqueeTimer = null;
    }
    
    // 如果歌曲名超过30个字符，启动跑马灯
    if (songName && songName.length > 30) {
      marqueeTimer = setInterval(() => {
        marqueeOffset = (marqueeOffset + 1) % (songName.length + 4);
        updateTrayMenu();
      }, 300); // 每300ms滚动一次
    }
    
    updateTrayMenu();
  });
  
  // 监听渲染进程的静音状态更新
  ipcMain.on('update-mute-state', (_event, muted: boolean) => {
    if (isMuted !== muted) {
      isMuted = muted;
      updateTrayMenu();
    }
  });
}

function registerIpcHandlers() {
  // 处理HTTP请求
  ipcMain.handle('http-request', async (_event: IpcMainInvokeEvent, config: any) => {
    logger.log('HTTP Request Config:', JSON.stringify(config, null, 2));
    
    try {
      const response = await axios(config);
      logger.log('HTTP Response Status:', response.status);
      logger.log('HTTP Response Data:', JSON.stringify(response.data, null, 2));
      
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error: any) {
      logger.error('HTTP Request Error:', error.message);
      if (error.response) {
        logger.error('Error Response Status:', error.response.status);
        logger.error('Error Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      return {
        error: true,
        message: error.message,
        response: error.response ? {
          data: error.response.data,
          status: error.response.status,
          headers: error.response.headers,
        } : undefined
      };
    }
  });

  // 处理下载文件请求（用于音频转换）
  ipcMain.handle('download-file', async (_event: IpcMainInvokeEvent, url: string) => {
    logger.log('下载文件:', url);
    
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'pan.baidu.com',
          'Referer': 'https://pan.baidu.com/'
        }
      });
      
      logger.log('文件下载成功，大小:', response.data.byteLength);
      
      // 将 ArrayBuffer 转换为 Uint8Array
      const uint8Array = new Uint8Array(response.data);
      
      return {
        success: true,
        data: Array.from(uint8Array) // 转换为普通数组以便通过 IPC 传递
      };
    } catch (error: any) {
      logger.error('下载文件失败:', error.message);
      if (error.response) {
        logger.error('错误响应:', error.response.status);
      }
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 处理设备码授权轮询
  ipcMain.handle('poll-device-code', async (event: IpcMainInvokeEvent, deviceCode: string) => {
    // 如果已经在轮询，先停止之前的轮询
    if (isPollingDeviceCode) {
      logger.log('检测到重复轮询请求，先停止之前的轮询');
      stopPollingFlag = true;
      // 等待之前的轮询退出
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 设置轮询标志
    isPollingDeviceCode = true;
    stopPollingFlag = false;

    const params = {
      grant_type: 'device_token',
      code: deviceCode,
      client_id: 'pVB2TAdcOLZiCldLEcG1dABS3OK2owVi',
      client_secret: 'XwXk28lcgoWLVlVLEkTMFxnqwA4onOLd'
    };

    logger.log('开始轮询设备码，参数:', params);

    try {
      // 最多轮询60次，每次间隔5秒
      for (let i = 0; i < 60; i++) {
        // 检查是否需要停止轮询
        if (stopPollingFlag) {
          logger.log('轮询被手动停止');
          isPollingDeviceCode = false;
          return { success: false, error: 'cancelled' };
        }

        try {
          logger.log(`第 ${i + 1} 次轮询...`);
          const response = await axios.get('https://openapi.baidu.com/oauth/2.0/token', {
            params,
            headers: {
              'User-Agent': 'pan.baidu.com'
            }
          });

          logger.log('响应状态:', response.status);
          logger.log('响应数据:', response.data);

          const data = response.data;

          // 授权成功
          if (data.access_token) {
            logger.log('授权成功！停止轮询');
            // 通知渲染进程授权成功
            event.sender.send('auth-success', data);
            // 清除轮询标志
            isPollingDeviceCode = false;
            stopPollingFlag = true; // 确保不会有其他轮询继续
            return { success: true, data };
          }

          // 授权过期
          if (data.error === 'expired_token') {
            logger.error('授权已过期');
            isPollingDeviceCode = false;
            return { success: false, error: 'expired_token' };
          }

          // 其他错误
          if (data.error && data.error !== 'authorization_pending') {
            logger.error('设备码授权失败:', data);
            isPollingDeviceCode = false;
            return { success: false, error: data.error };
          }

          // 等待用户授权
          if (data.error === 'authorization_pending') {
            logger.log('等待用户授权...');
          }

          // 等待5秒后继续轮询，但每100ms检查一次停止标志
          for (let j = 0; j < 50; j++) {
            if (stopPollingFlag) {
              logger.log('在等待期间收到停止信号');
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error: any) {
          // 特殊处理 authorization_pending 错误
          if (error.response && error.response.data && error.response.data.error === 'authorization_pending') {
            logger.log('等待用户授权...');
            // 等待5秒后继续轮询，但每100ms检查一次停止标志
            for (let j = 0; j < 50; j++) {
              if (stopPollingFlag) {
                logger.log('在等待期间收到停止信号');
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            continue;
          }

          logger.error('设备码授权失败:', error.message);
          if (error.response) {
            logger.error('错误响应:', error.response.status, error.response.data);
          }
          // 继续轮询而不是退出，但每100ms检查一次停止标志
          for (let j = 0; j < 50; j++) {
            if (stopPollingFlag) {
              logger.log('在等待期间收到停止信号');
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      logger.error('设备码授权超时');
      isPollingDeviceCode = false;
      return { success: false, error: 'timeout' };
    } finally {
      // 确保无论如何都清除轮询标志
      isPollingDeviceCode = false;
    }
  });

  // 处理停止设备码轮询请求
  ipcMain.handle('stop-poll-device-code', async () => {
    if (isPollingDeviceCode) {
      logger.log('收到停止轮询请求');
      stopPollingFlag = true;
    }
    return { success: true };
  });

  // 处理下载文件到本地
  ipcMain.handle('download-file-to-local', async (_event: IpcMainInvokeEvent, url: string, fileName: string) => {
    logger.log('开始下载文件到本地:', fileName);
    
    try {
      // 打开保存对话框
      const result = await dialog.showSaveDialog({
        title: '保存文件',
        defaultPath: fileName,
        filters: [
          { name: '音频文件', extensions: ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'wma', 'ape', 'alac'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        logger.log('用户取消下载');
        return { success: false, canceled: true };
      }

      const savePath = result.filePath;
      logger.log('保存路径:', savePath);

      // 下载文件
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        headers: {
          'User-Agent': 'pan.baidu.com',
          'Referer': 'https://pan.baidu.com/'
        },
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          
          // 发送进度更新
          if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
              fileName,
              progress: percentCompleted,
              loaded: progressEvent.loaded,
              total: progressEvent.total
            });
          }
        }
      });

      // 创建写入流
      const writer = fs.createWriteStream(savePath);
      
      // 将响应数据写入文件
      response.data.pipe(writer);

      // 等待写入完成
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      logger.log('文件下载成功:', savePath);
      
      return {
        success: true,
        filePath: savePath
      };
    } catch (error: any) {
      logger.error('下载文件失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 启动流式转码会话
  ipcMain.handle('stream-transcode-start', async (_event, sessionId: string, sourceUrl: string, startTimeSeconds?: number) => {
    const manager = SessionManager.getInstance();
    const session = manager.getOrCreateSession(sessionId, sourceUrl, startTimeSeconds);
    session.start();
    
    // 转发进度事件到渲染进程
    // Bug 2 修复：progress 是对象 { percent, timemark, totalBytes, duration }
    // 使用 progress?.percent ?? 0 确保始终发送数字，避免 percent=0 时 fallback 到整个对象
    session.on('progress', (progress: any) => {
      const percent = typeof progress === 'number' ? progress : (progress?.percent ?? 0);
      mainWindow?.webContents.send(`stream-progress-${sessionId}`, percent);
    });
    session.on('complete', (data: any) => {
      mainWindow?.webContents.send(`stream-complete-${sessionId}`, data.duration || 0);
    });
    session.on('error', (err: Error) => {
      mainWindow?.webContents.send(`stream-error-${sessionId}`, err.message);
    });
    
    return {
      streamUrl: `stream-audio://${sessionId}`,
      sessionId
    };
  });

  // 销毁流式转码会话
  ipcMain.handle('stream-transcode-destroy', async (_event, sessionId: string) => {
    const manager = SessionManager.getInstance();
    manager.destroySession(sessionId);
  });

  // 获取会话状态
  ipcMain.handle('stream-transcode-status', async (_event, sessionId: string) => {
    const manager = SessionManager.getInstance();
    const session = manager.getSession(sessionId);
    if (!session) return null;
    return {
      state: session.state,
      bufferedBytes: session.totalBytes,
      isComplete: session.state === 'completed'
    };
  });
  // ===== CUE 分轨相关 IPC Handlers =====

  /**
   * 检查百度网盘同目录是否存在同名CUE文件
   * 参数：{ filePath: string, accessToken: string }
   * 返回：{ hasCue: boolean, cuePath?: string }
   */
  ipcMain.handle('cue-check', async (_event: IpcMainInvokeEvent, filePath: string, accessToken: string) => {
    logger.log('[CUE] 检查CUE文件:', filePath);
    try {
      // 获取目录和文件名（不含扩展名）
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      const filename = filePath.substring(filePath.lastIndexOf('/') + 1);
      const basename = filename.substring(0, filename.lastIndexOf('.'));
      const cuePath = `${dir}/${basename}.cue`;
      const cuePathLower = `${dir}/${basename.toLowerCase()}.cue`;

      // 查询目录文件列表
      const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/file', {
        params: {
          method: 'list',
          dir,
          order: 'name',
          limit: 1000,
          web: 1,
          access_token: accessToken
        },
        headers: { 'User-Agent': 'pan.baidu.com' }
      });

      const list: any[] = response.data?.list || [];
      // 大小写不敏感地查找 .cue 文件
      const cueFile = list.find(f => {
        const name = f.server_filename || '';
        return name.toLowerCase() === `${basename.toLowerCase()}.cue`;
      });

      if (cueFile) {
        logger.log('[CUE] 找到CUE文件:', cueFile.path);
        return { hasCue: true, cuePath: cueFile.path, cueFs_id: cueFile.fs_id };
      }
      return { hasCue: false };
    } catch (error: any) {
      logger.error('[CUE] 检查CUE文件失败:', error.message);
      return { hasCue: false, error: error.message };
    }
  });

  /**
   * CUE 分轨主流程
   * 参数：{ audioPath, audioFsId, cuePath, cueFsId, accessToken, outputFormat, taskId }
   * 返回：{ success: boolean, tracks?: string[], error?: string }
   * 通过 'cue-split-progress-${taskId}' 发送进度
   */
  ipcMain.handle('cue-split', async (event: IpcMainInvokeEvent, params: {
    audioPath: string;
    audioFsId: number;
    cuePath: string;
    cueFsId: number;
    accessToken: string;
    outputFormat: 'flac' | 'wav' | 'm4a';
    taskId: string;
  }) => {
    const { audioPath, audioFsId, cuePath, cueFsId, accessToken, outputFormat, taskId } = params;
    const sendProgress = (stage: string, percent: number, message: string) => {
      mainWindow?.webContents.send(`cue-split-progress-${taskId}`, { stage, percent, message });
    };

    const tmpDir = path.join(os.tmpdir(), `cue-split-${taskId}`);
    
    try {
      // 创建临时目录
      fs.mkdirSync(tmpDir, { recursive: true });
      sendProgress('init', 2, '准备临时目录...');

      // ---- Step 1: 下载 CUE 文件 ----
      sendProgress('download-cue', 5, '正在下载CUE文件...');
      const cueDownloadLink = await getCueSplitDownloadLink(cueFsId, accessToken);
      if (!cueDownloadLink) throw new Error('无法获取CUE文件下载链接');

      const cueLocalPath = path.join(tmpDir, 'input.cue');
      await downloadFileToPath(cueDownloadLink, cueLocalPath);
      sendProgress('download-cue', 10, 'CUE文件下载完成');

      // 读取并检测编码，转换为UTF-8
      const cueRaw = fs.readFileSync(cueLocalPath);
      let cueContent: string;
      // 检测是否为 GBK 编码（简单启发：尝试 UTF-8，若有乱码则用 GBK）
      try {
        const utf8Attempt = cueRaw.toString('utf-8');
        // 检测 UTF-8 BOM 或常见 GBK 标志字节
        const hasHighBytes = cueRaw.some((b: number) => b > 0x7F);
        if (hasHighBytes) {
          // 尝试用 iconv 检测
          const gbkDecoded = iconv.decode(cueRaw, 'gbk');
          // 用 UTF-8 解码试一下
          const utf8Decoded = iconv.decode(cueRaw, 'utf-8');
          // 启发：GBK 解码后不应出现 \ufffd（替换字符）
          if (!gbkDecoded.includes('\ufffd') && utf8Decoded.includes('\ufffd')) {
            cueContent = gbkDecoded;
            logger.log('[CUE] CUE文件编码: GBK，已转换为UTF-8');
          } else {
            cueContent = utf8Decoded.replace(/\ufffd/g, '');
            logger.log('[CUE] CUE文件编码: UTF-8');
          }
        } else {
          cueContent = utf8Attempt;
        }
      } catch {
        cueContent = iconv.decode(cueRaw, 'gbk');
      }
      // 写回UTF-8版本的cue
      fs.writeFileSync(cueLocalPath, cueContent, 'utf-8');

      // ---- 解析 CUE 文件，提取曲目信息 ----
      const tracks = parseCueFile(cueContent);
      logger.log('[CUE] 解析到曲目数:', tracks.length);
      if (tracks.length === 0) throw new Error('CUE文件解析失败，没有找到任何曲目');

      sendProgress('parse-cue', 15, `CUE解析完成，共${tracks.length}首曲目`);

      // ---- Step 2: 下载无损音频文件 ----
      sendProgress('download-audio', 18, '正在下载无损音频文件...');
      const audioDownloadLink = await getCueSplitDownloadLink(audioFsId, accessToken);
      if (!audioDownloadLink) throw new Error('无法获取音频文件下载链接');

      const audioExt = audioPath.substring(audioPath.lastIndexOf('.'));
      const audioLocalPath = path.join(tmpDir, `input${audioExt}`);
      
      await downloadFileToPathWithProgress(audioDownloadLink, audioLocalPath, (p) => {
        sendProgress('download-audio', 18 + Math.floor(p * 0.22), `下载音频文件... ${p}%`);
      });
      sendProgress('download-audio', 40, '音频文件下载完成');

      // ---- Step 3: ffmpeg 分轨 ----
      sendProgress('split', 42, '开始分轨...');
      const outputFiles: string[] = [];

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const nextTrack = tracks[i + 1];
        const safeTitle = track.title.replace(/[\\/:*?"<>|]/g, '_');
        const trackNum = String(i + 1).padStart(2, '0');
        // 命名格式：{序号} - {曲目标题}.{格式}
        const outputFileName = `${trackNum} - ${safeTitle}.${outputFormat}`;
        const outputFilePath = path.join(tmpDir, outputFileName);

        await splitTrack(audioLocalPath, outputFilePath, track.startTime, nextTrack?.startTime, outputFormat);
        outputFiles.push(outputFilePath);

        const splitPercent = 42 + Math.floor(((i + 1) / tracks.length) * 30);
        sendProgress('split', splitPercent, `分轨进度: ${i + 1}/${tracks.length} - ${track.title}`);
      }
      sendProgress('split', 72, `分轨完成，共${outputFiles.length}个文件`);

      // ---- Step 4: 并行上传到百度网盘 ----
      // 目标目录与原音频文件相同
      const targetDir = audioPath.substring(0, audioPath.lastIndexOf('/'));
      const uploadResults: { filename: string; success: boolean; skipped?: boolean; error?: string }[] =
        new Array(outputFiles.length);

      // 并发数：min(floor(n/3), 5)，至少为1
      const concurrency = Math.max(1, Math.min(Math.floor(outputFiles.length / 3), 5));
      logger.log(`[CUE] 上传并发数: ${concurrency}，共${outputFiles.length}个文件`);

      let completedCount = 0;
      const activeUploads = new Set<string>(); // 正在上传的文件名集合

      // 发送上传进度（包含所有正在上传的文件名列表）
      const sendUploadProgress = (extra?: string) => {
        const activeList = Array.from(activeUploads);
        const message = extra
          ? extra
          : `已完成 ${completedCount}/${outputFiles.length}` +
            (activeList.length > 0 ? `，正在上传: ${activeList.join(', ')}` : '');
        sendProgress('upload', 72 + Math.floor((completedCount / outputFiles.length) * 26), message);
      };

      // 并发上传单个文件的任务函数
      const uploadTask = async (index: number) => {
        const localFile = outputFiles[index];
        const filename = path.basename(localFile);
        const targetPath = `${targetDir}/${filename}`;

        activeUploads.add(filename);
        sendUploadProgress();

        // 检查文件是否已存在
        const existsResult = await checkFileExists(targetPath, accessToken);
        
        if (existsResult.exists) {
          // 发送询问事件，等待用户响应
          const userChoice = await askUserOverwrite(event, taskId, filename);
          if (userChoice === 'skip') {
            uploadResults[index] = { filename, success: true, skipped: true };
            activeUploads.delete(filename);
            completedCount++;
            sendUploadProgress();
            return;
          }
          // overwrite 则继续上传（rtype=3 覆盖）
        }

        const uploadResult = await uploadFileToCloud(localFile, targetPath, accessToken);
        uploadResults[index] = { filename, success: uploadResult.success, error: uploadResult.error };
        activeUploads.delete(filename);
        completedCount++;
        sendUploadProgress();
      };

      // 使用并发池执行上传任务
      const uploadQueue = [...Array(outputFiles.length).keys()]; // [0, 1, 2, ..., n-1]
      const runPool = async () => {
        const executing: Promise<void>[] = [];
        for (const idx of uploadQueue) {
          const p = uploadTask(idx).then(() => {
            executing.splice(executing.indexOf(p), 1);
          });
          executing.push(p);
          if (executing.length >= concurrency) {
            await Promise.race(executing);
          }
        }
        await Promise.all(executing);
      };
      await runPool();

      sendProgress('upload', 98, '上传完成，清理临时文件...');

      // ---- Step 5: 清理临时文件 ----
      fs.rmSync(tmpDir, { recursive: true, force: true });

      sendProgress('done', 100, '分轨上传全部完成！');

      return {
        success: true,
        tracks: uploadResults.map(r => r.filename),
        uploadResults
      };
    } catch (error: any) {
      logger.error('[CUE] 分轨失败:', error.message);
      // 清理临时目录
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      sendProgress('error', 0, `错误: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  /**
   * 用户对"文件已存在"的回复
   * 参数：taskId, filename, choice ('overwrite' | 'skip')
   */
  ipcMain.on('cue-split-overwrite-choice', (_event, taskId: string, filename: string, choice: string) => {
    const key = `${taskId}:${filename}`;
    const resolver = overwriteResolvers.get(key);
    if (resolver) {
      resolver(choice);
      overwriteResolvers.delete(key);
    }
  });
}

// ===== CUE 分轨辅助函数 =====

// 存储"覆盖/跳过"的 Promise resolver
const overwriteResolvers = new Map<string, (choice: string) => void>();

/**
 * 询问用户是否覆盖已存在的文件
 */
async function askUserOverwrite(event: IpcMainInvokeEvent, taskId: string, filename: string): Promise<string> {
  return new Promise((resolve) => {
    const key = `${taskId}:${filename}`;
    overwriteResolvers.set(key, resolve);
    // 通知渲染进程询问用户
    event.sender.send('cue-split-file-exists', { taskId, filename });
  });
}

/**
 * 获取下载链接（通过 access_token 直接调用 API）
 */
async function getCueSplitDownloadLink(fsId: number, accessToken: string): Promise<string | null> {
  try {
    const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/multimedia', {
      params: {
        method: 'filemetas',
        fsids: JSON.stringify([fsId]),
        dlink: 1,
        access_token: accessToken
      },
      headers: { 'User-Agent': 'pan.baidu.com' }
    });
    const list = response.data?.list;
    if (!list || list.length === 0) return null;
    const dlink: string = list[0].dlink;
    if (!dlink) return null;
    const url = new URL(dlink);
    if (!url.searchParams.has('access_token')) {
      url.searchParams.set('access_token', accessToken);
    }
    return url.toString();
  } catch (error: any) {
    logger.error('[CUE] 获取下载链接失败:', error.message);
    return null;
  }
}

/**
 * 下载文件到本地路径
 */
async function downloadFileToPath(url: string, destPath: string): Promise<void> {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    headers: { 'User-Agent': 'pan.baidu.com', 'Referer': 'https://pan.baidu.com/' }
  });
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/**
 * 带进度回调地下载文件
 */
async function downloadFileToPathWithProgress(
  url: string,
  destPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    headers: { 'User-Agent': 'pan.baidu.com', 'Referer': 'https://pan.baidu.com/' }
  });

  const total = parseInt(response.headers['content-length'] || '0', 10);
  let loaded = 0;
  const writer = fs.createWriteStream(destPath);

  response.data.on('data', (chunk: Buffer) => {
    loaded += chunk.length;
    if (total > 0) {
      onProgress(Math.round((loaded / total) * 100));
    }
  });
  response.data.pipe(writer);

  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/**
 * CUE 文件解析 - 提取曲目列表
 */
interface CueTrack {
  index: number;
  title: string;
  performer: string;
  startTime: string; // "MM:SS:FF" 格式
}

function parseCueFile(content: string): CueTrack[] {
  const tracks: CueTrack[] = [];
  const lines = content.split(/\r?\n/);
  
  let currentTrack: Partial<CueTrack> | null = null;
  let globalPerformer = '';

  for (const line of lines) {
    const trimmed = line.trim();

    const performerMatch = trimmed.match(/^PERFORMER\s+"?([^"]+)"?$/i);
    if (performerMatch) {
      if (currentTrack) {
        currentTrack.performer = performerMatch[1];
      } else {
        globalPerformer = performerMatch[1];
      }
      continue;
    }

    const trackMatch = trimmed.match(/^TRACK\s+(\d+)\s+AUDIO$/i);
    if (trackMatch) {
      if (currentTrack && currentTrack.startTime) {
        tracks.push(currentTrack as CueTrack);
      }
      currentTrack = {
        index: parseInt(trackMatch[1], 10),
        title: `Track ${trackMatch[1]}`,
        performer: globalPerformer,
        startTime: '00:00:00'
      };
      continue;
    }

    const titleMatch = trimmed.match(/^TITLE\s+"?([^"]+)"?$/i);
    if (titleMatch && currentTrack) {
      currentTrack.title = titleMatch[1];
      continue;
    }

    const indexMatch = trimmed.match(/^INDEX\s+01\s+(\d{2}:\d{2}:\d{2})$/i);
    if (indexMatch && currentTrack) {
      currentTrack.startTime = indexMatch[1];
      continue;
    }
  }

  if (currentTrack && currentTrack.startTime) {
    tracks.push(currentTrack as CueTrack);
  }

  return tracks;
}

/**
 * CUE 时间格式转为秒数 (MM:SS:FF -> seconds)
 * FF 是帧数（75帧/秒）
 */
function cueTimeToSeconds(time: string): number {
  const parts = time.split(':');
  const mm = parseInt(parts[0], 10);
  const ss = parseInt(parts[1], 10);
  const ff = parseInt(parts[2], 10);
  return mm * 60 + ss + ff / 75;
}

/**
 * 使用 ffmpeg 分割单个曲目
 */
async function splitTrack(
  inputPath: string,
  outputPath: string,
  startTime: string,
  endTime: string | undefined,
  outputFormat: 'flac' | 'wav' | 'm4a'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startSeconds = cueTimeToSeconds(startTime);
    
    let cmd = ffmpeg(inputPath)
      .seekInput(startSeconds);
    
    if (endTime) {
      const endSeconds = cueTimeToSeconds(endTime);
      cmd = cmd.duration(endSeconds - startSeconds);
    }

    if (outputFormat === 'flac') {
      cmd = cmd.audioCodec('flac');
    } else if (outputFormat === 'wav') {
      cmd = cmd.audioCodec('pcm_s16le').format('wav');
    } else if (outputFormat === 'm4a') {
      // m4a-alac (Apple Lossless)
      cmd = cmd.audioCodec('alac').format('ipod');
    }

    cmd
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

/**
 * 检查百度网盘中文件是否存在
 */
async function checkFileExists(filePath: string, accessToken: string): Promise<{ exists: boolean }> {
  try {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    const filename = filePath.substring(filePath.lastIndexOf('/') + 1);

    const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/file', {
      params: {
        method: 'list',
        dir,
        order: 'name',
        limit: 1000,
        web: 1,
        access_token: accessToken
      },
      headers: { 'User-Agent': 'pan.baidu.com' }
    });

    const list: any[] = response.data?.list || [];
    const found = list.find(f => f.server_filename === filename);
    return { exists: !!found };
  } catch {
    return { exists: false };
  }
}

/**
 * 上传本地文件到百度网盘（三步上传）
 */
async function uploadFileToCloud(
  localPath: string,
  targetPath: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileBuffer = fs.readFileSync(localPath);
    const fileSize = fileBuffer.length;
    
    // 计算MD5
    const wordArray = CryptoJS.lib.WordArray.create(fileBuffer as any);
    const md5 = CryptoJS.MD5(wordArray).toString();
    const blockList = [md5];

    // 步骤1: 预创建
    const precreateResp = await axios.post(
      'https://pan.baidu.com/rest/2.0/xpan/file',
      new URLSearchParams({
        path: targetPath,
        size: fileSize.toString(),
        isdir: '0',
        autoinit: '1',
        block_list: JSON.stringify(blockList),
        rtype: '3'
      }).toString(),
      {
        params: { method: 'precreate', access_token: accessToken },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'pan.baidu.com'
        }
      }
    );

    const precreateData = precreateResp.data;
    if (precreateData.errno !== undefined && precreateData.errno !== 0) {
      return { success: false, error: `预创建失败: ${precreateData.errmsg} (${precreateData.errno})` };
    }

    const uploadid = precreateData.uploadid;
    
    // 如果秒传成功
    if (precreateData.return_type === 2) {
      logger.log('[CUE-UPLOAD] 文件秒传成功:', targetPath);
      return { success: true };
    }

    // 步骤2: 上传分片（文件较小，一次性上传）
    const uploadUrl = new URL('https://d.pcs.baidu.com/rest/2.0/pcs/superfile2');
    uploadUrl.searchParams.set('method', 'upload');
    uploadUrl.searchParams.set('access_token', accessToken);
    uploadUrl.searchParams.set('type', 'tmpfile');
    uploadUrl.searchParams.set('path', targetPath);
    uploadUrl.searchParams.set('uploadid', uploadid);
    uploadUrl.searchParams.set('partseq', '0');

    // 使用 FormData 上传
    const formData = new (require('form-data'))();
    formData.append('file', fileBuffer, { filename: path.basename(localPath) });

    const uploadResp = await axios.post(uploadUrl.toString(), formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'pan.baidu.com'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    if (uploadResp.data.errno !== undefined && uploadResp.data.errno !== 0) {
      return { success: false, error: `上传分片失败: ${uploadResp.data.errmsg}` };
    }

    // 步骤3: 创建文件（完成上传）
    const createResp = await axios.post(
      'https://pan.baidu.com/rest/2.0/xpan/file',
      new URLSearchParams({
        path: targetPath,
        size: fileSize.toString(),
        isdir: '0',
        uploadid,
        block_list: JSON.stringify(blockList),
        rtype: '3'
      }).toString(),
      {
        params: { method: 'create', access_token: accessToken },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'pan.baidu.com'
        }
      }
    );

    const createData = createResp.data;
    if (createData.errno !== undefined && createData.errno !== 0) {
      return { success: false, error: `创建文件失败: ${createData.errmsg} (${createData.errno})` };
    }

    logger.log('[CUE-UPLOAD] 文件上传成功:', targetPath);
    return { success: true };
  } catch (error: any) {
    logger.error('[CUE-UPLOAD] 上传失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 注册流式音频自定义协议方案（必须在 app.whenReady() 之前调用）
registerStreamAudioScheme();

app.whenReady().then(() => {
  // 初始化配置路径
  initConfigPath();
  
  registerIpcHandlers();
  
  // 设置音频流式转码
  setupAudioStreamTranscoder();

  // 注册流式音频自定义协议处理器
  registerStreamAudioProtocol();

  // 注册自定义协议来提供本地文件访问
  protocol.registerFileProtocol('local-audio', (request, callback) => {
    // 从 URL 中提取文件路径: local-audio://path/to/file
    const url = request.url.substring('local-audio://'.length);
    // URL 解码以处理路径中的特殊字符
    const filePath = decodeURIComponent(url);
    
    logger.log('[Protocol] 请求本地音频文件:', filePath);
    
    callback({ path: filePath });
  });

  // 拦截所有百度相关域名的请求
  const baiduUrls = [
    '*://*.baidu.com/*',
    '*://*.bdstatic.com/*',
    '*://*.baidupcs.com/*',
    '*://d.pcs.baidu.com/*',  // 百度网盘下载域名
    '*://*.pcs.baidu.com/*'   // 所有 pcs 子域名
  ];

  // 1. 拦截请求头，添加必要的 User-Agent 和 Referer
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: baiduUrls },
    (details: any, callback: any) => {
      // 为所有百度网盘相关请求添加必要的请求头
      details.requestHeaders['User-Agent'] = 'pan.baidu.com';
      details.requestHeaders['Referer'] = 'https://pan.baidu.com/';
      
      // 添加调试日志
      logger.log('拦截请求:', details.url.substring(0, 100));
      
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // 2. 拦截响应头，添加 CORS 允许头
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: baiduUrls },
    (details: any, callback: any) => {
      const responseHeaders = details.responseHeaders || {};
      
      // 添加 CORS 相关响应头
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
      
      callback({ responseHeaders });
    }
  );

  createWindow();
  createTray();

  // 注册全局快捷键
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // 防止系统休眠，确保后台播放
  const id = powerSaveBlocker.start('prevent-app-suspension');
  logger.log('Power Save Blocker ID:', id);
});

// 注册全局快捷键
function registerGlobalShortcuts() {
  // 辅助函数：发送命令到主窗口
  const sendCommand = (command: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player-control', command);
    }
  };

  // 上一曲: 多媒体键 或 Ctrl+Alt+左箭头
  globalShortcut.register('MediaPreviousTrack', () => sendCommand('previous'));
  globalShortcut.register('CommandOrControl+Alt+Left', () => sendCommand('previous'));

  // 下一曲: 多媒体键 或 Ctrl+Alt+右箭头
  globalShortcut.register('MediaNextTrack', () => sendCommand('next'));
  globalShortcut.register('CommandOrControl+Alt+Right', () => sendCommand('next'));

  // 播放/暂停: 多媒体键 或 Ctrl+Alt+空格
  globalShortcut.register('MediaPlayPause', () => sendCommand('play-pause'));
  globalShortcut.register('CommandOrControl+Alt+Space', () => sendCommand('play-pause'));

  // 静音: 多媒体键
  globalShortcut.register('VolumeMute', () => sendCommand('mute'));

  // 音量增加: 多媒体键 或 Ctrl+Alt+上箭头
  globalShortcut.register('VolumeUp', () => sendCommand('volume-up'));
  globalShortcut.register('CommandOrControl+Alt+Up', () => sendCommand('volume-up'));

  // 音量减少: 多媒体键 或 Ctrl+Alt+下箭头
  globalShortcut.register('VolumeDown', () => sendCommand('volume-down'));
  globalShortcut.register('CommandOrControl+Alt+Down', () => sendCommand('volume-down'));

  // 播放模式切换 - Cmd/Ctrl + Shift + M
  globalShortcut.register('CommandOrControl+Shift+M', () => sendCommand('toggle-playback-mode'));
}

// 取消注册全局快捷键
function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
}

// 修改窗口关闭行为：因为有托盘，所以不自动退出
app.on('window-all-closed', () => {
  // 不再自动退出，因为有系统托盘
  // 用户需要通过托盘菜单的"退出"选项来真正退出应用
  logger.log('所有窗口已关闭，应用继续在后台运行');
});

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true;
  // 清理跑马灯定时器
  if (marqueeTimer) {
    clearInterval(marqueeTimer);
    marqueeTimer = null;
  }
  // 取消注册全局快捷键
  unregisterGlobalShortcuts();
  // 清理所有临时音频文件
  cleanupAllTempFiles();
  // 清理所有流式转码会话
  SessionManager.getInstance().destroyAll();
});