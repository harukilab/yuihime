/**
 * DualClock — Yui punya dua referensi waktu:
 *  - UTC      : referensi internasional (reset, sinkronisasi global, ISO).
 *  - Local    : waktu lokasi user, dikonfigurasi lewat `circadian-rhythm.timezoneOffsetHours`
 *               (default GMT+7 / WIB). Dipakai untuk cron chan & konteks waktu yang dikirim ke LLM.
 */
import { SettingsManager } from '../kernel/settings.js';

export const DEFAULT_TZ_OFFSET_HOURS = 7;

type SettingsLike = Record<string, any> | null | undefined;

/**
 * Ambil offset timezone lokal (GMT+X). Prioritas:
 * 1. settings map lengkap (`settings['circadian-rhythm'].timezoneOffsetHours`)
 * 2. objek config circadian langsung (`settings.timezoneOffsetHours`)
 * 3. SettingsManager (fallback global)
 */
export function getTzOffsetHours(settings?: SettingsLike): number {
  let off: any;
  if (settings && typeof settings === 'object') {
    const circ = settings['circadian-rhythm'] ?? settings.circadian;
    off = circ?.timezoneOffsetHours;
    if (off === undefined) off = (settings as any).timezoneOffsetHours;
  }
  if (off === undefined) {
    try {
      const all = SettingsManager.getInstance().getAll();
      off = all?.['circadian-rhythm']?.timezoneOffsetHours;
    } catch {
      off = undefined;
    }
  }
  const n = Number(off);
  return Number.isFinite(n) ? n : DEFAULT_TZ_OFFSET_HOURS;
}

/**
 * Ubah momen UTC menjadi Date "lokal" (wall-clock bergeser sesuai offset).
 * getHours()/getMinutes()/getDate()/getDay() dari hasil ini = waktu lokal user.
 */
export function toLocalClock(offsetHours: number, date?: Date): Date {
  const d = date ? new Date(date.getTime()) : new Date();
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + offsetHours * 3600000);
}

export function nowLocal(settings?: SettingsLike): Date {
  return toLocalClock(getTzOffsetHours(settings));
}

export function localDateParts(offsetHours: number, date?: Date): {
  hour: number;
  minute: number;
  second: number;
  day: number;
  month: number;
  year: number;
  weekday: number;
} {
  const d = toLocalClock(offsetHours, date);
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    day: d.getDate(),
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    weekday: d.getDay()
  };
}

export function formatLocalTime(offsetHours: number, date?: Date): string {
  const p = localDateParts(offsetHours, date);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  const ss = String(p.second).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatLocalDateKey(offsetHours: number, date?: Date): string {
  const p = localDateParts(offsetHours, date);
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
  return `${p.year}-${m}-${d}`;
}

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatLocalFull(offsetHours: number, date?: Date): string {
  const p = localDateParts(offsetHours, date);
  return `${DAY_NAMES_ID[p.weekday]}, ${p.day} ${MONTH_NAMES_ID[p.month - 1]} ${p.year}, ${formatLocalTime(offsetHours, date)}`;
}

export function formatLocalFullEn(offsetHours: number, date?: Date): string {
  const p = localDateParts(offsetHours, date);
  return `${DAY_NAMES_EN[p.weekday]}, ${MONTH_NAMES_EN[p.month - 1]} ${p.day}, ${p.year}, ${formatLocalTime(offsetHours, date)}`;
}

export function formatUtcIso(date?: Date): string {
  return (date || new Date()).toISOString();
}

/** Label zona lokal, mis. "GMT+7". */
export function tzLabel(offsetHours: number): string {
  const sign = offsetHours >= 0 ? '+' : '-';
  return `GMT${sign}${Math.abs(offsetHours)}`;
}

/** Ringkasan blok waktu untuk prompt LLM (UTC + Local). */
export function dualClockPromptBlock(settings?: SettingsLike): string {
  const offset = getTzOffsetHours(settings);
  return [
    `- **Current Time (UTC)**: ${formatUtcIso()}`,
    `- **Current Time (Local)**: ${formatLocalFullEn(offset)} (${tzLabel(offset)})`
  ].join('\n');
}

/** Daypart Indonesia berdasarkan jam lokal. */
export function localDaypart(offsetHours: number, date?: Date): string {
  const hour = localDateParts(offsetHours, date).hour;
  if (hour >= 5 && hour < 11) return 'Pagi';
  if (hour >= 11 && hour < 15) return 'Siang';
  if (hour >= 15 && hour < 19) return 'Sore';
  return 'Malam';
}
