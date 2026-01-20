class AudioContextService {
  private static instance: AudioContextService;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;

  private constructor() {}

  public static getInstance(): AudioContextService {
    if (!AudioContextService.instance) {
      AudioContextService.instance = new AudioContextService();
    }
    return AudioContextService.instance;
  }

  public init(audioElement: HTMLAudioElement) {
    if (this.audioContext) {
      // 如果已经初始化，并且是同一个 audio 元素，则不需要重新初始化
      // 但如果是新的 audio 元素（比如组件重新挂载），则可能需要重新连接
      // 目前我们假设 audio 元素是持久的
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      return;
    }

    try {
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 创建分析器节点
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // 设置 FFT 大小
      
      // 连接音频源
      // 注意：这里需要确保 audio 元素已经加载了源，并且 crossOrigin 设置正确
      this.source = this.audioContext.createMediaElementSource(audioElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      // 初始化数据数组
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      console.log('AudioContext 初始化成功');
    } catch (error) {
      console.error('AudioContext 初始化失败:', error);
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getAudioData(): Uint8Array | null {
    if (!this.analyser || !this.dataArray) return null;
    
    // 获取频域数据
    // @ts-ignore - TypeScript 类型不匹配但运行时正常
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray.slice(); // 返回副本以避免外部修改
  }
  
  public getWaveformData(): Uint8Array | null {
    if (!this.analyser || !this.dataArray) return null;
    
    // 获取时域数据（波形）
    // @ts-ignore - TypeScript 类型不匹配但运行时正常
    this.analyser.getByteTimeDomainData(this.dataArray);
    return this.dataArray.slice(); // 返回副本以避免外部修改
  }
  
  public resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }
}

export const audioContextService = AudioContextService.getInstance();