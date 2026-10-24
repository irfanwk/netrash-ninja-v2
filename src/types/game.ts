export type GameMode = 'SOLO' | 'VERSUS';
export type PlayerSide = 'SOLO' | 'P1' | 'P2';
export type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

export interface WasteCategory {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  glowColor: string;
  points: number;
  co2: number;
  radius: number;
  isBomb: boolean;
}

export interface BladePoint {
  x: number;
  y: number;
  time: number;
}

export interface GameStats {
  score: number;
  co2: number;
  lives: number;
  maxCombo: number;
}

export interface SlicedHalfData {
  type: WasteCategory;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  sliceAngle: number;
  isLeft: boolean;
  alpha: number;
}
