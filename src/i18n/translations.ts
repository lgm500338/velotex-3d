import { Language } from '../types/game';

export interface Translations {
  appTagline: string;
  raceLabel: (num: number) => string;
  selectRace: string;
  startRace: string;
  resume: string;
  restart: string;
  nextRace: string;
  backToMenu: string;
  carColor: string;
  soundOn: string;
  soundOff: string;
  autoGasOn: string;
  autoGasOff: string;
  sceneryLabel: string;
  sceneryTunnel: string;
  sceneryNature: string;
  throttleLabel: string;
  brakeLabel: string;
  posLabel: string;
  speedUnit: string;
  gearLabel: string;
  nosLabel: string;
  ready: string;
  go: string;
  paused: string;
  raceComplete: string;
  finalRank: string;
  raceTime: string;
  topSpeed: string;
  nearMisses: string;
  standings: string;
  driver: string;
  you: string;
  bestRank: string;
  bestTime: string;
  unplayed: string;
  lengthLabel: string;
  difficultyLabel: string;
  controlsHintDesktop: string;
  controlsHintTouch: string;
  raceSettings: string;
  closeSettings: string;
  hideControls: string;
  showControls: string;
  calloutDraft: string;
  calloutNearMiss: string;
  calloutNitro: string;
  calloutBoostPad: string;
  calloutImpact: string;
  calloutOvertake: string;
  ordinal: (rank: number) => string;
  podiumGold: string;
  podiumSilver: string;
  podiumBronze: string;
  podiumFinish: string;
  webglFallbackTitle: string;
  webglFallbackDesc: string;
  reloadGame: string;
}

export const TRANSLATIONS: Record<Language, Translations> = {
  ko: {
    appTagline: '하이퍼 3D 슈퍼카 레이싱',
    raceLabel: (num: number) => `${num}레이스`,
    selectRace: '레이스 선택',
    startRace: '레이스 출발',
    resume: '계속 달리기',
    restart: '다시 도전',
    nextRace: '다음 레이스',
    backToMenu: '레이스 메뉴',
    carColor: '차량 컬러',
    soundOn: '엔진음 켜짐',
    soundOff: '음소거',
    autoGasOn: '자동 가속',
    autoGasOff: '수동 가속',
    sceneryLabel: '배경',
    sceneryTunnel: '터널',
    sceneryNature: '자연 실사',
    throttleLabel: '가속 방식',
    brakeLabel: '브레이크',
    posLabel: '순위',
    speedUnit: 'km/h',
    gearLabel: '단',
    nosLabel: 'NOS',
    ready: '출발 준비',
    go: '출발!',
    paused: '일시정지',
    raceComplete: '레이스 완주!',
    finalRank: '최종 순위',
    raceTime: '완주 기록',
    topSpeed: '최고 속도',
    nearMisses: '아슬아슬 회피',
    standings: '전체 순위표',
    driver: '드라이버',
    you: '나 (PLAYER)',
    bestRank: '최고 순위',
    bestTime: '최고 기록',
    unplayed: '미도전',
    lengthLabel: '코스 길이',
    difficultyLabel: '난이도',
    controlsHintDesktop: 'A/D · ←/→ 조향  ·  W/↑ 가속  ·  S/↓ 브레이크  ·  Space 니트로',
    raceSettings: '레이스 · 설정',
    closeSettings: '닫기',
    controlsHintTouch: '화면을 누른 채 좌우 드래그하여 조향 · 우측 NOS 버튼으로 부스트',
    hideControls: '컨트롤 숨기기',
    showControls: '컨트롤 보기',
    calloutDraft: '슬립스트림 가속! +NOS',
    calloutNearMiss: '아슬아슬 회피! +NOS',
    calloutNitro: '니트로 오버드라이브!',
    calloutBoostPad: '터보 부스트 패드!',
    calloutImpact: '충돌! 감속 주의',
    calloutOvertake: '추월 성공!',
    ordinal: (rank: number) => `${rank}위`,
    podiumGold: '압도적인 우승! 서킷을 지배했습니다.',
    podiumSilver: '치열한 접전 끝의 준우승입니다!',
    podiumBronze: '포디움 입성! 1위가 눈앞입니다.',
    podiumFinish: '완주 성공! 니트로 타이밍으로 순위를 끌어올려 보세요.',
    webglFallbackTitle: '3D 그래픽을 초기화할 수 없습니다',
    webglFallbackDesc: '브라우저에서 WebGL 하드웨어 가속을 활성화해 주세요.',
    reloadGame: '다시 불러오기',
  },
  en: {
    appTagline: 'High-Tension 3D Supercar Racing',
    raceLabel: (num: number) => `RACE ${num}`,
    selectRace: 'Select Race',
    startRace: 'Start Race',
    resume: 'Resume Race',
    restart: 'Restart Race',
    nextRace: 'Next Race',
    backToMenu: 'Race Menu',
    carColor: 'Vehicle Paint',
    soundOn: 'Engine SFX',
    soundOff: 'Muted',
    autoGasOn: 'Auto Gas',
    autoGasOff: 'Manual Gas',
    sceneryLabel: 'Scenery',
    sceneryTunnel: 'Tunnel',
    sceneryNature: 'Real World',
    throttleLabel: 'Throttle',
    brakeLabel: 'BRAKE',
    posLabel: 'POS',
    speedUnit: 'km/h',
    gearLabel: 'GEAR',
    nosLabel: 'NOS',
    ready: 'GET READY',
    go: 'GO!',
    paused: 'PAUSED',
    raceComplete: 'RACE FINISHED',
    finalRank: 'Final Position',
    raceTime: 'Finish Time',
    topSpeed: 'Top Speed',
    nearMisses: 'Near Misses',
    standings: 'Race Standings',
    driver: 'Driver',
    you: 'YOU',
    bestRank: 'Best',
    bestTime: 'Best Time',
    unplayed: 'Unplayed',
    lengthLabel: 'Distance',
    difficultyLabel: 'Intensity',
    controlsHintDesktop: 'A/D or Arrows to Steer  ·  W/Up Gas  ·  S/Down Brake  ·  Space Nitro',
    raceSettings: 'Race & Settings',
    closeSettings: 'Close',
    controlsHintTouch: 'Hold & drag left/right to steer · Tap NOS button to boost',
    hideControls: 'Hide Dock',
    showControls: 'Show Dock',
    calloutDraft: 'SLIPSTREAM! +NOS',
    calloutNearMiss: 'NEAR MISS! +NOS',
    calloutNitro: 'NITRO OVERDRIVE!',
    calloutBoostPad: 'TURBO CHEVRON BOOST!',
    calloutImpact: 'IMPACT! HOLD STEADY',
    calloutOvertake: 'OVERTAKE!',
    ordinal: (rank: number) => {
      if (rank === 1) return '1st';
      if (rank === 2) return '2nd';
      if (rank === 3) return '3rd';
      return `${rank}th`;
    },
    podiumGold: 'Dominant victory! You owned every apex.',
    podiumSilver: 'Razor-close battle for second place!',
    podiumBronze: 'Podium finish! Push harder for P1.',
    podiumFinish: 'Checkered flag crossed! Chain slipstreams and NOS to climb.',
    webglFallbackTitle: 'Unable to initialize 3D Graphics',
    webglFallbackDesc: 'Please enable WebGL hardware acceleration in your browser.',
    reloadGame: 'Reload Game',
  },
};
