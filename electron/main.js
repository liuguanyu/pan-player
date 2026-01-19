import electron from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
const { app, BrowserWindow, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    // 开发环境加载Vite服务器，生产环境加载构建文件
    if (process.env.NODE_ENV === 'development') {
        // 尝试连接到Vite开发服务器
        const vitePort = process.env.VITE_PORT || '5173';
        mainWindow.loadURL(`http://localhost:${vitePort}`);
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// 处理HTTP请求
ipcMain.handle('http-request', async (_event, config) => {
    try {
        const response = await axios(config);
        return {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        };
    }
    catch (error) {
        console.error('HTTP Request Error:', error.message);
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
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (electron.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
//# sourceMappingURL=main.js.map