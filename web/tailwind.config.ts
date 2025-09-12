import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './stories/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)'
        },
        surface: 'var(--surface)',
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)'
        },
        neon: {
          violet: 'var(--neon-violet)',
          cyan: 'var(--neon-cyan)',
          lime: 'var(--neon-lime)'
        },
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)'
      },
      boxShadow: {
        card: '0 8px 30px rgba(0,0,0,0.35)',
        glow: '0 0 10px rgba(124,58,237,0.35), 0 0 24px rgba(34,211,238,0.25)'
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px'
      },
      transitionDuration: {
        fast: '120ms',
        normal: '200ms',
        slow: '320ms'
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)']
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}

export default config

