import {
  Camera,
  ChevronRight,
  Flag,
  Gauge,
  Globe,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CAR_LIVERIES, RACES } from '../data/races';
import { TRANSLATIONS } from '../i18n/translations';
import { CameraMode, Language, RaceConfig, RaceRecord } from '../types/game';

interface RaceMenuProps {
  language: Language;
  onToggleLanguage: () => void;
  selectedRace: RaceConfig;
  onSelectRace: (race: RaceConfig) => void;
  cameraMode: CameraMode;
  onSelectCamera: (mode: CameraMode) => void;
  liveryId: string;
  onSelectLivery: (id: string) => void;
  autoGas: boolean;
  onToggleAutoGas: () => void;
  muted: boolean;
  onToggleMuted: () => void;
  records: Record<number, RaceRecord>;
  onStartRace: () => void;
}

function formatTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(2)}`;
}

export function RaceMenu({
  language,
  onToggleLanguage,
  selectedRace,
  onSelectRace,
  cameraMode,
  onSelectCamera,
  liveryId,
  onSelectLivery,
  autoGas,
  onToggleAutoGas,
  muted,
  onToggleMuted,
  records,
  onStartRace,
}: RaceMenuProps) {
  const t = TRANSLATIONS[language];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex h-dvh flex-col justify-between p-3 sm:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] [@media(max-height:500px)]:p-2 [@media(max-height:500px)]:pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {/* Top Header Strip — leaves center 3D supercar showcase completely open */}
      <header className="pointer-events-auto flex shrink-0 items-center justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="font-display text-xl sm:text-3xl [@media(max-height:500px)]:text-lg font-extrabold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            VELOTEX 3D
          </h1>
          <p className="text-xs sm:text-sm text-slate-200/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] [@media(max-height:500px)]:hidden">
            {t.appTagline}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMuted}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#080d18]/90 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-[#11192e] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-sky-400" />}
            <span className="hidden sm:inline">{muted ? t.soundOff : t.soundOn}</span>
          </button>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#080d18]/90 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-[#11192e] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="h-4 w-4 text-amber-400" />
            <span>{language === 'ko' ? '한국어 / EN' : 'EN / 한국어'}</span>
          </button>
        </div>
      </header>

      {/* Bottom Unified Race Config & Launch Dock */}
      <section className="pointer-events-auto mx-auto w-full max-w-5xl max-h-[calc(100dvh-5.25rem)] [@media(max-height:500px)]:max-h-[calc(100dvh-3.75rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/12 bg-[#070b14]/92 p-3.5 sm:p-5 [@media(max-height:500px)]:p-3 shadow-[0_20px_60px_rgba(0,0,0,0.72)]">
        {/* Row 1: 1레이스 ~ 5레이스 Selector */}
        <div className="mb-4 [@media(max-height:500px)]:mb-2.5">
          <div className="mb-2.5 [@media(max-height:500px)]:mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{t.selectRace}</span>
            <span className="tabular-nums">
              {t.lengthLabel} {(selectedRace.lengthMeters / 1000).toFixed(2)} km · {t.topSpeed} {selectedRace.topSpeedKmh} {t.speedUnit}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {RACES.map((race) => {
              const active = race.id === selectedRace.id;
              const rec = records[race.id];
              return (
                <button
                  key={race.id}
                  type="button"
                  onClick={() => onSelectRace(race)}
                  className={`group flex flex-col items-start rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-sky-400 bg-[#0e1933] shadow-[0_0_0_1px_rgba(56,189,248,0.4)]'
                      : 'border-white/10 bg-[#0c1222]/85 hover:border-white/25 hover:bg-[#131b31]'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span
                      className="font-display text-sm font-bold tracking-tight whitespace-nowrap"
                      style={{ color: active ? race.accentHex : '#f1f5f9' }}
                    >
                      {t.raceLabel(race.id)}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 tabular-nums whitespace-nowrap">
                      {rec ? t.ordinal(rec.bestRank) : '—'}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs font-medium text-slate-200">
                    {language === 'ko' ? race.nameKo : race.nameEn}
                  </div>
                  <div className="mt-1.5 flex w-full items-center justify-between text-[11px] text-slate-400 tabular-nums">
                    <span>{(race.lengthMeters / 1000).toFixed(1)}km</span>
                    <span>{rec ? formatTime(rec.bestTimeSec) : t.unplayed}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Race Description + Controls Strip */}
        <div className="flex flex-col gap-3.5 [@media(max-height:500px)]:gap-2.5 border-t border-white/10 pt-3.5 [@media(max-height:500px)]:pt-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Camera Selector + Paint Swatches */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 [@media(max-height:500px)]:gap-2.5">
            {/* Camera View Segmented Control */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">{t.cameraMode}</span>
              <div className="flex items-center gap-1 rounded-lg bg-[#0d1424] p-1 border border-white/10">
                {(
                  [
                    { id: 'chase', label: t.camChase },
                    { id: 'cockpit', label: t.camCockpit },
                    { id: 'hood', label: t.camHood },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onSelectCamera(cam.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraMode === cam.id
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{cam.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Car Paint Swatches */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">{t.carColor}</span>
              <div className="flex items-center gap-2 py-1">
                {CAR_LIVERIES.map((liv) => {
                  const selected = liv.id === liveryId;
                  return (
                    <button
                      key={liv.id}
                      type="button"
                      title={language === 'ko' ? liv.nameKo : liv.nameEn}
                      onClick={() => onSelectLivery(liv.id)}
                      className={`h-7 w-7 rounded-full border-2 transition-transform cursor-pointer ${
                        selected ? 'scale-110 border-white' : 'border-white/25 hover:scale-105'
                      }`}
                      style={{ backgroundColor: liv.cssColor }}
                      aria-label={language === 'ko' ? liv.nameKo : liv.nameEn}
                    />
                  );
                })}
              </div>
            </div>

            {/* Auto-Gas Toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">{t.throttleLabel}</span>
              <button
                type="button"
                onClick={onToggleAutoGas}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  autoGas
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/15 bg-[#0d1424] text-slate-300 hover:text-white'
                }`}
              >
                <Gauge className="h-3.5 w-3.5" />
                <span>{autoGas ? t.autoGasOn : t.autoGasOff}</span>
              </button>
            </div>
          </div>

          {/* Primary Start Race CTA */}
          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <div className="hidden xl:block text-right max-w-[230px]">
              <div className="text-xs font-semibold text-white truncate">
                {t.raceLabel(selectedRace.id)} · {language === 'ko' ? selectedRace.nameKo : selectedRace.nameEn}
              </div>
              <div className="text-[11px] text-slate-400 line-clamp-1">
                {language === 'ko' ? selectedRace.subtitleKo : selectedRace.subtitleEn}
              </div>
            </div>

            <button
              type="button"
              onClick={onStartRace}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-display text-base font-bold text-slate-950 shadow-[0_8px_28px_rgba(245,158,11,0.38)] hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer w-full sm:w-auto"
            >
              <Play className="h-5 w-5 fill-current" />
              <span>{t.startRace}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Subtle single-line controls summary */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2.5 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>{t.controlsHintDesktop}</span>
          </span>
          <span className="hidden md:inline text-slate-500">{t.controlsHintTouch}</span>
        </div>
      </section>
    </div>
  );
}
