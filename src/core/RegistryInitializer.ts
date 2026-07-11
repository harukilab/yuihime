import { SystemRegistry } from './registry';
import { ModuleType, ModulePhase } from '../include/types';
import { CustomToolsLoader } from './CustomToolsLoader';

let initPromise: Promise<void> | null = null;

const activeCompactions = new Set<string>();

export function initializeCortexModules(): Promise<void> {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    if (SystemRegistry.getModules().length > 10) {
      return; // Already initialized with a decent amount of modules
    }
    
    try {
      // Only clear if we are genuinely doing a fresh init
      if (SystemRegistry.getModules().length === 0) {
         SystemRegistry.clear();
      }
      
      // Register Placeholder Modules requested by User (Yuihime Agentic Core Architecture)
    const virtualModules = [
      // PHASE 1: Input Aggregation & Identity Mapping
    {
      metadata: {
        id: 'identity-mapping',
        name: 'yui-router: Signals Ingestion',
        type: ModuleType.CORTEX,
        phase: 'PHASE 1: AGGREGATION',
        order: 1,
        description: 'Maps incoming channel signals (Telegram/Web/Discord/LiveChat) to high-fidelity user profiles, including cross-platform matching.',
        configSchema: {
          fields: {
            confidenceThreshold: {
              type: 'number',
              label: 'Identity Confidence Threshold',
              default: 0.7,
              description: 'Minimum confidence to auto-update perceived name.'
            }
          }
        }
      },
      run: async (input: string, state: any, context: any) => {
        const words = (input || "").toLowerCase().split(/\s+/).filter(w => w.length > 2);
        let pName = context.userName || "Unknown Viewer";
        let sourceId = context.sourceId || "web-1";
        let source = context.source || "web";

        // Logic to detect direct identity claims or cross-platform mentions
        const nameMatch = input.match(/namaku (.*)/i) || input.match(/panggil aku (.*)/i) || input.match(/my name is (.*)/i) || input.match(/i am (.*)/i) || input.match(/panggil gua (.*)/i);
        const crossPlatformMatch = input.match(/id (discord|telegram|twitter|ig|instagram) (gua|ku|saya) (.*)/i) || input.match(/my (discord|telegram|twitter|ig|instagram) handle is (.*)/i);
        
        let perceivedNameUpdate;
        let linkedAccountUpdate;

        if (nameMatch && nameMatch[1]) {
           perceivedNameUpdate = nameMatch[1].trim().split(/[ \.\!\?]/)[0]; // Just the name part
        }

        if (crossPlatformMatch) {
            const platform = crossPlatformMatch[1].toLowerCase();
            const handle = (crossPlatformMatch[3] || crossPlatformMatch[2] || "").trim().split(/[ \.\!\?]/)[0];
            linkedAccountUpdate = `${platform}:${handle}`;
        }

        const allIdentities = context.allIdentities || [];
        
        // Find existing identity by name, sourceId, or linked accounts
        const viewerIdentity = allIdentities.find((id: any) => {
          if (!id) return false;
          const matchName = (id.perceivedName || "").toLowerCase() === (pName || "").toLowerCase();
          const matchSourceId = id.sourceId === sourceId;
          const matchLinked = (id.linkedAccounts || []).some((link: string) => 
            link.includes(pName.toLowerCase()) || (linkedAccountUpdate && link === linkedAccountUpdate)
          );
          return matchName || matchSourceId || matchLinked;
        });

        let identityContext = `[MENGHADAPI PENONTON]: ${pName} (${source})\n`;
        if (viewerIdentity) {
           identityContext += `[IDENTITAS_TERVERIFIKASI]: ${viewerIdentity.perceivedName}\n`;
           if (viewerIdentity.importantFacts && viewerIdentity.importantFacts.length > 0) {
              identityContext += `[FAKTA_PENONTON]: ${viewerIdentity.importantFacts.slice(0, 5).join('; ')}\n`;
           }
           if (viewerIdentity.linkedAccounts && viewerIdentity.linkedAccounts.length > 0) {
              identityContext += `[AKUN_TERTAUT]: ${viewerIdentity.linkedAccounts.join(', ')}\n`;
           }
           const trustVal = viewerIdentity.trust !== undefined ? viewerIdentity.trust : (state.relation?.trust || 50);
           const affectionVal = viewerIdentity.affection !== undefined ? viewerIdentity.affection : (state.relation?.affection || 50);
           const reputationVal = viewerIdentity.reputation !== undefined ? viewerIdentity.reputation : (state.relation?.reputation || 50);
           identityContext += `[RELASI]: Trust ${trustVal}%, Affection ${affectionVal}%, Reputation ${reputationVal}%\n`;
        } else {
           identityContext += `[CATATAN]: Penonton baru dideteksi.\n`;
        }

        return { 
          ...context, 
          perceivedNameUpdate, 
          linkedAccountUpdate,
          identityContext,
          viewerIdentity 
        };
      }
    },
    {
      metadata: {
        id: 'memory-recall',
        name: 'yui-memory: Relational Recall',
        type: ModuleType.CORTEX,
        phase: 'PHASE 1: AGGREGATION',
        order: 2,
        description: 'Pulls relational history and conversational continuity markers, mapping cross-platform identities.'
      },
      run: async (input: string, state: any, context: any) => {
        const words = (input || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const pName = (context.perceivedNameUpdate || context.userName || "Unknown Viewer").toLowerCase();
        
        // Find all identifiers for this user
        const identifiers = new Set([pName]);
        if (context.viewerIdentity) {
           identifiers.add((context.viewerIdentity.perceivedName || "").toLowerCase());
           (context.viewerIdentity.linkedAccounts || []).forEach((link: string) => {
              const handle = link.split(':')[1]?.toLowerCase();
              if (handle) identifiers.add(handle);
           });
        }

        const relevant = (context.memories || []).filter((m: any) => {
          const content = typeof m.content === 'string' ? m.content.toLowerCase() : JSON.stringify(m.content || "").toLowerCase();
          const tags = Array.isArray(m.tags) ? m.tags.map((t: string) => (t || "").toLowerCase()) : [];
          
          const isAboutTopic = words.some(word => content.includes(word) || tags.includes(word));
          const isFromSpeaker = (m.speaker && identifiers.has(m.speaker.toLowerCase())) || 
                                tags.some(t => identifiers.has(t));
          
          return isAboutTopic || isFromSpeaker;
        }).sort((a: any, b: any) => {
          const aContent = typeof a.content === 'string' ? a.content.toLowerCase() : JSON.stringify(a.content || "").toLowerCase();
          const bContent = typeof b.content === 'string' ? b.content.toLowerCase() : JSON.stringify(b.content || "").toLowerCase();
          
          const aTopic = words.some(w => aContent.includes(w)) ? 1 : 0;
          const aSpeaker = (a.speaker && identifiers.has(a.speaker.toLowerCase())) ? 2 : 0; // Prioritize speaker recall
          
          const bTopic = words.some(w => bContent.includes(w)) ? 1 : 0;
          const bSpeaker = (b.speaker && identifiers.has(b.speaker.toLowerCase())) ? 2 : 0;
          
          return (bTopic + bSpeaker) - (aTopic + aSpeaker);
        }).slice(0, 8);
        
        return { ...context, relevantMemories: relevant };
      }
    },
    // PHASE 2: The Context Compressor (Payload Construction)
    {
      metadata: {
        id: 'payload-compressor',
        name: 'yui-parser: Synaptic Constructor',
        type: ModuleType.CORTEX,
        phase: 'PHASE 2: COMPRESSION',
        order: 1,
        description: 'Bundles System Prompt, Soul Identity, Tools, and History into a dense instruction packet.'
      },
      run: async (input: string, state: any, context: any) => {
        let grounded = context.groundedKnowledge || "";
        if (context.identityContext) {
           grounded = context.identityContext + "\n" + grounded;
        }
        return { ...context, groundedKnowledge: grounded };
      }
    },
    {
      metadata: {
        id: 'cache-optimizer',
        name: 'yui-llm-client: Cache Layer',
        type: ModuleType.CORTEX,
        phase: 'PHASE 2: OPTIMIZATION',
        order: 2,
        description: 'Manages Provider-side Context Caching for static soul/tool metadata.'
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    // LOGIC & MAINTENANCE
    {
      metadata: {
        id: 'history-pruner',
        name: 'yui-router: Context Pruner',
        type: ModuleType.CORTEX,
        phase: 'PHASE 1: AGGREGATION',
        order: 0,
        description: 'Recursive history compaction to maintain neural context integrity.'
      },
      run: async (input: string, state: any, context: any) => {
        if (!context.memories || context.memories.length < 45) return context;

        const contextId = context.contextId || context.memories[0]?.context || 'web_default';
        const chatType = context.chatType || context.memories[0]?.chat_type || 'web';

        if (activeCompactions.has(contextId)) {
          console.log(`[COMPACTION] Skip triggering, compaction already running for context: ${contextId}`);
          return context;
        }

        activeCompactions.add(contextId);
        const memoriesSnapshot = [...context.memories];

        // Perform compaction asynchronously in the background so it never blocks the critical path response loop
        (async () => {
          try {
            console.log(`[COMPACTION] Initiating background history compaction for context: ${contextId}`);
            
            const { ContextCompressor } = await import('../modules/ContextCompressionModule');
            const compressor = new ContextCompressor({
              enabled: true,
              thresholdTokens: 2000,
              protectFirstN: 5,
              protectLastN: 15,
              maxPasses: 1,
              toolResultMaxChars: 1200
            }, 3000);

            const cortexPath = './cortex.js';
            const { Cortex } = await import(/* @vite-ignore */ cortexPath);
            const tempCortex = new Cortex();

            const result = await compressor.compress(memoriesSnapshot, async (segment) => {
              const transcript = segment.map((m: any) => `${(m.speaker || m.type || 'UNKNOWN').toUpperCase()}: ${m.content}`).join('\n');
              const summaryPrompt = `Summarize these ${segment.length} messages into a dense point-form context. Preserve all names, tasks, and key decisions. Omit filler. Transcript:\n${transcript}`;
              return await tempCortex.thinkSimple(summaryPrompt);
            });

            if (result.compressed) {
              const dbPath = './database.js';
              const { initializeDatabase } = await import(/* @vite-ignore */ dbPath);
              const db = initializeDatabase();

              const middle = memoriesSnapshot.slice(5, -15);
              if (middle.length > 0) {
                const summaryMsg = result.history.find(m => m.type === 'memory_summary');
                const summaryText = summaryMsg?.content || '';

                if (summaryText) {
                  const summaryId = `summary_${Date.now()}`;
                  const avgTimestamp = Math.floor(middle.reduce((acc: number, m: any) => acc + (m.timestamp || Date.now()), 0) / middle.length);

                  // 1. Insert consolidated summary memory to maintain continuity
                  db.prepare(`
                    INSERT INTO memories (id, type, content, importance, tags, context, sentiment, timestamp, speaker, chat_type)
                    VALUES (?, 'interaction', ?, 0.8, '["summary"]', ?, 0.5, ?, 'System', ?)
                  `).run(
                    summaryId,
                    summaryText,
                    contextId,
                    avgTimestamp,
                    chatType
                  );

                  // 2. Erase detailed middle memories to clean up SQLite footprint
                  const placeholders = middle.map(() => '?').join(',');
                  db.prepare(`
                    DELETE FROM memories 
                    WHERE id IN (${placeholders})
                  `).run(...middle.map((m: any) => m.id));

                  console.log(`[COMPACTION] Successfully persisted summary (${summaryId}) and cleared ${middle.length} detailed memories for context: ${contextId}`);
                }
              }
            }
          } catch (compactionErr) {
            console.error(`[COMPACTION_ERROR] Failed during background memory compaction for ${contextId}:`, compactionErr);
          } finally {
            activeCompactions.delete(contextId);
          }
        })();

        return context;
      }
    },
    {
      metadata: {
        id: 'context-analyze',
        name: 'yui-runtime: Priority Classifier',
        type: ModuleType.CORTEX,
        phase: 'PHASE 3: EVALUATION',
        order: 0,
        description: 'Analyzes intent, semantic weight, and priority of incoming contexts.'
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'personality-core',
        name: 'yui-core: Soul Directive',
        type: ModuleType.CORTEX,
        phase: 'SOUL',
        order: 2,
        description: 'Hard-coded behavioral markers and unique linguistic fingerprints.',
        configSchema: {
          fields: {
            personalityMode: {
              type: 'select',
              label: 'Behavioral Directive',
              default: 'polite',
              options: [
                { label: 'Polite & Refined', value: 'polite' },
                { label: 'Playful & Tsundere', value: 'playful' },
                { label: 'Technical & Analytical', value: 'technical' },
                { label: 'Chaotic & Random', value: 'chaotic' }
              ]
            },
            verbosity: {
              type: 'number',
              label: 'Sentence Verbosity',
              default: 0.8,
              description: 'Higher values lead to longer, more expressive dialogue.'
            },
            emotionalSensitivity: {
              type: 'boolean',
              label: 'Emotional Oscillation',
              default: true,
              description: 'Enable feedback loop between user sentiment and agent mood.'
            }
          }
        }
      },
      run: async (input: string, state: any, context: any) => {
        const mood = state.mood;
        const baseline = 15;
        
        const emotions = [
          { type: 'joy', value: mood.joy },
          { type: 'anger', value: mood.anger },
          { type: 'sadness', value: mood.sadness },
          { type: 'stress', value: mood.stress },
          { type: 'excitement', value: mood.excitement }
        ];
        const dominant = emotions.sort((a,b) => b.value - a.value)[0];
        
        let soulDirective = `[EMOTIONAL_CUE]: Current dominant mood is ${dominant.type}. `;
        if (dominant.value < baseline) soulDirective = "[EMOTIONAL_CUE]: Neutral/Calm state. ";
        
        if (dominant.type === 'anger' && dominant.value > 40) {
          soulDirective += "Respond with coldness or irritation. ";
        } else if (dominant.type === 'joy' && dominant.value > 50) {
          soulDirective += "Be cheerful and expressive. ";
        } else if (dominant.type === 'sadness' && dominant.value > 40) {
          soulDirective += "Sound a bit melancholy and reflective. ";
        }

        return { ...context, soulDirective };
      }
    },
    {
      metadata: {
        id: 'system-cronjob',
        name: 'yui-core: Loop Scheduler',
        type: ModuleType.CORTEX,
        phase: 'LOGIC',
        order: 100,
        description: 'Schedules periodic maintenance cycles or recurring agent checks.'
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'hearing',
        name: 'yui-hearing: Auditory Capture',
        type: ModuleType.CORTEX,
        phase: 'PHASE 1: AGGREGATION',
        order: 10,
        description: 'Speech-to-text and auditory capture. Configure how speech recognition works.',
        configSchema: {
          fields: {
            enabled: { label: 'Voice Activation Capture', type: 'boolean', default: true },
            threshold: { label: 'Microphone Sensitivity Threshold (dB)', type: 'slider', min: 10, max: 100, step: 1, default: 35 },
            silenceDuration: { label: 'End of Speech Silence Trigger (ms)', type: 'slider', min: 500, max: 4000, step: 100, default: 1500 }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'vision',
        name: 'yui-vision: Optical Frame Analysis',
        type: ModuleType.CORTEX,
        phase: 'PHASE 1: AGGREGATION',
        order: 11,
        description: 'Configure camera calibrations and image processing capabilities.',
        configSchema: {
          fields: {
            enabled: { label: 'Avatar Virtual Sight (Frame Analysis)', type: 'boolean', default: false },
            interval: { label: 'Snapshot Frequency Rate (ms)', type: 'slider', min: 1000, max: 15000, step: 500, default: 3000 },
            modelType: {
              label: 'Vision Backbone Node',
              type: 'select',
              default: 'gemini-3.5-flash',
              options: [
                { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
                { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
                { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                { value: 'gpt-4o', label: 'GPT-4o' }
              ]
            }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'artistry',
        name: 'yui-artistry: Creative Imagery',
        type: ModuleType.CORTEX,
        phase: 'SOUL',
        order: 12,
        description: 'Artistic Canvas Synthesizer Configs.',
        configSchema: {
          fields: {
            engine: {
              label: 'Creative Imaging Node',
              type: 'select',
              default: 'imagen3',
              options: [
                { value: 'imagen3', label: 'Imagen 3' },
                { value: 'flux-schnell', label: 'FLUX Schnell' },
                { value: 'midjourney-v6', label: 'Midjourney v6 API' }
              ]
            },
            ratio: {
              label: 'Aspect Ratio Constraints',
              type: 'select',
              default: '16:9',
              options: [
                { value: '16:9', label: '16:9 Cinematic' },
                { value: '1:1', label: '1:1 Square Art' },
                { value: '9:16', label: '9:16 vertical stream backdrop' }
              ]
            },
            negativePrompt: { label: 'Style Bias Restriction Filter (Negative prompt)', type: 'textarea', default: '' }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'short_term_memory',
        name: 'yui-memory: STM Recency Buffer',
        type: ModuleType.CORTEX,
        phase: 'PHASE 2: CONTEXT',
        order: 13,
        description: 'Episodic Recency Buffer limits.',
        configSchema: {
          fields: {
            recallBufferSize: { label: 'Short-Term Message Recency Limit', type: 'slider', min: 5, max: 100, step: 5, default: 15 },
            autoSummarizeThreshold: { label: 'Auto Summarization Queue Trigger (msg counts)', type: 'slider', min: 10, max: 150, step: 10, default: 20 }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'long_term_memory',
        name: 'yui-memory: LTM Knowledge Graph',
        type: ModuleType.CORTEX,
        phase: 'PHASE 2: CONTEXT',
        order: 14,
        description: 'Vector Database & Knowledge Graph Configs.',
        configSchema: {
          fields: {
            vectorDatabase: {
              label: 'Semantic DB Backbone Engine',
              type: 'select',
              default: 'sqlite_vss',
              options: [
                { value: 'sqlite_vss', label: 'SQLite VSS (Embedded Vector Store)' },
                { value: 'pinecone', label: 'Pinecone Cloud Node' },
                { value: 'chromadb', label: 'Local ChromaDB container' }
              ]
            },
            indexThreshold: { label: 'Semantic Similarity Match Confidence Filter', type: 'slider', min: 0.1, max: 1.0, step: 0.01, default: 0.72 }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'discord_bridge',
        name: 'yui-conduit: Discord Bridge',
        type: ModuleType.CORTEX,
        phase: 'SOUL',
        order: 15,
        description: 'Let your VTuber read, listen, and participate directly in Discord guilds! Handles voice channels transcription, messages sync, and custom bots trigger.',
        configSchema: {
          fields: {
            botToken: { label: 'Discord Bot Token Credential', type: 'password', default: '' },
            guildId: { label: 'Target Guild ID (Server Network)', type: 'text', default: '' },
            voiceChannelId: { label: 'Automated Stream Voice Lounge (Channel ID)', type: 'text', default: '' }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'twitter_bridge',
        name: 'yui-conduit: Twitter Bridge',
        type: ModuleType.CORTEX,
        phase: 'SOUL',
        order: 16,
        description: 'Allow your digital vtuber agent to self-publish replies, thread analytical analyses, and scrape/quote timeline tweets automatically!',
        configSchema: {
          fields: {
            apiKey: { label: 'Consumer Key API (X Account)', type: 'text', default: '' },
            apiSecret: { label: 'Consumer Secret API', type: 'password', default: '' },
            accessToken: { label: 'Access Token', type: 'text', default: '' },
            accessTokenSecret: { label: 'Access Token Secret', type: 'password', default: '' }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    },
    {
      metadata: {
        id: 'mcp_servers',
        name: 'yui-conduit: MCP Server Integration',
        type: ModuleType.CORTEX,
        phase: 'SOUL',
        order: 19,
        description: 'Configure external MCP servers endpoints to expose dynamic micro-services, system tools access, filesystem bindings, and external databases directly to Yui\'s reasoning loop!',
        configSchema: {
          fields: {
            enabled: { label: 'Enable MCP Integration', type: 'boolean', default: false },
            serverUrl: { label: 'MCP JSON-RPC WebSocket Address', type: 'text', default: 'ws://localhost:3011' },
            serverLabel: { label: 'Conduit Identity Identifier', type: 'text', default: 'External Tools Core' }
          }
        }
      },
      run: async (input: string, state: any, context: any) => ({ ...context })
    }
  ];

  virtualModules.forEach(v => SystemRegistry.register(v));

  // Auto-discover all modules using Vite's glob import (Browser client only)
  if (typeof window !== "undefined") {
    try {
      const cortexModules = import.meta.glob('../modules/*.ts', { eager: true });
      const agiModules = import.meta.glob('../modules/agi/*.ts', { eager: true });
      const providerModules = import.meta.glob('../drivers/ai-providers/*.ts', { eager: true });
      const ttsModules = import.meta.glob('./tts/*.ts', { eager: true });
      const toolModules = import.meta.glob('../drivers/tools/*/index.ts', { eager: true });
      const addonModules = import.meta.glob('../../addons/**/*.ts', { eager: true });

      const allModules = { 
        ...cortexModules, 
        ...agiModules,
        ...providerModules, 
        ...ttsModules,
        ...toolModules,
        ...addonModules
      };

      for (const path in allModules) {
        const mod: any = allModules[path];
        for (const key in mod) {
          const component = mod[key];
          if (component && component.metadata && component.metadata.id) {
            SystemRegistry.register(component);
          }
        }
      }
    } catch (e) {
      console.warn("[REGISTRY] Browser glob import failed:", e);
    }
  } else {
    // Server-side (Node.js) dynamic discover using native filesystem
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { pathToFileURL, fileURLToPath } = await import('url');

      let serverFilename = "";
      let serverDirname = "";

      try {
        if (typeof import.meta !== "undefined" && import.meta.url) {
          serverFilename = fileURLToPath(import.meta.url);
          serverDirname = path.dirname(serverFilename);
        } else {
          if (typeof __dirname !== 'undefined') {
            serverDirname = __dirname;
          } else {
            serverDirname = process.cwd();
          }
        }
      } catch (esmError) {
        // Fallback for CommonJS bundles
        if (typeof __dirname !== 'undefined') {
          serverDirname = __dirname;
        } else {
          serverDirname = process.cwd();
        }
      }

      const importComponent = async (fullFilePath: string) => {
        try {
          // Try standard ESM dynamic import via file URL
          const fileUrl = pathToFileURL(fullFilePath).href;
          const mod = await import(/* @vite-ignore */ fileUrl);
          for (const key in mod) {
            const component = mod[key];
            if (component && component.metadata && component.metadata.id) {
              SystemRegistry.register(component);
            }
          }
        } catch (moduleError) {
          // Fallback to require pattern (useful in compiled CommonJS bundles or CJS fallbacks)
          try {
            if (typeof require !== 'undefined') {
              const mod = require(fullFilePath);
              for (const key in mod) {
                const component = mod[key];
                if (component && component.metadata && component.metadata.id) {
                  SystemRegistry.register(component);
                }
              }
            } else {
              // ESM-bridge createRequire dynamic fallback
              const metaUrl = typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : '';
              if (metaUrl) {
                const { createRequire } = await import('module');
                const requireFn = createRequire(metaUrl);
                const mod = requireFn(fullFilePath);
                for (const key in mod) {
                  const component = mod[key];
                  if (component && component.metadata && component.metadata.id) {
                    SystemRegistry.register(component);
                  }
                }
              }
            }
          } catch (fallbackError) {
            // Gracefully skip binary-locked or import-failing modules
          }
        }
      };

      const loadNodeModulesFromDir = async (dirName: string) => {
        const pathsToTry = [
          path.resolve(serverDirname, dirName),
          path.resolve(serverDirname, '..', dirName),
          path.resolve(serverDirname, '../src', dirName),
          path.resolve(process.cwd(), dirName),
          path.resolve(process.cwd(), 'src', dirName)
        ];
        
        let absolutePath = "";
        for (const p of pathsToTry) {
          if (fs.existsSync(p)) {
            absolutePath = p;
            break;
          }
        }
        
        if (!absolutePath) {
          return;
        }
        
        const files = fs.readdirSync(absolutePath);
        for (const file of files) {
          const fullPath = path.join(absolutePath, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const possibleIndexFiles = ['index.ts', 'index.js', 'index.cjs'];
            for (const indexFile of possibleIndexFiles) {
              const indexPath = path.join(fullPath, indexFile);
              if (fs.existsSync(indexPath)) {
                await importComponent(indexPath);
                break;
              }
            }
          } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.cjs')) {
            await importComponent(fullPath);
          }
        }
      };

      await loadNodeModulesFromDir('modules');
      await loadNodeModulesFromDir('modules/agi');
      await loadNodeModulesFromDir('drivers/ai-providers');
      await loadNodeModulesFromDir('core/tts');
      await loadNodeModulesFromDir('drivers/tools');

      // Load and register user-defined custom tools from the registry
      await CustomToolsLoader.loadAndRegisterAll();

      // Write loaded tool definitions to src/core/available_tools.json
      try {
        const tools = SystemRegistry.getTools();
        const toolsData = tools.map((t: any) => t.metadata);
        const outputFilePath = path.resolve(process.cwd(), 'src', 'core', 'available_tools.json');
        
        const parentDir = path.dirname(outputFilePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        
        fs.writeFileSync(
          outputFilePath,
          JSON.stringify(toolsData, null, 2),
          'utf8'
        );
        console.log('[REGISTRY] Successfully saved all verified tool schemas directly to:', outputFilePath);
      } catch (fileErr: any) {
        console.warn('[REGISTRY] Non-blocking failure while generating available_tools.json:', fileErr.message);
      }
    } catch (e) {
      console.error("[Node-Registry] Node.js dynamic load failed:", e);
    }
  }

    // Register Explicit Hard-coded modules (Core Modules that might not be in generic glob)
    const { MemoryConsolidationModule } = await import('../modules/agi/MemoryConsolidationModule');
    const { CognitiveReflexModule } = await import('../modules/agi/CognitiveReflexModule');
    const { MemoryResonanceModule } = await import('../modules/agi/MemoryResonanceModule');
    const { SoulDriftModule } = await import('../modules/agi/SoulDriftModule');
    const { SubconsciousMonologueModule } = await import('../modules/agi/SubconsciousMonologueModule');
    const { CognitiveHeuristicsModule } = await import('../modules/agi/CognitiveHeuristicsModule');
    const { MicroCognitiveSynthesizer } = await import('../modules/agi/MicroCognitiveSynthesizer');
    const { YUIAGICoreModule } = await import('../modules/agi/YUIAGICoreModule');
    const { SelfAwarenessMirrorModule } = await import('../modules/agi/SelfAwarenessMirrorModule');
    const { NeuroSymbolicModule } = await import('../modules/agi/NeuroSymbolicModule');
    const { ContinuousLearningMemoryModule } = await import('../modules/agi/ContinuousLearningMemoryModule');
    const { TopDownExecutiveControlModule } = await import('../modules/agi/TopDownExecutiveControlModule');
    const { ProactiveVolitionModule } = await import('../modules/agi/ProactiveVolitionModule');
    const { HighOrderMetacognitionModule } = await import('../modules/agi/HighOrderMetacognitionModule');
    const { SomaticSensorGroundingModule } = await import('../modules/agi/SomaticSensorGroundingModule');
    const { CognitiveIntegrityGuardianModule } = await import('../modules/agi/CognitiveIntegrityGuardianModule');
    const { EmotionEngine } = await import('../modules/EmotionEngine');
    const { SpontaneousProactiveModule } = await import('../modules/agi/SpontaneousProactiveModule');
    const { CircadianRhythmModule } = await import('../modules/agi/CircadianRhythmModule');
    const { WeatherNewsEmpathyModule } = await import('../modules/agi/WeatherNewsEmpathyModule');
    const { AbstractReasoningModule } = await import('../modules/agi/AbstractReasoningModule');

    SystemRegistry.register(MemoryConsolidationModule);
    SystemRegistry.register(CognitiveReflexModule);
    SystemRegistry.register(MemoryResonanceModule);
    SystemRegistry.register(SoulDriftModule);
    SystemRegistry.register(SubconsciousMonologueModule);
    SystemRegistry.register(CognitiveHeuristicsModule);
    SystemRegistry.register(MicroCognitiveSynthesizer);
    SystemRegistry.register(YUIAGICoreModule);
    SystemRegistry.register(SelfAwarenessMirrorModule);
    SystemRegistry.register(NeuroSymbolicModule);
    SystemRegistry.register(ContinuousLearningMemoryModule);
    SystemRegistry.register(TopDownExecutiveControlModule);
    SystemRegistry.register(ProactiveVolitionModule);
    SystemRegistry.register(HighOrderMetacognitionModule);
    SystemRegistry.register(SomaticSensorGroundingModule);
    SystemRegistry.register(CognitiveIntegrityGuardianModule);
    SystemRegistry.register(EmotionEngine);
    SystemRegistry.register(SpontaneousProactiveModule);
    SystemRegistry.register(CircadianRhythmModule);
    SystemRegistry.register(WeatherNewsEmpathyModule);
    SystemRegistry.register(AbstractReasoningModule);

    // Dynamically scan and load plugins from the addons directory
    if (typeof window === 'undefined') {
      try {
        const { PluginManager } = await import('./kernel/PluginManager.js');
        await PluginManager.getInstance().loadPlugins();
      } catch (e: any) {
        console.error('[REGISTRY] PluginManager failed to load plugins dynamically:', e.message);
      }
    }

    // --- NEW: Sync Remote Addons (wrapped in try-catch to prevent boot lock) ---
    try {
      const { DynamicLoader } = await import('./DynamicLoader');
      // Execute sync but don't strictly await it to block the entire boot sequence if server isn't up yet
      DynamicLoader.syncAddons().catch(e => console.warn('[KERNEL] Background addon sync postponed:', e.message));
    } catch (e) {
      console.warn('[KERNEL] DynamicLoader not available yet.');
    }

  } catch (err) {
    console.error('[KERNEL] Registry Initialization CRITICAL FAILURE:', err);
  }
  })();
  return initPromise;
}
