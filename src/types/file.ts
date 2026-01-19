// 文件相关类型定义

export interface FileInfo {
  fs_id: number;
  path: string;
  server_filename: string;
  size: number;
  server_mtime: number;
  server_ctime: number;
  local_mtime: number;
  local_ctime: number;
  isdir: 0 | 1;
  category: number;
  md5: string;
  dir_empty: number;
  thumbs?: {
    icon: string;
    url1?: string;
    url2?: string;
    url3?: string;
  };
  dlink?: string;
}

export interface PlaylistItem {
  fs_id: number;
  server_filename: string;
  path: string;
  size: number;
  category: number;
  isdir: 0 | 1;
  local_mtime: number;
  server_mtime: number;
  md5: string;
  add_time: number;
  dlink?: string; // 缓存的下载链接
  dlink_expires_at?: number; // 链接过期时间
}

export interface Playlist {
  name: string;
  description: string;
  items: PlaylistItem[];
  create_time: number;
  update_time: number;
}