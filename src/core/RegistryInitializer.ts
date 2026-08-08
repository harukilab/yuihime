import { SystemRegistry } from '@shared/core/registry';
import { ModuleType, ModulePhase } from '@shared/include/types';
import { CustomToolsLoader } from './CustomToolsLoader';
import { CortexModulesLoader } from './CortexModulesLoader';
import { CreativeAgent } from './agents/definitions/creativeAgent.js';
import { ResearchAgent } from './agents/definitions/researchAgent.js';
import { ExplorerAgent } from './agents/definitions/explorerAgent.js';
import { PlannerAgent } from './agents/definitions/plannerAgent.js';
import { SubAgentRegistry } from './agents/SubAgentRegistry.js';
import { ProviderGatewayModule } from '../modules/ProviderGatewayModule.js';
import { Cortex } from './cortex.js';
import { PluginManager } from './kernel/PluginManager.js';
import { DynamicLoader } from './DynamicLoader.js';
import { BackgroundToolDispatcher } from './kernel/BackgroundToolDispatcher.js';
import { writeAvailableToolsFile } from './toolRegistryFile.js';

import { NeuralVerifierModule } from '../modules/NeuralVerifierModule.js';
import { NeuralLoopModule } from '../modules/NeuralLoopModule.js';
import { MultiChannelQueueModule } from '../modules/MultiChannelQueueModule.js';
import { MoodAnalysisModule } from '../modules/MoodAnalysisModule.js';
import { MemoryModule } from '../modules/MemoryModule.js';
import { LocalNanoNLPModule } from '../modules/LocalNanoNLPModule.js';
import { FileManipulationModule } from '../modules/FileManipulationModule.js';
import { EmotionEngine } from '../modules/EmotionEngine.js';
import { NeuralEchoAddon } from '../modules/AddonExample.js';
import { SandboxFSModule, SandboxTerminalModule } from '../modules/SandboxModule.js';
import { SOPModule } from '../modules/SOPModule.js';
import { RAGModule } from '../modules/RAGModule.js';
import { PromptManagerModule } from '../modules/PromptManager.js';
import { PlanningModule } from '../modules/PlanningModule.js';
import { ParallelStreamerModule } from '../modules/ParallelStreamerModule.js';
import { OutputRendererModule } from '../modules/OutputRendererModule.js';
import { ToolExecutorModule } from '../modules/ToolExecutorModule.js';
import { McpBridgeModule } from '../modules/McpBridgeModule.js';
import { TTSSelectorModule } from '../modules/TTSSelectorModule.js';
import { SubAgentDelegationModule } from '../modules/SubAgentDelegationModule.js';
import { YuiVisionModule } from '../modules/YuiVisionModule.js';
import { L2DExpressionTranslatorModule } from '../modules/L2DExpressionTranslator.js';
import { SendFinalReplyTool, SendStatusUpdateTool } from '../modules/LiveStatusToolsModule.js';
import { DelegateTool } from '../drivers/tools/delegate.js';
import { UndoLastChangesTool } from '../drivers/tools/undo_last_changes.js';
import { DiagnosticsTool } from '../drivers/tools/diagnostics.js';
import { AskChoiceTool } from '../drivers/tools/ask_choice.js';
import { McpGateway } from './kernel/mcpGateway.js';

