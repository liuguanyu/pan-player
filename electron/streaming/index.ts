/**
 * 流式转码模块入口
 *
 * 提供 TranscodeSession、SessionManager 和协议处理器的统一导出，
 * 供 main.ts 等模块使用。
 */

// TranscodeSession 类及相关类型
export { TranscodeSession } from './transcode-session';
export type { SessionState, TranscodeSessionOptions } from './transcode-session';

// SessionManager 单例管理器
export { SessionManager } from './session-manager';

// stream-audio 自定义协议处理器
export { registerStreamAudioScheme, registerStreamAudioProtocol } from './protocol-handler';