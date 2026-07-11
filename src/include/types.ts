export type EmotionType = 'joy' | 'curiosity' | 'melancholy' | 'determination' | 'serenity' | 'anger' | 'stress' | 'irritation' | 'excitement' | 'embarrassment' | 'jealousy' | 'panic' | 'relief' | 'shame' | 'pride';

export enum ModuleType {
  CORTEX = 'cortex',
  TOOL = 'tool',
  ADDON = 'addon',
  PROVIDER = 'provider',
  TTS = 'tts',
  IO = 'io',
  GATEWAY = 'gateway'
}

export type ModulePhase = 'pre-process' | 'context-augmentation' | 'post-process' | 'execution' | 'output' | 'logic' | 'PHASE 1: AGGREGATION' | 'PHASE 2: COMPRESSION' | 'PHASE 3: EVALUATION' | 'PHASE 4: EXECUTION' | 'PHASE 2: OPTIMIZATION' | 'PHASE 4: OPTIMIZATION' | 'PHASE 1: MAINTENANCE' | 'PHASE 4: EXPRESSION' | 'SOUL' | 'LOGIC';

export interface BaseModule {
  metadata: BaseModuleMetadata;
  /**
   * Optional method to fetch dynamic options for a specific field.
   * Useful for things like model lists from an API.
   */
  getDynamicOptions?: (fieldName: string, currentConfig: any) => Promise<{ label: string; value: any }[]>;
}

/**
 * Common metadata for all pluggable components.
 */
export interface BaseModuleMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  type: ModuleType;
  order: number;
  configSchema?: ModuleConfigSchema;
  settingsTab?: 'Providers' | 'Addons' | 'Neural' | 'Vocal' | 'System' | string;
  inputs?: string[];
  outputs?: string[];
}

export interface ModuleConfigSchema {
  fields: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'textarea' | 'color' | 'slider';
      label: string;
      description?: string;
      default?: any;
      placeholder?: string;
      tab?: string;
      group?: string;
      min?: number;
      max?: number;
      step?: number;
      options?: { label: string; value: any }[];
      dynamicOptions?: boolean; // Flag to indicate options should be fetched from module
      required?: boolean;
    };
  };
}

/**
 * Cortex Module (Neural Processing)
 */
export interface CortexModuleMetadata extends BaseModuleMetadata {
  type: ModuleType.CORTEX;
  phase: ModulePhase;
  trigger?: (input: string, state: AgentState) => boolean;
}

export interface CortexModule extends BaseModule {
  metadata: CortexModuleMetadata;
  run: (input: string, state: AgentState, context: any) => Promise<any>;
}

/**
 * Tool Module (LLM Function Calling)
 */
export interface ToolModuleMetadata extends BaseModuleMetadata {
  type: ModuleType.TOOL;
  parameters: {
    type: "object";
    properties: {
      [key: string]: {
        type: string;
        description: string;
        enum?: any[];
      };
    };
    required?: string[];
  };
}

export interface ToolModule extends BaseModule {
  metadata: ToolModuleMetadata;
  execute: (args: any, context: any) => Promise<any>;
}

/**
 * Addon Module (External Scripts)
 */
export interface AddonModuleMetadata extends BaseModuleMetadata {
  type: ModuleType.ADDON;
  runtime: 'python' | 'lua' | 'node' | 'go' | 'bash';
  entryPoint: string;
}

/**
 * OpenAI-compatible Message Format
 */
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

/**
 * Strict Payload Blueprint for LLM Request Configuration
 */
export interface PayloadBlueprint {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
  }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: {
    type: 'json_object' | 'text';
  };
  tools?: any[];
}

/**
 * AI Provider Module
 */
export interface ProviderModuleMetadata extends BaseModuleMetadata {
  type: ModuleType.PROVIDER;
  models: string[];
}

export interface ProviderModule extends BaseModule {
  metadata: ProviderModuleMetadata;
  generate: (prompt: string | ChatCompletionMessage[], config: any) => Promise<string>;
  getModels?: (config: any) => Promise<{ label: string; value: string }[]>;
}

/**
 * TTS Module
 */
export interface TTSModuleMetadata extends BaseModuleMetadata {
  type: ModuleType.TTS;
}

export interface TTSModule extends BaseModule {
  metadata: TTSModuleMetadata;
  speak: (text: string, config: any) => Promise<void>;
}

/**
 * Persisten Relational Layer
 */
export interface UserRelation {
  uid: string;
  trust: number;     // 0-100
  affection: number; // 0-100
  reputation: number;// 0-100
  lastInteraction: number;
}

/**
 * Volatile Mood Layer (Temporal Decay)
 */
export interface MoodState {
  joy: number;
  anger: number;
  sadness: number;
  stress: number;
  irritation: number;
  excitement: number;
  embarrassment: number;
  curiosity: number;
  lastUpdate: number;
  jealousy?: number;
  loneliness?: number;
  playfulness?: number;
  chastity?: number;
  temperance?: number;
  charity?: number;
  diligence?: number;
  patience?: number;
  kindness?: number;
  humility?: number;
  lust?: number;
  gluttony?: number;
  greed?: number;
  sloth?: number;
  wrath?: number;
  envy?: number;
  pride?: number;
  // v0.5.0 Neuromorphic Chemicals / Neurotransmitters
  dopamine?: number;
  serotonin?: number;
  oxytocin?: number;
  noradrenaline?: number;
  cortisol?: number;
  ambivalence?: string;
  hope?: number;
  fear?: number;
  gratitude?: number;
  love?: number;
  distress?: number;
}