import { YUIAGICoreModule } from '../modules/agi/YUIAGICoreModule.js';
import { WeatherNewsEmpathyModule } from '../modules/agi/WeatherNewsEmpathyModule.js';
import { TopDownExecutiveControlModule } from '../modules/agi/TopDownExecutiveControlModule.js';
import { SubconsciousMonologueModule } from '../modules/agi/SubconsciousMonologueModule.js';
import { SpontaneousProactiveModule } from '../modules/agi/SpontaneousProactiveModule.js';
import { SoulDriftModule } from '../modules/agi/SoulDriftModule.js';
import { SomaticSensorGroundingModule } from '../modules/agi/SomaticSensorGroundingModule.js';
import { SelfAwarenessMirrorModule } from '../modules/agi/SelfAwarenessMirrorModule.js';
import { ProactiveVolitionModule } from '../modules/agi/ProactiveVolitionModule.js';
import { NeuroSymbolicModule } from '../modules/agi/NeuroSymbolicModule.js';
import { MicroCognitiveSynthesizer } from '../modules/agi/MicroCognitiveSynthesizer.js';
import { MemoryResonanceModule } from '../modules/agi/MemoryResonanceModule.js';
import { MemoryConsolidationModule } from '../modules/agi/MemoryConsolidationModule.js';
import { HighOrderMetacognitionModule } from '../modules/agi/HighOrderMetacognitionModule.js';
import { DreamModule } from '../modules/agi/DreamModule.js';
import { ContinuousLearningMemoryModule } from '../modules/agi/ContinuousLearningMemoryModule.js';
import { CognitiveReflexModule } from '../modules/agi/CognitiveReflexModule.js';
import { CognitiveIntegrityGuardianModule } from '../modules/agi/CognitiveIntegrityGuardianModule.js';
import { CognitiveHeuristicsModule } from '../modules/agi/CognitiveHeuristicsModule.js';
import { CircadianRhythmModule } from '../modules/agi/CircadianRhythmModule.js';
import { AdaptiveLearningModule } from '../modules/agi/AdaptiveLearningModule.js';
import { AbstractReasoningModule } from '../modules/agi/AbstractReasoningModule.js';
import { MetacognitionReflectModule, SelfAwarenessReflectModule } from '../modules/agi/AGIReflectModules.js';
import { DiaryModule } from '../modules/agi/DiaryModule.js';
import { LifeSimulationModule } from '../modules/agi/LifeSimulationModule.js';
import { FeedbackLoopModule } from '../modules/agi/FeedbackLoopModule.js';
import { ConfidenceEstimatorModule } from '../modules/agi/ConfidenceEstimatorModule.js';
import { UserModelModule } from '../modules/agi/UserModelModule.js';
import { MemoryRetentionModule } from '../modules/agi/MemoryRetentionModule.js';
import { AfterActionReviewModule } from '../modules/agi/AfterActionReviewModule.js';
import { GoalDecompositionModule } from '../modules/agi/GoalDecompositionModule.js';
import { GoalProposalModule } from '../modules/agi/GoalProposalModule.js';
import { SkillsContextModule } from '../modules/agi/SkillsContextModule.js';
import { SkillsRegistry } from './SkillsRegistry.js';

import { LocalProvider } from '../drivers/ai-providers/LocalProvider.js';
import { GeminiProvider } from '../drivers/ai-providers/GeminiProvider.js';
import { CustomProvider } from '../drivers/ai-providers/CustomProvider.js';
import { AnthropicProvider } from '../drivers/ai-providers/AnthropicProvider.js';
import { OpenAIProvider } from '../drivers/ai-providers/OpenAIProvider.js';
import { OfficialChatProvider } from '../drivers/ai-providers/OfficialChatProvider.js';
import { OpenRouter } from '../drivers/ai-providers/OpenRouter.js';

import { OfficialSpeechTTS } from '../core/tts/OfficialSpeechTTS.js';
import { ElevenLabsTTS } from '../core/tts/ElevenLabsTTS.js';
import { WebSpeechTTS } from '../core/tts/WebSpeechTTS.js';
import { OpenRouterTTS } from '../core/tts/OpenRouterTTS.js';
import { OfficialStreamingSpeechTTS } from '../core/tts/OfficialStreamingSpeechTTS.js';
import { CustomAPITTS } from '../core/tts/CustomAPITTS.js';
import { GeminiTTS } from '../core/tts/GeminiTTS.js';

