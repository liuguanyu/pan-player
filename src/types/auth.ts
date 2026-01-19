// 认证相关类型定义

export interface AuthInfo {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  session_secret: string;
  session_key: string;
  session_expires_at: number;
  user_id: string;
  username: string;
  is_logged_in: boolean;
}

export interface BaiduPanConfig {
  app_id: string;
  app_key: string;
  secret_key: string;
  sign_key: string;
  redirect_uri: string;
  scope: string;
  device_name: string;
  api_base_url: string;
  oauth_url: string;
  device_id?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
  error?: string;
}

export interface UserInfoResponse {
  errno: number;
  errmsg?: string;
  baidu_name?: string;
  netdisk_name?: string;
  avatar_url?: string;
  vip_type?: number;
  uk?: number;
}