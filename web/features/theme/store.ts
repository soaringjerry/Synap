"use client"
import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'
type NeonLevel = 'low' | 'medium' | 'high'
type MotionLevel = 'off' | 'low' | 'on'

type ThemeState = {
  theme: ThemeMode
  neon: NeonLevel
  motion: MotionLevel
  setTheme: (t: ThemeMode) => void
  setNeon: (n: NeonLevel) => void
  setMotion: (m: MotionLevel) => void
}

const key = 'synap:ui'

function applyDOM({ theme, neon, motion }: { theme: ThemeMode; neon: NeonLevel; motion: MotionLevel }) {
  const root = document.documentElement
  root.classList.toggle('light', theme === 'light')
  root.style.setProperty('--neon-intensity', { low: '0.4', medium: '0.7', high: '1' }[neon])
  root.dataset.motion = motion
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  neon: 'medium',
  motion: 'on',
  setTheme: (theme) => { set({ theme }); if (typeof window !== 'undefined') { const s = { ...get(), theme }; localStorage.setItem(key, JSON.stringify(s)); applyDOM(s) } },
  setNeon: (neon) => { set({ neon }); if (typeof window !== 'undefined') { const s = { ...get(), neon }; localStorage.setItem(key, JSON.stringify(s)); applyDOM(s) } },
  setMotion: (motion) => { set({ motion }); if (typeof window !== 'undefined') { const s = { ...get(), motion }; localStorage.setItem(key, JSON.stringify(s)); applyDOM(s) } },
}))

if (typeof window !== 'undefined') {
  const raw = localStorage.getItem(key)
  if (raw) {
    try { applyDOM(JSON.parse(raw)) } catch {}
  } else {
    applyDOM({ theme: 'dark', neon: 'medium', motion: 'on' })
  }
}

