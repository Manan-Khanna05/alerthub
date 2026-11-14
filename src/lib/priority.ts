/**
 * Smart priority (Phase 9).
 *
 * Priority is how AlertHub treats an alert; Severity is the event's own
 * level. Marks changes are HIGH, never critical by default. Only a
 * severity-'critical' event (e.g. a Vercel security notice) is CRITICAL.
 * Nothing here upgrades every event to critical.
 */
import type {
  Alert,
  NotificationChannelPrefs,
  Priority,
  Severity,
} from './types';

export type { Priority };

export const PRIORITIES: Priority[] = ['critical', 'high', 'normal', 'low'];

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export function priorityOf(alert: Alert): Priority {
  if (alert.severity === 'critical') return 'critical';
  if (
    alert.category === 'academic' ||
    alert.academic !== undefined ||
    alert.sourceType === 'cuims' ||
    alert.severity === 'important'
  )
    return 'high';
  if (alert.severity === 'low') return 'low';
  if (alert.sourceType === 'system') return 'low';
  // Tasks and routine email are normal.
  return 'normal';
}

/** Built-in per-priority channel defaults (used when no preference is saved). */
export function defaultChannelPrefs(priority: Priority): NotificationChannelPrefs {
  switch (priority) {
    case 'critical':
      return { sound: true, vibration: true, banner: true, push: true };
    case 'high':
      return { sound: true, vibration: true, banner: true, push: true };
    case 'normal':
      return { sound: false, vibration: false, banner: true, push: true };
    case 'low':
      return { sound: false, vibration: false, banner: true, push: false };
  }
}

export function channelPrefsFor(
  prefs: Partial<Record<Priority, NotificationChannelPrefs>> | undefined,
  priority: Priority,
): NotificationChannelPrefs {
  return { ...defaultChannelPrefs(priority), ...(prefs?.[priority] ?? {}) };
}

/** Map the simulator's priority select to the alert Severity field. */
export function severityForPriority(priority: Priority): Severity {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'important';
    case 'normal':
      return 'normal';
    case 'low':
      return 'low';
  }
}
