import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Remove console & debugger in production builds only
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },

  // Production build optimizations
  build: {
    sourcemap: true, // Generate sourcemaps for debugging
    minify: 'esbuild', // Use esbuild for faster builds
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    host: '0.0.0.0', // Allow access from network devices
    port: 7001,
    watch: {
      usePolling: true,
    },
    hmr: {
      overlay: true,
      // Auto-detect host for HMR (no hardcoded IP)
    },
  },
}))
