import { useState, useEffect } from 'react';
import { baiduAuth } from '@/services/auth.service';
import { AuthInfo, UserInfoResponse } from '@/types/auth';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // 检查认证状态
  const checkAuthStatus = async () => {
    setLoading(true);
    try {
      const authenticated = baiduAuth.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const info = baiduAuth.getAuthInfo();
        setAuthInfo(info);
        
        // 获取用户信息
        const user = await baiduAuth.getUserInfo();
        setUserInfo(user);
      } else {
        setAuthInfo(null);
        setUserInfo(null);
      }
    } catch (error) {
      console.error('检查认证状态失败:', error);
      setIsAuthenticated(false);
      setAuthInfo(null);
      setUserInfo(null);
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const login = async () => {
    try {
      // 获取设备码
      const deviceCodeResponse = await baiduAuth.getDeviceCode();
      if (!deviceCodeResponse) {
        throw new Error('获取设备码失败');
      }

      // 显示用户码和验证URL（在实际应用中应该显示给用户）
      console.log('请访问以下链接并输入用户码进行授权：');
      console.log('验证链接:', deviceCodeResponse.verification_url);
      console.log('用户码:', deviceCodeResponse.user_code);

      // 轮询设备码状态
      const success = await baiduAuth.pollDeviceCodeStatus(
        deviceCodeResponse.device_code,
        () => {
          console.log('等待用户授权中...');
        }
      );

      if (success) {
        await checkAuthStatus();
        return true;
      }
    } catch (error) {
      console.error('登录失败:', error);
    }
    return false;
  };

  // 退出登录
  const logout = async () => {
    try {
      await baiduAuth.logout();
      setIsAuthenticated(false);
      setAuthInfo(null);
      setUserInfo(null);
    } catch (error) {
      console.error('退出登录失败:', error);
    }
  };

  // 刷新令牌
  const refreshToken = async () => {
    try {
      const success = await baiduAuth.refreshToken();
      if (success) {
        await checkAuthStatus();
      }
      return success;
    } catch (error) {
      console.error('刷新令牌失败:', error);
      return false;
    }
  };

  // 初始化时检查认证状态
  useEffect(() => {
    checkAuthStatus();
  }, []);

  return {
    isAuthenticated,
    authInfo,
    userInfo,
    loading,
    login,
    logout,
    refreshToken,
    checkAuthStatus
  };
};