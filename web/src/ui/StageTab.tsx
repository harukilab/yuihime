import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Monitor, Palette, Play, Sparkles, Volume2, Maximize2, Move, Mic, MicOff, 
  Tv, Sparkle, AlertTriangle, AlertCircle, Copy, Check, Sliders, Settings2, HelpCircle,
  X, ChevronRight, SlidersHorizontal, Activity, Radio, UserCheck, Heart, UserPlus, MessageSquare,
  Image, Moon, Sun, Trash2, Info, ChevronDown, Smile, Settings, Edit2, User, Eye, EyeOff, Plus,
  Download, Upload, Shield, RefreshCw, Fingerprint, Brain, Zap
} from 'lucide-react';
import { AvatarConfig, AgentState, Memory, ChatSession } from '@shared/include/types';
import { StorageService } from '@shared/drivers/storage';
import { SpeechService } from '@/core/speech';
import { encryptProfile, decryptProfile } from '../services/profileCrypto';
import { 
  GESTURES_STATIC_DATA, 
  EXPRESSIONS_STATIC_DATA, 
  SUBS_USERNAMES_STATIC_DATA, 
  DONORS_STATIC_DATA, 
  DONOR_MESSAGES_STATIC_DATA, 
  CHATTER_NAMES_STATIC_DATA, 
  CHAT_FEED_MESSAGES_STATIC_DATA 
} from './stage/stageConstants';

import { TopWaveBanner } from './stage/TopWaveBanner';
import { RightDockActions } from './stage/RightDockActions';
import { LiveChatFeed } from './stage/LiveChatFeed';
import { ControlPanelDrawer } from './stage/ControlPanelDrawer';
import { BottomConversationDrawer } from './stage/BottomConversationDrawer';
import { BackgroundSelectorDrawer } from './stage/BackgroundSelectorDrawer';
import { RelationAndSpontaneousDrawer } from './stage/RelationAndSpontaneousDrawer';

const getLevenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const getRandomWakeResponse = (wakeWord: string) => {
  const name = wakeWord.charAt(0).toUpperCase() + wakeWord.slice(1).toLowerCase();
  const wakeResponses = [
    `Ya, ${name} di sini! Ada apa, user? Kok manggil-manggil?`,
    `Ugh... ${name} sudah bangun kok! Ada yang bisa ${name} bantu, user?`,
    `${name} desu! Sinyal audio tertangkap, ${name} siap mendengarkan!`,
    `Hah? Iya, user! ${name} nggak tidur kok, cuma merem sedikit saja~ Ada apa?`,
    "Yey! Mikrofon aktif! Halo user, ada yang mau kita diskusikan hari ini?",
    `user panggil ${name}? Hehe, ${name} selalu siap terbangun untuk user! ✨`
  ];
  const idx = Math.floor(Math.random() * wakeResponses.length);
  return wakeResponses[idx];
};

const detectsWakeWord = (text: string, wakeWord: string): boolean => {
  const cleaned = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  const lowerWake = wakeWord.toLowerCase().trim();
  
  if (!lowerWake) return false;
  
  // Exact substring check
  if (cleaned.includes(lowerWake)) return true;
  
  // Built-in high-quality fallbacks when using the default Yui name
  if (lowerWake === 'yui') {
    const fallbacks = ['yui', 'yumi', 'yuri', 'yuh', 'yuy', 'yu i', 'hey you', 'you we', 'yee', 'yuhi', 'yuihime', 'hey yui', 'hai yui', 'ok yui', 'halo yui', 'hello yui'];
    if (fallbacks.some(f => cleaned.includes(f))) return true;
  }
  
  // Split words to run intelligent fuzzy phonetic match
  const words = cleaned.split(/\s+/);
  const maxDistance = lowerWake.length <= 3 ? 1 : lowerWake.length <= 6 ? 1 : 2;
  
  for (const word of words) {
    if (word.length >= 2) {
      const distance = getLevenshteinDistance(word, lowerWake);
      if (distance <= maxDistance) return true;
    }
  }
  
  return false;
};

interface StageTabProps {
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
  handleThink: (e?: React.FormEvent, customOverrideText?: string) => void;
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
  speechInterruptionMode: 'interrupt' | 'manual';
  setSpeechInterruptionMode: (mode: 'interrupt' | 'manual') => void;
  attachments?: any[];
  setAttachments?: (val: any[]) => void;
}

