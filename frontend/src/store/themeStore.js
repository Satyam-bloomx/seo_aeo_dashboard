import { create } from 'zustand';

const THEME_STORAGE_KEY = 'auditpro_theme';

const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const applyThemeToDOM = (resolvedTheme) => {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }
};

export const useThemeStore = create((set, get) => ({
  theme: 'system', // 'light' | 'dark' | 'system'
  resolvedTheme: 'light', // 'light' | 'dark'
  mounted: false,

  initTheme: () => {
    if (typeof window === 'undefined') return;

    let savedTheme = 'system';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        savedTheme = stored;
      }
    } catch {
      // localStorage may be restricted in private browsing
    }

    const systemTheme = getSystemTheme();
    const resolvedTheme = savedTheme === 'system' ? systemTheme : savedTheme;

    applyThemeToDOM(resolvedTheme);
    set({ theme: savedTheme, resolvedTheme, mounted: true });

    // Listen for OS system theme changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleMediaChange = (e) => {
        const currentTheme = get().theme;
        if (currentTheme === 'system') {
          const newResolved = e.matches ? 'dark' : 'light';
          applyThemeToDOM(newResolved);
          set({ resolvedTheme: newResolved });
        }
      };

      try {
        mediaQuery.addEventListener('change', handleMediaChange);
      } catch {
        mediaQuery.addListener(handleMediaChange);
      }
    }
  },

  setTheme: (newTheme) => {
    if (typeof window === 'undefined') return;

    const systemTheme = getSystemTheme();
    const resolvedTheme = newTheme === 'system' ? systemTheme : newTheme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // ignore
    }

    applyThemeToDOM(resolvedTheme);
    set({ theme: newTheme, resolvedTheme });
  },

  toggleTheme: () => {
    const currentResolved = get().resolvedTheme;
    const nextTheme = currentResolved === 'dark' ? 'light' : 'dark';
    get().setTheme(nextTheme);
  },
}));
