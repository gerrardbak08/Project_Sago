/** @type {import('tailwindcss').Config} */
// 색 토큰 정본은 src/constants/colors.js 하나. 여기서 import 해 유틸 클래스로 노출한다.
// (기본 red/blue/gray… 스케일은 extend 이므로 그대로 유지 — 겹치지 않는 의미 이름만 추가)
import { TW_COLORS } from './src/constants/colors.js';

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: { colors: TW_COLORS } },
  plugins: [],
};
