import { useCallback, useEffect, useRef, useState } from 'react';
import { RaceFinishModal } from './components/RaceFinishModal';
import { RaceMenu } from './components/RaceMenu';
import { RacingHud } from './components/RacingHud';
import { CAR_LIVERIES, RACES } from './data/races';
import { AudioEngine } from './engine/AudioEngine';
import { RacingEngine } from './engine/RacingEngine';
import { TRANSLATIONS } from './i18n/translations';
import {
  CalloutEvent,
  GamePhase,
  HudTelemetry,
  Language,
  RaceConfig,
  RaceRecord,
  SceneryMode,
} from './types/game';

const RECORDS_STORAGE_KEY = 'velotex_3d_records_v1';

const INITIAL_HUD: HudTelemetry = {
  speedKmh: 0,
  rpm: 0.2,
  gear: 1,
  position: 6,
  totalRacers: 6,
  progress: 0,
  elapsedSec: 0,
  nitroCharge: 100,
  nitroChargesCount: 3,
  isNitroActive: false,
  isDrafting: false,
  isDrifting: false,
  isBraking: false,
  countdownValue: 3,
  steerAngle: 0,
  rivalProgressList: [],
  rivalMarkers: [],
  standings: [],
  topSpeedReached: 0,
  nearMissCount: 0,
};

const SCENERY_STORAGE_KEY = 'velotex3d_scenery';

function loadScenery(): SceneryMode {
  try {
    return localStorage.getItem(SCENERY_STORAGE_KEY) === 'nature' ? 'nature' : 'tunnel';
  } catch {
    return 'tunnel';
  }
}

