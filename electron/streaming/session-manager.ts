import { TranscodeSession, SessionState, TranscodeSessionOptions } from './transcode-session';
import logger from '../logger';

/**
 * 会话管理器配置
 */
interface SessionManagerConfig {
  /** 最大并发会话数 */
  maxConcurrentSessions: number;
  /** 总内存缓冲上限（字节） */
  maxTotalMemoryBytes: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: SessionManagerConfig = {
  maxConcurrentSessions: 3,
  maxTotalMemoryBytes: 500 * 1024 * 1024, // 500MB
};

/**
 * SessionManager - 管理所有转码会话的生命周期
 *
 * 职责：
 * - 单例模式管理全局转码会话
 * - 创建、查询、销毁转码会话
 * - LRU 策略自动清理超限会话
 * - 同一 sourceUrl 缓存复用已完成的转码
 * - 内存和并发数限制
 */
export class SessionManager {
  private static instance: SessionManager;

  /** 所有活跃会话，key 为 sessionId */
  private sessions: Map<string, TranscodeSession> = new Map();

  /** 配置 */
  private config: SessionManagerConfig;

  private constructor(config?: Partial<SessionManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取 SessionManager 单例
   */
  static getInstance(config?: Partial<SessionManagerConfig>): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(config);
      logger.log('[SessionManager] Instance created');
    }
    return SessionManager.instance;
  }

  /**
   * 重置单例（仅用于测试）
   */
  static resetInstance(): void {
    if (SessionManager.instance) {
      SessionManager.instance.destroyAll();
      SessionManager.instance = undefined as any;
    }
  }

  // ─── 会话管理 ────────────────────────────────────────────────

  /**
   * 获取或创建转码会话
   *
   * 策略：
   * 1. 如果已有相同 sessionId 的会话且 sourceUrl 匹配，返回现有会话
   * 2. 如果已有相同 sourceUrl 的已完成会话，复用该缓存（缓存复用）
   * 3. 否则创建新会话
   *
   * @param sessionId - 会话唯一标识
   * @param sourceUrl - 音频源 HTTP URL
   * @param startTimeSeconds - 可选，seek 起始时间
   * @returns 转码会话实例
   */
  getOrCreateSession(
    sessionId: string,
    sourceUrl: string,
    startTimeSeconds?: number
  ): TranscodeSession {
    // 1. 检查是否已有相同 sessionId 的会话
    const existing = this.sessions.get(sessionId);
    if (existing && existing.sourceUrl === sourceUrl) {
      logger.log(`[SessionManager] Reusing existing session: ${sessionId}`);
      existing.lastAccessedAt = Date.now();
      return existing;
    }

    // 2. 检查是否有相同 sourceUrl 的已完成缓存（仅在没有 seek 偏移时复用）
    if (!startTimeSeconds || startTimeSeconds === 0) {
      const cached = this.findCachedSession(sourceUrl);
      if (cached) {
        logger.log(`[SessionManager] Found cached session for URL, reusing as ${sessionId}`);
        // 移除旧的映射，用新 sessionId 重新注册
        // 注意：不销毁缓存 session，只是更换 key
        cached.lastAccessedAt = Date.now();
        // 如果 sessionId 不同，需要在 map 中添加新引用
        if (!this.sessions.has(sessionId)) {
          this.sessions.set(sessionId, cached);
        }
        return cached;
      }
    }

    // 3. 如果存在相同 sessionId 但 URL 不同的旧会话，先销毁
    if (existing) {
      logger.log(`[SessionManager] Destroying old session with same id but different URL: ${sessionId}`);
      this._destroySessionInternal(sessionId);
    }

    // 4. 检查并执行清理策略
    this._enforceMemoryLimits();
    this._enforceConcurrencyLimits();

    // 5. 创建新会话
    const session = new TranscodeSession({
      sessionId,
      sourceUrl,
      startTimeSeconds,
    });

    // 监听会话事件以便日志和管理
    session.on('complete', () => {
      logger.log(`[SessionManager] Session completed: ${sessionId}, bytes: ${session.totalBytes}`);
    });

    session.on('error', (err: Error) => {
      logger.error(`[SessionManager] Session error: ${sessionId}:`, err.message);
    });

    this.sessions.set(sessionId, session);
    logger.log(
      `[SessionManager] Created new session: ${sessionId}, total sessions: ${this.sessions.size}`
    );

    return session;
  }

  /**
   * 获取指定会话
   *
   * @param sessionId - 会话 ID
   * @returns 会话实例，不存在时返回 null
   */
  getSession(sessionId: string): TranscodeSession | null {
    const session = this.sessions.get(sessionId) ?? null;
    if (session) {
      session.lastAccessedAt = Date.now();
    }
    return session;
  }

  /**
   * 销毁指定会话
   *
   * @param sessionId - 会话 ID
   */
  destroySession(sessionId: string): void {
    this._destroySessionInternal(sessionId);
  }

