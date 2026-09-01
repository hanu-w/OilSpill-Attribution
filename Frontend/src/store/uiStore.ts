import { create } from 'zustand';

/**
 * Panel identifiers for the right sidebar
 */
export type PanelId = 'vessels' | 'incidents' | 'layers' | 'settings' | null;

/**
 * Theme options
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * UI store state interface
 */
interface UIState {
  activePanel: PanelId;
  sidebarOpen: boolean;
  theme: Theme;

  // Panel actions
  setActivePanel: (panel: PanelId) => void;
  togglePanel: (panel: PanelId) => void;
  closePanel: () => void;

  // Sidebar actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Theme actions
  setTheme: (theme: Theme) => void;
}

/**
 * UI store for application shell state.
 *
 * Manages active panel, sidebar visibility, and theme settings.
 * These are UI-level concerns that should trigger React updates.
 *
 * See AGENTS.md §6: Use Zustand for active panel and UI state.
 */
export const useUIStore = create<UIState>((set) => ({
  activePanel: null,
  sidebarOpen: true,
  theme: 'system',

  setActivePanel: (panel) =>
    set({ activePanel: panel }),

  togglePanel: (panel) =>
    set((state) => ({
      activePanel: state.activePanel === panel ? null : panel,
    })),

  closePanel: () =>
    set({ activePanel: null }),

  setSidebarOpen: (open) =>
    set({ sidebarOpen: open }),

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setTheme: (theme) =>
    set({ theme }),
}));