function loadRecords(): Record<number, RaceRecord> {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, RaceRecord>;
  } catch {
    return {};
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const selectedRaceRef = useRef<RaceConfig>(RACES[0]);
  const calloutTimerRef = useRef<number | null>(null);

  const [language, setLanguage] = useState<Language>('ko');
  const [selectedRace, setSelectedRace] = useState<RaceConfig>(RACES[0]);
  const [liveryId, setLiveryId] = useState<string>(CAR_LIVERIES[0].id);
  const [autoGas, setAutoGas] = useState<boolean>(true);
  const [scenery, setScenery] = useState<SceneryMode>(() => loadScenery());
  const sceneryRef = useRef<SceneryMode>(scenery);
  const [muted, setMuted] = useState<boolean>(false);
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [hud, setHud] = useState<HudTelemetry>(INITIAL_HUD);
  const [callout, setCallout] = useState<CalloutEvent | null>(null);
  const [records, setRecords] = useState<Record<number, RaceRecord>>(() => loadRecords());
  const [webglError, setWebglError] = useState<boolean>(false);

  selectedRaceRef.current = selectedRace;

  // Mount Three.js WebGL engine once inside isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const audio = new AudioEngine();
    audioRef.current = audio;

    const engine = new RacingEngine(mountEl, audio, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
      },
      onCallout: (ev) => {
        setCallout(ev);
        if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
        calloutTimerRef.current = window.setTimeout(() => {
          setCallout(null);
        }, 1400);
      },
      onRaceFinished: (finalHud) => {
        const raceId = selectedRaceRef.current.id;
        setRecords((prev) => {
          const existing = prev[raceId];
          const updated: Record<number, RaceRecord> = {
            ...prev,
            [raceId]: {
              bestRank: existing ? Math.min(existing.bestRank, finalHud.position) : finalHud.position,
              bestTimeSec: existing ? Math.min(existing.bestTimeSec, finalHud.elapsedSec) : finalHud.elapsedSec,
            },
          };
          try {
            localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // ignore storage quota errors
          }
          return updated;
        });
      },
      onWebGLFailed: () => {
        setWebglError(true);
      },
    });

    engineRef.current = engine;
    engine.setSceneryMode(sceneryRef.current);
    engine.init();

    return () => {
      if (calloutTimerRef.current) window.clearTimeout(calloutTimerRef.current);
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const handleToggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'ko' ? 'en' : 'ko'));
  }, []);

  const handleSelectRace = useCallback((race: RaceConfig) => {
    setSelectedRace(race);
    engineRef.current?.loadRace(race, false);
  }, []);

  const handleSelectLivery = useCallback((id: string) => {
    setLiveryId(id);
    engineRef.current?.setLivery(id);
  }, []);

  const handleToggleAutoGas = useCallback(() => {
    setAutoGas((prev) => {
      const next = !prev;
      engineRef.current?.setAutoGas(next);
      return next;
    });
  }, []);

  const handleSelectScenery = useCallback((mode: SceneryMode) => {
    sceneryRef.current = mode;
    setScenery(mode);
    engineRef.current?.setSceneryMode(mode);
    try {
      localStorage.setItem(SCENERY_STORAGE_KEY, mode);
    } catch {
      /* private mode: just don't remember */
    }
  }, []);

  const handleToggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.init();
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleStartRace = useCallback(() => {
    audioRef.current?.init();
    engineRef.current?.setAutoGas(autoGas);
    engineRef.current?.startCountdown();
  }, [autoGas]);

  const handleRestart = useCallback(() => {
    audioRef.current?.init();
    engineRef.current?.restartCurrentRace();
  }, []);

  const handleNextRace = useCallback(() => {
    const nextIdx = RACES.findIndex((r) => r.id === selectedRace.id) + 1;
    const nextRace = RACES[nextIdx] ?? RACES[0];
    setSelectedRace(nextRace);
    audioRef.current?.init();
    engineRef.current?.loadRace(nextRace, true);
  }, [selectedRace.id]);

  const handleExitToMenu = useCallback(() => {
    engineRef.current?.loadRace(selectedRace, false);
  }, [selectedRace]);

  const handleNitroPress = useCallback((active: boolean) => {
    engineRef.current?.triggerNitro(active);
  }, []);

  const handleBrakePress = useCallback((active: boolean) => {
    engineRef.current?.triggerBrake(active);
  }, []);

  const t = TRANSLATIONS[language];

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#060912]">
      {/* Isolated WebGL Canvas Container — never re-mounted on React state changes */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {/* Graceful WebGL Fallback with Reload recovery button */}
      {webglError && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060912] p-6 text-center">
          <h1 className="font-display text-2xl font-bold text-white">{t.webglFallbackTitle}</h1>
          <p className="mt-2 max-w-md text-sm text-slate-400">{t.webglFallbackDesc}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-amber-500 px-5 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
          >
            {t.reloadGame}
          </button>
        </div>
      )}

      {/* Race Select & Garage Start Screen */}
      {phase === 'menu' && !webglError && (
        <RaceMenu
          language={language}
          onToggleLanguage={handleToggleLanguage}
          selectedRace={selectedRace}
          onSelectRace={handleSelectRace}
          liveryId={liveryId}
          onSelectLivery={handleSelectLivery}
          autoGas={autoGas}
          onToggleAutoGas={handleToggleAutoGas}
          scenery={scenery}
          onSelectScenery={handleSelectScenery}
          muted={muted}
          onToggleMuted={handleToggleMuted}
          records={records}
          onStartRace={handleStartRace}
        />
      )}

      {/* Live Racing HUD (Countdown / Racing / Paused) */}
      {(phase === 'countdown' || phase === 'racing' || phase === 'paused') && !webglError && (
        <RacingHud
          language={language}
          onToggleLanguage={handleToggleLanguage}
          race={selectedRace}
          phase={phase}
          hud={hud}
          autoGas={autoGas}
          onToggleAutoGas={handleToggleAutoGas}
          muted={muted}
          onToggleMuted={handleToggleMuted}
          callout={callout}
          onNitroPress={handleNitroPress}
          onBrakePress={handleBrakePress}
          onPause={() => engineRef.current?.pause()}
          onResume={() => engineRef.current?.resume()}
          onRestart={handleRestart}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {/* Finish Podium Modal */}
      {phase === 'finished' && !webglError && (
        <RaceFinishModal
          language={language}
          race={selectedRace}
          hud={hud}
          onNextRace={handleNextRace}
          onRestart={handleRestart}
          onBackToMenu={handleExitToMenu}
        />
      )}
    </main>
  );
}
