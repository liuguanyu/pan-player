import { AuthInfo, TokenResponse, DeviceCodeResponse, UserInfoResponse } from '@/types/auth';
import { BAIDU_CONFIG } from '@/config/credentials';
import { httpClient } from '@/lib/http-client';

class BaiduPanAuth {
  private config = BAIDU_CONFIG;
  private authInfo: AuthInfo;

  constructor() {
    // 从localStorage加载认证信息
    this.authInfo = this.loadAuthInfo();
    
    // 获取或生成设备ID
    this.getDeviceId();
  }

  /**
   * 从localStorage加载认证信息
   */
  private loadAuthInfo(): AuthInfo {
    const defaultAuthInfo: AuthInfo = {
      access_token: '',
      refresh_token: '',
      expires_at: 0,
      scope: '',
      session_secret: '',
      session_key: '',
      session_expires_at: 0,
      user_id: '',
      username: '',
      is_logged_in: false
    };

    try {
      const stored = localStorage.getItem('baidu_auth_info');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultAuthInfo, ...parsed };
      }
    } catch (error) {
      console.error('加载认证信息失败:', error);
    }

    return defaultAuthInfo;
  }

  /**
   * 保存认证信息到localStorage
   */
  private saveAuthInfo(): boolean {
    try {
      localStorage.setItem('baidu_auth_info', JSON.stringify(this.authInfo));
      return true;
    } catch (error) {
      console.error('保存认证信息失败:', error);
      return false;
    }
  }

  /**
   * 获取或生成设备ID
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = this.generateUUID();
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * 生成UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 检查是否已认证
   */
  public isAuthenticated(): boolean {
    if (!this.authInfo.is_logged_in) {
      return false;
    }

    if (!this.authInfo.access_token) {
      return false;
    }

    // 检查令牌是否过期
    if (Date.now() >= this.authInfo.expires_at) {
      return false;
    }

    return true;
  }

  /**
   * 获取授权URL
   */
  public getAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.app_key,
      response_type: 'code',
      redirect_uri: this.config.redirect_uri,
      scope: this.config.scope,
      display: 'page'
    });

    return `${this.config.oauth_url}/authorize?${params.toString()}`;
  }

  /**
   * 获取设备码
   */
  public async getDeviceCode(): Promise<DeviceCodeResponse | null> {
    try {
      const params = {
        client_id: this.config.app_key,
        scope: this.config.scope,
        response_type: 'device_code'
      };

      const response = await httpClient.get(
        `${this.config.oauth_url}/device/code`,
        {
          params,
          headers: {
            'User-Agent': 'pan.baidu.com'
          }
        }
      );

      if ('error' in response) {
        console.error('获取设备码失败:', response.message);
        return null;
      }

      const data = response.data;

      if (data.error) {
        console.error('获取设备码失败:', data);
        return null;
      }

      return data as DeviceCodeResponse;
    } catch (error) {
      console.error('获取设备码失败:', error);
      return null;
    }
  }

  /**
   * 轮询设备码状态
   */
  public async pollDeviceCodeStatus(
    deviceCode: string,
    onPending?: () => void
  ): Promise<boolean> {
    const params = {
      grant_type: 'device_token',
      code: deviceCode,
      client_id: this.config.app_key,
      client_secret: this.config.secret_key
    };

    // 最多轮询60次，每次间隔5秒
    for (let i = 0; i < 60; i++) {
      try {
        const response = await httpClient.get(
          `${this.config.oauth_url}/token`,
          {
            params,
            headers: {
              'User-Agent': 'pan.baidu.com'
            }
          }
        );

        if ('error' in response) {
          console.error('设备码授权失败:', response.message);
          return false;
        }

        const data = response.data as TokenResponse;

        // 授权成功
        if (data.access_token) {
          this.authInfo.access_token = data.access_token;
          this.authInfo.refresh_token = data.refresh_token;
          this.authInfo.expires_at = Date.now() + data.expires_in * 1000;
          this.authInfo.scope = data.scope;
          this.authInfo.is_logged_in = true;

          this.saveAuthInfo();
          return true;
        }

        // 授权中
        if (data.error === 'authorization_pending') {
          onPending?.();
        }
        // 授权过期
        else if (data.error === 'expired_token') {
          console.error('授权已过期');
          return false;
        }
        // 其他错误
        else if (data.error) {
          console.error('设备码授权失败:', data);
          return false;
        }

        // 等待5秒后继续轮询
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('设备码授权失败:', error);
        return false;
      }
    }

    console.error('设备码授权超时');
    return false;
  }

  /**
   * 使用授权码交换令牌
   */
  public async exchangeCodeForToken(code: string): Promise<boolean> {
    try {
      const params = {
        grant_type: 'authorization_code',
        code: code,
        client_id: this.config.app_key,
        client_secret: this.config.secret_key,
        redirect_uri: this.config.redirect_uri
      };

      const response = await httpClient.get(
        `${this.config.oauth_url}/token`,
        {
          params,
          headers: {
            'User-Agent': 'pan.baidu.com'
          }
        }
      );

      if ('error' in response) {
        console.error('获取令牌失败:', response.message);
        return false;
      }

      const data = response.data as TokenResponse;

      if (data.error) {
        console.error('获取令牌失败:', data);
        return false;
      }

      this.authInfo.access_token = data.access_token;
      this.authInfo.refresh_token = data.refresh_token;
      this.authInfo.expires_at = Date.now() + data.expires_in * 1000;
      this.authInfo.scope = data.scope;
      this.authInfo.is_logged_in = true;

      return this.saveAuthInfo();
    } catch (error) {
      console.error('获取令牌失败:', error);
      return false;
    }
  }

  /**
   * 刷新令牌
   */
  public async refreshToken(): Promise<boolean> {
    if (!this.authInfo.refresh_token) {
      console.error('刷新令牌失败: 无刷新令牌');
      return false;
    }

    try {
      const params = {
        grant_type: 'refresh_token',
        refresh_token: this.authInfo.refresh_token,
        client_id: this.config.app_key,
        client_secret: this.config.secret_key
      };

      const response = await httpClient.get(
        `${this.config.oauth_url}/token`,
        {
          params,
          headers: {
            'User-Agent': 'pan.baidu.com'
          }
        }
      );

      if ('error' in response) {
        console.error('刷新令牌失败:', response.message);
        return false;
      }

      const data = response.data as TokenResponse;

      if (data.error) {
        console.error('刷新令牌失败:', data);
        return false;
      }

      this.authInfo.access_token = data.access_token;
      this.authInfo.refresh_token = data.refresh_token;
      this.authInfo.expires_at = Date.now() + data.expires_in * 1000;
      this.authInfo.is_logged_in = true;

      return this.saveAuthInfo();
    } catch (error) {
      console.error('刷新令牌失败:', error);
      return false;
    }
  }

  /**
   * 获取用户信息
   */
  public async getUserInfo(): Promise<UserInfoResponse | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    try {
      const params = {
        method: 'uinfo',
        access_token: this.authInfo.access_token
      };

      const response = await httpClient.get(
        `${this.config.api_base_url}/xpan/nas`,
        {
          params,
          headers: {
            'User-Agent': 'pan.baidu.com'
          }
        }
      );

      if ('error' in response) {
        console.error('获取用户信息失败:', response.message);
        return null;
      }

      const data = response.data as UserInfoResponse;

      if (data.errno !== 0) {
        console.error('获取用户信息失败:', data);
        return null;
      }

      // 更新用户名
      if (data.baidu_name) {
        this.authInfo.username = data.baidu_name;
        this.saveAuthInfo();
      }

      return data;
    } catch (error) {
      console.error('获取用户信息失败:', error);
      return null;
    }
  }

  /**
   * 退出登录
   */
  public async logout(): Promise<boolean> {
    try {
      if (this.authInfo.access_token) {
        const params = {
          access_token: this.authInfo.access_token
        };

        await httpClient.get(
          `${this.config.oauth_url}/revoke`,
          {
            params,
            headers: {
              'User-Agent': 'pan.baidu.com'
            }
          }
        );
      }
    } catch (error) {
      console.error('退出登录失败:', error);
    }

    // 清除认证信息
    this.authInfo = {
      access_token: '',
      refresh_token: '',
      expires_at: 0,
      scope: '',
      session_secret: '',
      session_key: '',
      session_expires_at: 0,
      user_id: '',
      username: '',
      is_logged_in: false
    };

    return this.saveAuthInfo();
  }

  /**
   * 获取访问令牌
   */
  public getAccessToken(): string {
    return this.authInfo.access_token;
  }

  /**
   * 获取认证信息
   */
  public getAuthInfo(): AuthInfo {
    return { ...this.authInfo };
  }

  /**
   * 重新加载认证信息（用于外部直接修改localStorage后刷新内存中的数据）
   */
  public reload(): void {
    this.authInfo = this.loadAuthInfo();
  }

  /**
   * 处理登录成功（用于接收主进程传递的token数据）
   */
  public handleLoginSuccess(tokenData: any): void {
    this.authInfo = {
      ...this.authInfo,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
      session_key: tokenData.session_key || '',
      session_secret: tokenData.session_secret || '',
      is_logged_in: true
    };
    
    this.saveAuthInfo();
  }
}

// 导出单例
export const baiduAuth = new BaiduPanAuth();