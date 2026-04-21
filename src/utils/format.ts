import { addDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayDateKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function currentTimeKey() {
  return format(new Date(), 'HH:mm');
}

export function shiftDateKey(baseDate: string, amount: number) {
  return format(addDays(parseISO(baseDate), amount), 'yyyy-MM-dd');
}

export function formatLongDate(value: string) {
  try {
    return format(parseISO(value), 'yyyy년 M월 d일', { locale: ko });
  } catch {
    return value;
  }
}

export function formatShortDate(value: string) {
  try {
    return format(parseISO(value), 'M월 d일 (EEE)', { locale: ko });
  } catch {
    return value;
  }
}

export function calculateAge(value?: string) {
  if (!value) return null;

  try {
    const birthDate = parseISO(value);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

export function formatTime(value?: string) {
  if (!value) return '';
  const [h, m] = value.split(':');
  const hours = parseInt(h, 10);
  const period = hours >= 12 ? '오후' : '오전';
  const displayHours = hours % 12 || 12;
  return `${period} ${displayHours}:${m}`;
}

export function formatMonthYear(value: Date | string) {
  const resolved = typeof value === 'string' ? parseISO(value) : value;
  return format(resolved, 'yyyy년 M월', { locale: ko });
}

export function formatDayLabel(value: string) {
  return format(parseISO(value), 'd');
}

export function formatWeekdayLabel(value: string) {
  return format(parseISO(value), 'EEE', { locale: ko });
}

export function formatRelativeDue(value: string) {
  try {
    return formatDistanceToNowStrict(parseISO(value), {
      addSuffix: true,
      locale: ko
    });
  } catch {
    return value;
  }
}

export function formatWeight(value: number) {
  return `${value.toFixed(1)} kg`;
}

export function formatDistanceKm(value: number) {
  return `${value.toFixed(1)} km`;
}

export function formatDurationMinutes(value: number) {
  if (value < 60) {
    return `${Math.round(value)}분`;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

export function formatPace(value: number) {
  const wholeMinutes = Math.floor(value);
  const seconds = Math.round((value - wholeMinutes) * 60);
  const paddedSeconds = `${seconds}`.padStart(2, '0');
  return `${wholeMinutes}:${paddedSeconds} /km`;
}

export function sortByDateDesc<T extends { date: string; time?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const dateComp = right.date.localeCompare(left.date);
    if (dateComp !== 0) return dateComp;
    const timeLeft = left.time || '00:00';
    const timeRight = right.time || '00:00';
    return timeRight.localeCompare(timeLeft);
  });
}
