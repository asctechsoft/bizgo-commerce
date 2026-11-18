/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../../packages/ui-web/tailwind-preset.cjs')],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui-web/src/**/*.{ts,tsx}'],
};
