import { protocol } from 'electron';
import { SessionManager } from './session-manager';
import { TranscodeSession } from './transcode-session';
import logger from '../logger';

/**
 * 注册 stream-audio 自定义协议 scheme
 *
 * 必须在 app.ready 之前调用（即在 app 初始化阶段调用）
 * 注册为特权协议以支持 stream、绕过 CSP、以及 Fetch API
 */
export function registerStreamAudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'stream-audio',
      privileges: {
        stream: true,
        bypassCSP: true,
        supportFetchAPI: true,
      },
    },
  ]);
  logger.log('[ProtocolHandler] stream-audio scheme registered as privileged');
}

/**
 * 注册 stream-audio 协议处理器
 *
 * 必须在 app.ready 之后调用
 * HTML5 <audio> 元素通过 stream-audio://{sessionId} URL 请求音频数据
 *
 * 所有请求统一返回 200（非 206），不设置 Accept-Ranges 头，
 * 避免 HTML5 Audio 使用 Range 请求，改为流式加载模式。
 */
export function registerStreamAudioProtocol(): void {
  protocol.handle('stream-audio', async (request: Request) => {
    try {
      // 解析 URL 获取 sessionId（从 hostname 部分）
      const url = new URL(request.url);
      const sessionId = url.hostname;

      if (!sessionId) {
        logger.warn('[ProtocolHandler] Missing sessionId in URL:', request.url);
        return new Response('Missing sessionId', { status: 400 });
      }

      // 从 SessionManager 获取会话
      const sessionManager = SessionManager.getInstance();
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        logger.warn('[ProtocolHandler] Session not found:', sessionId);
        return new Response('Session not found', { status: 404 });
      }

      // 忽略 Range 头，统一走流式处理
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        logger.info(
          `[ProtocolHandler] Ignoring Range header "${rangeHeader}" for session ${sessionId}, using streaming mode`
        );
      }

      return await handleStreamingRequest(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[ProtocolHandler] Error handling request:', message);
      return new Response(`Internal Server Error: ${message}`, { status: 500 });
    }
  });

  logger.log('[ProtocolHandler] stream-audio protocol handler registered');
}

/**
 * 处理音频请求 —— 统一返回 200 + 流式输出
 *
 * - 转码已完成：直接返回完整 Buffer（Content-Length 已知）
 * - 转码进行中：使用 ReadableStream 流式输出已缓冲数据 + 后续新增数据
 *
 * 不设置 Accept-Ranges 头，使 HTML5 Audio 采用流式加载模式，
 * 而非 Range 请求模式。
 *
 * @param session - 转码会话
 * @returns 200 响应
 */
async function handleStreamingRequest(session: TranscodeSession): Promise<Response> {
  // 如果缓冲区为空且转码仍在进行，等待首批数据到达
  if (session.totalBytes === 0 && session.state === 'transcoding') {
    logger.info(
      `[ProtocolHandler] No data buffered yet for session ${session.sessionId}, waiting for first data...`
    );
    const dataReady = await session.waitForData(1, 30000);
    if (!dataReady) {
      logger.error(
        `[ProtocolHandler] Timeout waiting for first data, session ${session.sessionId}`
      );
      return new Response('Service Unavailable - transcoding timeout', { status: 503 });
    }
    logger.info(
      `[ProtocolHandler] First data arrived for session ${session.sessionId}, buffered=${session.totalBytes}`
    );
  }

  // 转码出错
  if (session.state === 'error') {
    logger.error(`[ProtocolHandler] Session ${session.sessionId} is in error state`);
    return new Response('Transcoding error', { status: 500 });
  }

  // 会话已销毁（idle）
  if (session.state === 'idle') {
    logger.warn(`[ProtocolHandler] Session ${session.sessionId} is idle (destroyed?)`);
    return new Response('Session not active', { status: 410 });
  }

  // 转码已完成：直接返回完整数据
  if (session.state === 'completed') {
    const data = session.getFullBuffer();
    logger.log(
      `[ProtocolHandler] Serving completed session ${session.sessionId}, bytes: ${data.length}`
    );
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'audio/flac',
        'Content-Length': String(data.length),
        'Cache-Control': 'no-cache',
      },
    });
  }

  // 转码进行中：使用 ReadableStream 流式输出
  logger.log(
    `[ProtocolHandler] Starting streaming response for session ${session.sessionId}, ` +
    `currently buffered=${session.totalBytes}`
  );

  // currentOffset 追踪已写入 stream 的字节数，在 start() 闭包中共享
  let currentOffset = 0;

  const stream = new ReadableStream({
    start(controller) {
      // 先输出已缓冲的数据
      const initialBytes = session.totalBytes;
      if (initialBytes > 0) {
        const buffered = session.getBufferedData(0, initialBytes);
        if (buffered.length > 0) {
          controller.enqueue(new Uint8Array(buffered));
          currentOffset = buffered.length;
          logger.info(
            `[ProtocolHandler] Streamed initial ${currentOffset} bytes for session ${session.sessionId}`
          );
        }
      }

      // 检查在读取初始数据期间转码是否已完成
      if (session.state === 'completed') {
        // 若有 totalBytes > currentOffset 的剩余数据，一并输出
        const totalNow = session.totalBytes;
        if (totalNow > currentOffset) {
          const remaining = session.getBufferedData(currentOffset, totalNow);
          if (remaining.length > 0) {
            controller.enqueue(new Uint8Array(remaining));
            currentOffset += remaining.length;
          }
        }
        controller.close();
        logger.info(
          `[ProtocolHandler] Stream completed (session already done) for session ${session.sessionId}, ` +
          `total streamed=${currentOffset}`
        );
        return;
      }

      // 监听新数据事件
      const onData = () => {
        try {
          const available = session.totalBytes;
          if (available > currentOffset) {
            const newData = session.getBufferedData(currentOffset, available);
            if (newData.length > 0) {
              controller.enqueue(new Uint8Array(newData));
              currentOffset += newData.length;
            }
          }
        } catch (err) {
          logger.error(
            `[ProtocolHandler] Error reading data in onData for session ${session.sessionId}:`,
            err
          );
        }
      };

      const onComplete = () => {
        cleanup();
        try {
          // 输出 complete 事件触发前尚未写入的最后数据
          const available = session.totalBytes;
          if (available > currentOffset) {
            const remaining = session.getBufferedData(currentOffset, available);
            if (remaining.length > 0) {
              controller.enqueue(new Uint8Array(remaining));
              currentOffset += remaining.length;
            }
          }
          controller.close();
          logger.info(
            `[ProtocolHandler] Stream completed for session ${session.sessionId}, ` +
            `total streamed=${currentOffset}`
          );
        } catch (err) {
          logger.error(
            `[ProtocolHandler] Error in onComplete for session ${session.sessionId}:`,
            err
          );
          try { controller.close(); } catch { /* ignore if already closed */ }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        logger.error(
          `[ProtocolHandler] Transcode error during streaming for session ${session.sessionId}:`,
          err.message
        );
        try {
          controller.error(err);
        } catch {
          // controller may already be closed/errored
        }
      };

      const cleanup = () => {
        session.removeListener('data', onData);
        session.removeListener('complete', onComplete);
        session.removeListener('error', onError);
      };

      session.on('data', onData);
      session.on('complete', onComplete);
      session.on('error', onError);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/flac',
      'Cache-Control': 'no-cache',
    },
  });
}