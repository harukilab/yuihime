import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert } from 'lucide-react';
import { BugReportBoundary } from '../ui/BugReportBoundary';
import { NeuralBackdrop } from '../ui/NeuralBackdrop';
import { VTuberAvatar } from '../ui/VTuberAvatar';
import { StageTab } from '../ui/StageTab';
import { ModularSettings } from '../ui/ModularSettings';
import { StreamOverlay } from '../ui/StreamOverlay';
import { SpeechService } from '@/core/speech';
import type { AppState } from './state';
import type { AppHandlers } from './handlers';

interface AppLayoutProps {
  s: AppState;
  chat: any;
  h: AppHandlers;
}

export function AppLayout({ s, chat, h }: AppLayoutProps) {
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlMode = searchParams.get('mode');
  const isStreamMode = urlMode === 'stream';
  const isOBSMode = urlMode === 'obs';

  if (isStreamMode || isOBSMode) {
    return (
      <StreamOverlay
        state={s.state}
        memories={s.memories}
        activeSubtitle={s.activeSubtitle}
        typedSubtitle={s.typedSubtitle}
        isSubtitleTyping={s.isSubtitleTyping}
        animations={s.animations}
        avatarConfig={s.avatarConfig}
        showSubtitles={isOBSMode || isStreamMode ? (searchParams.get('subtitles') !== 'false') : s.showSubtitles}
        pure={isOBSMode}
      />
    );
  }

  return (
    <BugReportBoundary>
      <div
        id="yuihime-app-container"
        className="text-[#d4d4d8] font-sans selection:bg-amber-500/30 flex flex-col cyber-grid relative overflow-hidden"
        style={{
          transform: 'scale(var(--ui-scale, 1))',
          transformOrigin: 'top left',
          width: 'calc(100% / var(--ui-scale, 1))',
          height: 'calc(var(--vh, 1vh) * 100)',
          backgroundColor: '#050505'
        }}
      >
        <div className="scanline" />

        <main className="flex-1 flex overflow-hidden relative">
          <section className="flex-1 flex flex-col relative overflow-hidden bg-[#050505]">
            <AnimatePresence mode="wait">
              <motion.div
                key="neural-background-layer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10"
              >
                <NeuralBackdrop activeTab={s.activeTab} />
              </motion.div>
            </AnimatePresence>

            <div className={`absolute inset-0 z-30 flex items-center justify-center pointer-events-none overflow-hidden transition-opacity duration-500 ${s.activeTab === 'stage' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {s.activeTab === 'stage' && (
                <VTuberAvatar
                  key="v-avatar-stable"
                  mood={s.state.mood}
                  emotion={s.state.emotion}
                  relation={s.state.relation}
                  status={s.state.status}
                  modelUrl={s.avatarConfig?.modelUrl}
                  isTyping={s.isSubtitleTyping}
                  animations={s.animations}
                  scale={s.avatarConfig?.scale}
                  xOffset={s.avatarConfig?.xOffset}
                  yOffset={s.avatarConfig?.yOffset}
                  isSpeaking={s.isReallySpeaking}
                  volume={s.speechVolume}
                  isActive={s.activeTab === 'stage'}
                  typedSubtitle={s.typedSubtitle}
                  activeSubtitle={s.activeSubtitle || ''}
                  disableMouseTracking={s.avatarConfig?.disableMouseTracking}
                />
              )}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={s.activeTab}
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex flex-col overflow-hidden relative z-40 pointer-events-auto"
              >
                {s.activeTab === 'stage' && (
                  <StageTab
                    state={s.state}
                    avatarConfig={s.avatarConfig}
                    onAvatarUpdate={h.handleAvatarUpdate}
                    animations={s.animations}
                    setAnimations={s.setAnimations}
                    showSubtitles={s.showSubtitles}
                    setShowSubtitles={s.setShowSubtitles}
                    addLog={chat.addLog}
                    memories={s.memories}
                    setMemories={s.setMemories}
                    logs={chat.logs}
                    input={s.input}
                    setInput={s.setInput}
                    attachments={s.attachments}
                    setAttachments={s.setAttachments}
                    handleThink={h.handleThink}
                    isThinking={s.isThinking}
                    activeSubtitle={s.activeSubtitle}
                    typedSubtitle={s.typedSubtitle}
                    isSubtitleTyping={s.isSubtitleTyping}
                    setActiveSubtitle={s.setActiveSubtitle}
                    perceivedName={s.perceivedName}
                    setIdentity={h.setIdentity}
                    setActiveTab={s.setActiveTab}
                    isSleeping={s.isSleeping}
                    setIsSleeping={s.setIsSleeping}
                    showChatFeed={s.showChatFeed}
                    setShowChatFeed={s.setShowChatFeed}
                    showInfoCard={s.showInfoCard}
                    setShowInfoCard={s.setShowInfoCard}
                    isMicEnabled={s.isMicEnabled}
                    setIsMicEnabled={s.setIsMicEnabled}
                    activePersonaId={s.state.activePersonaId}
                    setActivePersonaId={h.handleSetActivePersonaId}
                    NEURAL_CORES={s.NEURAL_CORES}
                    sessions={chat.sessions}
                    activeSessionId={chat.activeSessionId}
                    onSwitchSession={chat.handleSwitchSession}
                    onCreateSession={chat.handleCreateSession}
                    onDeleteSession={chat.handleDeleteSession}
                    onRestoreProfile={h.handleRestoreProfile}
                    identities={s.identities}
                    onRefreshIdentities={h.loadData}
                    SpeechService={SpeechService}
                    onUpdateRelation={(uRel) => s.setState((prev: any) => ({ ...prev, relation: uRel }))}
                    speechInterruptionMode={s.speechInterruptionMode}
                    setSpeechInterruptionMode={s.setSpeechInterruptionMode}
                  />
                )}

                {s.activeTab !== 'stage' && (
                  <div id="settings-scroll-container" className="flex-1 overflow-y-auto overflow-x-hidden z-10">
                    <div className="p-4 md:p-8 pb-28 md:pb-32">
                      <ModularSettings
                        activeTab={s.activeTab}
                        setActiveTab={s.setActiveTab}
                        activeSessionId={chat.activeSessionId}
                        onAvatarUpdate={h.handleAvatarUpdate}
                        avatarConfig={s.avatarConfig}
                        onClose={() => s.setActiveTab('stage')}
                        onSave={s.loadConfig}
                        currentLiveTopic={s.state.currentLiveTopic}
                        setCurrentLiveTopic={h.handleSetCurrentLiveTopic}
                        handleSimulateLive={h.handleSimulateLive}
                        showSubtitles={s.showSubtitles}
                        setShowSubtitles={s.setShowSubtitles}
                        showMobileNav={s.showMobileNav}
                        setShowMobileNav={s.setShowMobileNav}
                        ttsEnabled={s.ttsEnabled}
                        setTtsEnabled={s.setTtsEnabled}
                        showDebugPanel={s.showDebugPanel}
                        setShowDebugPanel={s.setShowDebugPanel}
                        isSleeping={s.isSleeping}
                        setIsSleeping={s.setIsSleeping}
                        showChatFeed={s.showChatFeed}
                        setShowChatFeed={s.setShowChatFeed}
                        showInfoCard={s.showInfoCard}
                        setShowInfoCard={s.setShowInfoCard}
                        isMicEnabled={s.isMicEnabled}
                        setIsMicEnabled={s.setIsMicEnabled}
                        neuralCircuitStatus={s.neuralCircuitStatus}
                        pulseEnabled={s.pulseEnabled}
                        setPulseEnabled={s.setPulseEnabled}
                        heuristics={s.state.heuristics}
                        handleOptimize={h.handleOptimize}
                        isLearning={s.isLearning}
                        identities={s.identities}
                        activePersonaId={s.state.activePersonaId}
                        setActivePersonaId={h.handleSetActivePersonaId}
                        NEURAL_CORES={s.NEURAL_CORES}
                        handleReflect={h.handleReflect}
                        isThinking={s.isThinking}
                        logs={chat.logs}
                        state={s.state}
                        memories={s.memories}
                        setMemories={s.setMemories}
                        dreams={s.dreams}
                        knowledge={s.knowledge}
                        metricsHistory={s.metricsHistory}
                        memorySearchQuery={s.memorySearchQuery}
                        setMemorySearchQuery={s.setMemorySearchQuery}
                        handleExtractKnowledge={h.handleExtractKnowledge}
                        backgroundLogs={chat.backgroundLogs}
                        showSystemLogs={s.showSystemLogs}
                        setShowSystemLogs={s.setShowSystemLogs}
                        reasoningIterations={s.reasoningIterations}
                        activeSubtitle={s.activeSubtitle}
                        typedSubtitle={s.typedSubtitle}
                        isSubtitleTyping={s.isSubtitleTyping}
                        lastAgentResponse={s.lastAgentResponse}
                        setActiveSubtitle={s.setActiveSubtitle}
                        input={s.input}
                        setInput={s.setInput}
                        handleThink={h.handleThink}
                        perceivedName={s.perceivedName}
                        SpeechService={SpeechService}
                        avatarOnInConsole={s.avatarOnInConsole}
                        setAvatarOnInConsole={s.setAvatarOnInConsole}
                        handleDream={h.handleDream}
                        handleConsolidate={h.handleConsolidate}
                        animations={s.animations}
                        setAnimations={s.setAnimations}
                        onRefreshIdentities={h.loadData}
                        llmStreamingEnabled={s.llmStreamingEnabled}
                        setLlmStreamingEnabled={s.setLlmStreamingEnabled}
                        onAddLog={chat.addLog}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>

        {s.globalPendingConfirm.length > 0 && (
          <div className="fixed inset-0 bg-[#07070a]/90 backdrop-blur-md flex items-center justify-center z-[9999] p-4 font-sans animate-fade-in">
            <div className="bg-[#0e0e14] border border-white/10 rounded-2xl p-6 max-w-md md:max-w-lg w-full shadow-2xl relative overflow-hidden select-none text-left">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl shrink-0">
                  <ShieldAlert size={20} className="animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <h4 className="text-sm font-bold text-white tracking-tight leading-none">
                      YuiHime File Access Authorization
                    </h4>
                    {s.globalPendingConfirm.length > 1 && (
                      <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30 font-sans">
                        Batch ({s.globalPendingConfirm.length} Antrean)
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono mb-4 uppercase tracking-widest">
                    ID AKTIF: <span className="text-amber-400 font-bold">{s.globalPendingConfirm[0].id}</span>
                  </p>
                  <p className="text-[11.5px] text-zinc-300 leading-relaxed mb-2">
                    YuiHime is attempting a <strong className="text-amber-400 font-bold">{s.globalPendingConfirm[0].action.toUpperCase()}</strong> operation:
                  </p>
                  <div className="bg-black/45 border border-white/5 rounded-lg px-3 py-2 text-[10.5px] font-mono text-zinc-300 break-all mb-4">
                    {s.globalPendingConfirm[0].targetPath}
                  </div>

                  {s.globalPendingConfirm.length > 1 && (
                    <div className="mb-4 bg-zinc-950/50 border border-white/5 rounded-xl p-3">
                      <p className="text-[10.5px] font-bold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Daftar Permintaan Lainnya ({s.globalPendingConfirm.length - 1}):
                      </p>
                      <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-white/10 text-[10px]">
                        {s.globalPendingConfirm.slice(1).map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between bg-black/30 border border-white/5 px-2.5 py-1.5 rounded-lg gap-2">
                            <span className="font-mono text-zinc-500 font-bold bg-white/5 px-1 py-0.5 rounded">{item.id}</span>
                            <span className="font-bold text-amber-500 font-mono text-[9px] uppercase bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/15">{item.action}</span>
                            <span className="text-zinc-400 truncate flex-1 text-left font-mono text-[9.5px]">{item.targetPath}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">
                    Select the level of authorization for Yuihime to execute this file system instruction:
                  </p>

                  <div className="flex flex-col gap-3">
                    {s.globalPendingConfirm.length > 1 && (
                      <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3 flex flex-col gap-2">
                        <p className="text-[10px] font-bold text-amber-400/90 tracking-wide uppercase">
                          ⚡ Opsi Batch (Semua {s.globalPendingConfirm.length} Permintaan)
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => h.handleBatchAction('approved')}
                            className="py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold border border-amber-500/35 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center"
                          >
                            Setujui Semua
                          </button>
                          <button
                            onClick={() => h.handleBatchAction('denied')}
                            className="py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-bold border border-red-500/20 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center"
                          >
                            Tolak Semua
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      {s.globalPendingConfirm.length > 1 && (
                        <p className="text-[10px] font-bold text-zinc-500 tracking-wide uppercase mb-1">
                          📍 Opsi Tunggal (Hanya ID: {s.globalPendingConfirm[0].id})
                        </p>
                      )}
                      <button
                        onClick={async () => {
                          const id = s.globalPendingConfirm[0].id;
                          await fetch(`/api/sandbox/pending-confirmations/${id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'approved' })
                          });
                          s.setGlobalPendingConfirm((prev: any[]) => prev.filter((x: any) => x.id !== id));
                        }}
                        className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-bold border border-amber-500/20 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center font-sans"
                      >
                        Approve (Setujui Sekali)
                      </button>
                      <button
                        onClick={async () => {
                          const id = s.globalPendingConfirm[0].id;
                          await fetch(`/api/sandbox/pending-confirmations/${id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'always' })
                          });
                          s.setGlobalPendingConfirm((prev: any[]) => prev.filter((x: any) => x.id !== id));
                        }}
                        className="w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-bold border border-emerald-500/20 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center font-sans"
                      >
                        Always Approve (Selalu Setujui Sesi Ini)
                      </button>
                      <button
                        onClick={async () => {
                          const id = s.globalPendingConfirm[0].id;
                          await fetch(`/api/sandbox/pending-confirmations/${id}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'denied' })
                          });
                          s.setGlobalPendingConfirm((prev: any[]) => prev.filter((x: any) => x.id !== id));
                        }}
                        className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-bold border border-white/5 rounded-xl transition-all cursor-pointer active:scale-[0.98] text-center font-sans"
                      >
                        Deny Action (Tolak)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </BugReportBoundary>
  );
}
