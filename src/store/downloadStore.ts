import { create } from 'zustand';

export type DownloadTaskStatus = 'pending' | 'downloading' | 'success' | 'failed';

export interface DownloadTask {
  id: string;
  type: 'lyrics';
  songName: string;
  lrcContent: string;       // 歌词文本内容（已从网络取到）
  targetPanPath: string;    // 目标百度网盘路径（同音频同目录的 .lrc 文件路径）
  status: DownloadTaskStatus;
  progress: number;         // 0-100
  error?: string;
  createdAt: number;
  completedAt?: number;
}

interface DownloadState {
  tasks: DownloadTask[];
  showManager: boolean;

  // actions
  addTask: (task: Omit<DownloadTask, 'createdAt' | 'status' | 'progress' | 'id'>) => string;
  updateTask: (id: string, updates: Partial<Omit<DownloadTask, 'id'>>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  setShowManager: (show: boolean) => void;
}

let nextId = Date.now();

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],
  showManager: false,

  addTask: (task) => {
    const id = `dl-${nextId++}`;
    set(state => ({
      tasks: [
        {
          id,
          status: 'pending',
          progress: 0,
          createdAt: Date.now(),
          ...task,
        },
        ...state.tasks,
      ],
    }));
    return id;
  },

  updateTask: (id, updates) => {
    set(state => ({
      tasks: state.tasks.map(t => (t.id === id ? { ...t, ...updates } : t)),
    }));
  },

  removeTask: (id) => {
    set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
  },

  clearCompleted: () => {
    set(state => ({
      tasks: state.tasks.filter(t => t.status !== 'success' && t.status !== 'failed'),
    }));
  },

  setShowManager: (show) => set({ showManager: show }),
}));
