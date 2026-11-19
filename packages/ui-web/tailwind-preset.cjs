/** Shared Tailwind preset (tokens from the prototype). Breakpoints per Spec §10.1. */
module.exports = {
  theme: {
    screens: {
      // mobile <= 680 is the base; sm = tablet 681+, md = 981+ (prototype 980 break), lg = desktop 1200+
      sm: '681px',
      md: '981px',
      lg: '1200px',
    },
    extend: {
      colors: {
        green: { DEFAULT: '#176a3a', deep: '#104b2a', mint: '#e9f7ed', soft: '#f5f8f4' },
        ink: '#1c2c24',
        muted: '#5f6f66',
        line: '#e3ebe4',
        orange: { DEFAULT: '#f67829', deep: '#c9560f' },
        danger: '#b3261e',
        focus: '#7edc99',
      },
      borderRadius: { card: '18px', control: '11px' },
      boxShadow: { card: '0 12px 40px #184b2c12' },
      maxWidth: { page: '1240px' },
      fontFamily: {
        sans: ['var(--font-be-vietnam)', 'Be Vietnam Pro', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        // Loader icon: grows from tiny to full size with a small overshoot, then settles.
        'bg-pop': {
          '0%': { transform: 'scale(0.1)', opacity: '0' },
          '60%': { transform: 'scale(1.12)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // After the pop-in, the icon breathes gently while loading continues.
        'bg-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
        'bg-orbit': { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'bg-pop': 'bg-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'bg-breathe': 'bg-breathe 2s ease-in-out 0.7s infinite',
        'bg-orbit': 'bg-orbit 1.1s linear infinite',
      },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
};
