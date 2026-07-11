import React from 'react';
import { AvatarConfig, AgentState, Memory, ChatSession } from '../../include/types';

export interface StageTabProps {
  state: AgentState;
  avatarConfig: AvatarConfig;
  onAvatarUpdate: (newConfig: any) => void;
  animations: string[];
  setAnimations: (anims: string[]) => void;
  showSubtitles: boolean;
  setShowSubtitles: (val: boolean) => void;
  addLog: (type: 'user' | 'agent', content: string) => void;
  memories: Memory[];
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
  
  // Advanced Chat properties integrated from ConsoleTab
  logs: any[];
  input: string;
  setInput: (val: string) => void;
  handleThink: (e: React.FormEvent) => void;
  isThinking: boolean;
  activeSubtitle: string | null;
  typedSubtitle: string;
  isSubtitleTyping: boolean;
  setActiveSubtitle: (val: string | null) => void;
  perceivedName: string;
  setIdentity?: (name: string) => void;
  setActiveTab?: (tab: any) => void;

  isSleeping: boolean;
  setIsSleeping: (val: boolean) => void;
  showChatFeed: boolean;
  setShowChatFeed: (val: boolean) => void;
  showInfoCard: boolean;
  setShowInfoCard: (val: boolean) => void;
  isMicEnabled: boolean;
  setIsMicEnabled: (val: boolean) => void;
  
  // Persona quick switching controls
  activePersonaId?: string;
  setActivePersonaId?: (id: string) => void;
  NEURAL_CORES?: any[];

  // Session parameters dynamically integrated for responsive Conversations HUD
  sessions?: ChatSession[];
  activeSessionId?: string;
  onSwitchSession?: (id: string) => void;
  onCreateSession?: () => void;
  onDeleteSession?: (id: string, e: React.MouseEvent) => void;
  onRestoreProfile?: (name: string, sessionId: string) => void;
  identities?: any[];
  onRefreshIdentities?: () => Promise<void>;
  SpeechService?: any;
  onUpdateRelation?: (relation: any) => void;
}

export interface SpontaneousConfig {
  cooldownInterval: number;
  probabilisticTriggerChance: number;
  enableSpontaneousSpam: boolean;
}
