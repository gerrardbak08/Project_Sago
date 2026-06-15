import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// index.html 내 %VITE_*% 패턴을 환경변수로 치환하는 인라인 플러그인.
// Vite 기본 동작은 JS 코드(import.meta.env)만 치환하고 HTML은 치환하지 않으므로
// 카카오 SDK 스크립트 태그의 appkey가 리터럴 "%VITE_KAKAO_JS_KEY%"로 요청되는 문제를 방지.
function htmlEnvPlugin(env) {
  return {
    name: 'html-env-plugin',
    transformIndexHtml(html) {
      return html.replace(/%VITE_([A-Z0-9_]+)%/g, (match, key) => {
        const fullKey = `VITE_${key}`;
        return Object.prototype.hasOwnProperty.call(env, fullKey) ? env[fullKey] : match;
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // root(proj/) 기준으로 모든 접두사 환경변수 로드 (VITE_ 포함)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), htmlEnvPlugin(env)],
    publicDir: 'public',
    server:  { port: 5173, host: true },
    build:   { outDir: 'dist', sourcemap: true },
    esbuild: { loader: 'jsx', include: /\.[jt]sx?$/ },
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
  };
});
