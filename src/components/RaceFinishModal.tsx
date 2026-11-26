import { ChevronRight, Home, RotateCcw, Trophy } from 'lucide-react';
import { RACES } from '../data/races';
import { TRANSLATIONS } from '../i18n/translations';
import { HudTelemetry, Language, RaceConfig } from '../types/game';

interface RaceFinishModalProps {
  language: Language;
  race: RaceConfig;
  hud: HudTelemetry;
  onNextRace: () => void;
  onRestart: () => void;
  onBackToMenu: () => void;
}

function formatFinishTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(2)}`;
}

export function RaceFinishModal({
  language,
  race,
  hud,
  onNextRace,
  onRestart,
  onBackToMenu,
}: RaceFinishModalProps) {
  const t = TRANSLATIONS[language];
  const hasNext = race.id < RACES.length;

  const summaryLine =
    hud.position === 1
      ? t.podiumGold
      : hud.position === 2
        ? t.podiumSilver
        : hud.position === 3
          ? t.podiumBronze
          : t.podiumFinish;

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#080d18] p-5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-semibold text-sky-400">
              {t.raceLabel(race.id)} · {language === 'ko' ? race.nameKo : race.nameEn}
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-white">
              {t.raceComplete}
            </h2>
            <p className="mt-1 text-sm text-slate-300">{summaryLine}</p>
          </div>

          <div className="flex flex-col items-end">
            <Trophy
              className={`h-7 w-7 ${
                hud.position === 1
                  ? 'text-amber-400'
                  : hud.position === 2
                    ? 'text-slate-300'
                    : hud.position === 3
                      ? 'text-amber-600'
                      : 'text-slate-500'
              }`}
            />
            <span className="mt-1 font-display text-4xl font-extrabold italic text-white tabular-nums">
              {t.ordinal(hud.position)}
            </span>
          </div>
        </div>

        {/* Key Performance Metrics */}
        <div className="grid grid-cols-3 gap-3 py-4 border-b border-white/10">
          <div>
            <div className="text-[11px] text-slate-400">{t.raceTime}</div>
            <div className="mt-0.5 font-display text-lg sm:text-xl font-bold text-white tabular-nums">
              {formatFinishTime(hud.elapsedSec)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{t.topSpeed}</div>
            <div className="mt-0.5 font-display text-lg sm:text-xl font-bold text-sky-300 tabular-nums">
              {hud.topSpeedReached} {t.speedUnit}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{t.nearMisses}</div>
            <div className="mt-0.5 font-display text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">
              {hud.nearMissCount}
            </div>
          </div>
        </div>

        {/* Full 6-Car Standings Table */}
        <div className="py-4">
          <div className="mb-2 text-xs font-semibold text-slate-400">{t.standings}</div>
          <div className="divide-y divide-white/8 rounded-xl border border-white/10 bg-[#0b1222]">
            {hud.standings.map((row) => (
              <div
                key={row.id}
                className={`flex items-center justify-between px-3.5 py-2 text-xs sm:text-sm ${
                  row.isPlayer ? 'bg-sky-500/15 font-bold text-white' : 'text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 font-display font-bold tabular-nums text-amber-400">
                    {t.ordinal(row.rank)}
                  </span>
                  <span
                    className="h-2.5 w-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <span>{row.isPlayer ? t.you : row.name}</span>
                </div>
                <div className="font-display tabular-nums text-slate-300">
                  {row.finishTimeSec !== null
                    ? formatFinishTime(row.finishTimeSec)
                    : `${Math.round(row.progress * 100)}%`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onBackToMenu}
            className="flex items-center gap-1.5 rounded-xl border border-white/12 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Home className="h-4 w-4" />
            <span>{t.backToMenu}</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#10192e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#182542] transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t.restart}</span>
          </button>

          {hasNext && (
            <button
              type="button"
              onClick={onNextRace}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <span>{t.nextRace}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
