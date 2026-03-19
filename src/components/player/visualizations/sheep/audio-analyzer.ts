import type { AudioAnalysis, IntensityLevel } from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const analyzeSheepAudio = (data: Uint8Array): AudioAnalysis => {
  const bufferLength = data.length || 1;

  let total = 0;
  let bass = 0;
  let treble = 0;
  let peaks = 0;

  const bassLimit = Math.max(1, Math.floor(bufferLength * 0.1));
  const trebleStart = Math.floor(bufferLength * 0.72);

  for (let index = 0; index < bufferLength; index += 1) {
    const value = data[index] / 255;
    total += value;

    if (index < bassLimit) {
      bass += value;
    }

    if (index >= trebleStart) {
      treble += value;
    }

    if (data[index] > 220) {
      peaks += 1;
    }
  }

  const averageVolume = total / bufferLength;
  const bassEnergy = bass / bassLimit;
  const trebleEnergy = treble / Math.max(1, bufferLength - trebleStart);
  const beat = clamp(bassEnergy * 0.9 + averageVolume * 0.6, 0, 1);
  const peak = peaks / bufferLength > 0.06 || (bassEnergy > 0.72 && trebleEnergy > 0.62);

  let intensity: IntensityLevel = 'low';
  if (beat > 0.63 || averageVolume > 0.58) {
    intensity = 'high';
  } else if (beat > 0.35 || averageVolume > 0.3) {
    intensity = 'mid';
  }

  return {
    averageVolume,
    bassEnergy,
    trebleEnergy,
    beat,
    peak,
    intensity
  };
};
