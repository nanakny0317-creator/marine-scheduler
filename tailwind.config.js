/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // パステルカラーテーマ
        lavender: {
          50:  '#f8f5ff',
          100: '#ede9ff',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        mint: {
          50:  '#f0fdf8',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
        },
        peach: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
        },
        sky: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
        },
      },
      // ── 視認性調整 ──────────────────────────────────────────────
      // 背景色はパステルのまま、「文字色」と「境界線」だけを一段濃くする。
      // （text-* / border-* だけに効き、bg-* には影響しない）
      textColor: {
        gray: {
          300: '#9ca3af',   // 元 gray-400 相当
          400: '#6b7280',   // 元 gray-500 相当（補足文・ラベル類）
          500: '#4b5563',   // 元 gray-600 相当
        },
        lavender: {
          300: '#a78bfa',
          400: '#8b5cf6',   // 見出し・リンク文字
        },
      },
      borderColor: {
        lavender: {
          50:  '#ddd4fb',
          100: '#c9bbf7',   // カード・セクションの枠
          200: '#ab98ee',   // 入力欄の枠
          300: '#9a83ea',
        },
        gray: {
          100: '#dfe2e7',
          200: '#c5cad2',
          300: '#a3a9b3',
        },
      },
      // ── 文字サイズ（既定より一段大きく） ──
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.2rem' }],    // 12px → 13px
        sm: ['0.9375rem', { lineHeight: '1.45rem' }],   // 14px → 15px
        base: ['1.0625rem', { lineHeight: '1.6rem' }],  // 16px → 17px
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
