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

  /**
   * 导出所有播放列表为JSON
   */
  public exportAllPlaylists(): string {
    const { playlists, recentSongs } = usePlayerStore.getState();

    const exportData = {
      version: '1.0',
      export_time: new Date().toISOString(),
      playlists: playlists,
      recentSongs: recentSongs
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出单个播放列表为JSON
   */
  public exportPlaylist(playlistName: string): string | null {
    const playlist = this.getPlaylist(playlistName);

    if (!playlist) {
      return null;
    }

    const exportData = {
      version: '1.0',
      export_time: new Date().toISOString(),
      playlist: playlist
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 从JSON导入播放列表
   */
  public importFromJSON(jsonString: string): { success: boolean; message: string; imported?: number } {
    try {
      console.log('开始解析JSON字符串，长度:', jsonString.length);

      const data = JSON.parse(jsonString);
      console.log('解析成功，数据结构:', { version: data.version, hasPlaylists: !!data.playlists, hasPlaylist: !!data.playlist });

      // 验证数据格式
      if (!data.version) {
        console.error('缺少version字段');
        return { success: false, message: '无效的歌单文件格式: 缺少version字段' };
      }

      const { playlists } = usePlayerStore.getState();
      let importedCount = 0;

      // 情况1: 导入全部歌单格式 (包含 playlists 数组)
      if (data.playlists && Array.isArray(data.playlists)) {
        console.log('检测到全量导出格式，歌单数量:', data.playlists.length);

        const { updatePlaylist, addPlaylist } = usePlayerStore.getState();

        data.playlists.forEach((importedPlaylist: Playlist, index: number) => {
          console.log(`处理歌单 ${index + 1}/${data.playlists.length}:`, importedPlaylist.name);

          try {
            const existingIndex = playlists.findIndex(p => p.name === importedPlaylist.name);

            if (existingIndex >= 0) {
              // 如果已存在，合并歌曲
              const existing = playlists[existingIndex];
              const mergedItems = [...existing.items];

              importedPlaylist.items.forEach(item => {
                if (!mergedItems.some(m => m.fs_id === item.fs_id)) {
                  mergedItems.push(item);
                }
              });

              updatePlaylist({
                ...existing,
                items: mergedItems,
                update_time: Math.floor(Date.now() / 1000)
              });
            } else {
              // 不存在，直接添加
              addPlaylist(importedPlaylist);
            }

            importedCount++;
          } catch (error) {
            console.error(`处理歌单 ${importedPlaylist.name} 失败:`, error);
          }
        });

        // 导入最近播放（可选）
        if (data.recentSongs && Array.isArray(data.recentSongs)) {
          const { addRecentSong } = usePlayerStore.getState();
          data.recentSongs.forEach((song: PlaylistItem) => {
            addRecentSong(song);
          });
        }
      }
      // 情况2: 导入单个歌单格式 (包含 playlist 对象)
      else if (data.playlist) {
        console.log('检测到单个歌单导出格式');

        const { updatePlaylist, addPlaylist } = usePlayerStore.getState();
        const importedPlaylist = data.playlist as Playlist;
        const existingIndex = playlists.findIndex(p => p.name === importedPlaylist.name);

        if (existingIndex >= 0) {
          // 如果已存在，合并歌曲
          const existing = playlists[existingIndex];
          const mergedItems = [...existing.items];

          importedPlaylist.items.forEach(item => {
            if (!mergedItems.some(m => m.fs_id === item.fs_id)) {
              mergedItems.push(item);
            }
          });

          updatePlaylist({
            ...existing,
            items: mergedItems,
            update_time: Math.floor(Date.now() / 1000)
          });
        } else {
          // 不存在，直接添加
          addPlaylist(importedPlaylist);
        }

        importedCount = 1;
      }
      else {
        console.error('未找到有效的歌单数据');
        return { success: false, message: '无效的歌单文件格式: 未找到playlists或playlist字段' };
      }

      console.log('导入完成，导入数量:', importedCount);
      return {
        success: true,
        message: `成功导入 ${importedCount} 个播放列表`,
        imported: importedCount
      };
    } catch (error) {
      console.error('导入歌单失败:', error);
      return {
        success: false,
        message: `解析文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 下载导出文件到本地
   */
  public downloadExportFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const playlistService = PlaylistService.getInstance();