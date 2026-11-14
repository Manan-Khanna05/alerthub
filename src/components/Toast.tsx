import type { Toast } from '../lib/types';

interface ToastViewProps {
  toast: Toast | null;
  onDismiss: () => void;
}

/** Single-instance toast: only one is ever rendered at a time. */
export function ToastView({ toast, onDismiss }: ToastViewProps) {
  if (!toast) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast glass ${toast.kind}`}>
        <span className="toast-dot" />
        <span>{toast.message}</span>
        <button type="button" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  );
}
