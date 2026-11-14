import { useState } from 'react';
import type { TaskItem } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { EmptyState } from '../components/Cards';
import { Icon } from '../components/Icons';

interface TasksPageProps {
  tasks: TaskItem[];
  onAddTask: (title: string, dueAt: string | null, reminders: boolean) => void;
  onToggleComplete: (task: TaskItem) => void;
  onDeleteTask: (task: TaskItem) => void;
}

export function TasksPage({
  tasks,
  onAddTask,
  onToggleComplete,
  onDeleteTask,
}: TasksPageProps) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reminders, setReminders] = useState(true);

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddTask(trimmed, dueAt ? new Date(dueAt).toISOString() : null, reminders);
    setTitle('');
    setDueAt('');
  };

  return (
    <div>
      <div className="page-head">
        <h1>Tasks</h1>
        <p>Reminders you add here appear as alerts at their due time.</p>
      </div>

      <div className="card glass glow-blue">
        <h2>Add a task</h2>
        <form onSubmit={submit}>
          <div className="form-inline">
            <div className="field">
              <label htmlFor="task-title">Title</label>
              <input
                id="task-title"
                className="input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Revise COA Unit 3"
                required
              />
            </div>
            <div className="field narrow">
              <label htmlFor="task-due">Due date &amp; time</label>
              <input
                id="task-due"
                className="input"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Add task
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
              />
              Remind me about this task
            </label>
          </div>
        </form>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card glass">
          <h2>Open ({open.length})</h2>
          {open.length === 0 ? (
            <EmptyState
              icon="check"
              title="No open tasks"
              body="Add a task above — completing one posts an alert into your feed."
            />
          ) : (
            open.map((t) => (
              <div className="list-row" key={t.id}>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Complete ${t.title}`}
                  title="Mark complete"
                  onClick={() => onToggleComplete(t)}
                >
                  <Icon name="checkCircle" />
                </button>
                <div className="row-main">
                  <strong>{t.title}</strong>
                  <span>
                    {t.dueAt ? `Due ${formatDateTime(t.dueAt)} IST` : 'No due date'}
                    {t.reminders ? ' · Reminders on' : ' · Reminders off'}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Delete ${t.title}`}
                  title="Delete"
                  onClick={() => onDeleteTask(t)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="card glass">
          <h2>Completed ({done.length})</h2>
          {done.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="Nothing completed yet"
              body="Completed tasks show up here."
            />
          ) : (
            done.map((t) => (
              <div className="list-row task-done" key={t.id}>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Reopen ${t.title}`}
                  title="Reopen"
                  onClick={() => onToggleComplete(t)}
                >
                  <Icon name="refresh" />
                </button>
                <div className="row-main">
                  <strong>{t.title}</strong>
                  <span>
                    {t.dueAt ? `Due ${formatDateTime(t.dueAt)} IST` : 'No due date'}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Delete ${t.title}`}
                  title="Delete"
                  onClick={() => onDeleteTask(t)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
