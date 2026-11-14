import type {
  Alert,
  DeliveryLog,
  Device,
  Preferences,
  TaskItem,
  ThemePreference,
} from './types';
import seed from '../data/seed.json';

export const STATE_KEY = 'alerthub:state:v1';
export const API_KEY_KEY = 'alerthub:webhook-key:v1';

export interface HubState {
  readIds: number[];
  starredIds: number[];
  archivedIds: number[];
  deletedIds: number[];
  localAlerts: Alert[];
  tasks: TaskItem[];
  preferences: Preferences;
  devices: Device[];
  localLogs: DeliveryLog[];
  /** Per-source enabled overrides, keyed by source.key. */
  sourceEnabled: Record<string, boolean>;
}

export const defaultPreferences: Preferences = seed.preferences as Preferences;

function defaultState(): HubState {
  return {
    readIds: [],
    starredIds: [],
    archivedIds: [],
    deletedIds: [],
    localAlerts: [],
    tasks: (seed.tasks as TaskItem[]) ?? [],
    preferences: { ...defaultPreferences },
    devices: [],
    localLogs: [],
    sourceEnabled: {},
  };
}

export function loadState(): HubState {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<HubState>;
    // Theme migration (Glass Navy default): the old default was 'system',
    // which followed a light OS into Light mode. A stored 'system' value —
    // or anything that is not an explicit 'light' — now resolves to Dark.
    // An explicit stored 'light' choice is still respected.
    const storedTheme = (parsed.preferences as Partial<Preferences> | undefined)
      ?.theme;
    const theme: ThemePreference = storedTheme === 'light' ? 'light' : 'dark';
    return {
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds : base.readIds,
      starredIds: Array.isArray(parsed.starredIds)
        ? parsed.starredIds
        : base.starredIds,
      archivedIds: Array.isArray(parsed.archivedIds)
        ? parsed.archivedIds
        : base.archivedIds,
      deletedIds: Array.isArray(parsed.deletedIds)
        ? parsed.deletedIds
        : base.deletedIds,
      localAlerts: Array.isArray(parsed.localAlerts)
        ? parsed.localAlerts
        : base.localAlerts,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : base.tasks,
      preferences: { ...base.preferences, ...(parsed.preferences ?? {}), theme },
      devices: Array.isArray(parsed.devices) ? parsed.devices : base.devices,
      localLogs: Array.isArray(parsed.localLogs)
        ? parsed.localLogs
        : base.localLogs,
      sourceEnabled:
        parsed.sourceEnabled && typeof parsed.sourceEnabled === 'object'
          ? parsed.sourceEnabled
          : base.sourceEnabled,
    };
  } catch {
    return base;
  }
}

export function saveState(state: HubState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — state stays in memory for this session.
  }
}

/** Apply the theme preference to <html data-theme>. Glass Navy Dark is the
 *  default; any legacy/unrecognised value (including the old 'system'
 *  preference) resolves to Dark. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  const resolved: 'light' | 'dark' = theme === 'light' ? 'light' : 'dark';
  root.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#071426' : '#F2F6FC');
}

/** Merge seed alerts with local overrides (read/star/archive/delete + local alerts). */
export function applyOverrides(seedAlerts: Alert[], state: HubState): Alert[] {
  const read = new Set(state.readIds);
  const starred = new Set(state.starredIds);
  const deleted = new Set(state.deletedIds);
  const merged = seedAlerts
    .filter((a) => !deleted.has(a.id))
    .map((a) => ({
      ...a,
      isRead: read.has(a.id) ? true : a.isRead,
      isStarred: starred.has(a.id) ? true : a.isStarred,
    }));
  const local = state.localAlerts
    .filter((a) => !deleted.has(a.id))
    .map((a) => ({
      ...a,
      isRead: read.has(a.id) ? true : a.isRead,
      isStarred: starred.has(a.id) ? true : a.isStarred,
    }));
  return [...local, ...merged].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export function loadApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_KEY);
  } catch {
    return null;
  }
}

export function saveApiKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(API_KEY_KEY, key);
    else localStorage.removeItem(API_KEY_KEY);
  } catch {
    // ignore
  }
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return (
    'ah_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}
