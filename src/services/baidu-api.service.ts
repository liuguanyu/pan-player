import { httpClient } from '@/lib/http-client';
import { baiduAuth } from '@/services/auth.service';
import { FileInfo } from '@/types/file';
import CryptoJS from 'crypto-js';

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
    const audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.ape', '.alac'];

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
    const audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.ape', '.alac'];

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

  /**
   * 计算文件的MD5
   */
  private calculateMD5(content: string): string {
    return CryptoJS.MD5(content).toString();
  }

  /**
   * 上传文件 - 预创建
   */
  private async precreateFile(
    path: string,
    size: number,
    blockList: string[]
  ): Promise<{ uploadid: string; return_type?: number } | null> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      console.error('无法获取访问令牌');
      return null;
    }

    const url = `${this.PAN_API_URL}/file`;
    const params = {
      method: 'precreate',
      access_token: accessToken
    };

    const data = new URLSearchParams();
    data.append('path', path);
    data.append('size', size.toString());
    data.append('isdir', '0');
    data.append('autoinit', '1');
    data.append('block_list', JSON.stringify(blockList));
    data.append('rtype', '3'); // rtype=3 表示覆盖

    try {
      const response = await httpClient.post<any>(url, data.toString(), {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'pan.baidu.com'
        }
      });

      if ('error' in response) {
        console.error('预创建文件失败:', response.message);
        return null;
      }

      const result = response.data;
      console.log('预创建API响应:', JSON.stringify(result, null, 2));
      
      if (result.errno !== undefined && result.errno !== 0) {
        console.error('预创建文件API错误:', result.errmsg, '错误码:', result.errno);
        return null;
      }

      return {
        uploadid: result.uploadid,
        return_type: result.return_type
      };
    } catch (error) {
      console.error('预创建文件失败:', error);
      return null;
    }
  }

  /**
   * 上传文件分片 - 使用原生fetch API以支持FormData
   */
  private async uploadFileSlice(
    path: string,
    uploadid: string,
    partseq: number,
    file: Blob
  ): Promise<boolean> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      console.error('无法获取访问令牌');
      return false;
    }

    // 构建URL with参数
    const urlObj = new URL('https://d.pcs.baidu.com/rest/2.0/pcs/superfile2');
    urlObj.searchParams.set('method', 'upload');
    urlObj.searchParams.set('access_token', accessToken);
    urlObj.searchParams.set('type', 'tmpfile');
    urlObj.searchParams.set('path', path);
    urlObj.searchParams.set('uploadid', uploadid);
    urlObj.searchParams.set('partseq', partseq.toString());

    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log('上传文件分片到:', urlObj.toString());
      
      // 使用原生fetch API以正确处理FormData
      const response = await fetch(urlObj.toString(), {
        method: 'POST',
        body: formData,
        headers: {
          'User-Agent': 'pan.baidu.com'
        }
      });

      const result = await response.json();
      console.log('上传分片API响应:', JSON.stringify(result, null, 2));
      
      if (!response.ok) {
        console.error('上传文件分片HTTP错误:', response.status, response.statusText);
        return false;
      }

      if (result.errno !== undefined && result.errno !== 0) {
        console.error('上传文件分片API错误:', result.errmsg, '错误码:', result.errno);
        return false;
      }

      return true;
    } catch (error) {
      console.error('上传文件分片失败:', error);
      return false;
    }
  }

  /**
   * 创建文件
   */
  private async createFile(
    path: string,
    size: number,
    uploadid: string,
    blockList: string[]
  ): Promise<boolean> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      console.error('无法获取访问令牌');
      return false;
    }

    const url = `${this.PAN_API_URL}/file`;
    const params = {
      method: 'create',
      access_token: accessToken
    };

    const data = new URLSearchParams();
    data.append('path', path);
    data.append('size', size.toString());
    data.append('isdir', '0');
    data.append('uploadid', uploadid);
    data.append('block_list', JSON.stringify(blockList));
    data.append('rtype', '3'); // rtype=3 表示覆盖

    try {
      const response = await httpClient.post<any>(url, data.toString(), {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'pan.baidu.com'
        }
      });

      if ('error' in response) {
        console.error('创建文件失败:', response.message);
        return false;
      }

      const result = response.data;
      console.log('创建文件API响应:', JSON.stringify(result, null, 2));
      
      if (result.errno !== undefined && result.errno !== 0) {
        console.error('创建文件API错误:', result.errmsg, '错误码:', result.errno);
        return false;
      }

      return true;
    } catch (error) {
      console.error('创建文件失败:', error);
      return false;
    }
  }

  /**
   * 上传LRC文件
   */
  public async uploadLrcFile(
    targetPath: string,
    content: string,
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 确保路径以.lrc结尾
      if (!targetPath.toLowerCase().endsWith('.lrc')) {
        return { success: false, error: '目标路径必须以.lrc结尾' };
      }

      // 将内容转换为Blob
      const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
      const size = blob.size;

      // 计算MD5
      const md5 = this.calculateMD5(content);
      const blockList = [md5];

      if (onProgress) onProgress(10);

      // 步骤1: 预创建
      console.log('=== 开始上传LRC文件 ===');
      console.log('目标路径:', targetPath);
      console.log('文件大小:', size, 'bytes');
      console.log('MD5:', md5);
      console.log('开始预创建文件...');
      
      const precreateResult = await this.precreateFile(targetPath, size, blockList);
      if (!precreateResult) {
        console.error('预创建文件失败');
        return { success: false, error: '预创建文件失败' };
      }

      console.log('预创建成功, uploadid:', precreateResult.uploadid);
      console.log('return_type:', precreateResult.return_type);

      if (onProgress) onProgress(30);

      // 如果return_type为2，表示秒传成功，无需上传
      if (precreateResult.return_type === 2) {
        console.log('文件秒传成功(MD5匹配,跳过上传步骤)');
        if (onProgress) onProgress(100);
        return { success: true };
      }

      // 步骤2: 上传文件分片
      console.log('开始上传文件分片...');
      const uploadSuccess = await this.uploadFileSlice(
        targetPath,
        precreateResult.uploadid,
        0,
        blob
      );

      if (!uploadSuccess) {
        console.error('上传文件分片失败');
        return { success: false, error: '上传文件分片失败' };
      }

      console.log('文件分片上传成功');
      if (onProgress) onProgress(70);

      // 步骤3: 创建文件
      console.log('开始创建文件(完成上传)...');
      const createSuccess = await this.createFile(
        targetPath,
        size,
        precreateResult.uploadid,
        blockList
      );

      if (!createSuccess) {
        console.error('创建文件失败');
        return { success: false, error: '创建文件失败' };
      }

      if (onProgress) onProgress(100);
      console.log('=== 文件上传成功 ===');
      console.log('最终路径:', targetPath);
      return { success: true };
    } catch (error: any) {
      console.error('上传LRC文件失败:', error);
      return { success: false, error: error.message || '上传失败' };
    }
  }

  /**
   * 检查LRC文件是否存在
   */
  public async checkLrcFileExists(lrcPath: string): Promise<boolean> {
    try {
      const file = await this.searchFile(lrcPath);
      return file !== null && file.server_filename.toLowerCase().endsWith('.lrc');
    } catch (error) {
      console.error('检查LRC文件失败:', error);
      return false;
    }
  }
}

// 导出单例
export const baiduAPI = BaiduPanAPI.getInstance();