import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './glass-navy-tokens.css';
import './styles.css';
import { applyTheme, loadState } from './lib/store';

// Apply the saved theme before first paint so there is no flash.
try {
  applyTheme(loadState().preferences.theme);
} catch {
  applyTheme('dark');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration is best-effort; the app works without it.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