import { TensorArtGenerateTool } from '../drivers/tools/tensorart_generate.js';
import { SearchChatHistoryTool } from '../drivers/tools/search_chat_history.js';
import { BashTool } from '../drivers/tools/bash.js';
import { FileReadTool } from '../drivers/tools/read.js';
import { WebSearchTool } from '../drivers/tools/websearch.js';
import { PluginInstallerTool } from '../drivers/tools/plugin_installer.js';
import { ViewLogsTool } from '../drivers/tools/view_logs.js';
import { WebSnipperTool } from '../drivers/tools/webfetch.js';
import { CodeInterpreter } from '../drivers/tools/code_interpreter.js';
import { EditFileSegmentTool } from '../drivers/tools/edit.js';
import { DownloadFileTool } from '../drivers/tools/download_file.js';
import { SendFileTool } from '../drivers/tools/send_file.js';
import { EmotionAdjustTool } from '../drivers/tools/emotion_adjust.js';
import { FileListTool } from '../drivers/tools/glob.js';
import { QuestionTool } from '../drivers/tools/question.js';
import { ApplyPatchTool } from '../drivers/tools/apply_patch.js';
import { CalculatorTool } from '../drivers/tools/calculator.js';
import { GitHubTool } from '../drivers/tools/github_integration.js';
import { GetCurrentTimeTool } from '../drivers/tools/get_current_time.js';
import { MessagingTool } from '../drivers/tools/messaging_integration.js';
import { BgProcTool } from '../drivers/tools/manage_bgproc.js';
import { ManageIdentitiesTool } from '../drivers/tools/manage_identities.js';
import { CronTool } from '../drivers/tools/manage_cron.js';
import { OCRTool } from '../drivers/tools/ocr.js';
import { ManagePairingTool } from '../drivers/tools/manage_pairing.js';
import { FileManagerTool } from '../drivers/tools/file_manager.js';
import { FileWriteTool } from '../drivers/tools/write.js';
import { DailySummaryTool } from '../drivers/tools/daily_summary.js';
import { ChatLogTool } from '../drivers/tools/chat_log.js';
import { TelegramQuickToolkit } from '../drivers/tools/telegram_quick_tools.js';
import { DiaryTool } from '../drivers/tools/diary.js';
import { GrepTool } from '../drivers/tools/grep.js';
import { TodoWriteTool } from '../drivers/tools/todowrite.js';
import { SkillTool } from '../drivers/tools/skill.js';

let initPromise: Promise<void> | null = null;

const activeCompactions = new Set<string>();

