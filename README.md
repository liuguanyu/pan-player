# 度盘播放器 (DuPan Player)

基于百度网盘的音乐播放器，使用 Electron + React 19 + Vite 构建的跨平台桌面应用。

## 技术栈

- **前端框架**: React 19
- **桌面框架**: Electron
- **构建工具**: Vite
- **状态管理**: Zustand (with persistence)
- **样式方案**: TailwindCSS + Shadcn/UI
- **查询库**: @tanstack/react-query
- **语言**: TypeScript

## 功能特性

### 1. 用户认证
- ✅ 百度OAuth设备码授权流程
- ✅ 自动令牌刷新
- ✅ 本地持久化存储
- ✅ 登录状态管理

### 2. 播放控制
- ✅ 播放/暂停/上一曲/下一曲
- ✅ 进度条拖拽
- ✅ 音量控制
- ✅ 播放模式切换（顺序/随机/单曲循环）
- ✅ 歌曲名滚动显示（长文件名）

### 3. 播放列表管理
- ✅ 创建/删除播放列表
- ✅ 从百度网盘浏览并选择音频文件
- ✅ 支持递归添加文件夹
- ✅ 本地存储播放列表
- ✅ 最近播放列表（最多30首）
- ✅ 支持的音频格式：mp3, m4a, flac, wav, ogg, aac, wma

### 4. 歌词显示
- ✅ LRC歌词解析
- ✅ 同步歌词滚动
- ✅ 手动选择LRC文件
- ✅ 自动关联同文件夹.lrc文件

### 5. 用户界面
- ✅ 现代化Material Design风格
- ✅ 响应式布局
- ✅ 暗色主题支持
- ✅ 用户信息显示
- ✅ 退出登录功能

## 项目结构

```
dupan-player/
├── electron/                 # Electron主进程
│   ├── main.ts              # 主进程入口
│   └── preload.ts           # 预加载脚本
├── src/
│   ├── components/          # React组件
│   │   ├── auth/           # 认证相关组件
│   │   ├── player/         # 播放器组件
│   │   ├── playlist/       # 播放列表组件
│   │   ├── lyrics/         # 歌词组件
│   │   └── ui/             # Shadcn UI组件
│   ├── services/           # 服务层
│   │   ├── auth.service.ts       # 认证服务
│   │   └── baidu-api.service.ts  # 百度网盘API
│   ├── store/              # 状态管理
│   │   └── playerStore.ts  # Zustand播放器状态
│   ├── lib/                # 工具库
│   │   ├── http-client.ts  # HTTP客户端
│   │   ├── lrc-parser.ts   # LRC解析器
│   │   └── utils.ts        # 工具函数
│   ├── types/              # TypeScript类型定义
│   ├── hooks/              # React Hooks
│   ├── config/             # 配置文件
│   ├── App.tsx             # 应用根组件
│   └── main.tsx            # 应用入口
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

## 开发指南

### 前置要求

- Node.js >= 18
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

这将同时启动：
- Vite开发服务器（端口5173）
- Electron应用

### 构建应用

```bash
npm run build
```

### 环境配置

在 `src/config/credentials.ts` 中配置百度应用凭据：

```typescript
export const BAIDU_CONFIG = {
  CLIENT_ID: 'your_client_id',
  CLIENT_SECRET: 'your_client_secret',
  SCOPE: 'basic,netdisk'
};
```

## 核心实现

### 1. 认证流程

应用使用百度OAuth 2.0设备码授权流程：

1. 获取设备码和用户码
2. 用户在浏览器中输入用户码授权
3. 应用轮询授权状态
4. 获取访问令牌和刷新令牌
5. 自动刷新过期令牌

**关键代码**: [`src/services/auth.service.ts`](src/services/auth.service.ts)

### 2. 百度网盘API集成

通过Electron IPC绕过CORS限制：

```typescript
// 渲染进程 -> 主进程 -> HTTP请求
const response = await window.electronAPI.httpRequest({
  method: 'GET',
  url: 'https://pan.baidu.com/rest/2.0/xpan/file',
  params: { method: 'list', dir: '/' }
});
```

**关键代码**: 
- [`electron/main.ts`](electron/main.ts)
- [`src/services/baidu-api.service.ts`](src/services/baidu-api.service.ts)

### 3. 状态管理

使用Zustand进行状态管理，并持久化关键数据：

```typescript
export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      // 状态定义
      playlists: [],
      recentSongs: [],
      volume: 0.7,
      playbackMode: 'order',
      // ... 方法定义
    }),
    {
      name: 'player-storage',
      partialize: (state) => ({
        volume: state.volume,
        playbackMode: state.playbackMode,
        playlists: state.playlists,
        recentSongs: state.recentSongs
      })
    }
  )
);
```

**关键代码**: [`src/store/playerStore.ts`](src/store/playerStore.ts)

### 4. LRC歌词解析

支持标准LRC格式歌词：

```
[00:12.00]第一句歌词
[00:17.20]第二句歌词
[00:21.10]第三句歌词
```

**关键代码**: [`src/lib/lrc-parser.ts`](src/lib/lrc-parser.ts)

## 待完成功能

- [ ] 从百度网盘自动加载LRC文件
- [ ] 播放列表排序功能
- [ ] 搜索功能
- [ ] 播放历史记录
- [ ] 播放队列管理
- [ ] 键盘快捷键
- [ ] 系统托盘支持
- [ ] 媒体控制集成（Windows/macOS）

## 参考项目

本项目基于Python实现的百度网盘音乐播放器迁移而来：
- 原项目路径: `D:\devspace\dupan-music-cmd\`
- 主要参考文件:
  - `dupan_music/auth.py` - 认证逻辑
  - `dupan_music/playlist/playlist.py` - 播放列表管理

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！