// HTTP客户端，用于在渲染进程中调用主进程的HTTP请求功能

interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

interface HttpError {
  error: true;
  message: string;
  response?: {
    data: any;
    status: number;
    headers: Record<string, string>;
  };
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface HttpRequestConfig {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
}

class HttpClient {
  private async sendRequest<T>(config: HttpRequestConfig): Promise<HttpResponse<T> | HttpError> {
    // 在Electron环境中调用主进程的HTTP请求
    if (window.electronAPI) {
      return window.electronAPI.httpRequest(config);
    }
    
    // 如果不在Electron环境中，使用fetch作为备选方案
    try {
      const url = new URL(config.url);
      if (config.params) {
        Object.keys(config.params).forEach(key => {
          url.searchParams.append(key, config.params![key]);
        });
      }
      
      const response = await fetch(url.toString(), {
        method: config.method,
        headers: config.headers,
        body: config.data ? JSON.stringify(config.data) : undefined
      });
      
      let data;
      if (config.responseType === 'text') {
        data = await response.text();
      } else if (config.responseType === 'arraybuffer') {
        data = await response.arrayBuffer();
      } else if (config.responseType === 'blob') {
        data = await response.blob();
      } else {
        data = await response.json();
      }
      
      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error: any) {
      return {
        error: true,
        message: error.message
      };
    }
  }
  
  async get<T = any>(url: string, config?: Omit<HttpRequestConfig, 'url' | 'method'>): Promise<HttpResponse<T> | HttpError> {
    return this.sendRequest<T>({
      url,
      method: 'GET',
      ...config
    });
  }
  
  async post<T = any>(url: string, data?: any, config?: Omit<HttpRequestConfig, 'url' | 'method' | 'data'>): Promise<HttpResponse<T> | HttpError> {
    return this.sendRequest<T>({
      url,
      method: 'POST',
      data,
      ...config
    });
  }
  
  async put<T = any>(url: string, data?: any, config?: Omit<HttpRequestConfig, 'url' | 'method' | 'data'>): Promise<HttpResponse<T> | HttpError> {
    return this.sendRequest<T>({
      url,
      method: 'PUT',
      data,
      ...config
    });
  }
  
  async delete<T = any>(url: string, config?: Omit<HttpRequestConfig, 'url' | 'method'>): Promise<HttpResponse<T> | HttpError> {
    return this.sendRequest<T>({
      url,
      method: 'DELETE',
      ...config
    });
  }
}

// 导出单例
export const httpClient = new HttpClient();