export type Language = 'ko' | 'en';

export type CameraMode = 'chase' | 'cockpit' | 'hood';

export type GamePhase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

export type TrackThemeId =
  | 'cyber_tunnel'
  | 'neon_grid'
  | 'forest_canopy'
  | 'timber_valley'
  | 'sunset_gp';

export interface CarLivery {
  id: string;
  nameKo: string;
  nameEn: string;
  primaryHex: number;
  accentHex: number;
  cssColor: string;
  cssAccent: string;
}

export interface RaceConfig {
  id: number;
  theme: TrackThemeId;
  nameKo: string;
  nameEn: string;
  subtitleKo: string;
  subtitleEn: string;
  lengthMeters: number;
  roadWidth: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  topSpeedKmh: number;
  rivalBaseSpeedKmh: number;
  obstacleFrequency: number;
  tunnelCoverage: number;
  curveIntensity: number;
  hillIntensity: number;
  accentHex: string;
  skyTopHex: number;
  skyBottomHex: number;
  fogHex: number;
  fogDensity: number;
}

export interface RivalScreenMarker {
  id: string;
  rank: number;
  name: string;
  color: string;
  screenX: number;
  screenY: number;
  distanceMeters: number;
  visible: boolean;
}

export interface RacerStanding {
  id: string;
  name: string;
  isPlayer: boolean;
  rank: number;
  color: string;
  progress: number;
  finishTimeSec: number | null;
  speedKmh: number;
}

export interface CalloutEvent {
  id: number;
  type: 'draft' | 'nearmiss' | 'nitro' | 'boostpad' | 'impact' | 'overtake';
  bonusText?: string;
}

export interface HudTelemetry {
  speedKmh: number;
  rpm: number; // 0..1
  gear: number; // 1..6
  position: number; // 1..6
  totalRacers: number;
  progress: number; // 0..1
  elapsedSec: number;
  nitroCharge: number; // 0..100
  nitroChargesCount: number; // 0..3 discrete bottles like screenshot
  isNitroActive: boolean;
  isDrafting: boolean;
  isDrifting: boolean;
  isBraking: boolean;
  countdownValue: number; // 3, 2, 1, 0 (GO!)
  steerAngle: number; // -1..1
  rivalProgressList: { id: string; progress: number; color: string }[];
  rivalMarkers: RivalScreenMarker[];
  standings: RacerStanding[];
  topSpeedReached: number;
  nearMissCount: number;
}

export interface RaceRecord {
  bestRank: number;
  bestTimeSec: number;
}
