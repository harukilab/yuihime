import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, Plugin} from 'vite';

function serverModuleStubPlugin(): Plugin {
  const stubbedModules = new Set([
    'fs',
    'fs/promises',
    'node:fs',
    'node:fs/promises',
    'path',
    'node:path',
    'os',
    'node:os',
    'child_process',
    'node:child_process',
    'module',
    'node:module',
    'util',
    'node:util',
    'better-sqlite3',
    'bindings',
    'fast-glob',
    'adm-zip',
    'cheerio',
    'smol-toml',
    'telegraf',
    'discord.js',
    '@/core/database',
    '@/core/kernel/settings',
    '@/core/kernel/logger',
    '@/core/kernel/core',
    '@/core/api_framework',
    '@/core/ValidationMiddleware',
    '@/core/learning',
    '@/core/circuits/StandardCircuits',
    '@/core/circuits/NeuralCircuitFramework',
    '@/core/dream',
    '@/core/FlowEngine',
    '@/core/consolidator',
    '@/core/CustomToolsLoader',
    '@/core/DynamicLoader',
    '@/core/memorySearch',
    '@/core/neural/Brain',
    '@/core/openaiTools',
    '@/core/PromptRegistry',
    '@/core/cortex',
    '@/core/cortex/cortexThinkEngine',
    '@/core/cortex/autonomousThought',
    '@/core/cortex/fastTrackRunner',
    '@/core/cortex/toolNormalizer',
    '@/core/cortex/jsonRepairer',
    '@/core/cortex/jsonExtract',
    '@/core/cortex/streamExtractors',
    '@/core/cortex/dynamicToolSynthesizer',
    '@/core/cortex/cortexSettings',
    '@/core/kernel/processor',
    '@/core/kernel/state-machine',
    '@/core/kernel/CognitiveScheduler',
    '@/core/kernel/MultiChannelQueue',
    '@/core/kernel/BackgroundProcessManager',
    '@/core/kernel/PluginManager',
    '@/core/kernel/cron',
    '@/core/kernel/NeuralInterface',
    '@/core/kernel/ai',
    '@/core/kernel/TTSGateway',
    '@/core/server/apiRouter',
    '@/core/server/telegram',
    '@/core/server/discord',
    '@/core/server/twitter',
    '@/core/server/mcp',
    '@/core/server/onboarding',
    '@/core/server/storageServer',
    '@/core/server/routes/cortexRouter',
    '@/core/server/routes/toolsRouter',
    '@/core/server/routes/systemRouter',
    '@/core/server/routes/telegramRouter',
    '@/core/server/routes/storageRouter',
    '@/core/server/routes/identitiesRouter',
    '@/core/server/routes/datasetRouter',
    '@/core/server/routes/synthesizerRouter',
    '@/core/server/routes/aiRouter',
    '@/core/server/llmAuditor',
    '@/core/server/channelFileAttachment',
    '@/core/server/datasetSynthesizer',
    '@/core/server/telegramReactionLearner',
    '@/core/tts/OfficialStreamingSpeechTTS',
    '@/core/tts/OfficialSpeechTTS',
    '@/core/tts/OpenRouterTTS',
    '@/core/tts/CustomAPITTS',
    '@/core/tts/ElevenLabsTTS',
    '@/core/tts/GeminiTTS',
    '@/core/tts/WebSpeechTTS',
    '@/core/agents/SubAgentManager',
    '@/core/agents/SubAgentRegistry',
    '@/core/agents/SubAgentTypes',
    '@/core/agents/definitions/creativeAgent',
    '@/core/agents/definitions/researchAgent',
    'shared/drivers/storageServer',
    '@shared/drivers/storageServer',
    '@shared/core/registry',
    '@shared/services/api',
    '@shared/core/kernel/logger',
    '@shared/drivers/storage',
    'src/core/RegistryInitializer',
  ]);

  return {
    name: 'server-module-stub',
    enforce: 'pre',
    resolveId(id) {
      if (stubbedModules.has(id)) {
        return '\0virtual:' + id;
      }
      if (id.startsWith('@/core/') || id.startsWith('@shared/drivers/storageServer') || id.startsWith('@shared/services/api') || id.startsWith('@shared/core/registry') || id.startsWith('src/core/RegistryInitializer')) {
        return '\0virtual:' + id;
      }
      if (id.startsWith('node:')) {
        return '\0virtual:' + id;
      }
      return null;
    },
    load(id) {
      if (!id.startsWith('\0virtual:')) return null;
      const mod = id.replace('\0virtual:', '');

      if (mod === 'path' || mod === 'node:path') {
        return `
          export const join = (...args) => args.filter(Boolean).join('/');
          export const resolve = (...args) => args.filter(Boolean).join('/');
          export const dirname = (p) => (p ? p.split('/').slice(0, -1).join('/') || '.' : '.');
          export const basename = (p, ext) => {
            if (!p) return '';
            let b = p.split('/').pop() || '';
            if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
            return b;
          };
          export const extname = (p) => {
            if (!p) return '';
            const b = basename(p);
            const i = b.lastIndexOf('.');
            return i <= 0 ? '' : b.slice(i);
          };
          export const isAbsolute = (p) => typeof p === 'string' && p.startsWith('/');
          export const sep = '/';
          export const delimiter = ':';
          export const parse = (p) => ({ root: '/', dir: dirname(p), base: basename(p), ext: extname(p), name: basename(p, extname(p)) });
          const pathObj = { join, resolve, dirname, basename, extname, isAbsolute, sep, delimiter, parse };
          export default pathObj;
        `;
      }

      if (mod === 'fs' || mod === 'node:fs' || mod === 'fs/promises' || mod === 'node:fs/promises') {
        return `
          export const existsSync = () => false;
          export const readFileSync = () => '';
          export const writeFileSync = () => {};
          export const mkdirSync = () => {};
          export const readdirSync = () => [];
          export const statSync = () => ({ isDirectory: () => false, isFile: () => true, size: 0, mtime: new Date() });
          export const unlinkSync = () => {};
          export const renameSync = () => {};
          export const copyFileSync = () => {};
          export const realpathSync = (p) => p;
          export const promises = {
            readFile: async () => '',
            writeFile: async () => {},
            mkdir: async () => {},
            readdir: async () => [],
            stat: async () => ({ isDirectory: () => false, isFile: () => true, size: 0, mtime: new Date() }),
            unlink: async () => {},
          };
          export const readFile = promises.readFile;
          export const writeFile = promises.writeFile;
          export const mkdir = promises.mkdir;
          export const readdir = promises.readdir;
          export const stat = promises.stat;
          export const unlink = promises.unlink;
          const fsObj = { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, copyFileSync, realpathSync, promises, readFile, writeFile, mkdir, readdir, stat, unlink };
          export default fsObj;
        `;
      }

      if (mod === 'os' || mod === 'node:os') {
        return `
          export const homedir = () => '/home/user';
          export const platform = () => 'browser';
          export const arch = () => 'x64';
          export const type = () => 'Browser';
          export const release = () => '1.0.0';
          export const uptime = () => 0;
          export const totalmem = () => 8589934592;
          export const freemem = () => 4294967296;
          export const cpus = () => [];
          export const networkInterfaces = () => ({});
          export const userInfo = () => ({ username: 'user', homedir: '/home/user' });
          const osObj = { homedir, platform, arch, type, release, uptime, totalmem, freemem, cpus, networkInterfaces, userInfo };
          export default osObj;
        `;
      }

      if (mod === 'better-sqlite3') {
        return `
          export default function Database() {
            return {
              prepare: () => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) }),
              exec: () => {},
              close: () => {},
              pragma: () => []
            };
          }
        `;
      }

      if (mod === 'child_process' || mod === 'node:child_process') {
        return `
          export const exec = (cmd, cb) => { if (cb) cb(null, '', ''); return {}; };
          export const execSync = () => '';
          export const spawn = () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} } });
          export const fork = () => ({ on: () => {} });
          const cpObj = { exec, execSync, spawn, fork };
          export default cpObj;
        `;
      }

      if (mod === 'smol-toml') {
        return `
          export const parse = () => ({});
          export const stringify = () => '';
          const tomlObj = { parse, stringify };
          export default tomlObj;
        `;
      }

      if (mod === 'fast-glob') {
        return `
          const fg = async () => [];
          fg.sync = () => [];
          fg.stream = () => ({ on: () => {} });
          export const glob = fg;
          export const globSync = () => [];
          export default fg;
        `;
      }

      return `
        const dummy = {};
        export default dummy;
      `;
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '..', '');
  return {
    root: path.resolve(__dirname, '.'),
    plugins: [
      serverModuleStubPlugin(),
      react(),
      tailwindcss(),
    ],
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
        '/api': { target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || '3000'}`, changeOrigin: true },
        '/ws': { target: `ws://127.0.0.1:${process.env.VITE_WS_PORT || '3001'}`, ws: true, changeOrigin: true },
        '/lib': { target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || '3000'}`, changeOrigin: true },
        '/models': { target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || '3000'}`, changeOrigin: true }
      }
    },
    publicDir: path.resolve(__dirname, '../public'),
build: {
       outDir: path.resolve(__dirname, '../dist/web'),
        rollupOptions: {
          onwarn(warning, warn) {
            if (
              warning.code === 'UNUSED_EXTERNAL_IMPORT' &&
              (warning as any).source === 'url'
            ) return;
            if (
              warning.code === 'DYNAMIC_IMPORT_NEEDS_NAME' &&
              warning.message?.includes('url')
            ) return;
            if (
              warning.message?.includes('dynamic import') &&
              warning.message?.includes('will not move module into another chunk')
            ) return;
            warn(warning);
         }
       }
     }
  };
});
