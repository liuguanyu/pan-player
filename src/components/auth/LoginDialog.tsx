import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { baiduAuth } from '@/services/auth.service';
import { useAuth } from '@/hooks/useAuth';
import { QRCodeSVG } from 'qrcode.react';

export function LoginDialog() {
  const { isAuthenticated, checkAuthStatus } = useAuth();
  const [isOpen, setIsOpen] = useState(!isAuthenticated);
  const [deviceCode, setDeviceCode] = useState<{
    user_code: string;
    verification_url: string;
    device_code: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [polling, setPolling] = useState(false);

  // 监听认证状态变化
  React.useEffect(() => {
    setIsOpen(!isAuthenticated);
  }, [isAuthenticated]);

  // 当对话框打开且未登录时，自动获取设备码
  React.useEffect(() => {
    if (isOpen && !isAuthenticated && !deviceCode && !loading) {
      handleLogin();
    }
  }, [isOpen, isAuthenticated, deviceCode, loading]);

  // 监听主进程的授权成功事件
  React.useEffect(() => {
    if (window.electronAPI) {
      const handleAuthSuccess = async (tokenData: any) => {
        console.log('收到授权成功事件:', tokenData);
        
        // 使用authService处理登录成功
        baiduAuth.handleLoginSuccess(tokenData);
        
        // 更新认证状态
        await checkAuthStatus();
        setMessage('授权成功！正在跳转...');
        setPolling(false);
        
        setTimeout(() => {
          setIsOpen(false);
        }, 1000);
      };
      
      window.electronAPI.onAuthSuccess(handleAuthSuccess);
      
      // 清理函数：移除事件监听器
      return () => {
        if (window.electronAPI) {
          window.electronAPI.removeAuthSuccessListener?.(handleAuthSuccess);
        }
      };
    }
  }, [checkAuthStatus]);

  const handleLogin = async () => {
    setLoading(true);
    setMessage('正在获取设备码...');
    
    try {
      const code = await baiduAuth.getDeviceCode();
      if (!code) {
        setMessage('获取设备码失败，请重试');
        setLoading(false);
        return;
      }

      setDeviceCode({
        user_code: code.user_code,
        verification_url: code.verification_url,
        device_code: code.device_code
      });
      setMessage('请使用手机百度网盘APP扫描二维码登录');
      setLoading(false);
      setPolling(true);

      // 在主进程轮询设备码状态
      if (window.electronAPI) {
        await window.electronAPI.pollDeviceCode(code.device_code);
      }
    } catch (error) {
      console.error('登录失败:', error);
      setMessage('登录发生错误，请重试');
      setLoading(false);
      setPolling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>登录度盘播放器</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {!deviceCode ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              <p className="text-sm text-muted-foreground">{message}</p>
              {loading && (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">请使用手机百度网盘APP扫描二维码登录</p>
              </div>
              
              {/* 二维码显示 */}
              <div className="p-4 bg-white rounded-lg shadow-md">
                <QRCodeSVG
                  value={`${deviceCode.verification_url}?code=${deviceCode.user_code}`}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              {/* 备用方案：显示链接和用户码 */}
              <div className="text-center space-y-2 w-full">
                <details className="text-left">
                  <summary className="text-sm text-primary cursor-pointer hover:underline">
                    无法扫码？点击查看备用方案
                  </summary>
                  <div className="mt-3 space-y-3 p-3 bg-muted rounded-lg">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">访问链接：</p>
                      <a
                        href={deviceCode.verification_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                      >
                        {deviceCode.verification_url}
                      </a>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">输入用户码：</p>
                      <p className="text-lg font-bold tracking-widest select-all cursor-pointer"
                         onClick={() => navigator.clipboard.writeText(deviceCode.user_code)}>
                        {deviceCode.user_code}
                      </p>
                      <p className="text-xs text-muted-foreground">（点击复制）</p>
                    </div>
                  </div>
                </details>
              </div>

              <div className="flex items-center space-x-2">
                {polling && (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <p className="text-sm text-muted-foreground">等待授权中...</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}