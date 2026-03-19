export const COLORS = {
  skyTopDay: '#9aa4ff',
  skyBottomDay: '#001dff',
  skyTopNight: '#1b2170',
  skyBottomNight: '#02072f',
  grass: '#20f020',
  fence: '#ffffff',
  sheepWool: '#f3f3f3',
  sheepWoolPink: '#f27cd9',
  sheepHead: '#000000',
  sheepEye: '#ffffff',
  sheepPupil: '#000000',
  tongue: '#ff8aa8',
  moon: '#fff36b',
  star: '#dfe7ff',
  shadow: 'rgba(240, 255, 210, 0.72)',
  discoBall: '#f2f2f2',
  discoWire: '#202020',
  cloud: '#ffffff',
  spectrumShell: '#d8d8d8',
  microphoneHead: '#8c8c8c',
  microphoneBody: '#1f1f1f'
} as const;

export type IntensityLevel = 'low' | 'mid' | 'high';

export interface AudioAnalysis {
  averageVolume: number;
  bassEnergy: number;
  trebleEnergy: number;
  beat: number;
  peak: boolean;
  intensity: IntensityLevel;
}

export interface Bird {
  x: number;
  y: number;
  speed: number;
  wingPhase: number;
}

export interface BackgroundSheep {
  x: number;
  y: number;
  scale: number;
  hopOffset: number;
  hopUntil: number;
  phase: number;
}

export interface TimedEffect {
  active: boolean;
  until: number;
}

export interface SceneState {
  initialized: boolean;
  startTime: number;
  lastFrameTime: number;
  beatPulse: number;
  sheepPulse: number;
  legPhase: number;
  tongueValue: number;
  headNod: number;
  headSwing: number;
  bodyTilt: number;
  bodyBob: number;
  bodyStretch: number;
  eyeWide: number;
  eyelid: number;
  spinAngle: number;
  swaggerPhase: number;
  farSheepKick: number;
  isNight: boolean;
  pinkMode: boolean;
  debugCycle: number;
  goofyType: number;
  goofy: TimedEffect;
  spin: TimedEffect;
  swagger: TimedEffect;
  disco: TimedEffect;
  microphone: TimedEffect;
  spectrumLamp: TimedEffect;
  birds: Bird[];
  farSheep: BackgroundSheep[];
  lastGoofyTrigger: number;
  lastSpinTrigger: number;
  lastSwaggerTrigger: number;
  lastFarHopTrigger: number;
  lastBirdTrigger: number;
  lastLampTrigger: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}
