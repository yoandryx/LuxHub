import { useState, useEffect, useCallback } from 'react';

export type UrgencyLevel = 'normal' | 'amber' | 'red' | 'expired';

export interface CountdownResult {
  timeRemaining: number;
  displayText: string;
  urgencyLevel: UrgencyLevel;
  progress: number;
  isExpired: boolean;
}

const DEFAULTS: CountdownResult = {
  timeRemaining: 0,
  displayText: '',
  urgencyLevel: 'normal',
  progress: 0,
  isExpired: false,
};

const DEFAULT_TOTAL_MS = 48 * 60 * 60 * 1000; // 48h fallback

function computeCountdown(
  targetDate: string | Date | undefined,
  startDate?: string | Date
): CountdownResult {
  if (!targetDate) return DEFAULTS;

  const now = Date.now();
  const target = new Date(targetDate).getTime();
  const remaining = target - now;

  if (remaining <= 0) {
    return {
      timeRemaining: 0,
      displayText: 'Expired',
      urgencyLevel: 'expired',
      progress: 1,
      isExpired: true,
    };
  }

  // Urgency thresholds
  let urgencyLevel: UrgencyLevel = 'normal';
  if (remaining < 3_600_000) {
    urgencyLevel = 'red';
  } else if (remaining < 14_400_000) {
    urgencyLevel = 'amber';
  }

  // Progress (fraction elapsed)
  const start = startDate ? new Date(startDate).getTime() : target - DEFAULT_TOTAL_MS;
  const totalDuration = target - start;
  const elapsed = now - start;
  const progress = totalDuration > 0 ? Math.min(1, Math.max(0, elapsed / totalDuration)) : 0;

  // Display text
  const totalMinutes = Math.floor(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const displayText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return {
    timeRemaining: remaining,
    displayText,
    urgencyLevel,
    progress,
    isExpired: false,
  };
}

export function useCountdown(
  targetDate: string | Date | undefined,
  startDate?: string | Date,
  intervalMs: number = 60_000
): CountdownResult {
  const calculate = useCallback(
    () => computeCountdown(targetDate, startDate),
    [targetDate, startDate]
  );

  const [result, setResult] = useState<CountdownResult>(calculate);

  useEffect(() => {
    if (!targetDate) {
      setResult(DEFAULTS);
      return;
    }

    // Recalculate immediately
    setResult(calculate());

    const id = setInterval(() => {
      setResult(calculate());
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [targetDate, calculate, intervalMs]);

  return result;
}