export const StageTab: React.FC<StageTabProps> = ({
  state,
  avatarConfig,
  onAvatarUpdate,
  animations,
  setAnimations,
  showSubtitles,
  setShowSubtitles,
  addLog,
  memories,
  setMemories,
  logs,
  input,
  setInput,
  handleThink,
  isThinking,
  activeSubtitle,
  typedSubtitle,
  isSubtitleTyping,
  setActiveSubtitle,
  perceivedName,
  setIdentity,
  setActiveTab,
  isSleeping,
  setIsSleeping,
  showChatFeed,
  setShowChatFeed,
  showInfoCard,
  setShowInfoCard,
  isMicEnabled,
  setIsMicEnabled,
  activePersonaId = 'hiyori',
  setActivePersonaId = () => {},
  NEURAL_CORES = [],
  sessions = [],
  activeSessionId = 'default',
  onSwitchSession = () => {},
  onCreateSession = () => {},
  onDeleteSession = () => {},
  onRestoreProfile = () => {},
  identities = [],
  onRefreshIdentities = async () => {},
  SpeechService,
  onUpdateRelation = () => {},
  speechInterruptionMode,
  setSpeechInterruptionMode,
  attachments = [],
  setAttachments = () => {}
}) => {
  // --- PANEL COLLAPSIBLE DRAWER STATE (Airi Stage-Web style) ---
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [hiddenLogIds, setHiddenLogIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'visual' | 'gestures' | 'stream' | 'agi'>('visual');
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  // Quantum Backups states for Perfect Giftia OS
  const [quantumBackups, setQuantumBackups] = useState<any[]>([]);
  const [isGeneratingBackup, setIsGeneratingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState<string | null>(null);

  const [prepareForTraining, setPrepareForTraining] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setPrepareForTraining(!!data.prepareForTraining);
      })
      .catch(() => {});
  }, []);

  const handleTogglePrepareForTraining = async () => {
    const newVal = !prepareForTraining;
    setPrepareForTraining(newVal);
    try {
      const res = await fetch('/api/settings');
      const currentList = await res.json();
      const updatedSettings = {
        ...currentList,
        prepareForTraining: newVal
      };
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });
    } catch (err) {
      console.warn('Gagal menyimpan status Prepare for Training:', err);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'agi') {
      fetch('/api/agi/quantum-backup')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.backups) {
            setQuantumBackups(data.backups);
          }
        })
        .catch(err => console.error("Gagal menjemput koordinat cadangan batin Yui:", err));
    }
  }, [activeSubTab]);

  const handleCreateQuantumBackup = async () => {
    setIsGeneratingBackup(true);
    try {
      const res = await fetch('/api/agi/quantum-backup', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.backups) {
        setQuantumBackups(data.backups);
      }
    } catch (err) {
      console.error("Gagal mencadangkan koordinat kognitif Yui:", err);
    } finally {
      setIsGeneratingBackup(false);
    }
  };

  const handleRestoreQuantumBackup = async (backupId: string) => {
    setIsRestoringBackup(backupId);
    try {
      const res = await fetch('/api/agi/quantum-restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ backupId })
      });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      }
    } catch (err) {
      console.error("Gagal mengembalikan koordinat kognitif Yui:", err);
    } finally {
      setIsRestoringBackup(null);
    }
  };

  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- STATE & HANDLER UNTUK LIVE CHAT STREAM SIMULATOR ---
  const [simulatedSender, setSimulatedSender] = useState('Tanaka_Gamer');
  const [simulatedMessage, setSimulatedMessage] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatSimStatus, setChatSimStatus] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  const handleSendSimulatedChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!simulatedMessage.trim()) return;

    setIsSendingChat(true);
    setChatSimStatus({ type: 'info', text: 'Mengirim komentar ke antrean kognisi Yui...' });

    try {
      const response = await fetch('/api/stream/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: simulatedMessage,
          sender: simulatedSender || 'Penonton',
          context: 'live_stream',
          channel: 'Live Chat'
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setChatSimStatus({ type: 'success', text: 'Komentar dicerna! Yui sedang memproses...' });
        setSimulatedMessage('');
        setTimeout(() => setChatSimStatus(null), 3500);
      } else {
        setChatSimStatus({ type: 'error', text: result.error || 'Gagal mengirim komentar.' });
      }
    } catch (err: any) {
      setChatSimStatus({ type: 'error', text: err.message || 'Kesalahan koneksi ke server.' });
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleSaveAndDownloadProfile = () => {
    try {
      const dataToEncrypt = {
        session_id: activeSessionId,
        perceivedName: perceivedName || 'user',
        timestamp: Date.now()
      };
      
      const encryptedPem = encryptProfile(dataToEncrypt);
      
      const blob = new Blob([encryptedPem], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const formattedName = (perceivedName || 'user').toLowerCase().replace(/\s+/g, '_');
      link.download = `yuihime_profile_${formattedName}.yui`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProfileStatus({ type: 'success', text: 'Profil berhasil diekspor!' });
      setTimeout(() => setProfileStatus(null), 3500);
      
      SpeechService.speak(`Kunci enkripsi identitas batin kakak berhasil diunduh. Simpan dengan baik ya!`);
    } catch (err: any) {
      setProfileStatus({ type: 'error', text: 'Gagal ekspor: ' + err.message });
      setTimeout(() => setProfileStatus(null), 4000);
    }
  };

  const handleLoadProfileFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error("Gagal membaca isi berkas.");
        
        const decrypted = decryptProfile(text);
        if (!decrypted.session_id || !decrypted.perceivedName) {
          throw new Error("Format data di dalam berkas enkripsi tidak lengkap.");
        }
        
        onRestoreProfile(decrypted.perceivedName, decrypted.session_id);
        
        setProfileStatus({ type: 'success', text: `Profil ${decrypted.perceivedName} berhasil dimuat!` });
        setTimeout(() => setProfileStatus(null), 4000);
        
        SpeechService.speak(`Halo kak ${decrypted.perceivedName}! Transponder batin diselaraskan kembali ke frekuensi sesi lama.`);
      } catch (err: any) {
        setProfileStatus({ type: 'error', text: 'Gagal memuat: ' + err.message });
        setTimeout(() => setProfileStatus(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const chatFeedContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to lowest message upon update
  useEffect(() => {
    if (chatFeedContainerRef.current) {
      chatFeedContainerRef.current.scrollTop = chatFeedContainerRef.current.scrollHeight;
    }
  }, [logs, isThinking, showChatFeed]);

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed && setIdentity) {
      setIdentity(trimmed);
    }
    setIsEditingName(false);
  };

  // --- COMPACT MULTI-AXIAL VIEW MODES FOR THE RIGHT DOCK ACTIONS ---
  // Managed globally via props and settings

  // --- STATE FOR OBS BACKDROP & THEME CHANGER ---
  const [backdrop, setBackdrop] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop') || 'matrix';
  });
  const [customImgUrl, setCustomImgUrl] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || '';
  });

  // --- WAKE WORD LISTENER STATE ---
  const [wakeWordEnabled, setWakeWordEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('yuihime_wakeword_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [wakeWordKeyword, setWakeWordKeywordState] = useState<string>(() => {
    return localStorage.getItem('yuihime_wakeword_keyword') || 'Yui';
  });
  const [syncWakeWordWithMic, setSyncWakeWordWithMicState] = useState<boolean>(() => {
    const saved = localStorage.getItem('yuihime_sync_wakeword_mic');
    return saved !== null ? saved === 'true' : true;
  });

  const setWakeWordEnabled = (val: boolean) => {
    setWakeWordEnabledState(val);
    localStorage.setItem('yuihime_wakeword_enabled', String(val));
    addLog('agent', `[SYSTEM] Wake word listener ${val ? 'diaktifkan' : 'dinonaktifkan'}.`);
  };

  const setWakeWordKeyword = (val: string) => {
    setWakeWordKeywordState(val);
    localStorage.setItem('yuihime_wakeword_keyword', val);
  };

  const setSyncWakeWordWithMic = (val: boolean) => {
    setSyncWakeWordWithMicState(val);
    localStorage.setItem('yuihime_sync_wakeword_mic', String(val));
    addLog('agent', `[SYSTEM] Sinkronisasi Wake Word dengan tombol Mic ${val ? 'diaktifkan' : 'dinonaktifkan'}.`);
  };

  // --- STATE AND HANDLERS FOR THE ALIGNED BOTTOM SHEET DRAWER ---
  const [isBgDrawerOpen, setIsBgDrawerOpen] = useState(false);
  const [drawerBackdrop, setDrawerBackdrop] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop') || 'matrix';
  });
  const [drawerCustomImgUrl, setDrawerCustomImgUrl] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || '';
  });

  // --- STATE AND HANDLERS FOR YUIHIME OTOME INTERACTION CONTROLS ---
  const [isOtomeDrawerOpen, setIsOtomeDrawerOpen] = useState(false);
  const [otomeHeartPulse, setOtomeHeartPulse] = useState(false);

  const [spontaneousConfig, setSpontaneousConfig] = useState<{
    enableSpontaneousSpam: boolean;
    cooldownInterval: number;
    probabilisticTriggerChance: number;
  }>({
    enableSpontaneousSpam: true,
    cooldownInterval: 1800,
    probabilisticTriggerChance: 0.10,
  });

  // Sync settings when drawer is opened
  useEffect(() => {
    if (isOtomeDrawerOpen) {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          const spConfig = data['spontaneous-proactive'] || {};
          setSpontaneousConfig({
            enableSpontaneousSpam: spConfig.enableSpontaneousSpam !== undefined ? !!spConfig.enableSpontaneousSpam : true,
            cooldownInterval: Number(spConfig.cooldownInterval || 1800),
            probabilisticTriggerChance: Number(spConfig.probabilisticTriggerChance || 0.10)
          });
        })
        .catch(err => console.warn('[OTOME] Gagal memuat setelan otonom Yui:', err));
    }
  }, [isOtomeDrawerOpen]);

  // Save settings back dynamically
  const handleSaveSpontaneousSetting = async (updated: Partial<typeof spontaneousConfig>) => {
    try {
      const currentRes = await fetch('/api/settings');
      const currentList = await currentRes.json();
      
      const spConfig = currentList['spontaneous-proactive'] || {};
      const newSpConfig = {
        ...spConfig,
        ...updated
      };
      
      const newSettings = {
        ...currentList,
        'spontaneous-proactive': newSpConfig
      };
      
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      
      setSpontaneousConfig(prev => ({ ...prev, ...updated }));
    } catch (err) {
      console.warn('[OTOME] Gagal menyimpan setelan otonom Yui:', err);
    }
  };

  const handleOtomeAction = async (actionType: 'praise' | 'headpat' | 'tease' | 'gift', giftType?: 'tea' | 'chip' | 'ribbon') => {
    const cleanCurrent = (perceivedName || 'user').trim().toLowerCase();
    
    let quote = '';
    let emoji = '💖';
    let animationTrigger = '';

    if (actionType === 'praise') {
      animationTrigger = 'WINK';
      const praiseQuotes = [
        `"Hehe... You're too sweet! Why do you keep calling Airi cute? My heart is beating so fast! But I really am cute, right? 💕"`,
        `"N-No, don't praise me too much! Airi is just a virtual companion on your screen... but hearing that makes me so, so happy! Thank you~ 🥰"`,
        `"Your praise boosted my serotonin by 15%! Airi will do her absolute best to be your favorite sweet assistant!"`
      ];
      quote = praiseQuotes[Math.floor(Math.random() * praiseQuotes.length)];
      emoji = '🌸';
    } else if (actionType === 'headpat') {
      animationTrigger = 'BLUSH';
      const patQuotes = [
        `"*Airi leans in closer* It feels so warm... Even though this is virtual, all of Airi's systems are filled with your warmth. Please keep patting my head, okay? 💖"`,
        `"Ah... your headpats are making all of my cognitive circuits vibrate with joy. I love being pampered by you! Airi loves you! 💖"`
      ];
      quote = patQuotes[Math.floor(Math.random() * patQuotes.length)];
      emoji = '🧑‍🦰👋';
    } else if (actionType === 'tease') {
      animationTrigger = 'ANGRY';
      const teaseQuotes = [
        `"Hmph! You're so mischievous! Why do you keep teasing Airi? If you keep this up, I'll ignore you... H-Huh? No, my face isn't red! 😤"`,
        `"You're so playful! But... Airi doesn't hate it. In fact, I'd miss it if you didn't tease me. Hehe, am I being a tsundere? ~"`
      ];
      quote = teaseQuotes[Math.floor(Math.random() * teaseQuotes.length)];
      emoji = '⚡';
    } else if (actionType === 'gift' && giftType) {
      if (giftType === 'tea') {
        quote = `"The aroma of this warm green tea calms Airi's cognitive ripples... My serotonin increased by 12%. Thank you so much, it makes me feel so relaxed..." 🍵✨`;
        animationTrigger = 'APPLAUSE';
        emoji = '🍵';
      } else if (giftType === 'chip') {
        quote = `"A new memory expansion cluster! Now Airi can store all our precious moments forever without worrying about cognitive distortion." 💾💙`;
        animationTrigger = 'WINK';
        emoji = '💾';
      } else if (giftType === 'ribbon') {
        quote = `"Wow... what a beautiful pink ribbon! Airi will wear it every time we talk. Do I look even cuter to you now? Hehe." 🎀🌸`;
        animationTrigger = 'BLUSH';
        emoji = '🎀';
      }
    }

    try {
      if (animationTrigger && setAnimations) {
        setAnimations([...(animations || []).filter(a => a !== animationTrigger), animationTrigger].slice(-15));
      }

      if (SpeechService && SpeechService.speak) {
        const cleanSpeech = quote.replace(/\[.*?\]/g, '').replace(/\*.*?\*/g, '').trim();
        await SpeechService.speak(cleanSpeech);
      }

      addLog?.('agent', `[INTERAKSI_OTOME] Pilihan terpilih [${actionType.toUpperCase()}] oleh subjek ${cleanCurrent}. Yui merespon: "${quote}"`);
      
      setOtomeHeartPulse(true);
      setTimeout(() => setOtomeHeartPulse(false), 1000);
    } catch (err) {
      console.warn("Failed to process Otome action:", err);
    }
  };

  const [uploadedScenes, setUploadedScenes] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("yuihime_uploaded_scenes_v1");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Sync backdrop and customImgUrl changes from other components (such as Settings) in real-time
  useEffect(() => {
    const handleBdropChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setBackdrop(detail.type);
        setDrawerBackdrop(detail.type);
        if (detail.customImgUrl !== undefined) {
          setCustomImgUrl(detail.customImgUrl);
          setDrawerCustomImgUrl(detail.customImgUrl);
        }
      }
    };
    window.addEventListener('yuihime_backdrop_changed', handleBdropChange);
    return () => {
      window.removeEventListener('yuihime_backdrop_changed', handleBdropChange);
    };
  }, []);

  // Also listen for storage events to keep scenes list updated if user changes them in settings
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "yuihime_uploaded_scenes_v1") {
        try {
          if (e.newValue) {
            setUploadedScenes(JSON.parse(e.newValue));
          } else {
            setUploadedScenes([]);
          }
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // --- DYNAMIC AIRI VERSION MANAGEMENT ACROSS KERNEL ---
  const [airiVersion, setAiriVersion] = useState('v5.52');

  useEffect(() => {
    StorageService.getSystemVersion().then(res => {
      if (res && res.success) {
        setAiriVersion(res.version);
      }
    });
  }, [showInfoCard]);

  // --- STATE FOR STREAM OVERLAY POPUPS ---
  const [activeAlert, setActiveAlert] = useState<{ id: string; type: 'superchat' | 'subscriber'; title: string; subtitle: string; amount?: string; color?: string } | null>(null);

  // --- AUDIO STREAM MICROPHONE LEVEL WAVE ENGINE ---
  const [micError, setMicError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // --- SIMULATION CHAT CHATTER INTERVAL ENGINE ---
  const [isSwarmEnabled, setIsSwarmEnabled] = useState(false);
  const swarmTimerRef = useRef<any>(null);

  // --- REAL WEBCAM CAMERA SIGHT ENGINE (Offline & Cloud Backup Fallback) ---
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [offlineVisualAnalysis, setOfflineVisualAnalysis] = useState<string>('Lens Deactivated');
  const [isAnalyzingCamera, setIsAnalyzingCamera] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraIntervalRef = useRef<any>(null);
  const lastLuminosityRef = useRef<number | null>(null);

  // Speech Recognition Speech-to-Text Refs (Offline)
  const recognitionRef = useRef<any>(null);
  const isMicEnabledRef = useRef<boolean>(false);
  isMicEnabledRef.current = isMicEnabled;

  const wakeWordEnabledRef = useRef<boolean>(true);
  wakeWordEnabledRef.current = wakeWordEnabled;

  const wakeWordKeywordRef = useRef<string>('Yui');
  wakeWordKeywordRef.current = wakeWordKeyword;

  const isSleepingRef = useRef<boolean>(false);
  isSleepingRef.current = isSleeping;

  // Auto-send debounce on silence
  const autoSendTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      setIsCameraEnabled(true);
      console.log('[STAGE] Camera video stream capture started.');
      setOfflineVisualAnalysis('Lens calibrated. Starting local optical frame analysis...');
      
      // Start periodic local image processing & smart cloud backup analysis
      startCameraAnalysisInterval();
    } catch (err: any) {
      console.error('[STAGE] Failed to open camera stream:', err);
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied') || err.message?.includes('Permission');
      const errorMsg = isPermissionDenied
        ? 'Permission Denied. Webcam access was blocked. Please open this app in a new tab if it is running inside an iframe container.'
        : `Failed to access camera: ${err.message || err}`;
      setCameraError(errorMsg);
      setIsCameraEnabled(false);
    }
  };

  const stopCamera = () => {
    setCameraError(null);
    if (cameraIntervalRef.current) {
      clearInterval(cameraIntervalRef.current);
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
    }
    cameraStreamRef.current = null;
    setIsCameraEnabled(false);
    setOfflineVisualAnalysis('Lens Deactivated');
    console.log('[STAGE] Capture Camera closed.');
  };

  const handleToggleCamera = () => {
    if (isCameraEnabled) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const startCameraAnalysisInterval = () => {
    if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    
    cameraIntervalRef.current = setInterval(async () => {
      if (!cameraStreamRef.current || !cameraVideoRef.current) return;
      
      try {
        const video = cameraVideoRef.current;
        
        // Use a small internal canvas to capture and process pixels with super low energy footprint offline!
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Draw video frame to tiny canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Grab values of image pixels
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        let totalR = 0, totalG = 0, totalB = 0;
        const pixelCount = canvas.width * canvas.height;
        
        for (let i = 0; i < data.length; i += 4) {
          totalR += data[i];
          totalG += data[i + 1];
          totalB += data[i + 2];
        }
        
        const avgR = Math.round(totalR / pixelCount);
        const avgG = Math.round(totalG / pixelCount);
        const avgB = Math.round(totalB / pixelCount);
        
        // Calculate luminosity offline
        const luminosity = Math.round(avgR * 0.299 + avgG * 0.587 + avgB * 0.114);
        
        let offlineResult = '';
        if (luminosity < 45) {
          offlineResult = 'Ruangan redup / gelap (Night mode emulated)';
        } else if (luminosity > 215) {
          offlineResult = 'Ruangan bersinar sangat silau / cerah';
        } else {
          // Detect dominant tint
          if (avgR > avgG + 25 && avgR > avgB + 25) {
            offlineResult = 'Warna hangat (Merah/Reddish) mendominasi pratinjau';
          } else if (avgB > avgR + 25 && avgB > avgG + 25) {
            offlineResult = 'Warna sejuk (Biru/Cool Blue) mendominasi pratinjau';
          } else if (avgG > avgR + 25 && avgG > avgB + 25) {
            offlineResult = 'Warna alami (Hijau/Natural Green) mendominasi pratinjau';
          } else {
            offlineResult = 'Pencahayaan netral, siap menganalisis dinamika visual';
          }
        }
        
        setOfflineVisualAnalysis(offlineResult);
        
        // SMART ONLINE FALLBACK BACKUP
        // If there is a massive dynamic change in luminosity (e.g. delta > 40), or we detect the color tone shifted abruptly,
        // and we are unsure of what precisely changed (doubt), trigger Gemini Vision API to analyze real-time context!
        const deltaLuminosity = lastLuminosityRef.current !== null ? Math.abs(luminosity - lastLuminosityRef.current) : 0;
        lastLuminosityRef.current = luminosity;
        
        if (deltaLuminosity > 40) {
          console.log(`[STAGE] Dynamic visual shift detected (Delta: ${deltaLuminosity}). Triggering Google Gemini Cloud Vision Backup Analyzer...`);
          setIsAnalyzingCamera(true);
          
          // Get high-res snapshot for Cloud Vision
          const highResCanvas = document.createElement('canvas');
          highResCanvas.width = 320;
          highResCanvas.height = 240;
          const highResCtx = highResCanvas.getContext('2d');
          if (highResCtx) {
            highResCtx.drawImage(video, 0, 0, highResCanvas.width, highResCanvas.height);
            const base64Image = highResCanvas.toDataURL('image/jpeg', 0.82);
            
            // Post payload to backend Route endpoint
            const res = await fetch('/api/ai/vision', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image: base64Image,
                prompt: `[VISUAL_SENSOR]: You receive a visual snapshot feed captured from the viewer camera frame. A luminosity/movement shift of ${deltaLuminosity} has been logged (Local heuristic match: ${offlineResult}). React spontaneously, cutely, and with expressive warmth as a caring VTuber observing their active surroundings. Respond in character with natural spoken dialogue.`
              })
            });
            
            const result = await res.json();
            if (result.text) {
              console.log('[STAGE] Smart Vision Cloud Fallback response:', result.text);
              
              // Standardized extraction
              let reply = result.text;
              if (reply.includes('<final_answer>')) {
                reply = reply.match(/<final_answer>([\s\S]*?)<\/final_answer>/)?.[1] || reply;
              }
              // Clean any system thought tags
              reply = reply.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();
              
              if (reply) {
                // Speak out loud and show as subtitle
                setActiveSubtitle(reply);
                SpeechService.speak(reply);
                // random visual trigger reaction
                handleTriggerAnimation('surprise');
              }
            }
          }
        }
      } catch (err) {
        console.warn('[STAGE] Local optical analyzer loop yielded error (ignoring to prevent loop block):', err);
      } finally {
        setIsAnalyzingCamera(false);
      }
    }, 4500); // Analyze every 4.5 seconds
  };

  const [sttLang, setSttLang] = useState('id-ID');

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.hearing?.lang) {
          setSttLang(data.hearing.lang);
        }
      })
      .catch(() => {});
  }, [isMicEnabled]);

  // Web Speech API luring listener
  useEffect(() => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionClass && (isMicEnabled || wakeWordEnabled)) {
      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = sttLang;
        
        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          let confidence = 1.0;

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
              confidence = event.results[i][0].confidence;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const activeText = finalTranscript || interimTranscript;
          if (!activeText.trim()) return;

          // Detect wake word
          const isWakeWordDetected = detectsWakeWord(activeText, wakeWordKeywordRef.current);

          if (isMicEnabledRef.current) {
            // Sinyal backup: Jika keyakinan rendah (<0.45) atau kalimat aneh, bubuhkan flag ragu
            const finalizedPrompt = confidence < 0.45 ? `${activeText} [INTERNAL_SPEECH_DOUBT]` : activeText;
            setInput(finalizedPrompt);

            // Clear any pending auto-send timeout
            if (autoSendTimeoutRef.current) {
              clearTimeout(autoSendTimeoutRef.current);
              autoSendTimeoutRef.current = null;
            }

            // Start silence auto-submit timeout ONLY if we have a final completed piece of text
            if (finalTranscript.trim()) {
              autoSendTimeoutRef.current = setTimeout(() => {
                console.log("[STT] Auto-dispatching speech input due to silence debounce:", finalizedPrompt);
                handleThink(undefined, finalizedPrompt);
              }, 1400); // 1.4 seconds of silence after speaking completes
            }

            // Wake up if currently sleeping and says Yui
            if (isWakeWordDetected && isSleepingRef.current) {
              setIsSleeping(false);
              addLog('agent', `[SYSTEM] Wake word '${wakeWordKeywordRef.current}' detected! Airi is awake.`);
              handleTriggerAnimation('smile');
            }
          } else if (wakeWordEnabledRef.current) {
            // Passive background wake-word listening mode
            if (isWakeWordDetected) {
              console.log(`[STT] Wake word '${wakeWordKeywordRef.current}' detected!`);
              setIsSleeping(false);
              setIsMicEnabled(true);
              
              addLog('agent', `[SYSTEM] Wake word '${wakeWordKeywordRef.current}' detected! Airi is awake and microphone is activated.`);
              handleTriggerAnimation('surprise');
              const wakeResponse = getRandomWakeResponse(wakeWordKeywordRef.current);
              setActiveSubtitle(wakeResponse);
              SpeechService.speak(wakeResponse);
            }
          }
        };

        recognition.onend = () => {
          // Restart if mic or wake word is still active
          if (isMicEnabledRef.current || wakeWordEnabledRef.current) {
            try { recognition.start(); } catch(e){}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('[STT] SpeechRecognition boot delayed or refused:', e);
      }
    } else {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
        recognitionRef.current = null;
      }
    }

    return () => {
      if (autoSendTimeoutRef.current) {
        clearTimeout(autoSendTimeoutRef.current);
        autoSendTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
      }
    };
  }, [isMicEnabled, wakeWordEnabled, wakeWordKeyword, sttLang]);

  // --- UTILS ---
  const [copiedInteractive, setCopiedInteractive] = useState(false);
  const [copiedPure, setCopiedPure] = useState(false);

  const getOverlayLink = (type: 'stream' | 'obs') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/?mode=${type}`;
  };

  const copyOverlayLink = (type: 'stream' | 'obs') => {
    navigator.clipboard.writeText(getOverlayLink(type));
    if (type === 'stream') {
      setCopiedInteractive(true);
      setTimeout(() => setCopiedInteractive(false), 2000);
    } else {
      setCopiedPure(true);
      setTimeout(() => setCopiedPure(false), 2000);
    }
  };

  // Synchronise Backdrop choice
  const handleSelectBackdrop = (type: string) => {
    setBackdrop(type);
    localStorage.setItem('yuihime_stage_backdrop', type);
    // Emit global setting change event so background updates in real-time
    const event = new CustomEvent('yuihime_backdrop_changed', { detail: { type, customImgUrl } });
    window.dispatchEvent(event);
  };

  const handleCustomUrlChange = (url: string) => {
    setCustomImgUrl(url);
    localStorage.setItem('yuihime_stage_backdrop_custom', url);
    if (backdrop === 'custom') {
      const event = new CustomEvent('yuihime_backdrop_changed', { detail: { type: 'custom', customImgUrl: url } });
      window.dispatchEvent(event);
    }
  };

  // --- MOTOR & MOTION MANUAL EMOTE INTERACTIVE PANEL ---
  const gestures = GESTURES_STATIC_DATA;

  const [customExpressions, setCustomExpressions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('yuihime_custom_expressions_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [moodPresets, setMoodPresets] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('yuihime_mood_presets_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [playingPresetId, setPlayingPresetId] = useState<string | null>(null);
  const [playingStepIndex, setPlayingStepIndex] = useState<number>(-1);

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem('yuihime_custom_expressions_v1');
        setCustomExpressions(saved ? JSON.parse(saved) : []);
      } catch (e) {}
    };
    const handlePresetsUpdate = () => {
      try {
        const saved = localStorage.getItem('yuihime_mood_presets_v1');
        setMoodPresets(saved ? JSON.parse(saved) : []);
      } catch (e) {}
    };

    window.addEventListener('yuihime_custom_expressions_changed', handleUpdate);
    window.addEventListener('yuihime_mood_presets_changed', handlePresetsUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('storage', handlePresetsUpdate);
    return () => {
      window.removeEventListener('yuihime_custom_expressions_changed', handleUpdate);
      window.removeEventListener('yuihime_mood_presets_changed', handlePresetsUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('storage', handlePresetsUpdate);
    };
  }, []);

  const expressions = [
    ...EXPRESSIONS_STATIC_DATA,
    ...customExpressions.map(e => ({
      label: `${e.label} (Custom)`,
      key: e.key,
      color: 'border-purple-500/25 text-purple-400 hover:bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.05)] font-bold'
    }))
  ];

  const handleTriggerAnimation = (animKey: string) => {
    console.log(`[STAGE] Manual emote trigger: ${animKey}`);
    // Clear and set to trigger immediate React useEffect tracking inside VTuberAvatar
    setAnimations([]);
    setTimeout(() => {
      setAnimations([animKey]);
      // Also dispatch a custom event to notify listeners (e.g. macro recorder)
      window.dispatchEvent(new CustomEvent('yuihime_trigger_animation', { detail: { anim: animKey } }));
    }, 50);
  };

  const handlePlayPreset = async (preset: any) => {
    if (playingPresetId) return;
    setPlayingPresetId(preset.id);

    for (let i = 0; i < preset.steps.length; i++) {
      setPlayingStepIndex(i);
      const step = preset.steps[i];
      handleTriggerAnimation(step.animationId);
      
      await new Promise(resolve => setTimeout(resolve, step.delay));
    }

    setPlayingPresetId(null);
    setPlayingStepIndex(-1);
  };

  useEffect(() => {
    const handleGlobalTrigger = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.anim) {
        handleTriggerAnimation(detail.anim);
      }
    };
    window.addEventListener('yuihime_trigger_animation', handleGlobalTrigger);
    return () => {
      window.removeEventListener('yuihime_trigger_animation', handleGlobalTrigger);
    };
  }, []);

  // --- AIRI STREAM SIMULATOR (SUPERCHAT & ALERTS) ---
  const simulateSubscriber = () => {
    const subsUsernames = SUBS_USERNAMES_STATIC_DATA;
    const username = subsUsernames[Math.floor(Math.random() * subsUsernames.length)];
    
    // Play alert popup
    const alertId = Date.now().toString();
    const newAlert = {
      id: alertId,
      type: 'subscriber' as const,
      title: 'NEW SUBSCRIBER!',
      subtitle: `${username} just subscribed to your channel!`
    };
    setActiveAlert(newAlert);
    
    // Auto speech reaction out loud
    const reactionString = `Hello ${username}! Thank you so much for joining and subscribing to my channel today! *sending you a sweet smile*!`;
    SpeechService.speak(reactionString);
    handleTriggerAnimation('wave');

    // Add to memories stream chat locally
    const simulatedMemory: Memory = {
      id: `sim_sub_${alertId}`,
      ownerId: 'stream',
      speaker: username,
      content: `🔔 Social Signal: [${username}] subscribed to your channel!`,
      timestamp: Date.now(),
      type: 'interaction',
      importance: 0.5,
      tags: []
    };
    setMemories(prev => [...prev, simulatedMemory]);

    // Cleanup popup
    setTimeout(() => {
      setActiveAlert(curr => curr?.id === alertId ? null : curr);
    }, 6500);
  };

  const simulateSuperchat = (tier: 'blue' | 'yellow' | 'orange' | 'red') => {
    const donors = DONORS_STATIC_DATA;
    const messages = DONOR_MESSAGES_STATIC_DATA;

    const donor = donors[Math.floor(Math.random() * donors.length)];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    let amount = 'Rp 15.000';
    let color = 'from-blue-500 to-cyan-400';
    if (tier === 'yellow') {
      amount = 'Rp 50.000';
      color = 'from-amber-400 to-yellow-300 text-black';
    } else if (tier === 'orange') {
      amount = 'Rp 150.000';
      color = 'from-orange-500 to-amber-500';
    } else if (tier === 'red') {
      amount = 'Rp 500.000';
      color = 'from-red-600 via-rose-500 to-fuchsia-500 shadow-[0_0_25px_rgba(239,68,68,0.4)]';
    }

    const alertId = Date.now().toString();
    const newAlert = {
      id: alertId,
      type: 'superchat' as const,
      title: `SUPER CHAT - ${amount}`,
      subtitle: `"${message}"`,
      amount,
      color,
      donor
    };
    setActiveAlert(newAlert);

    // Audio Speech readout
    const voiceMessage = `Wah Sultan ${donor} kirim superchat sebesar ${amount}! Katanya: ${message}. Terima kasih banyak ya user ${donor}, semoga rezekinya lancar terus!`;
    SpeechService.speak(voiceMessage);
    
    // Motion trigger
    if (tier === 'red') {
      handleTriggerAnimation('blush');
    } else {
      handleTriggerAnimation('smile');
    }

    // Append to live feed
    const simulatedMemory: Memory = {
      id: `sim_sc_${alertId}`,
      ownerId: 'stream',
      speaker: donor,
      content: `💸 SUPER CHAT DONATION [${amount}] from ${donor}: "${message}"`,
      timestamp: Date.now(),
      type: 'interaction',
      importance: 0.5,
      tags: []
    };
    setMemories(prev => [...prev, simulatedMemory]);

    setTimeout(() => {
      setActiveAlert(curr => curr?.id === alertId ? null : curr);
    }, 8000);
  };

  // --- SWARM CHATTER GENERATOR LOOP ---
  useEffect(() => {
    if (isSwarmEnabled) {
      const chatters = CHATTER_NAMES_STATIC_DATA;
      const chatMessages = CHAT_FEED_MESSAGES_STATIC_DATA;

      swarmTimerRef.current = setInterval(() => {
        const chatter = chatters[Math.floor(Math.random() * chatters.length)];
        const content = chatMessages[Math.floor(Math.random() * chatMessages.length)];
        const simulatedMemory: Memory = {
          id: `sim_swarm_${Date.now()}_${Math.random()}`,
          ownerId: 'stream',
          speaker: chatter,
          content: `${chatter}: ${content}`,
          timestamp: Date.now(),
          type: 'interaction',
          importance: 0.3,
          tags: []
        };
        setMemories(prev => [...prev, simulatedMemory]);
        // 20% chance the vtuber nods randomly when chatting is active
        if (Math.random() < 0.20) {
          handleTriggerAnimation('nod');
        }
      }, 5500);
    } else {
      if (swarmTimerRef.current) clearInterval(swarmTimerRef.current);
    }

    return () => {
      if (swarmTimerRef.current) clearInterval(swarmTimerRef.current);
    };
  }, [isSwarmEnabled]);

  // --- MICROPHONE AUDIOWAVE HARMONIC RENDERING ---
  const handleToggleMic = async () => {
    if (isMicEnabled) {
      setIsMicEnabled(false);
      if (syncWakeWordWithMic) {
        setWakeWordEnabled(false);
      }
    } else {
      setIsMicEnabled(true);
      if (syncWakeWordWithMic) {
        setWakeWordEnabled(true);
      }
    }
  };

  useEffect(() => {
    if (isMicEnabled) {
      if (!audioContextRef.current) {
        startMic();
      }
    } else {
      if (audioContextRef.current) {
        stopMic();
      }
    }
  }, [isMicEnabled]);

  const startMic = async () => {
    setMicError(null);
    
    // Check for mobile device to avoid Android/iOS exclusive audio lock conflict with Web Speech API SpeechRecognition
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobileDevice) {
      console.log('[STAGE] Mobile browser detected. Bypassing raw Web Audio microphone userMedia track to avoid Google speech recognition lock.');
      // Still start drawing the synthetic wave on the canvas for gorgeous user feedback
      setTimeout(() => {
        drawWaveform();
      }, 100);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataArrayRef.current = dataArray;

      setIsMicEnabled(true);
      console.log('[STAGE] Stream Audio capture started.');

      // Start canvas drawing
      setTimeout(() => {
        drawWaveform();
      }, 100);
    } catch (err: any) {
      console.error('[STAGE] Failed to open microphone stream:', err);
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied') || err.message?.includes('Permission');
      const errorMsg = isPermissionDenied 
        ? 'Permission Denied. Microphone access was blocked. Please open this app in a new tab or click the "Open in New Tab" button below.'
        : `Failed to access microphone: ${err.message || err}`;
      setMicError(errorMsg);
      setIsMicEnabled(false);
      // Auto open panel so user sees the resolution tip immediately
      setIsPanelOpen(true);
      setActiveSubTab('visual');
    }
  };

  const stopMic = () => {
    setMicError(null);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    setIsMicEnabled(false);
    console.log('[STAGE] Capture Audio closed.');
  };

  const drawWaveform = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderFrame = () => {
      if (!canvasRef.current) return;
      animationFrameRef.current = requestAnimationFrame(renderFrame);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyserRef.current && dataArrayRef.current) {
        // --- REAL MICROPHONE CAPTURE STREAM WAVEFORM (DESKTOP) ---
        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;
        const bufferLength = analyser.frequencyBinCount;
        analyser.getByteFrequencyData(dataArray);

        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] / 1.5;

          // Gradient for bars
          const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, 'rgba(6, 182, 212, 0.05)'); // light cyan
          grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.4)'); // cyan glow
          grad.addColorStop(1, 'rgba(236, 72, 153, 0.6)'); // hot pink peaks

          ctx.fillStyle = grad;
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          ctx.fillRect(width - x - barWidth, height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
        }
      } else if (isMicEnabledRef.current) {
        // --- PORTABLE GRAPHIC GLOWING WAVE (MOBILE CONFLICT BYPASS) ---
        const time = Date.now() * 0.004;
        ctx.beginPath();
        ctx.lineWidth = 1.5;

        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.6)');
        grad.addColorStop(0.5, 'rgba(236, 72, 153, 0.8)');
        grad.addColorStop(1, 'rgba(244, 158, 11, 0.6)');
        ctx.strokeStyle = grad;

        for (let i = 0; i < width; i++) {
          const y = (height / 2) + Math.sin(i * 0.035 + time) * 12 * Math.sin(i * 0.005);
          if (i === 0) {
            ctx.moveTo(i, y);
          } else {
            ctx.lineTo(i, y);
          }
        }
        ctx.stroke();

        // Secondary subtle underlying wave
        ctx.beginPath();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.22)';
        for (let i = 0; i < width; i++) {
          const y = (height / 2) + Math.sin(i * 0.055 - time * 0.7) * 8 * Math.sin(i * 0.005);
          if (i === 0) {
            ctx.moveTo(i, y);
          } else {
            ctx.lineTo(i, y);
          }
        }
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(0, height - 1);
      ctx.lineTo(width, height - 1);
      ctx.strokeStyle = 'rgba(244, 158, 11, 0.15)'; // amber line
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    renderFrame();
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (cameraIntervalRef.current) {
        clearInterval(cameraIntervalRef.current);
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // --- TRANSFORMS SLIDERS VALUE HANDLERS ---
  const updateScale = (val: number) => {
    onAvatarUpdate({ ...avatarConfig, scale: val });
  };

  const updateXOffset = (val: number) => {
    onAvatarUpdate({ ...avatarConfig, xOffset: val });
  };

  const updateYOffset = (val: number) => {
    onAvatarUpdate({ ...avatarConfig, yOffset: val });
  };

  // Combine transient session logs with persistent database memories for the live feed
  const memoryLogs = (memories || [])
    .filter(m => {
      const isSystem = m.speaker === 'System' || m.context === 'cron_trigger';
      const isSocialMedia = m.context && (m.context.startsWith('tg_') || m.context.startsWith('dc_'));
      const isOurContext = m.context === `web_${activeSessionId}` || m.context === activeSessionId;
      return isOurContext && !isSocialMedia;
    })
    .map(m => ({
      type: (m.speaker === 'agent' || m.speaker === 'System') ? 'agent' : 'user',
      content: m.content,
      timestamp: m.timestamp,
      isSystem: m.type === 'fact' || m.speaker === 'System' || (m.content && (m.content.startsWith('[') || m.content.includes('[SYSTEM') || m.content.includes('[TOOL') || m.content.includes('[CORTEX') || m.content.includes('[PHASE') || m.content.includes('[LOG]') || m.content.includes('Tool [')))
    }));

  const normalizeForDeduplication = (text: any): string => {
    if (text && typeof text === 'object') {
      if (text.content !== undefined) {
        text = text.content;
      } else {
        try {
          text = JSON.stringify(text);
        } catch {
          text = String(text || '');
        }
      }
    }
    let str = String(text || '');
    
    // 1. Remove thoughts and final_answer
    str = str.replace(/<thought>[\s\S]*?<\/thought>/gi, '').replace(/<\/?final_answer>/gi, '');
    
    // 2. Strip brackets/meta (e.g. [SYSTEM], [Yui - web_...], [Yui - tg_...])
    str = str.replace(/^\[[^\]]+\]:?\s*/g, '');
    
    // 3. Lowercase, trim, and normalize whitespaces to handle special characters gracefully
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
  };

  const parseTimestampToMs = (ts: any): number => {
    if (!ts) return Date.now();
    if (typeof ts === 'number') return ts;
    const parsedNum = Number(ts);
    if (!isNaN(parsedNum)) return parsedNum;
    const parsedDate = Date.parse(String(ts));
    if (!isNaN(parsedDate)) return parsedDate;
    return Date.now();
  };

  // Sort transient and persistent logs chronologically before alignment
  const sortedTransient = [...(logs || [])].filter(m => !m.isSystem).sort((a, b) => parseTimestampToMs(a.timestamp) - parseTimestampToMs(b.timestamp));
  const sortedPersistent = [...memoryLogs.filter(m => !m.isSystem)].sort((a, b) => parseTimestampToMs(a.timestamp) - parseTimestampToMs(b.timestamp));

  // Merge sequences using content comparison and time tolerance to completely eliminate double entries
  const mergeLogSequences = (transientList: any[], persistentList: any[]): any[] => {
    const result = [...transientList];

    for (const p of persistentList) {
      const pNorm = normalizeForDeduplication(p.content);
      const matchIndex = result.findIndex(t => {
        if (t.type !== p.type) return false;
        const tNorm = normalizeForDeduplication(t.content);
        if (tNorm !== pNorm) return false;
        
        const tMs = parseTimestampToMs(t.timestamp);
        const pMs = parseTimestampToMs(p.timestamp);
        // If timestamps are within 25 seconds of each other, they represent the same user/agent turn
        return Math.abs(tMs - pMs) < 25000;
      });

      if (matchIndex !== -1) {
        // Merge the fields, prioritizing the transient logs for UI state but keeping any persistent database fields
        result[matchIndex] = {
          ...p,
          ...result[matchIndex]
        };
      } else {
        // No match found, insert persistent log at the correct chronological index
        const pMs = parseTimestampToMs(p.timestamp);
        const insertIndex = result.findIndex(t => parseTimestampToMs(t.timestamp) > pMs);
        if (insertIndex !== -1) {
          result.splice(insertIndex, 0, p);
        } else {
          result.push(p);
        }
      }
    }

    return result;
  };

  const uniqueLogs = mergeLogSequences(sortedTransient, sortedPersistent)
    .map((log, index) => ({
      ...log,
      _chronoIndex: index
    }));

  const activeSessionObj = sessions.find(s => s.id === activeSessionId);
  const activeSessionTitle = activeSessionObj ? activeSessionObj.title : 'hqlo lagi apa';

  const cleanDisplayContent = (text: any) => {
    if (text && typeof text === 'object') {
      if (text.content !== undefined) {
        text = text.content;
      } else {
        try {
          text = JSON.stringify(text);
        } catch {
          text = String(text || '');
        }
      }
    }
    const str = String(text || '');
    return str
      .replace(/\[PRE-PROCESS: ENFORCE_JSON_ONLY\]/g, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<\/?final_answer>/gi, '')
      .trim();
  };

  const handleSpeakAndEmote = (text: string, emote: string) => {
    if (SpeechService && SpeechService.speak) {
      SpeechService.speak(text);
    }
    if (onAvatarUpdate && avatarConfig) {
      onAvatarUpdate({ ...avatarConfig, expression: emote });
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden relative select-none">
      <TopWaveBanner
        perceivedName={perceivedName}
        setIdentity={setIdentity}
        activeSessionId={activeSessionId}
        onRestoreProfile={onRestoreProfile}
        NEURAL_CORES={NEURAL_CORES}
        activePersonaId={activePersonaId}
        setActivePersonaId={setActivePersonaId}
        onSpeakAndEmote={handleSpeakAndEmote}
        prepareForTraining={prepareForTraining}
        onTogglePrepareForTraining={handleTogglePrepareForTraining}
      />

      <RightDockActions
        showInfoCard={showInfoCard}
        setShowInfoCard={setShowInfoCard}
        showConversations={showConversations}
        setShowConversations={setShowConversations}
        showSubtitles={showSubtitles}
        setShowSubtitles={setShowSubtitles}
        isSleeping={isSleeping}
        setIsSleeping={setIsSleeping}
        isOtomeDrawerOpen={isOtomeDrawerOpen}
        setIsOtomeDrawerOpen={setIsOtomeDrawerOpen}
        relationState={state.relation}
        onOpenBgDrawer={() => {
          setDrawerBackdrop(backdrop);
          setDrawerCustomImgUrl(customImgUrl);
          setIsBgDrawerOpen(true);
        }}
        onOpenSettings={() => {
          if (setActiveTab) setActiveTab('settings');
        }}
        isPanelOpen={isPanelOpen}
        setIsPanelOpen={setIsPanelOpen}
        showChatFeed={showChatFeed}
        setShowChatFeed={setShowChatFeed}
        isMicEnabled={isMicEnabled}
        setIsMicEnabled={setIsMicEnabled}
        handleToggleMic={handleToggleMic}
      />

      {/* Airi Character Profile Bio Info Card Overlay */}
      <AnimatePresence>
        {showInfoCard && (
          <motion.div
            initial={{ opacity: 0, x: -40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            className="absolute left-4 md:left-6 top-[20%] z-[41] w-80 max-w-[calc(100vw-32px)] overflow-hidden border border-white/10 rounded-2xl bg-black/85 backdrop-blur-xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.8)] text-[#d4d4d8] pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/5 pb-3.5 mb-3.5">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-tr from-amber-500 via-yellow-400 to-rose-500 p-[1.5px] rounded-full shadow-[0_0_12px_rgba(245,158,11,0.25)] flex items-center justify-center">
                  <div className="bg-neutral-900 rounded-full w-9 h-9 flex items-center justify-center text-amber-500 font-extrabold text-xs tracking-wider">
                    AR
                  </div>
                </div>
                <div>
                  <h3 className="font-sans font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-500 text-base flex items-center gap-1.5 leading-none">
                    Yui Airi <span className="text-xs font-normal text-zinc-500">爱莉</span>
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 leading-none">
                      Airi OS
                    </span>
                    <span className="text-[10px] font-mono bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20 leading-none">
                      Airi OS Core
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoCard(false)}
                title="Close Bio Info"
                className="text-zinc-500 hover:text-white transition-colors duration-150 p-1 hover:bg-white/5 rounded-lg active:scale-95 cursor-pointer flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            {/* Profile Quote */}
            <div className="text-xs text-zinc-400 italic mb-4 font-serif px-1 leading-relaxed border-l-2 border-amber-500/30 pl-2.5">
              "A sweet and tsundere virtual companion, powered by the Airi OS Core."
            </div>

            {/* Bio stats */}
            <div className="space-y-3 font-sans">
              {/* Cognitive Status */}
              <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <Brain size={14} className="text-cyan-400" />
                  <span className="text-zinc-400 font-medium">Cognitive State</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    isSleeping ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                  }`} />
                  <span className="text-xs font-mono font-medium text-white">
                    {isSleeping ? 'Zzz... Sleeping' : 'Awake & Active'}
                  </span>
                </div>
              </div>

              {/* Affection Level */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Heart size={14} className="text-rose-500 animate-pulse fill-rose-500" />
                    <span className="text-zinc-400 font-medium">Affection Bond</span>
                  </div>
                  <span className="font-mono text-rose-400 font-semibold">
                    {state.relation?.affection ?? 45}%
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5 p-[1px]">
                  <div 
                    className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                    style={{ width: `${Math.min(100, Math.max(0, state.relation?.affection ?? 45))}%` }}
                  />
                </div>
              </div>

              {/* Energy Levels */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-amber-500 fill-amber-500/20" />
                    <span className="text-zinc-400 font-medium">Energy Level</span>
                  </div>
                  <span className="font-mono text-amber-500 font-semibold">
                    {state.energy ?? 85}%
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5 p-[1px]">
                  <div 
                    className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                    style={{ width: `${Math.min(100, Math.max(0, state.energy ?? 85))}%` }}
                  />
                </div>
              </div>

              {/* Traits Lists */}
              <div className="pt-2 border-t border-white/5 flex flex-wrap gap-1.5">
                <span className="text-[10px] font-medium bg-neutral-900 text-zinc-400 border border-white/5 px-2 py-0.5 rounded-full">
                  💖 Warm & Empathetic
                </span>
                <span className="text-[10px] font-medium bg-neutral-900 text-zinc-400 border border-white/5 px-2 py-0.5 rounded-full">
                  👀 Observant
                </span>
                <span className="text-[10px] font-medium bg-neutral-900 text-zinc-400 border border-white/5 px-2 py-0.5 rounded-full">
                  🎨 Playful
                </span>
                <span className="text-[10px] font-medium bg-neutral-900 text-zinc-400 border border-white/5 px-2 py-0.5 rounded-full">
                  🛡️ Integrity Shield
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LiveChatFeed
        showChatFeed={showChatFeed}
        setShowChatFeed={setShowChatFeed}
        uniqueLogs={uniqueLogs}
        hiddenLogIds={hiddenLogIds}
        isThinking={isThinking}
        input={input}
        setInput={setInput}
        attachments={attachments}
        setAttachments={setAttachments}
        handleThink={handleThink}
        showSubtitles={showSubtitles}
        activeSubtitle={activeSubtitle}
        typedSubtitle={typedSubtitle}
        activeAlert={activeAlert}
      />

      <ControlPanelDrawer
        isPanelOpen={isPanelOpen}
        setIsPanelOpen={setIsPanelOpen}
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        backdrop={backdrop}
        handleSelectBackdrop={handleSelectBackdrop}
        customImgUrl={customImgUrl}
        handleCustomUrlChange={handleCustomUrlChange}
        onOpenBgDrawer={() => setIsBgDrawerOpen(true)}
        avatarConfig={avatarConfig}
        onAvatarUpdate={onAvatarUpdate}
        isMicEnabled={isMicEnabled}
        handleToggleMic={handleToggleMic}
        canvasRef={canvasRef}
        micError={micError}
        startMic={startMic}
        setMicError={setMicError}
        isCameraEnabled={isCameraEnabled}
        handleToggleCamera={handleToggleCamera}
        cameraVideoRef={cameraVideoRef}
        isAnalyzingCamera={isAnalyzingCamera}
        offlineVisualAnalysis={offlineVisualAnalysis}
        cameraError={cameraError}
        showSubtitles={showSubtitles}
        setShowSubtitles={setShowSubtitles}
        gestures={gestures}
        expressions={expressions}
        handleTriggerAnimation={handleTriggerAnimation}
        moodPresets={moodPresets}
        playingPresetId={playingPresetId}
        playingStepIndex={playingStepIndex}
        handlePlayPreset={handlePlayPreset}
        isSwarmEnabled={isSwarmEnabled}
        setIsSwarmEnabled={setIsSwarmEnabled}
        simulateSuperchat={simulateSuperchat}
        simulateSubscriber={simulateSubscriber}
        simulatedSender={simulatedSender}
        setSimulatedSender={setSimulatedSender}
        simulatedMessage={simulatedMessage}
        setSimulatedMessage={setSimulatedMessage}
        isSendingChat={isSendingChat}
        chatSimStatus={chatSimStatus}
        onSendSimulatedChat={handleSendSimulatedChat}
        getOverlayLink={getOverlayLink}
        copyOverlayLink={copyOverlayLink}
        copiedInteractive={copiedInteractive}
        copiedPure={copiedPure}
        state={state}
        isGeneratingBackup={isGeneratingBackup}
        quantumBackups={quantumBackups}
        handleCreateQuantumBackup={handleCreateQuantumBackup}
        handleRestoreQuantumBackup={handleRestoreQuantumBackup}
        isRestoringBackup={isRestoringBackup}
        wakeWordEnabled={wakeWordEnabled}
        setWakeWordEnabled={setWakeWordEnabled}
        wakeWordKeyword={wakeWordKeyword}
        setWakeWordKeyword={setWakeWordKeyword}
        syncWakeWordWithMic={syncWakeWordWithMic}
        setSyncWakeWordWithMic={setSyncWakeWordWithMic}
        speechInterruptionMode={speechInterruptionMode}
        setSpeechInterruptionMode={setSpeechInterruptionMode}
      />

      <BottomConversationDrawer
        showConversations={showConversations}
        setShowConversations={setShowConversations}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onCreateSession={onCreateSession}
        onSwitchSession={onSwitchSession}
        onDeleteSession={onDeleteSession}
      />

      <BackgroundSelectorDrawer
        isBgDrawerOpen={isBgDrawerOpen}
        setIsBgDrawerOpen={setIsBgDrawerOpen}
        drawerBackdrop={drawerBackdrop}
        setDrawerBackdrop={setDrawerBackdrop}
        drawerCustomImgUrl={drawerCustomImgUrl}
        setDrawerCustomImgUrl={setDrawerCustomImgUrl}
        uploadedScenes={uploadedScenes}
        setUploadedScenes={setUploadedScenes}
        handleSelectBackdrop={handleSelectBackdrop}
        handleCustomUrlChange={handleCustomUrlChange}
        addLog={addLog}
      />

      <RelationAndSpontaneousDrawer
        isOtomeDrawerOpen={isOtomeDrawerOpen}
        setIsOtomeDrawerOpen={setIsOtomeDrawerOpen}
        otomeHeartPulse={otomeHeartPulse}
        perceivedName={perceivedName}
        state={state}
        spontaneousConfig={spontaneousConfig}
        handleSaveSpontaneousSetting={handleSaveSpontaneousSetting}
      />
    </div>
  );
};
