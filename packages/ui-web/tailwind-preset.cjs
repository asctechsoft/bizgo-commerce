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
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
};
