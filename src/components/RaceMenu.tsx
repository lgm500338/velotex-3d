import { useState } from 'react';
import {
  ChevronRight,
  Flag,
  Gauge,
  Globe,
  Mountain,
  Play,
  Sparkles,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CAR_LIVERIES, RACES } from '../data/races';
import { TRANSLATIONS } from '../i18n/translations';
import { Language, RaceConfig, RaceRecord, SceneryMode } from '../types/game';

interface RaceMenuProps {
  language: Language;
  onToggleLanguage: () => void;
  selectedRace: RaceConfig;
  onSelectRace: (race: RaceConfig) => void;
  liveryId: string;
  onSelectLivery: (id: string) => void;
  autoGas: boolean;
  onToggleAutoGas: () => void;
  scenery: SceneryMode;
  onSelectScenery: (mode: SceneryMode) => void;
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

/**
 * Start screen. The 3D supercar (orbiting showcase camera) owns the middle of the
 * screen; the bottom holds only the race chip, paint swatches and the start button.
 * Race list and throttle settings live in a sheet that is closed by default.
 */
export function RaceMenu({
  language,
  onToggleLanguage,
  selectedRace,
  onSelectRace,
  liveryId,
  onSelectLivery,
  autoGas,
  onToggleAutoGas,
  scenery,
  onSelectScenery,
  muted,
  onToggleMuted,
  records,
  onStartRace,
}: RaceMenuProps) {
  const t = TRANSLATIONS[language];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedRecord = records[selectedRace.id];
  const raceName = language === 'ko' ? selectedRace.nameKo : selectedRace.nameEn;

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-20 flex h-dvh flex-col justify-between p-3 sm:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] [@media(max-height:500px)]:p-2 [@media(max-height:500px)]:pb-[calc(0.5rem+env(safe-area-inset-bottom))]`}
    >
      {/* Top: title + sound/language */}
      <header className="pointer-events-auto flex shrink-0 items-start justify-between gap-3">
        <div className="flex flex-col">
          <h1
            className={`font-display text-3xl sm:text-5xl [@media(max-height:500px)]:text-2xl font-extrabold italic tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] whitespace-nowrap`}
          >
            VELOTEX <span className="text-amber-400">3D</span>
          </h1>
          <p
            className={`text-xs sm:text-sm text-slate-200/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] [@media(max-height:500px)]:hidden`}
          >
            {t.appTagline}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMuted}
            aria-label={muted ? t.soundOff : t.soundOn}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#080d18]/80 px-2.5 py-2 text-xs font-semibold text-slate-100 hover:bg-[#11192e] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-sky-400" />}
            <span className="hidden sm:inline">{muted ? t.soundOff : t.soundOn}</span>
          </button>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#080d18]/80 px-2.5 py-2 text-xs font-semibold text-slate-100 hover:bg-[#11192e] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="h-4 w-4 text-amber-400" />
            <span>{language === 'ko' ? 'EN' : '한국어'}</span>
          </button>
        </div>
      </header>

      {settingsOpen ? (
        /* Settings sheet: race list + throttle mode */
        <section
          className={`pointer-events-auto mx-auto w-full max-w-3xl max-h-[calc(100dvh-6rem)] [@media(max-height:500px)]:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/12 bg-[#070b14]/94 p-3.5 sm:p-5 [@media(max-height:500px)]:p-3 shadow-[0_20px_60px_rgba(0,0,0,0.72)]`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-sm font-bold text-white">{t.selectRace}</span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t.closeSettings}</span>
            </button>
          </div>

          <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 [@media(max-height:500px)]:grid-cols-5`}>
            {RACES.map((race) => {
              const active = race.id === selectedRace.id;
              const rec = records[race.id];
              return (
                <button
                  key={race.id}
                  type="button"
                  onClick={() => onSelectRace(race)}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-400">{t.throttleLabel}</span>
              <button
                type="button"
                onClick={onToggleAutoGas}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  autoGas
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/15 bg-[#0d1424] text-slate-300 hover:text-white'
                }`}
              >
                <Gauge className="h-3.5 w-3.5" />
                <span>{autoGas ? t.autoGasOn : t.autoGasOff}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400 cursor-pointer"
            >
              {t.closeSettings}
            </button>
          </div>

          <div className="mt-3 hidden sm:flex flex-wrap items-center gap-2 border-t border-white/8 pt-2.5 text-[11px] text-slate-400">
            <Flag className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>{t.controlsHintDesktop}</span>
          </div>
        </section>
      ) : (
        /* Launch dock: the car stays fully visible above this */
        <section
          className={`pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-3 [@media(max-height:500px)]:max-w-2xl [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2`}
        >
          <div className={`flex flex-col gap-3 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:gap-2`}>
            {/* Paint swatches */}
            <div className="flex items-center justify-center gap-3">
              {CAR_LIVERIES.map((liv) => {
                const selected = liv.id === liveryId;
                return (
                  <button
                    key={liv.id}
                    type="button"
                    title={language === 'ko' ? liv.nameKo : liv.nameEn}
                    aria-label={language === 'ko' ? liv.nameKo : liv.nameEn}
                    onClick={() => onSelectLivery(liv.id)}
                    className={`h-8 w-8 rounded-full border-2 shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-transform cursor-pointer ${
                      selected ? 'scale-115 border-white' : 'border-white/30 hover:scale-105'
                    }`}
                    style={{ backgroundColor: liv.cssColor }}
                  />
                );
              })}
            </div>

            {/* Scenery: original tunnel tracks vs. real-photo backgrounds */}
            <div
              role="radiogroup"
              aria-label={t.sceneryLabel}
              className="mx-auto flex w-full max-w-xs items-center gap-1 rounded-xl border border-white/12 bg-[#070b14]/80 p-1 backdrop-blur-sm"
            >
              {(
                [
                  ['tunnel', t.sceneryTunnel, Sparkles],
                  ['nature', t.sceneryNature, Mountain],
                ] as const
              ).map(([mode, label, Icon]) => {
                const on = scenery === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onSelectScenery(mode)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      on ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Current race chip — opens settings sheet */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-[#070b14]/80 px-3.5 py-2.5 text-left backdrop-blur-sm hover:bg-[#0e1526]/90 transition-colors cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-display text-sm font-bold whitespace-nowrap"
                    style={{ color: selectedRace.accentHex }}
                  >
                    {t.raceLabel(selectedRace.id)}
                  </span>
                  <span className="truncate text-sm font-semibold text-white">{raceName}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                  {(selectedRace.lengthMeters / 1000).toFixed(1)}km
                  {selectedRecord
                    ? ` · ${t.bestRank} ${t.ordinal(selectedRecord.bestRank)} · ${formatTime(selectedRecord.bestTimeSec)}`
                    : ` · ${t.unplayed}`}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-300">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden min-[360px]:inline">{t.raceSettings}</span>
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onStartRace}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 py-4 font-display text-lg font-extrabold text-slate-950 shadow-[0_10px_34px_rgba(245,158,11,0.45)] hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer [@media(max-height:500px)]:w-auto [@media(max-height:500px)]:py-3`}
          >
            <Play className="h-5 w-5 fill-current" />
            <span>{t.startRace}</span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </section>
      )}
    </div>
  );
}
