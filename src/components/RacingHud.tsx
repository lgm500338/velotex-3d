import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Flag,
  Flame,
  Gauge,
  Globe,
  Octagon,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations';
import {
  CalloutEvent,
  GamePhase,
  HudTelemetry,
  Language,
  RaceConfig,
} from '../types/game';

interface RacingHudProps {
  language: Language;
  onToggleLanguage: () => void;
  race: RaceConfig;
  phase: GamePhase;
  hud: HudTelemetry;
  autoGas: boolean;
  onToggleAutoGas: () => void;
  muted: boolean;
  onToggleMuted: () => void;
  callout: CalloutEvent | null;
  onNitroPress: (active: boolean) => void;
  onBrakePress: (active: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

function formatTimer(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

export function RacingHud({
  language,
  onToggleLanguage,
  race,
  phase,
  hud,
  autoGas,
  onToggleAutoGas,
  muted,
  onToggleMuted,
  callout,
  onNitroPress,
  onBrakePress,
  onPause,
  onResume,
  onRestart,
  onExitToMenu,
}: RacingHudProps) {
  const t = TRANSLATIONS[language];
  const [dockOpen, setDockOpen] = useState(
    () => (typeof window !== 'undefined' ? window.innerHeight > 500 : true),
  );

  const speedPct = Math.min(1, hud.speedKmh / (race.topSpeedKmh * 1.18));
  const arcTotal = 165;
  const arcOffset = arcTotal - speedPct * arcTotal;

  const nitroRingTotal = 188.5;
  const nitroRingOffset = nitroRingTotal - (hud.nitroCharge / 100) * nitroRingTotal;

  const getCalloutCopy = (type: CalloutEvent['type']) => {
    switch (type) {
      case 'draft':
        return { text: t.calloutDraft, color: 'text-sky-300 border-sky-400/50 bg-[#06182c]/90' };
      case 'nearmiss':
        return { text: t.calloutNearMiss, color: 'text-emerald-300 border-emerald-400/50 bg-[#062119]/90' };
      case 'nitro':
        return { text: t.calloutNitro, color: 'text-cyan-200 border-cyan-400/60 bg-[#072033]/92' };
      case 'boostpad':
        return { text: t.calloutBoostPad, color: 'text-fuchsia-200 border-fuchsia-400/60 bg-[#230b2e]/92' };
      case 'overtake':
        return { text: t.calloutOvertake, color: 'text-amber-300 border-amber-400/60 bg-[#241606]/90' };
      case 'impact':
        return { text: t.calloutImpact, color: 'text-rose-300 border-rose-500/60 bg-[#2a0a10]/92' };
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {/* High-Speed Nitro Edge Tension Glow (compositor opacity only) */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-200"
        style={{
          opacity: hud.isNitroActive ? 0.55 : hud.isDrafting ? 0.25 : 0,
          boxShadow: hud.isNitroActive
            ? 'inset 0 0 90px rgba(56, 189, 248, 0.55)'
            : 'inset 0 0 65px rgba(245, 158, 11, 0.35)',
        }}
      />

      {/* Floating 3D-Projected Rival Position Tags (honoring Image 4!) */}
      {phase === 'racing' &&
        hud.rivalMarkers.map((m) => (
          <div
            key={m.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
            style={{
              left: `${m.screenX}px`,
              top: `${m.screenY}px`,
            }}
          >
            <div className="flex flex-col items-center">
              <div
                className="rounded px-2 py-0.5 font-display text-xs font-bold text-white shadow-md whitespace-nowrap"
                style={{
                  backgroundColor: 'rgba(10, 15, 28, 0.88)',
                  borderBottom: `2px solid ${m.color}`,
                }}
              >
                {t.ordinal(m.rank)}
              </div>
              <div className="h-1.5 w-0.5 bg-white/60" />
            </div>
          </div>
        ))}

      {/* TOP HUD BAR: Left POS · Center Race Progress · Right Curved Speedometer */}
      <div className="flex items-start justify-between p-3 sm:p-5">
        {/* Top-Left: Position & Live Timer (honoring screenshots' POS block) */}
        <div className="rounded-xl border border-white/12 bg-[#070b14]/86 px-3.5 py-2.5 shadow-lg">
          <div className="text-[11px] font-bold tracking-wider text-sky-400">
            {t.posLabel}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-3xl sm:text-4xl font-extrabold italic leading-none tabular-nums ${
                hud.position === 1
                  ? 'text-amber-400'
                  : hud.position <= 3
                    ? 'text-emerald-400'
                    : 'text-rose-500'
              }`}
            >
              {t.ordinal(hud.position)}
            </span>
            <span className="font-display text-xs font-semibold text-slate-400 tabular-nums">
              / {hud.totalRacers}
            </span>
          </div>
          <div className="mt-1 font-display text-xs font-semibold text-slate-300 tabular-nums">
            {formatTimer(hud.elapsedSec)}
          </div>
        </div>

        {/* Top-Center: Race Number ("1레이스" / "RACE 1") + Progress Bar with Checkered Flag */}
        <div className="flex flex-col items-center mx-2 w-44 sm:w-64">
          <div className="mb-1 flex items-center gap-2 text-center">
            <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] whitespace-nowrap">
              {t.raceLabel(race.id)}
            </span>
            <span className="hidden sm:inline text-xs font-medium text-slate-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] whitespace-nowrap">
              · {language === 'ko' ? race.nameKo : race.nameEn}
            </span>
          </div>

          <div className="relative flex h-5 w-full items-center rounded-md border border-white/15 bg-[#070b14]/88 px-1.5 shadow-md">
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-slate-800">
              {/* Green progress fill like screenshots */}
              <div
                className="h-full rounded-sm transition-transform duration-75 origin-left"
                style={{
                  width: '100%',
                  transform: `scaleX(${hud.progress})`,
                  background: hud.isNitroActive
                    ? 'linear-gradient(90deg, #0ea5e9, #38bdf8)'
                    : 'linear-gradient(90deg, #16a34a, #4ade80)',
                }}
              />
              {/* Rival dots along bar */}
              {hud.rivalProgressList.map((rv) => (
                <div
                  key={rv.id}
                  className="absolute top-1/2 h-2 w-1.5 -translate-y-1/2 rounded-xs border border-black/50"
                  style={{
                    left: `${Math.min(97, rv.progress * 100)}%`,
                    backgroundColor: rv.color,
                  }}
                />
              ))}
            </div>
            <Flag className="ml-1.5 h-3.5 w-3.5 text-white shrink-0" />
          </div>
        </div>

        {/* Top-Right: Curved Speedometer & Gear Gauge (honoring screenshots!) */}
        <div className="relative flex items-center justify-end rounded-xl border border-white/12 bg-[#070b14]/86 px-3.5 py-2 shadow-lg min-w-[126px] sm:min-w-[148px]">
          <svg
            viewBox="0 0 110 74"
            className="h-14 w-24 sm:h-16 sm:w-28 overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="velotexSpeedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="55%" stopColor="#fb7185" />
                <stop offset="100%" stopColor={hud.isNitroActive ? '#38bdf8' : '#ef4444'} />
              </linearGradient>
            </defs>
            {/* Track arc */}
            <path
              d="M 14 8 L 14 42 Q 14 64 38 64 L 104 64"
              fill="none"
              stroke="rgba(148, 163, 184, 0.25)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Active speed arc */}
            <path
              d="M 14 8 L 14 42 Q 14 64 38 64 L 104 64"
              fill="none"
              stroke="url(#velotexSpeedGrad)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={arcTotal}
              strokeDashoffset={arcOffset}
            />
          </svg>

          <div className="absolute right-3.5 top-1.5 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-display text-[11px] font-bold text-amber-400 tabular-nums">
                {language === 'ko' ? `${hud.gear}${t.gearLabel}` : `G${hud.gear}`}
              </span>
              <span className="text-[11px] font-medium text-slate-400">{t.speedUnit}</span>
            </div>
            <div
              className={`font-display text-2xl sm:text-3xl font-extrabold italic leading-tight tabular-nums ${
                hud.isNitroActive ? 'text-sky-300' : 'text-white'
              }`}
            >
              {hud.speedKmh}
            </div>
          </div>
        </div>
      </div>

      {/* Countdown Center Sequence (3 - 2 - 1 - GO!) */}
      {phase === 'countdown' && (
        <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center">
          <div className="mb-3 text-xs font-bold tracking-widest text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            {t.ready}
          </div>
          <div
            key={hud.countdownValue}
            className={`animate-countdown font-display text-7xl sm:text-8xl font-extrabold italic drop-shadow-[0_6px_28px_rgba(0,0,0,0.85)] ${
              hud.countdownValue === 0 ? 'text-emerald-400' : 'text-white'
            }`}
          >
            {hud.countdownValue === 0 ? t.go : hud.countdownValue}
          </div>
        </div>
      )}

      {/* Dynamic Action Callout (SLIPSTREAM, NEAR MISS, NITRO, OVERTAKE) */}
      {phase === 'racing' && callout && (
        <div
          key={callout.id}
          className={`animate-callout pointer-events-none fixed left-1/2 top-24 sm:top-28 rounded-lg border px-4 py-1.5 font-display text-sm sm:text-base font-extrabold italic tracking-wide shadow-xl whitespace-nowrap ${
            getCalloutCopy(callout.type).color
          }`}
        >
          {getCalloutCopy(callout.type).text}
        </div>
      )}

      {/* Lower-Left Interactive Touch Brake Button */}
      {phase === 'racing' && (
        <div className="pointer-events-auto fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-4 sm:bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:left-6">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore if pointer capture unavailable
              }
              onBrakePress(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              onBrakePress(false);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              onBrakePress(false);
            }}
            onLostPointerCapture={() => onBrakePress(false)}
            className={`flex h-16 w-16 sm:h-18 sm:w-18 flex-col items-center justify-center rounded-full border transition-transform active:scale-95 cursor-pointer ${
              hud.isBraking
                ? 'border-rose-400 bg-rose-600/45 shadow-[0_0_24px_rgba(244,63,94,0.6)]'
                : 'border-white/25 bg-[#080f20]/90 hover:border-rose-400/80'
            }`}
            aria-label={t.brakeLabel}
          >
            <Octagon className={`h-5 w-5 ${hud.isBraking ? 'text-rose-200' : 'text-rose-400'}`} />
            <span className="mt-0.5 font-display text-[11px] font-extrabold tracking-tight text-white">
              {t.brakeLabel}
            </span>
          </button>
        </div>
      )}

      {/* Lower-Right Interactive NOS Boost Button (uses pointer capture & never disables mid-press) */}
      {phase === 'racing' && (
        <div className="pointer-events-auto fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] right-4 sm:bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:right-6">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore if pointer capture unavailable
              }
              onNitroPress(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              onNitroPress(false);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              onNitroPress(false);
            }}
            onLostPointerCapture={() => onNitroPress(false)}
            aria-disabled={hud.nitroCharge < 5}
            className={`relative flex h-18 w-18 sm:h-20 sm:w-20 flex-col items-center justify-center rounded-full border transition-transform active:scale-95 cursor-pointer ${
              hud.isNitroActive
                ? 'border-sky-300 bg-sky-500/35 shadow-[0_0_28px_rgba(56,189,248,0.65)]'
                : hud.nitroCharge >= 10
                  ? 'border-white/25 bg-[#080f20]/90 hover:border-sky-400'
                  : 'border-white/10 bg-[#080f20]/60 opacity-60'
            }`}
            aria-label="Nitro Boost"
          >
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 68 68">
              <circle
                cx="34"
                cy="34"
                r="30"
                fill="none"
                stroke="rgba(148,163,184,0.22)"
                strokeWidth="4"
              />
              <circle
                cx="34"
                cy="34"
                r="30"
                fill="none"
                stroke={hud.isNitroActive ? '#38bdf8' : '#0ea5e9'}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeDasharray={nitroRingTotal}
                strokeDashoffset={nitroRingOffset}
              />
            </svg>
            <Flame
              className={`h-5 w-5 ${
                hud.isNitroActive ? 'text-sky-200' : 'text-sky-400'
              }`}
            />
            <span className="font-display text-xs font-extrabold tracking-tight text-white">
              {t.nosLabel}
            </span>
            <span className="font-display text-[10px] font-bold text-sky-300 tabular-nums">
              {hud.nitroCharge}%
            </span>
          </button>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock (Wraps cleanly on narrow mobile & respects safe-area) */}
      <div className="pointer-events-auto fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex w-[calc(100%-1rem)] max-w-fit -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((prev) => !prev)}
          className="mb-1 flex items-center gap-1 rounded-t-lg border border-b-0 border-white/12 bg-[#070b14]/88 px-3 py-1 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
        >
          {dockOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span>{dockOpen ? t.hideControls : t.showControls}</span>
        </button>

        <div
          className={`flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-white/12 bg-[#070b14]/90 px-2 py-1.5 sm:px-2.5 sm:py-2 shadow-2xl transition-all duration-200 ${
            dockOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0 h-0 py-0 overflow-hidden'
          }`}
        >
          {/* Utility Row (Auto-Gas, Audio, Language, Pause) — always visible on mobile */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Auto-Gas Toggle */}
            <button
              type="button"
              onClick={onToggleAutoGas}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-2.5 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoGas ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Gauge className="h-3.5 w-3.5" />
              <span>{autoGas ? t.autoGasOn : t.autoGasOff}</span>
            </button>

            {/* Engine Sound Toggle */}
            <button
              type="button"
              onClick={onToggleMuted}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title={muted ? t.soundOff : t.soundOn}
              aria-label={muted ? t.soundOff : t.soundOn}
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-sky-400" />}
            </button>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={onToggleLanguage}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5 text-amber-400" />
              <span>{language === 'ko' ? 'EN' : 'KO'}</span>
            </button>

            {/* Pause Button */}
            <button
              type="button"
              onClick={phase === 'paused' ? onResume : onPause}
              className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={t.paused}
            >
              {phase === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Pause Modal Overlay */}
      {phase === 'paused' && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#080d18] p-6 shadow-2xl">
            <div className="text-xs font-semibold text-sky-400">
              {t.raceLabel(race.id)} · {language === 'ko' ? race.nameKo : race.nameEn}
            </div>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
              {t.paused}
            </h2>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-display text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{t.resume}</span>
              </button>

              <button
                type="button"
                onClick={onRestart}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#10182b] px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-[#17223c] transition-colors cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>{t.restart}</span>
              </button>

              <button
                type="button"
                onClick={onExitToMenu}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/8 hover:text-white transition-colors cursor-pointer"
              >
                <span>{t.backToMenu}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
