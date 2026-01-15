/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        brand: '#4285f4',
        'brand-hover': '#3b78dc',
        
        // Base colors
        primary: '#0d0f12',
        secondary: '#007AFF',
        success: '#16A34A',
        warning: '#FF9500',
        error: '#FF3B30',
        neutral: '#6B7280',
        
        // Surface colors
        background: '#FFFFFC',
        surface: {
          DEFAULT: '#FFFFFF',
          dim: '#FAFAFA',
          subtle: '#F5F5F5',
          hover: '#EBEBEB',
          pressed: '#E0E0E0',
          emphasis: '#D5D5D5',
        },
        
        // Text colors
        text: {
          DEFAULT: '#202329',
          subtle: 'rgba(32, 35, 41, 0.65)',
          muted: 'rgba(32, 35, 41, 0.45)',
        },
        
        // Border colors
        border: {
          DEFAULT: 'rgba(107, 114, 128, 0.4)',
          subtle: 'rgba(107, 114, 128, 0.2)',
          strong: 'rgba(107, 114, 128, 0.7)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Berkeley Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs': '10px',
        'sm': '12px',
        'base': '14px',
        'lg': '16px',
        'xl': '18px',
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '36px',
        '5xl': '48px',
        '6xl': '60px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'DEFAULT': '0 2px 8px 0 rgba(0, 0, 0, 0.08)',
        'md': '0 4px 16px 0 rgba(0, 0, 0, 0.1)',
        'lg': '0 8px 32px 0 rgba(0, 0, 0, 0.12)',
        'xl': '0 16px 48px 0 rgba(0, 0, 0, 0.16)',
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
        'fade-in-down': 'fade-in-down 0.6s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.6s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.6s ease-out forwards',
        'scale-in': 'scale-in 0.4s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
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
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
