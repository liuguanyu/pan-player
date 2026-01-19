import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, powerSaveBlocker, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import axios from 'axios';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let configPath: string = '';

// 初始化配置路径
function initConfigPath() {
  configPath = path.join(app.getPath('userData'), 'window-config.json');
}

// 保存窗口配置
function saveWindowConfig(config: any) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存窗口配置失败:', error);
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
    console.error('读取窗口配置失败:', error);
  }
  return null;
}

// 创建系统托盘
function createTray() {
  // 创建托盘图标
  // 使用内置的图标或者自定义图标
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../public/icon.ico') // Windows 使用 .ico
    : path.join(__dirname, '../public/icon.png'); // macOS 和 Linux 使用 .png
  
  // 如果找不到图标文件，使用 nativeImage 创建一个简单的图标
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // 如果图标为空，创建一个简单的图标
      icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAICSURBVFhH7ZbPK0RhFMaf8WMkC2VhYWFhYWNhY2VhYWFjY2NlZWVlZWVlZWVlZWNjY2NlZWVlY2NjY2VlZWFhYWFhYWFhYeH7nHPvzJ25d+69M2bB4lNP5z3vec973nPu3Dv/iYiIiIiIiP4XVVVVWl5eVnt7u7q7u9Xb26v+/n4NDAxocHBQQ0NDGh4e1sjIiEZHRzU2Nqbx8XFNTExocnJSU1NTmp6e1szMjGZnZzU3N6f5+XktLCxocXFRS0tLWl5e1srKilarq6taX1/X5uamtra2tL29rZ2dHe3u7mpvb0/7+/s6ODjQ4eGhjo6OdHx8rJOTE52enurs7Ezn5+e6uLjQ5eWlrq6udH19rZubG93e3uru7k739/d6eHjQ4+Ojnp6e9Pz8rJeXF72+vurt7U3v7+/6+PjQ5+enXKAL5HdCuoDugO6B7oMehB6FHoeeRJ6lO6V7pfulB6aHpoemx6bHp8enR5AjyJHkWHI0OZ4c8XsE/w8gRAAiChARiKhARAYiQxAZishSRJoiWRRpisRRJI4idRSpo8gdRfIoEkmRTIp0UiSUIqUUSaZINCmiTRFxiihUvgdVuKjCRRUuqnBRhYsqXFThogrnVbiv4oGKJyqeqXiu4qWK1yreqniv4qOKLyr+qPir4r+K/yre/xERERERERH9ND4BEcN3yPIIZykAAAAASUVORK5CYII=');
    }
  } catch (error) {
    // 创建默认图标
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAICSURBVFhH7ZbPK0RhFMaf8WMkC2VhYWFhYWNhY2VhYWFjY2NlZWVlZWVlZWVlZWNjY2NlZWVlY2NjY2VlZWFhYWFhYWFhYeH7nHPvzJ25d+69M2bB4lNP5z3vec973nPu3Dv/iYiIiIiIiP4XVVVVWl5eVnt7u7q7u9Xb26v+/n4NDAxocHBQQ0NDGh4e1sjIiEZHRzU2Nqbx8XFNTExocnJSU1NTmp6e1szMjGZnZzU3N6f5+XktLCxocXFRS0tLWl5e1srKilarq6taX1/X5uamtra2tL29rZ2dHe3u7mpvb0/7+/s6ODjQ4eGhjo6OdHx8rJOTE52enurs7Ezn5+e6uLjQ5eWlrq6udH19rZubG93e3uru7k739/d6eHjQ4+Ojnp6e9Pz8rJeXF72+vurt7U3v7+/6+PjQ5+enXKAL5HdCuoDugO6B7oMehB6FHoeeRJ6lO6V7pfulB6aHpoemx6bHp8enR5AjyJHkWHI0OZ4c8XsE/w8gRAAiChARiKhARAYiQxAZishSRJoiWRRpisRRJI4idRSpo8gdRfIoEkmRTIp0UiSUIqUUSaZINCmiTRFxiihUvgdVuKjCRRUuqnBRhYsqXFThogrnVbiv4oGKJyqeqXiu4qWK1yreqniv4qOKLyr+qPir4r+K/yre/xERERERERH9ND4BEcN3yPIIZykAAAAASUVORK5CYII=');
  }

  tray = new Tray(icon);
  
  // 设置托盘提示文字
  tray.setToolTip('百度网盘播放器');

  // 创建托盘菜单
  const contextMenu = Menu.buildFromTemplate([
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
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  // 设置托盘菜单
  tray.setContextMenu(contextMenu);

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
}

function registerIpcHandlers() {
  // 处理HTTP请求
  ipcMain.handle('http-request', async (_event: IpcMainInvokeEvent, config: any) => {
    console.log('HTTP Request Config:', JSON.stringify(config, null, 2));
    
    try {
      const response = await axios(config);
      console.log('HTTP Response Status:', response.status);
      console.log('HTTP Response Data:', JSON.stringify(response.data, null, 2));
      
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error: any) {
      console.error('HTTP Request Error:', error.message);
      if (error.response) {
        console.error('Error Response Status:', error.response.status);
        console.error('Error Response Data:', JSON.stringify(error.response.data, null, 2));
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
    console.log('下载文件:', url);
    
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
      
      console.log('文件下载成功，大小:', response.data.byteLength);
      
      // 将 ArrayBuffer 转换为 Uint8Array
      const uint8Array = new Uint8Array(response.data);
      
      return {
        success: true,
        data: Array.from(uint8Array) // 转换为普通数组以便通过 IPC 传递
      };
    } catch (error: any) {
      console.error('下载文件失败:', error.message);
      if (error.response) {
        console.error('错误响应:', error.response.status);
      }
      return {
        success: false,
        error: error.message
      };
    }
  });

  // 处理设备码授权轮询
  ipcMain.handle('poll-device-code', async (event: IpcMainInvokeEvent, deviceCode: string) => {
    const params = {
      grant_type: 'device_token',
      code: deviceCode,
      client_id: 'pVB2TAdcOLZiCldLEcG1dABS3OK2owVi',
      client_secret: 'XwXk28lcgoWLVlVLEkTMFxnqwA4onOLd'
    };

    console.log('开始轮询设备码，参数:', params);

    // 最多轮询60次，每次间隔5秒
    for (let i = 0; i < 60; i++) {
      try {
        console.log(`第 ${i + 1} 次轮询...`);
        const response = await axios.get('https://openapi.baidu.com/oauth/2.0/token', {
          params,
          headers: {
            'User-Agent': 'pan.baidu.com'
          }
        });

        console.log('响应状态:', response.status);
        console.log('响应数据:', response.data);

        const data = response.data;

        // 授权成功
        if (data.access_token) {
          console.log('授权成功！');
          // 通知渲染进程授权成功
          event.sender.send('auth-success', data);
          return { success: true, data };
        }

        // 授权过期
        if (data.error === 'expired_token') {
          console.error('授权已过期');
          return { success: false, error: 'expired_token' };
        }

        // 其他错误
        if (data.error && data.error !== 'authorization_pending') {
          console.error('设备码授权失败:', data);
          return { success: false, error: data.error };
        }

        // 等待用户授权
        if (data.error === 'authorization_pending') {
          console.log('等待用户授权...');
        }

        // 等待5秒后继续轮询
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error: any) {
        // 特殊处理 authorization_pending 错误
        if (error.response && error.response.data && error.response.data.error === 'authorization_pending') {
          console.log('等待用户授权...');
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        console.error('设备码授权失败:', error.message);
        if (error.response) {
          console.error('错误响应:', error.response.status, error.response.data);
        }
        // 继续轮询而不是退出
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.error('设备码授权超时');
    return { success: false, error: 'timeout' };
  });
}

app.whenReady().then(() => {
  // 初始化配置路径
  initConfigPath();
  
  registerIpcHandlers();

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
      console.log('拦截请求:', details.url.substring(0, 100));
      
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // 防止系统休眠，确保后台播放
  const id = powerSaveBlocker.start('prevent-app-suspension');
  console.log('Power Save Blocker ID:', id);
});

// 修改窗口关闭行为：因为有托盘，所以不自动退出
app.on('window-all-closed', () => {
  // 不再自动退出，因为有系统托盘
  // 用户需要通过托盘菜单的"退出"选项来真正退出应用
  console.log('所有窗口已关闭，应用继续在后台运行');
});

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true;
});