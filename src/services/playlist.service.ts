import { usePlayerStore } from '@/store/playerStore';
import { Playlist, PlaylistItem, FileInfo } from '@/types/file';
import { baiduAPI } from '@/services/baidu-api.service';

class PlaylistService {
  private static instance: PlaylistService;
  // private readonly RECENT_PLAYLIST_NAME = "最近播放"; // 不再使用

  private constructor() {
    // this.ensureRecentPlaylist();
  }

  public static getInstance(): PlaylistService {
    if (!PlaylistService.instance) {
      PlaylistService.instance = new PlaylistService();
    }
    return PlaylistService.instance;
  }

  /**
   * 获取所有播放列表
   */
  public getAllPlaylists(): Playlist[] {
    return usePlayerStore.getState().playlists;
  }

  /**
   * 获取指定播放列表
   */
  public getPlaylist(name: string): Playlist | undefined {
    return usePlayerStore.getState().playlists.find(p => p.name === name);
  }

  /**
   * 创建播放列表
   */
  public createPlaylist(name: string, _description: string = ""): boolean {
    const { playlists, createPlaylist } = usePlayerStore.getState();
    
    // 检查是否已存在
    if (playlists.some(p => p.name === name)) {
      console.warn(`播放列表 ${name} 已存在`);
      return false;
    }

    createPlaylist(name, []);
    return true;
  }

  /**
   * 删除播放列表
   */
  public deletePlaylist(name: string): boolean {
    // 不允许删除"最近播放"逻辑已在UI层处理，这里不需要特殊检查，或者如果name是"最近播放"则返回false（取决于调用方）
    if (name === "最近播放") {
      console.warn("不允许删除最近播放列表");
      return false;
    }

    const { removePlaylist } = usePlayerStore.getState();
    removePlaylist(name);
    return true;
  }

  /**
   * 将文件信息转换为播放列表项
   */
  private convertToFileInfo(fileInfo: FileInfo): PlaylistItem {
    return {
      fs_id: fileInfo.fs_id,
      server_filename: fileInfo.server_filename,
      path: fileInfo.path,
      size: fileInfo.size,
      category: fileInfo.category,
      isdir: fileInfo.isdir,
      local_mtime: fileInfo.local_mtime,
      server_mtime: fileInfo.server_mtime,
      md5: fileInfo.md5,
      add_time: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * 添加歌曲到播放列表
   */
  public addToPlaylist(playlistName: string, fileInfo: FileInfo): boolean {
    const { playlists, updatePlaylist } = usePlayerStore.getState();
    const playlist = playlists.find(p => p.name === playlistName);

    if (!playlist) {
      console.warn(`播放列表 ${playlistName} 不存在`);
      return false;
    }

    // 检查是否已存在
    if (playlist.items.some(item => item.fs_id === fileInfo.fs_id)) {
      console.debug(`文件 ${fileInfo.server_filename} 已存在于播放列表 ${playlistName}`);
      return false;
    }

    const newItem = this.convertToFileInfo(fileInfo);
    
    const updatedPlaylist = {
      ...playlist,
      items: [...playlist.items, newItem],
      update_time: Math.floor(Date.now() / 1000)
    };

    updatePlaylist(updatedPlaylist);
    return true;
  }

  /**
   * 批量添加歌曲到播放列表
   */
  public addBatchToPlaylist(playlistName: string, files: FileInfo[]): boolean {
    const { playlists, updatePlaylist } = usePlayerStore.getState();
    const playlist = playlists.find(p => p.name === playlistName);

    if (!playlist) {
      console.warn(`播放列表 ${playlistName} 不存在`);
      return false;
    }

    const newItems: PlaylistItem[] = [];
    
    for (const file of files) {
      if (!playlist.items.some(item => item.fs_id === file.fs_id)) {
        newItems.push(this.convertToFileInfo(file));
      }
    }

    if (newItems.length === 0) {
      return false;
    }

    const updatedPlaylist = {
      ...playlist,
      items: [...playlist.items, ...newItems],
      update_time: Math.floor(Date.now() / 1000)
    };

    updatePlaylist(updatedPlaylist);
    return true;
  }

  /**
   * 从播放列表移除歌曲
   */
  public removeFromPlaylist(playlistName: string, fsId: number): boolean {
    const { playlists, updatePlaylist } = usePlayerStore.getState();
    const playlist = playlists.find(p => p.name === playlistName);

    if (!playlist) {
      console.warn(`播放列表 ${playlistName} 不存在`);
      return false;
    }

    const updatedItems = playlist.items.filter(item => item.fs_id !== fsId);
    
    if (updatedItems.length === playlist.items.length) {
      return false;
    }

    const updatedPlaylist = {
      ...playlist,
      items: updatedItems,
      update_time: Math.floor(Date.now() / 1000)
    };

    updatePlaylist(updatedPlaylist);
    return true;
  }

  /**
   * 递归添加目录下的所有音频文件
   */
  public async addDirectoryRecursive(playlistName: string, dirPath: string): Promise<number> {
    try {
      // 获取目录下所有音频文件（递归）
      const audioFiles = await baiduAPI.getAudioFilesRecursive(dirPath);
      
      if (!audioFiles || audioFiles.length === 0) {
        return 0;
      }

      // 批量添加到播放列表
      this.addBatchToPlaylist(playlistName, audioFiles);
      
      return audioFiles.length;
    } catch (error) {
      console.error(`添加目录 ${dirPath} 失败:`, error);
      return 0;
    }
  }

  /**
   * 播放列表排序
   */
  public sortPlaylist(playlistName: string, key: 'name' | 'time' | 'size' | 'add_time', desc: boolean = false): boolean {
    const { playlists, updatePlaylist } = usePlayerStore.getState();
    const playlist = playlists.find(p => p.name === playlistName);

    if (!playlist) {
      return false;
    }

    const items = [...playlist.items];
    
    items.sort((a, b) => {
      let result = 0;
      switch (key) {
        case 'name':
          result = a.server_filename.localeCompare(b.server_filename, 'zh-CN');
          break;
        case 'time':
          result = a.server_mtime - b.server_mtime;
          break;
        case 'size':
          result = a.size - b.size;
          break;
        case 'add_time':
          result = a.add_time - b.add_time;
          break;
      }
      return desc ? -result : result;
    });

    const updatedPlaylist = {
      ...playlist,
      items,
      update_time: Math.floor(Date.now() / 1000)
    };

    updatePlaylist(updatedPlaylist);
    return true;
  }
}

export const playlistService = PlaylistService.getInstance();