  /**
   * 销毁所有会话（应用退出时调用）
   */
  destroyAll(): void {
    logger.log(`[SessionManager] Destroying all sessions (${this.sessions.size} total)`);
    for (const [sessionId] of this.sessions) {
      this._destroySessionInternal(sessionId);
    }
    this.sessions.clear();
    logger.log('[SessionManager] All sessions destroyed');
  }

  // ─── 查询方法 ────────────────────────────────────────────────

  /**
   * 查找同一 sourceUrl 的已完成缓存会话
   *
   * @param sourceUrl - 音频源 URL
   * @returns 已完成的缓存会话，不存在时返回 null
   */
  findCachedSession(sourceUrl: string): TranscodeSession | null {
    for (const session of this.sessions.values()) {
      if (session.sourceUrl === sourceUrl && session.isComplete) {
        return session;
      }
    }
    return null;
  }

  /**
   * 获取当前会话总数
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 获取当前总内存使用量（字节）
   */
  getTotalMemoryUsage(): number {
    let total = 0;
    for (const session of this.sessions.values()) {
      total += session.getMemoryUsage();
    }
    return total;
  }

  /**
   * 获取当前正在转码的会话数
   */
  getActiveTranscodingCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.state === 'transcoding') {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取所有会话的概要信息（调试用）
   */
  getSessionsSummary(): Array<{
    sessionId: string;
    sourceUrl: string;
    state: SessionState;
    totalBytes: number;
    createdAt: number;
    lastAccessedAt: number;
  }> {
    const summaries: Array<{
      sessionId: string;
      sourceUrl: string;
      state: SessionState;
      totalBytes: number;
      createdAt: number;
      lastAccessedAt: number;
    }> = [];
    for (const [id, session] of this.sessions) {
      summaries.push({
        sessionId: id,
        sourceUrl: session.sourceUrl.substring(0, 80),
        state: session.state,
        totalBytes: session.totalBytes,
        createdAt: session.createdAt,
        lastAccessedAt: session.lastAccessedAt,
      });
    }
    return summaries;
  }

  // ─── 内部方法 ────────────────────────────────────────────────

  /**
   * 内部销毁会话
   */
  private _destroySessionInternal(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    logger.log(`[SessionManager] Destroying session: ${sessionId}`);
    session.destroy();
    this.sessions.delete(sessionId);
  }

  /**
   * 执行内存限制策略
   * 当总内存超过上限时，按 LRU 策略销毁最旧的非活跃（已完成/出错）会话
   */
  private _enforceMemoryLimits(): void {
    let totalMemory = this.getTotalMemoryUsage();

    if (totalMemory <= this.config.maxTotalMemoryBytes) {
      return;
    }

    logger.warn(
      `[SessionManager] Memory limit exceeded: ${(totalMemory / 1024 / 1024).toFixed(1)}MB / ${(this.config.maxTotalMemoryBytes / 1024 / 1024).toFixed(1)}MB, cleaning up...`
    );

    // 获取所有非活跃会话（已完成或出错），按最后访问时间排序（最旧的优先清理）
    const inactiveSessions = this._getInactiveSessionsSortedByLRU();

    for (const [sessionId] of inactiveSessions) {
      if (totalMemory <= this.config.maxTotalMemoryBytes) {
        break;
      }

      const session = this.sessions.get(sessionId);
      if (session) {
        const freed = session.getMemoryUsage();
        this._destroySessionInternal(sessionId);
        totalMemory -= freed;
        logger.log(
          `[SessionManager] Evicted session ${sessionId}, freed ${(freed / 1024 / 1024).toFixed(1)}MB`
        );
      }
    }
  }

  /**
   * 执行并发数限制策略
   * 当并发转码数超过上限时，按 LRU 策略销毁最旧的非活跃会话
   */
  private _enforceConcurrencyLimits(): void {
    if (this.sessions.size < this.config.maxConcurrentSessions) {
      return;
    }

    logger.warn(
      `[SessionManager] Concurrency limit reached: ${this.sessions.size} / ${this.config.maxConcurrentSessions}, cleaning up...`
    );

    // 获取所有非活跃会话，按 LRU 排序
    const inactiveSessions = this._getInactiveSessionsSortedByLRU();

    // 需要释放的数量
    const toFree = this.sessions.size - this.config.maxConcurrentSessions + 1;

    for (let i = 0; i < Math.min(toFree, inactiveSessions.length); i++) {
      const [sessionId] = inactiveSessions[i];
      logger.log(`[SessionManager] Evicting session for concurrency: ${sessionId}`);
      this._destroySessionInternal(sessionId);
    }
  }

  /**
   * 获取非活跃会话列表，按最后访问时间升序排列（最旧的在前）
   */
  private _getInactiveSessionsSortedByLRU(): Array<[string, TranscodeSession]> {
    const inactive: Array<[string, TranscodeSession]> = [];

    for (const [id, session] of this.sessions) {
      if (session.state === 'completed' || session.state === 'error' || session.state === 'idle') {
        inactive.push([id, session]);
      }
    }

    // 按 lastAccessedAt 升序排列（最旧的优先清理）
    inactive.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    return inactive;
  }
}