/**
 * Structured Emotion Layer (v0.4 Engine)
 */
export interface EmotionState {
  arousal: number; // 0-100
  valence: number; // -100 to 100
  focus: number;   // 0-100
  rapport: number; // 0-100
  lastUpdate: number;
}

export interface EmotionDelta {
  arousal?: number;
  valence?: number;
  focus?: number;
  rapport?: number;
}

/**
 * Represents a factual memory of the agent.
 */
export interface Memory {
  id: string;
  ownerId: string;
  speaker?: string; // The perceived speaker
  type: 'interaction' | 'observation' | 'fact' | 'system';
  content: string;
  timestamp: number;
  importance: number; // 0-1
  tags: string[];
  context?: string;
  sentiment?: number; // -1 to 1
}

export interface ViewerHabit {
  action: string;
  frequency: number;
  lastSeen: number;
}

export interface Identity {
  id: string;
  ownerId: string;
  perceivedName: string;
  realName?: string;
  source: 'telegram' | 'web' | 'introduction' | 'discord' | 'live_stream';
  sourceId?: string;
  traits: string[];
  habits: ViewerHabit[];
  importantFacts: string[];
  linkedAccounts: string[]; // List of other sourceIds or identifiers
  preferredLanguage?: string;
  lastMet: number;
  trust?: number;
  affection?: number;
  reputation?: number;
  yuiPerspective?: string;
}

/**
 * Represents an abstracted "dream" or long-term concept.
 */
export interface Dream {
  id: string;
  ownerId: string;
  concept: string;
  underlyingMemories: string[]; // IDs of memories that formed this dream
  strength: number;
  lastReinforced: number;
  abstractions: string[]; // Higher level patterns derived
}

/**
 * Represents an external API capability the agent can use.
 */
export interface APICapability {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  endpoints: APIEndpoint[];
  authType: 'none' | 'apiKey' | 'bearer';
  learnedAt: number;
}

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  parameters: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
}

/**
 * Represents a learned behavioral or API strategy.
 */
export interface LearnedStrategy {
  id: string;
  topic: string; // e.g., "API_RETRY_LOGIC", "EMOTIONAL_RESPONSE_PATTERN"
  instruction: string;
  confidence: number; // 0-1
  successCount: number;
  failureCount: number;
  lastOptimized: number;
}

/**
 * Tracks performance for specific operations.
 */
export interface PerformanceMetric {
  timestamp: number;
  operation: string;
  latency: number;
  success: boolean;
  context?: string;
}

export interface ProviderConfig {
  provider: string; // Module ID
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  ttsProvider?: string; // Module ID
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
}

export interface AvatarConfig {
  modelUrl: string;
  scale?: number;
  xOffset?: number;
  yOffset?: number;
  disableMouseTracking?: boolean;
}

export interface CoreKnowledge {
  id: string;
  topic: string;
  content: string;
  confidence: number;
  sourceMemoryIds: string[];
  updatedAt: number;
}

export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  traits: string[];
  color: string;
  archetype: string;
}

/**
 * Workflow Graph (ComfyUI Style)
 */
export interface NeuralNode {
  id: string;
  type: string; // The module id or special types
  data: any;
  position: { x: number; y: number };
}

export interface NeuralEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NeuralWorkflow {
  nodes: NeuralNode[];
  edges: NeuralEdge[];
}

export enum AdaptiveAction {
  SHIFT_TONE_WARM = 'SHIFT_TONE_WARM',
  SHIFT_TONE_ANALYTICAL = 'SHIFT_TONE_ANALYTICAL',
  SHIFT_TONE_ENERGETIC = 'SHIFT_TONE_ENERGETIC',
  INCREASE_CONFIDENCE = 'INCREASE_CONFIDENCE',
  DECREASE_CONFIDENCE = 'DECREASE_CONFIDENCE',
  USE_DEEP_MEMORY = 'USE_DEEP_MEMORY',
  USE_SURFACE_MEMORY = 'USE_SURFACE_MEMORY'
}

export interface QTable {
  [state_action: string]: number;
}

export interface SubTask {
  id: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  result?: any;
}

export interface TaskPlan {
  id: string;
  originalGoal: string;
  tasks: SubTask[];
  currentTaskIndex: number;
  isComplete: boolean;
}

/**
 * The current state of the agent's consciousness.
 */
export interface AgentState {
  status: 'awake' | 'dreaming' | 'learning' | 'idle' | 'reflecting' | 'planning' | 'executing' | 'sleeping';
  energy: number;
  mood: MoodState;
  emotion: EmotionState;
  activePersonaId: string;
  tone: {
    pitch: number;
    speed: number;
    emotionalBias: string;
  };
  relation: UserRelation;
  activeContext: string[];
  lastDreamCycle: number;
  heuristics: LearnedStrategy[];
  knowledge: CoreKnowledge[];
  currentPlan?: TaskPlan;
  currentLiveTopic?: string;
  systemHealth: {
    latency: number;
    successRate: number;
    tasksCompleted: number;
    consecutive_formatting_errors?: number;
    somatic?: {
      cpuUsage?: number;
      ramUsage?: number;
      virtualHeartrate?: number;
      virtualTemperature?: number;
      neuralEnergy?: number;
      touchRegion?: string;
      touchSensorId?: string;
    };
    homeostasis?: {
      computationalSuffering?: number;
      computationalFlourishing?: number;
      cognitiveModeOfAttention?: string;
      totalEpochs?: number;
      accuracy?: number;
      lossValue?: number;
    };
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  logs: { type: 'user' | 'agent', content: string, timestamp: number, isSystem: boolean }[];
}
