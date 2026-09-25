/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Mirrors apps/mobile `theme.ds.light` (bright, cool, consumer).
        brand: '#2563EB',
        'brand-hover': '#1D4ED8',
        'brand-soft': '#E8F0FF',

        tertiary: { DEFAULT: '#0E7490', soft: '#E0F5F9' },
        coral: { DEFAULT: '#FF7A66', soft: '#FFEDEA' },
        mint: { DEFAULT: '#22C29A', soft: '#E3F8F1' },
        rose: { DEFAULT: '#FF6F91', soft: '#FFEBF0' },
        sky: '#38BDF8',
        sun: '#FFC24B',
        positive: '#0B8A67',
        caution: { DEFAULT: '#A1510A', soft: '#FFF3E0' },
        danger: { DEFAULT: '#C92F42', soft: '#FFE9EC' },

        primary: '#10131F',
        secondary: '#2563EB',
        success: '#0E9F77',
        warning: '#B25E09',
        error: '#D8394B',
        neutral: '#6B7288',

        background: '#F5F6FB',
        surface: {
          DEFAULT: '#FFFFFF',
          dim: '#F5F6FB',
          subtle: '#EEF0F7',
          hover: '#E6E8F1',
          pressed: '#D3D7E4',
          emphasis: '#C9CEDC',
        },

        text: {
          DEFAULT: '#10131F',
          subtle: '#555C72',
          muted: '#7A8197',
        },

        border: {
          DEFAULT: '#E6E8F1',
          subtle: '#EEF0F7',
          strong: '#D3D7E4',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'system-ui',
          'sans-serif',
        ],
        mono: ['SF Mono', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['15px', { lineHeight: '24px' }],
        lg: ['17px', { lineHeight: '26px' }],
        xl: ['19px', { lineHeight: '28px' }],
        '2xl': ['22px', { lineHeight: '30px' }],
        '3xl': ['28px', { lineHeight: '34px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
        '5xl': ['48px', { lineHeight: '52px' }],
        '6xl': ['60px', { lineHeight: '62px' }],
        '7xl': ['72px', { lineHeight: '72px' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        '3xl': '32px',
        '4xl': '40px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(16, 19, 31, 0.04)',
        DEFAULT: '0 2px 10px 0 rgba(16, 19, 31, 0.06)',
        md: '0 6px 20px 0 rgba(16, 19, 31, 0.08)',
        lg: '0 14px 40px 0 rgba(16, 19, 31, 0.10)',
        xl: '0 24px 64px 0 rgba(16, 19, 31, 0.14)',
        phone: '0 40px 80px -20px rgba(37, 99, 235, 0.25), 0 20px 40px -20px rgba(16, 19, 31, 0.25)',
      },
      backgroundImage: {
        'grad-blue': 'linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)',
        'grad-coral': 'linear-gradient(135deg, #FF8A6B 0%, #FFB86B 100%)',
        'grad-mint': 'linear-gradient(135deg, #2BCFA3 0%, #4DA3FF 100%)',
        'grad-rose': 'linear-gradient(135deg, #FF6F91 0%, #FF9E7A 100%)',
        'grad-sky': 'linear-gradient(135deg, #4DA3FF 0%, #6FE0E8 100%)',
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
