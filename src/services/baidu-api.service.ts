import { httpClient } from '@/lib/http-client';
import { baiduAuth } from '@/services/auth.service';
import { FileInfo } from '@/types/file';

class BaiduPanAPI {
  private static instance: BaiduPanAPI;
  private readonly PAN_API_URL = 'https://pan.baidu.com/rest/2.0/xpan';

  private constructor() {}

  public static getInstance(): BaiduPanAPI {
    if (!BaiduPanAPI.instance) {
      BaiduPanAPI.instance = new BaiduPanAPI();
    }
    return BaiduPanAPI.instance;
  }

  /**
   * 确保有有效的访问令牌
   */
  private async ensureAccessToken(): Promise<string | null> {
    if (!baiduAuth.isAuthenticated()) {
      // 尝试刷新令牌
      const success = await baiduAuth.refreshToken();
      if (!success) {
        return null;
      }
    }
    return baiduAuth.getAccessToken();
  }

  /**
   * 发送API请求
   */
  private async makeRequest<T>(config: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    params?: Record<string, any>;
    data?: any;
    headers?: Record<string, string>;
  }): Promise<T | null> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      console.error('无法获取访问令牌');
      return null;
    }

    // 添加访问令牌到参数
    const params = {
      ...config.params,
      access_token: accessToken
    };

    try {
      const response = await httpClient.get<T>(config.url, {
        params,
        headers: {
          'User-Agent': 'pan.baidu.com',
          ...config.headers
        }
      });

      // 检查是否有错误
      if ('error' in response) {
        console.error('API请求错误:', response.message);
        return null;
      }

      const data = response.data as any;

      // 检查API错误
      if (data.errno !== undefined && data.errno !== 0) {
        const errorMsg = `百度网盘API错误: ${data.errmsg || '未知错误'} (错误码: ${data.errno})`;
        console.error(errorMsg);
        return null;
      }

      return data;
    } catch (error) {
      console.error('请求错误:', error);
      return null;
    }
  }

  /**
   * 获取文件列表
   */
  public async getFileList(
    dirPath: string = '/',
    order: string = 'name',
    desc: boolean = false,
    limit: number = 1000
  ): Promise<FileInfo[] | null> {
    const url = `${this.PAN_API_URL}/file`;
    const params = {
      method: 'list',
      dir: dirPath,
      order,
      desc: desc ? 1 : 0,
      start: 0,
      limit,
      web: 1,
      folder: 0
    };

    console.log('获取文件列表，URL:', url);
    console.log('参数:', params);

    const result = await this.makeRequest<{ list: FileInfo[] }>({
      url,
      method: 'GET',
      params
    });

    console.log('文件列表结果:', result);

    return result?.list || null;
  }

  /**
   * 递归获取文件列表
   */
  public async getFileListRecursive(
    dirPath: string = '/',
    order: string = 'name',
    desc: boolean = false,
    limit: number = 1000
  ): Promise<FileInfo[] | null> {
    const url = `${this.PAN_API_URL}/multimedia`;
    const params = {
      method: 'listall',
      path: dirPath,
      order,
      desc: desc ? 1 : 0,
      limit,
      recursion: 1
    };

    const result = await this.makeRequest<{ list: FileInfo[] }>({
      url,
      method: 'GET',
      params
    });

    return result?.list || null;
  }

  /**
   * 获取音频文件列表（非递归）
   */
  public async getAudioFiles(
    dirPath: string = '/',
    order: string = 'name',
    desc: boolean = false,
    limit: number = 1000
  ): Promise<FileInfo[] | null> {
    // 支持的音频文件扩展名
    const audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma'];

    // 获取文件列表（非递归）
    const files = await this.getFileList(dirPath, order, desc, limit);
    if (!files) return null;

    // 过滤音频文件
    const audioFiles = files.filter(
      file => file.isdir === 0 && 
        audioExtensions.includes(
          file.server_filename.substring(file.server_filename.lastIndexOf('.')).toLowerCase()
        )
    );

    return audioFiles;
  }

  /**
   * 递归获取音频文件列表
   */
  public async getAudioFilesRecursive(
    dirPath: string = '/',
    order: string = 'name',
    desc: boolean = false,
    limit: number = 1000
  ): Promise<FileInfo[] | null> {
    // 支持的音频文件扩展名
    const audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma'];

    // 获取文件列表（递归）
    const files = await this.getFileListRecursive(dirPath, order, desc, limit);
    if (!files) return null;

    // 过滤音频文件
    const audioFiles = files.filter(
      file => file.isdir === 0 && 
        audioExtensions.includes(
          file.server_filename.substring(file.server_filename.lastIndexOf('.')).toLowerCase()
        )
    );

    return audioFiles;
  }

  /**
   * 获取文件信息（包括下载链接）
   */
  public async getFileInfo(fsIds: number[]): Promise<FileInfo[] | null> {
    const url = `${this.PAN_API_URL}/multimedia`;
    const params = {
      method: 'filemetas',
      fsids: JSON.stringify(fsIds),
      dlink: 1 // 请求下载链接
    };

    const result = await this.makeRequest<{ list: FileInfo[] }>({
      url,
      method: 'GET',
      params
    });

    return result?.list || null;
  }

  /**
   * 获取文件下载链接
   */
  public async getDownloadLink(fsId: number): Promise<string | null> {
    const fileInfo = await this.getFileInfo([fsId]);
    if (!fileInfo || fileInfo.length === 0) {
      console.error(`无法获取文件信息: ${fsId}`);
      return null;
    }

    const dlink = fileInfo[0].dlink;
    if (!dlink) {
      console.error(`无法获取下载链接: ${fsId}`);
      return null;
    }

    // 处理下载链接，添加access_token参数
    try {
      const url = new URL(dlink);
      if (!url.searchParams.has('access_token')) {
        url.searchParams.set('access_token', baiduAuth.getAccessToken());
      }
      return url.toString();
    } catch (error) {
      console.error('处理下载链接失败:', error);
      return dlink; // 返回原始链接
    }
  }

  /**
   * 获取用户信息
   */
  public async getUserInfo(): Promise<any> {
    const url = `${this.PAN_API_URL}/nas`;
    const params = {
      method: 'uinfo'
    };

    return this.makeRequest({
      url,
      method: 'GET',
      params
    });
  }

  /**
   * 根据路径搜索文件
   */
  public async searchFile(filePath: string): Promise<FileInfo | null> {
    // 获取文件所在目录
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

    // 获取目录下的文件列表
    const files = await this.getFileList(dirPath);
    if (!files) return null;

    // 查找匹配的文件
    const file = files.find(f => f.server_filename === fileName);
    return file || null;
  }

  /**
   * 获取文件内容（文本）
   */
  public async getFileContent(filePath: string): Promise<string | null> {
    // 先搜索文件
    const file = await this.searchFile(filePath);
    if (!file) {
      console.error(`文件不存在: ${filePath}`);
      return null;
    }

    // 获取下载链接
    const downloadLink = await this.getDownloadLink(file.fs_id);
    if (!downloadLink) {
      console.error(`无法获取下载链接: ${filePath}`);
      return null;
    }

    try {
      // 使用HTTP客户端获取文件内容
      const response = await httpClient.get<string>(downloadLink, {
        responseType: 'text'
      });

      if ('error' in response) {
        console.error('获取文件内容失败:', response.message);
        return null;
      }

      return response.data;
    } catch (error) {
      console.error('获取文件内容失败:', error);
      return null;
    }
  }
}

// 导出单例
export const baiduAPI = BaiduPanAPI.getInstance();