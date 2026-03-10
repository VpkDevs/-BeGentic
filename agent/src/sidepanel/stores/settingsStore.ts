import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

// Settings schema
const SettingsSchema = z.object({
  fontSize: z.number().min(13).max(21).default(16),  // Font size in pixels
  theme: z.enum(['light', 'dark', 'gray']).default('light'),  // App theme
  autoScroll: z.boolean().default(true),  // Auto-scroll chat to bottom
  autoCollapseTools: z.boolean().default(false),  // Auto-collapse tool results
  chatMode: z.boolean().default(false),  // Chat mode for Q&A (uses ChatAgent instead of BrowserAgent)
  focusMode: z.boolean().default(false),  // Focus mode: block distracting sites
  blockedSites: z.array(z.string()).default([])  // List of sites to block in focus mode
})

type Settings = z.infer<typeof SettingsSchema>

// Store actions
interface SettingsActions {
  setFontSize: (size: number) => void
  setTheme: (theme: 'light' | 'dark' | 'gray') => void
  setAutoScroll: (enabled: boolean) => void
  setAutoCollapseTools: (enabled: boolean) => void
  setChatMode: (enabled: boolean) => void
  setFocusMode: (enabled: boolean) => void
  addBlockedSite: (site: string) => void
  removeBlockedSite: (site: string) => void
  resetSettings: () => void
}

// Initial state
const initialState: Settings = {
  fontSize: 16,
  theme: 'light',
  autoScroll: true,
  autoCollapseTools: false,
  chatMode: false,
  focusMode: false,
  blockedSites: ['twitter.com', 'x.com', 'facebook.com', 'reddit.com', 'youtube.com', 'instagram.com', 'tiktok.com']
}

// Create the store with persistence
export const useSettingsStore = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      // State
      ...initialState,
      
      // Actions
      setFontSize: (size) => {
        set({ fontSize: size })
        // Apply font size to document
        document.documentElement.style.setProperty('--app-font-size', `${size}px`)
      },
      
      setTheme: (theme) => {
        set({ theme })
        // Apply theme classes to document
        const root = document.documentElement
        root.classList.remove('dark')
        root.classList.remove('gray')
        if (theme === 'dark') root.classList.add('dark')
        if (theme === 'gray') root.classList.add('gray')
      },
      
      setAutoScroll: (enabled) => {
        set({ autoScroll: enabled })
      },
      
      setAutoCollapseTools: (enabled) => {
        set({ autoCollapseTools: enabled })
      },
      
      setChatMode: (enabled) => {
        set({ chatMode: enabled })
      },
      
      setFocusMode: (enabled) => {
        set({ focusMode: enabled })
        // Persist focus mode state to chrome.storage for background script access
        try {
          chrome.storage?.local?.set({ 'nxtscape-focus-mode': enabled })
        } catch { /* ignore in non-extension contexts */ }
      },

      addBlockedSite: (site) => {
        const normalized = site.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
        if (!normalized) return
        set(state => ({
          blockedSites: state.blockedSites.includes(normalized)
            ? state.blockedSites
            : [...state.blockedSites, normalized]
        }))
      },

      removeBlockedSite: (site) => {
        set(state => ({
          blockedSites: state.blockedSites.filter(s => s !== site)
        }))
      },
      
      resetSettings: () => {
        set(initialState)
        // Reset document styles
        document.documentElement.style.removeProperty('--app-font-size')
        document.documentElement.classList.remove('dark')
        document.documentElement.classList.remove('gray')
      }
    }),
    {
      name: 'nxtscape-settings',  // localStorage key
      version: 6,
      migrate: (persisted: any, version: number) => {
        // Migrate from v1 isDarkMode -> theme
        if (version === 1 && persisted) {
          const isDarkMode: boolean = persisted.isDarkMode === true
          const next = {
            fontSize: typeof persisted.fontSize === 'number' ? persisted.fontSize : 16,
            theme: isDarkMode ? 'dark' : 'light'
          }
          return next
        }
        // Migrate to v3 add autoScroll default true
        if (version === 2 && persisted) {
          return {
            fontSize: typeof persisted.fontSize === 'number' ? persisted.fontSize : 16,
            theme: persisted.theme === 'dark' || persisted.theme === 'gray' ? persisted.theme : 'light',
            autoScroll: true
          } as Settings
        }
        // Migrate to v4 add autoCollapseTools default false
        if (version === 3 && persisted) {
          return {
            fontSize: typeof persisted.fontSize === 'number' ? persisted.fontSize : 16,
            theme: persisted.theme === 'dark' || persisted.theme === 'gray' ? persisted.theme : 'light',
            autoScroll: typeof persisted.autoScroll === 'boolean' ? persisted.autoScroll : true,
            autoCollapseTools: false,
            chatMode: false
          } as Settings
        }
        // Migrate to v5 add chatMode default false
        if (version === 4 && persisted) {
          return {
            fontSize: typeof persisted.fontSize === 'number' ? persisted.fontSize : 16,
            theme: persisted.theme === 'dark' || persisted.theme === 'gray' ? persisted.theme : 'light',
            autoScroll: typeof persisted.autoScroll === 'boolean' ? persisted.autoScroll : true,
            autoCollapseTools: typeof persisted.autoCollapseTools === 'boolean' ? persisted.autoCollapseTools : false,
            chatMode: false
          } as Settings
        }
        // Migrate to v6 add focusMode and blockedSites
        if (version === 5 && persisted) {
          return {
            ...persisted,
            focusMode: false,
            blockedSites: initialState.blockedSites
          } as Settings
        }
        return persisted as Settings
      }
    }
  )
) 
