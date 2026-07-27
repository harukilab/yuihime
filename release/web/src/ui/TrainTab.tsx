import React, { useState } from 'react';
import { Layers, Brain, Sparkles, Edit3, HelpCircle } from 'lucide-react';
import { DatasetImport } from './train/DatasetImport';
import { DatasetExport } from './train/DatasetExport';
import { DatasetCreator } from './train/DatasetCreator';
import { DatasetEditor } from './train/DatasetEditor';

interface TrainTabProps {
  onRefreshMemories?: () => void;
  onRefreshKnowledge?: () => void;
  onShowInfo?: (title: string, text: string) => void;
}

export const TrainTab: React.FC<TrainTabProps> = ({
  onRefreshMemories,
  onRefreshKnowledge,
  onShowInfo
}) => {
  const [activeMode, setActiveMode] = useState<'import' | 'export' | 'creator' | 'editor'>('import');
  const [helpOpen, setHelpOpen] = useState(false);

  // Compact inline detail toggle
  const CollapsibleHeader: React.FC = () => {
    if (!helpOpen) {
      return (
        <span className="text-zinc-500 font-normal">
          Refactor cognitive elements and dataset structures.{' '}
          <button 
            onClick={() => setHelpOpen(true)}
            className="text-amber-500 hover:underline font-bold text-[10px] focus:outline-none"
          >
            [Detail]
          </button>
        </span>
      );
    }
    return (
      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl text-[11px] text-zinc-400 mt-2 space-y-2 leading-relaxed">
        <div className="flex justify-between items-center pb-1 border-b border-white/5">
          <span className="font-extrabold text-amber-500 uppercase tracking-wider text-[9px]">Mental Training Protocols</span>
          <button 
            onClick={() => setHelpOpen(false)}
            className="text-zinc-500 hover:text-white font-mono font-bold text-[9px] focus:outline-none"
          >
            [Hide]
          </button>
        </div>
        <p>
          Configure, compile, and transfigure Yuihime's dialogue models.
        </p>
        <ul className="list-disc pl-4 space-y-1 text-zinc-500 text-[10px]">
          <li><strong>Import</strong>: Ingest external dialogue datasets into systemic caches.</li>
          <li><strong>Export</strong>: Pack live database logs into clean SFT training structures.</li>
          <li><strong>Creator</strong>: Automate background synthetic dialogue transmutation.</li>
          <li><strong>Editor</strong>: Maintain and curate your SFT row states in the database.</li>
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans select-none text-left">
      {/* Tab Header Description */}
      <div className="flex justify-between items-start border-b border-white/5 pb-4">
        <div>
          <h4 className="text-[9px] uppercase font-mono tracking-widest text-zinc-550 mb-1 font-bold">Mental Refactoring & SFT</h4>
          <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
            {activeMode === 'import' && <><Layers className="text-amber-500" size={16} /> Memory Ingestion</>}
            {activeMode === 'export' && <><Brain className="text-amber-500" size={16} /> Dataset Synthesis</>}
            {activeMode === 'creator' && <><Sparkles className="text-rose-500" size={16} /> Synaptic Creator</>}
            {activeMode === 'editor' && <><Edit3 className="text-emerald-500" size={16} /> SFT Records Editor</>}
          </h2>
          <div className="text-xs text-zinc-400 mt-1">
            <CollapsibleHeader />
          </div>
        </div>
        {onShowInfo && (
          <button
            type="button"
            onClick={() => onShowInfo(
              activeMode === 'import' ? "Cognitive Data Injection" : "Synaptic Refactoring Engine",
              activeMode === 'import' ? (
                "Data ingestion utilizes dual memory architectures:\\n\\n1. System 1 (Episodic Cache): High performance, direct-hit similarity search bypasses LLM overhead.\\n\\n2. System 2 (SQLite Memory blocks): Seeds core knowledge bases pulled by the Cortex RAG router for deeply-tuned personality behaviors."
              ) : (
                "Dataset synthesizers convert live interaction history into formatted Supervised Fine-Tuning rows (JSON CoT or Speech only) fully prepared for model training runs."
              )
            )}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-amber-500 px-3 py-1.5 rounded-xl border border-white/5 transition-all text-[10px] font-mono cursor-pointer font-bold"
          >
            <HelpCircle size={11} /> Info
          </button>
        )}
      </div>

      {/* Navigation Sub-Tabs bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-white/5 pb-3">
        {(['import', 'export', 'creator', 'editor'] as const).map((mode) => {
          const isActive = activeMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setActiveMode(mode)}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all uppercase tracking-wide cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10 font-extrabold'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Dynamic Sub-tab Panel */}
      <div className="mt-6">
        {activeMode === 'import' && (
          <DatasetImport 
            onRefreshMemories={onRefreshMemories} 
            onRefreshKnowledge={onRefreshKnowledge} 
            onShowInfo={onShowInfo}
          />
        )}
        {activeMode === 'export' && (
          <DatasetExport 
            onRefreshMemories={onRefreshMemories} 
            onRefreshKnowledge={onRefreshKnowledge} 
          />
        )}
        {activeMode === 'creator' && (
          <DatasetCreator 
            onRefreshMemories={onRefreshMemories} 
          />
        )}
        {activeMode === 'editor' && (
          <DatasetEditor 
            onRefreshMemories={onRefreshMemories} 
          />
        )}
      </div>
    </div>
  );
};
