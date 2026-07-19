import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '..', '');
  return {
    root: path.resolve(__dirname, '.'),
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../src'),
        '@shared': path.resolve(__dirname, '../shared'),
        '@web': path.resolve(__dirname, './src')
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/yuihime.db*',
          '**/config.toml',
          '**/*.db',
          '**/*.db-wal',
          '**/*.db-shm'
        ]
      },
      fs: {
        allow: [path.resolve(__dirname, '..')]
      },
      proxy: {
        '/api': 'http://localhost:3000',
        '/ws': { target: 'ws://localhost:3000', ws: true },
        '/lib': 'http://localhost:3000',
        '/models': 'http://localhost:3000'
      }
    },
    publicDir: path.resolve(__dirname, '../public'),
    build: {
      outDir: path.resolve(__dirname, '../dist/web'),
      rollupOptions: {
        external: [
          'better-sqlite3',
          'smol-toml',
          'telegraf',
          'discord.js',
          '@discordjs/ws',
          'express',
          'zlib-sync',
          'bufferutil',
          'utf-8-validate'
        ]
      }
    }
  };
});
