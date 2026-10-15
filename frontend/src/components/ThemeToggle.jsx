import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle, touch = false, withLabel = false }) {
  const isDark = theme === 'dark';
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`btn ${touch ? 'btn-touch' : ''} ${withLabel ? '' : 'w-9 px-0'}`}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {withLabel && <span>{isDark ? 'Light theme' : 'Dark theme'}</span>}
    </button>
  );
}
