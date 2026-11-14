export type Severity = 'critical' | 'important' | 'normal' | 'low';

export type SourceType = 'email' | 'cuims' | 'task' | 'system' | 'webhook';

/** Smart-priority band for an alert (Phase 9). Distinct from Severity:
 *  severity is the event's own level; Priority is how AlertHub treats it. */
export type Priority = 'critical' | 'high' | 'normal' | 'low';

/** One CUIMS marks change attached to an alert (Phase 7 simulator / ingest). */
export interface AcademicChange {
  subject: string;
  subjectCode?: string;
  assessment: string;
  previous: number | null;
  current: number;
  max: number;
  difference: number;
  direction: 'up' | 'down' | 'new' | 'unchanged';
  /** True only when the change was read from CUIMS. False for simulations. */
  verified: boolean;
  /** True for simulator-generated test events — never real CUIMS data. */
  isSimulation: boolean;
}

/** Per-priority delivery channels a user can toggle in Settings. */
export interface NotificationChannelPrefs {
  sound: boolean;
  vibration: boolean;
  banner: boolean;
  push: boolean;
}

export type SourceStatus = 'ok' | 'connected' | 'unreachable' | 'disabled';

export type DeliveryState = 'delivered' | 'logged' | 'failed' | 'pending';

export interface Alert {
  id: number;
  externalId: string;
  title: string;
  body: string;
  sender: string;
  sourceType: SourceType;
  sourceLabel: string;
  severity: Severity;
  category: string;
  sourceUrl: string | null;
  occurredAt: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  deliveryState: DeliveryState;
  dedupeKey: string;
  /** Optional CUIMS marks change (Phase 7). Present on academic alerts. */
  academic?: AcademicChange;
}

export interface Source {
  id: number;
  key: string;
  kind: string;
  name: string;
  status: SourceStatus;
  detail: string;
  enabled: boolean;
  eventCount: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextCheckAt: string | null;
}

export type ThemePreference = 'light' | 'dark';

export interface Preferences {
  masterEnabled: boolean;
  emailEnabled: boolean;
  cuimsEnabled: boolean;
  taskEnabled: boolean;
  systemEnabled: boolean;
  webhookEnabled: boolean;
  criticalEnabled: boolean;
  importantEnabled: boolean;
  normalEnabled: boolean;
  lowEnabled: boolean;
  digestLow: boolean;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  theme: ThemePreference;
  timezone: string;
  watchedEmail: string;
  /** Per-priority delivery channels (Phase 9). Absent = built-in defaults. */
  priorityPrefs?: Partial<Record<Priority, NotificationChannelPrefs>>;
}

export interface Profile {
  name: string;
  uid: string;
  email: string;
  programme: string;
  section: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueAt: string | null;
  reminders: boolean;
  completed: boolean;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  endpoint: string | null;
  permission: NotificationPermission;
  subscribed: boolean;
  createdAt: string;
  lastTestAt: string | null;
}

export type DeliveryChannel = 'in_app' | 'push' | 'local';

export type DeliveryStatus = 'delivered' | 'failed' | 'shown_locally';

export interface DeliveryLog {
  id: number | string;
  alertId: number | null;
  attemptedAt: string;
  channel: DeliveryChannel;
  detail: string;
  deviceId: string | null;
  status: DeliveryStatus;
}

export interface MarkComponent {
  exam: string;
  /**
   * Marks obtained, or null when CUIMS shows ABSENT for the component.
   * Null rows are excluded from totals/percentages and render as "ABSENT".
   */
  obtained: number | null;
  max: number;
}

export interface SubjectMarks {
  subject: string;
  code: string;
  marks: MarkComponent[];
}

export interface SubjectCredits {
  credits: number;
  /** True when the credit value was verified against the official CU curriculum. */
  verified: boolean;
  note?: string;
}

/** Latest CUIMS marks snapshot (read from the portal, never invented). */
export interface MarksSnapshot {
  session: string;
  checkedAtIst: string;
  note: string;
  subjects: SubjectMarks[];
  /** Per-subject credits keyed by subject code (all verified; see the note for the source). */
  credits?: Record<string, SubjectCredits>;
}

export interface SeedData {
  alerts: Alert[];
  sources: Source[];
  preferences: Preferences;
  profile: Profile;
  tasks: TaskItem[];
  devices: Device[];
  deliveryLogs: DeliveryLog[];
  marks: MarksSnapshot;
  meta: {
    counts: {
      connectedSources: number;
      starred: number;
      today: number;
      total: number;
      totalSources: number;
      unread: number;
    };
    generatedAt: string;
    source: string;
    timezone: string;
    watchedEmail: string;
  };
}

export type View =
  | 'overview'
  | 'alerts'
  | 'email'
  | 'cuims'
  | 'tasks'
  | 'sources'
  | 'devices'
  | 'history'
  | 'settings';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}
