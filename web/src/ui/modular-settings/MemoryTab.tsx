import React from 'react';
import { IdentitiesTab } from '../IdentitiesTab';
import { HeuristicsTab } from '../HeuristicsTab';
import { ReflectTab } from '../ReflectTab';
import { DreamsTab } from '../DreamsTab';
import { ArchiveTab } from '../ArchiveTab';
import { TrainTab } from '../TrainTab';

interface MemoryTabProps {
  identities: any[];
  activePersonaId: string;
  setActivePersonaId: (id: string) => void;
  NEURAL_CORES: any[];
  onRefreshIdentities?: () => Promise<void>;
  onAddLog: (type: 'user' | 'agent', content: string) => void;
  heuristics: any[];
  handleOptimize: () => void;
  isLearning: boolean;
  handleReflect: () => void;
  isThinking: boolean;
  status: any;
  logs: any[];
  state: any;
  dreams: any[];
  handleConsolidate: () => void;
  handleDream: () => void;
  memories: any[];
  setMemories: React.Dispatch<React.SetStateAction<any[]>>;
  activeSessionId: string;
  knowledge: any[];
  memorySearchQuery: string;
  setMemorySearchQuery: (val: string) => void;
  handleExtractKnowledge: () => void;
  backgroundLogs: any[];
  showSystemLogs: boolean;
  setShowSystemLogs: (val: boolean) => void;
  reasoningIterations: any[];
  handleShowInfo: (title: string, text: string) => void;
}

export const MemoryTab: React.FC<MemoryTabProps> = ({
  identities,
  activePersonaId,
  setActivePersonaId,
  NEURAL_CORES,
  onRefreshIdentities,
  onAddLog,
  heuristics,
  handleOptimize,
  isLearning,
  handleReflect,
  isThinking,
  status,
  logs,
  state,
  dreams,
  handleConsolidate,
  handleDream,
  memories,
  setMemories,
  activeSessionId,
  knowledge,
  memorySearchQuery,
  setMemorySearchQuery,
  handleExtractKnowledge,
  backgroundLogs,
  showSystemLogs,
  setShowSystemLogs,
  reasoningIterations,
  handleShowInfo,
}) => {
  const [activeSoulTab, setActiveSoulTab] = React.useState<string>('identities');

  return (
    <div className="space-y-6">
      {/* Horizontal nested state tabs */}
      <div className="flex flex-wrap gap-2 bg-white/[0.02] border border-white/[0.03] p-1 rounded-2xl w-fit">
        {[
          { id: 'identities', label: 'Subjects' },
          { id: 'heuristics', label: 'Heuristics' },
          { id: 'reflect', label: 'Reflections' },
          { id: 'dreams', label: 'Dreams' },
          { id: 'archive', label: 'Archives' },
          { id: 'train', label: 'Synthesizer' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSoulTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-[9px] uppercase font-mono tracking-widest transition-all cursor-pointer ${
              activeSoulTab === tab.id
                ? 'bg-amber-500 text-black font-extrabold'
                : 'text-white/40 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-[#0e0e14]/55 border border-white/5 rounded-3xl p-6">
        {activeSoulTab === 'identities' && (
          <IdentitiesTab
            identities={identities}
            activePersonaId={activePersonaId}
            setActivePersonaId={setActivePersonaId}
            NEURAL_CORES={NEURAL_CORES}
            onRefreshIdentities={onRefreshIdentities}
            onAddLog={onAddLog}
          />
        )}
        {activeSoulTab === 'heuristics' && (
          <HeuristicsTab
            heuristics={heuristics}
            handleOptimize={handleOptimize}
            isLearning={isLearning}
          />
        )}
        {activeSoulTab === 'reflect' && (
          <ReflectTab
            handleReflect={handleReflect}
            isThinking={isThinking}
            status={status}
            logs={logs}
            state={state}
          />
        )}
        {activeSoulTab === 'dreams' && (
          <DreamsTab
            dreams={dreams}
            handleConsolidate={handleConsolidate}
            handleDream={handleDream}
            isThinking={isThinking}
          />
        )}
        {activeSoulTab === 'archive' && (
          <ArchiveTab
            logs={logs}
            backgroundLogs={backgroundLogs}
            memories={memories}
            showSystemLogs={showSystemLogs}
            setShowSystemLogs={setShowSystemLogs}
            reasoningIterations={reasoningIterations}
            activeSessionId={activeSessionId}
          />
        )}
        {activeSoulTab === 'train' && (
          <TrainTab
            onRefreshMemories={async () => {
              try {
                const res = await fetch('/api/storage/memories');
                if (res.ok) {
                  const data = await res.json();
                  if (setMemories && Array.isArray(data)) {
                    setMemories(data);
                  }
                }
              } catch (err) {
                console.error("Failed to resync visual memory:", err);
              }
            }}
            onShowInfo={handleShowInfo}
          />
        )}
      </div>
    </div>
  );
};