export function initializeCortexModules(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (SystemRegistry.getModules().length > 10) {
      return;
    }

    try {
      if (SystemRegistry.getModules().length === 0) {
         SystemRegistry.clear();
      }

      const virtualModules = [
        {
          metadata: {
            id: 'identity-mapping',
            name: 'yui-router: Signals Ingestion',
            type: ModuleType.CORTEX,
            phase: 'aggregation',
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
          run: async (input: string, state: any, context: any) => ({ ...context })
        },
        {
          metadata: {
            id: 'memory-recall',
            name: 'yui-memory: Relational Recall',
            type: ModuleType.CORTEX,
            phase: 'aggregation',
            order: 2,
            description: 'Pulls relational history and conversational continuity markers, mapping cross-platform identities.',
            configSchema: {
              fields: {
                recallDepth: {
                  type: 'number',
                  label: 'Memory Recall Depth',
                  default: 50,
                  description: 'Number of past interactions to analyze for identity matching.'
                }
              }
            }
          },
          run: async (input: string, state: any, context: any) => ({ ...context })
        },
        {
          metadata: {
            id: 'payload-compressor',
            name: 'yui-parser: Synaptic Constructor',
            type: ModuleType.CORTEX,
            phase: 'compression',
            order: 1,
            description: 'Bundles System Prompt, Soul Identity, Tools, and History into a dense instruction packet.'
          },
          run: async (input: string, state: any, context: any) => ({ ...context })
        },
        {
          metadata: {
            id: 'cache-optimizer',
            name: 'yui-llm-client: Cache Layer',
            type: ModuleType.CORTEX,
            phase: 'optimization',
            order: 2,
            description: 'Manages Provider-side Context Caching for static soul/tool metadata.'
          },
          run: async (input: string, state: any, context: any) => ({ ...context })
        },
        {
          metadata: {
            id: 'history-pruner',
            name: 'yui-router: Context Pruner',
            type: ModuleType.CORTEX,
            phase: 'aggregation',
            order: 0,
            description: 'Recursive history compaction to maintain neural context integrity.'
          },
          run: async (input: string, state: any, context: any) => ({ ...context })
        },
        {
          metadata: {
            id: 'context-analyze',
            name: 'yui-runtime: Priority Classifier',
            type: ModuleType.CORTEX,
            phase: 'evaluation',
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
            phase: 'soul',
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
          run: async (input: string, state: any, context: any) => ({ ...context })
        },
        {
          metadata: {
            id: 'system-cronjob',
            name: 'yui-core: Loop Scheduler',
            type: ModuleType.CORTEX,
            phase: 'logic',
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
            phase: 'aggregation',
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
            phase: 'aggregation',
            order: 11,
            description: 'Configure camera calibrations and image processing capabilities.',
            configSchema: {
              fields: {
                enabled: { label: 'Avatar Virtual Sight (Frame Analysis)', type: 'boolean', default: false },
                interval: { label: 'Snapshot Frequency Rate (ms)', type: 'slider', min: 1000, max: 15000, step: 500, default: 3000 },
                modelType: {
                  label: 'Vision Backbone Node',
                  type: 'select',
                  default: 'gemini-flash-latest',
                  options: [
                    { value: 'gemini-flash-latest', label: 'Gemini Flash (Latest)' },
                    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
                    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
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
            phase: 'soul',
            order: 12,
            description: 'Artistic Canvas Synthesizer Configs.',
            configSchema: {
              fields: {
                engine: {
                  label: 'Creative Imaging Node',
                  type: 'select',
                  default: 'comfyui',
                  options: [
                    { value: 'comfyui', label: 'ComfyUI (Local)' }
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
            phase: 'context-augment',
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
            phase: 'context-augment',
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
            phase: 'soul',
            order: 15,
            description: 'Let your VTuber read, listen, and participate directly in Discord guilds!',
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
            phase: 'soul',
            order: 16,
            description: 'Allow your digital vtuber agent to self-publish replies and scrape/quote timeline tweets automatically!',
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
            phase: 'soul',
            order: 19,
            description: 'Configure external MCP servers endpoints to expose dynamic micro-services.',
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

      const allStaticModules = [
        NeuralVerifierModule, NeuralLoopModule, MultiChannelQueueModule, MoodAnalysisModule, MemoryModule,
        LocalNanoNLPModule, FileManipulationModule, EmotionEngine, NeuralEchoAddon,
        SandboxFSModule, SandboxTerminalModule, SOPModule, RAGModule, ProviderGatewayModule,
        PromptManagerModule, PlanningModule, ParallelStreamerModule, OutputRendererModule,
        ToolExecutorModule, TTSSelectorModule, SubAgentDelegationModule, YuiVisionModule, L2DExpressionTranslatorModule, McpBridgeModule,
        YUIAGICoreModule, WeatherNewsEmpathyModule, TopDownExecutiveControlModule, SubconsciousMonologueModule,
        SpontaneousProactiveModule, SoulDriftModule, SomaticSensorGroundingModule, SelfAwarenessMirrorModule,
        ProactiveVolitionModule, NeuroSymbolicModule, MicroCognitiveSynthesizer, MemoryResonanceModule,
        MemoryConsolidationModule, HighOrderMetacognitionModule, DreamModule, ContinuousLearningMemoryModule,
        CognitiveReflexModule, CognitiveIntegrityGuardianModule, CognitiveHeuristicsModule, CircadianRhythmModule,
        AdaptiveLearningModule, AbstractReasoningModule, MetacognitionReflectModule, SelfAwarenessReflectModule,
        DiaryModule, LifeSimulationModule, FeedbackLoopModule, ConfidenceEstimatorModule, UserModelModule, MemoryRetentionModule, AfterActionReviewModule, GoalDecompositionModule, GoalProposalModule,
        SkillsContextModule,
        LocalProvider, GeminiProvider, CustomProvider, AnthropicProvider, OpenAIProvider,
        OfficialChatProvider, OpenRouter, OfficialSpeechTTS, ElevenLabsTTS, WebSpeechTTS,
        OpenRouterTTS, OfficialStreamingSpeechTTS, CustomAPITTS, GeminiTTS,
        TensorArtGenerateTool, SearchChatHistoryTool, BashTool, FileReadTool, WebSearchTool,
        PluginInstallerTool, ViewLogsTool, WebSnipperTool, CodeInterpreter,
        EditFileSegmentTool, DownloadFileTool, SendFileTool,
        EmotionAdjustTool, FileListTool, CalculatorTool, GitHubTool,
        GetCurrentTimeTool, MessagingTool, BgProcTool, ManageIdentitiesTool, CronTool,
        OCRTool, ManagePairingTool, FileManagerTool, FileWriteTool,
        DailySummaryTool,
        ChatLogTool,
        TelegramQuickToolkit,
        DiaryTool,
        QuestionTool, ApplyPatchTool,
        GrepTool, TodoWriteTool, SkillTool,
        SendFinalReplyTool, SendStatusUpdateTool,
        DelegateTool,
        UndoLastChangesTool,
        DiagnosticsTool,
        AskChoiceTool
      ];

      allStaticModules.forEach(m => SystemRegistry.register(m));

      if (typeof window === 'undefined') {
        try {
          writeAvailableToolsFile();
        } catch (fileErr) {
          console.warn('[REGISTRY] Non-blocking failure while generating available_tools.json:', fileErr);
        }
        try {
          const skillCount = SkillsRegistry.loadFromDisk();
          if (skillCount > 0) {
            console.log(`[SKILLS_REGISTRY] Loaded ${skillCount} skill(s) from disk.`);
          }
        } catch (skillErr: any) {
          console.warn('[SKILLS_REGISTRY] Non-blocking failure while loading skills:', skillErr.message);
        }
      }

      await CustomToolsLoader.loadAndRegisterAll();
      await CortexModulesLoader.loadAndRegisterAll();

      if (typeof window === 'undefined') {
        try {
           await PluginManager.getInstance().loadPlugins();
        } catch (e: any) {
          console.error('[REGISTRY] PluginManager failed to load plugins dynamically:', e.message);
        }
      }

      try {
         DynamicLoader.syncAddons().catch(e => console.warn('[KERNEL] Background addon sync postponed:', e.message));
      } catch (e) {
        console.warn('[KERNEL] DynamicLoader not available yet.');
      }

       if (typeof window === 'undefined') {
         SubAgentRegistry.register(CreativeAgent);
         SubAgentRegistry.register(ResearchAgent);
         SubAgentRegistry.register(ExplorerAgent);
         SubAgentRegistry.register(PlannerAgent);
         console.log(`[SUBAGENT] Registered ${SubAgentRegistry.getAll().length} sub-agents`);

         McpGateway.ensureInitialized().catch(e => console.warn('[MCP] init deferred:', e?.message));
       }

       BackgroundToolDispatcher.getInstance();
     } catch (err) {
       console.error('[KERNEL] Registry Initialization CRITICAL FAILURE:', err);
     }
   })();
   return initPromise;
}
