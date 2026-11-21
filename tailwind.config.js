/** Love Locks design system — see DESIGN.md */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: { 950: '#0b0d1a', 900: '#12152a', 800: '#1b1f3a', 700: '#262b4d' },
        seine: { 500: '#3d6a8c', 400: '#5a8db3' },
        brass: { 300: '#f3d9a4', 400: '#e8c27a', 500: '#d4a14f', 600: '#b07f33' },
        rose: { 300: '#f4b6c2', 400: '#ec8fa3', 500: '#d9607d' },
        ivory: '#fbf6ec',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 40px -8px rgba(232,194,122,.45)' },
      keyframes: {
        toast: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'none' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-8px)' }, '40%,80%': { transform: 'translateX(8px)' } },
        twinkle: { '0%,100%': { opacity: 0.2 }, '50%': { opacity: 1 } },
        floatUp: { from: { transform: 'translateY(0) scale(1)', opacity: 0.9 }, to: { transform: 'translateY(-160px) scale(.3)', opacity: 0 } },
        fadeIn: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        toast: 'toast .25s ease-out',
        shake: 'shake .45s ease-in-out',
        twinkle: 'twinkle 1.6s ease-in-out infinite',
        'float-up': 'floatUp 2.2s ease-out infinite',
        'fade-in': 'fadeIn .9s ease-out forwards',
      },
    },
  },
  plugins: [],
};
