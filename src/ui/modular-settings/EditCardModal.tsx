/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, Layers, MessageSquare, Palette, Settings, Smile, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';

export interface EditCardModalProps {
  editModalTab: string;
  setEditModalTab: (val: any) => void;
  cardForm: any;
  setCardForm: (val: any) => void;
  setIsEditModalOpen: (val: boolean) => void;
  setEditingCard: (val: any) => void;
  handleSaveCard: () => void;
}

export const EditCardModal: React.FC<EditCardModalProps> = ({
  editModalTab,
  setEditModalTab,
  cardForm,
  setCardForm,
  setIsEditModalOpen,
  setEditingCard,
  handleSaveCard
}) => {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-8 max-w-4xl w-full text-zinc-800 shadow-2xl relative overflow-hidden flex flex-col font-sans border border-gray-100"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-200/20 blur-3xl rounded-full pointer-events-none" />

        <h3 className="text-[#0ea5e9] font-sans font-medium text-2xl tracking-wide mb-6">Edit Card</h3>

        <div className="flex flex-wrap items-center gap-6 border-b border-gray-200/80 pb-3 mb-6">
          {[
            { id: 'identity', label: 'Identity', icon: Smile },
            { id: 'behavior', label: 'Behavior', icon: MessageSquare },
            { id: 'modules', label: 'Modules', icon: Layers },
            { id: 'artistry', label: 'Artistry', icon: Palette },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = editModalTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEditModalTab(tab.id as any)}
                className={`flex items-center gap-2 pb-2.5 px-1 text-xs sm:text-sm font-medium transition-all relative border-b-2 cursor-pointer ${
                  isActive 
                    ? 'border-[#0ea5e9] text-[#0ea5e9] font-semibold' 
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-[#0ea5e9]' : 'text-gray-400'} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
          {editModalTab === 'identity' && (
            <div className="space-y-6">
              <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
                You can put here some details about the character you are creating, explain his history and context, and how your interactions should be answered.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-5">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-gray-400 font-sans block">
                      Is the formal name of this character.
                    </span>
                    <input
                      type="text"
                      value={cardForm.name || ''}
                      onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
                      className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                      placeholder="ReLU"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-gray-400 font-sans block">
                      Description of this character.
                    </span>
                    <textarea
                      value={cardForm.description || ''}
                      onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })}
                      rows={4}
                      className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                      placeholder="NAME payload"
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Nickname
                    </label>
                    <span className="text-[10px] text-gray-400 font-sans block">
                      You can also give a nickname that will be used in priority.
                    </span>
                    <input
                      type="text"
                      value={cardForm.nickname || ''}
                      onChange={(e) => setCardForm({ ...cardForm, nickname: e.target.value })}
                      className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                      placeholder="Nickname"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Creator Notes
                    </label>
                    <span className="text-[10px] text-gray-400 font-sans block">
                      If you want to add some personal notes.
                    </span>
                    <textarea
                      value={cardForm.creatorNotes || ''}
                      onChange={(e) => setCardForm({ ...cardForm, creatorNotes: e.target.value })}
                      rows={4}
                      className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm font-sans transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                      placeholder="..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {editModalTab === 'behavior' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">First Message</label>
                <span className="text-[10px] text-gray-400 font-sans block">The greeting dialogue sent when starting a session.</span>
                <textarea
                  value={cardForm.behavior?.firstMessage || ''}
                  onChange={(e) => setCardForm({
                    ...cardForm,
                    behavior: { ...(cardForm.behavior || {}), firstMessage: e.target.value }
                  })}
                  rows={3}
                  className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                  placeholder="Halo..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Roleplay Scenario</label>
                  <span className="text-[10px] text-gray-400 font-sans block">Context or room rules (e.g. streaming, chatting).</span>
                  <textarea
                    value={cardForm.behavior?.scenario || ''}
                    onChange={(e) => setCardForm({
                      ...cardForm,
                      behavior: { ...(cardForm.behavior || {}), scenario: e.target.value }
                    })}
                    rows={4}
                    className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                    placeholder="Streaming, chatting, gaming..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Dialogue Examples</label>
                  <span className="text-[10px] text-gray-400 font-sans block">Example exchange pairs to establish dialogue rhythm.</span>
                  <textarea
                    value={cardForm.behavior?.examples || ''}
                    onChange={(e) => setCardForm({
                      ...cardForm,
                      behavior: { ...(cardForm.behavior || {}), examples: e.target.value }
                    })}
                    rows={4}
                    className="w-full text-gray-800 bg-gray-50 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none min-h-[100px] resize-y shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                    placeholder="<user>: halo\n<char>: Halo kakak manis!"
                  />
                </div>
              </div>
            </div>
          )}

          {editModalTab === 'modules' && (
            <div className="space-y-5">
              <span className="text-xs text-zinc-400 uppercase tracking-widest font-mono font-bold block mb-2">Cognitive Matrix Routing</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: 'enableMic', label: 'Microphone Lip-Sync Integration', desc: 'Allows active voice capture to sync character mouth mesh' },
                  { id: 'enableWebSearch', label: 'Google Search Core Grounding', desc: 'Grown character thoughts on live Google search engine metrics' },
                  { id: 'enableMcp', label: 'MCP Server Capabilities', desc: 'Allow character to fetch sandbox files system context' }
                ].map(m => (
                  <div key={m.id} className="bg-gray-50/50 border border-gray-200/60 rounded-2xl p-4 flex items-start gap-3 transition-colors hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={!!cardForm.modules?.[m.id]}
                      onChange={(e) => setCardForm({
                        ...cardForm,
                        modules: { ...(cardForm.modules || {}), [m.id]: e.target.checked }
                      })}
                      className="mt-1 w-4 h-4 text-[#0ea5e9] border-gray-300 rounded focus:ring-[#0ea5e9] cursor-pointer"
                    />
                    <div>
                      <label className="block text-xs font-bold text-gray-800">{m.label}</label>
                      <p className="text-[10px] text-gray-400 mt-1 leading-normal">{m.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editModalTab === 'artistry' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Live2D Avatar Model</label>
                  <select
                    value={cardForm.artistry?.avatar || 'hiyori'}
                    onChange={(e) => setCardForm({
                      ...cardForm,
                      artistry: { ...(cardForm.artistry || {}), avatar: e.target.value }
                    })}
                    className="w-full text-gray-800 bg-gray-50 border border-gray-200 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none cursor-pointer"
                  >
                    <option value="hiyori">Hiyori (Default Red Ribbons)</option>
                    <option value="codex">Codex (Cybernetic Matrix Blue)</option>
                    <option value="mairo">Mairo (Chibi Cozy Nekomimi)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Voice Speed Calibration</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={cardForm.artistry?.voiceSpeed || 1}
                    onChange={(e) => setCardForm({
                      ...cardForm,
                      artistry: { ...(cardForm.artistry || {}), voiceSpeed: parseFloat(e.target.value) }
                    })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0ea5e9] mt-3"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-gray-400 mt-1">
                    <span>0.5x Slow</span>
                    <span>Current: {cardForm.artistry?.voiceSpeed || 1}x</span>
                    <span>2.0x Fast</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editModalTab === 'settings' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Custom Prompt Injection (Tuning)</label>
                <span className="text-[10px] text-gray-400 font-sans block">Direct instructions injected into prompt before dialog generator.</span>
                <textarea
                  value={cardForm.settings?.systemPrompt || ''}
                  onChange={(e) => setCardForm({
                    ...cardForm,
                    settings: { ...(cardForm.settings || {}), systemPrompt: e.target.value }
                  })}
                  rows={3}
                  className="w-full text-gray-800 bg-gray-50/80 border border-gray-200/80 focus:bg-white focus:border-[#0ea5e9] rounded-xl px-4 py-3 text-sm transition-all outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]"
                  placeholder="e.g. Always respond politely, refer to user as 'Sobat'..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              setIsEditModalOpen(false);
              setEditingCard(null);
            }}
            className="flex items-center gap-2 px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-all font-sans font-medium text-sm cursor-pointer select-none"
          >
            <Undo2 size={16} />
            Cancel action
          </button>
          <button
            type="button"
            onClick={handleSaveCard}
            className="flex items-center gap-2 px-6 py-3 bg-[#e0f2fe] text-[#0369a1] hover:bg-[#bae6fd] rounded-xl transition-all font-sans font-semibold text-sm cursor-pointer select-none"
          >
            <Check size={16} />
            Save changes
          </button>
        </div>
      </motion.div>
    </div>
  );
};
