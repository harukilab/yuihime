/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StorageService } from '../../drivers/storage';

export interface ConnectionSectionTabProps {
  testWsStatus: string;
  testWsUrl: string;
  setTestWsUrl: (val: string) => void;
  connectTestWs: (url: string) => void;
  disconnectTestWs: () => void;
  testWsLogs: any[];
  setTestWsLogs: React.Dispatch<React.SetStateAction<any[]>>;
  clearTestWsLogs: () => void;
  testWsMsg: string;
  setTestWsMsg: (val: string) => void;
  sendTestWsMsg: () => void;
  user: any;
  currentLiveTopic?: string;
  setCurrentLiveTopic?: (val: string) => void;
  handleSimulateLive?: () => void;
  pairingLinked: boolean;
  perceivedName?: string;
  pairingLinkedAccounts: string[];
  pairingLoading: boolean;
  pairingCode: string | null;
  generatePairingCode: () => void;
  botPairingCode: string;
  setBotPairingCode: (val: string) => void;
  claimBotPairingCode: () => void;
  botPairingLoading: boolean;
  botPairingMessage: { type: 'success' | 'error'; text: string } | null;
}

export const ConnectionSectionTab: React.FC<ConnectionSectionTabProps> = ({
  testWsStatus,
  testWsUrl,
  setTestWsUrl,
  connectTestWs,
  disconnectTestWs,
  testWsLogs,
  setTestWsLogs,
  clearTestWsLogs,
  testWsMsg,
  setTestWsMsg,
  sendTestWsMsg,
  user,
  currentLiveTopic,
  setCurrentLiveTopic,
  handleSimulateLive,
  pairingLinked,
  perceivedName,
  pairingLinkedAccounts,
  pairingLoading,
  pairingCode,
  generatePairingCode,
  botPairingCode,
  setBotPairingCode,
  claimBotPairingCode,
  botPairingLoading,
  botPairingMessage
}) => {
  const [restartLoading, setRestartLoading] = React.useState(false);
  const [restartStatus, setRestartStatus] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRestartTelegram = async () => {
    setRestartLoading(true);
    setRestartStatus(null);
    try {
      const res = await fetch('/api/telegram/restart', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setRestartStatus({ type: 'success', text: data.message || 'Telegram daemon successfully restarted!' });
      } else {
        setRestartStatus({ type: 'error', text: data.error || 'Failed to restart Telegram daemon.' });
      }
    } catch (err: any) {
      setRestartStatus({ type: 'error', text: err.message || 'Local connection error.' });
    } finally {
      setRestartLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. WebSocket Controller & Diagnostic Panel */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-amber-500 font-bold">WebSocket Client Suite</h4>
            <p className="text-[10px] text-zinc-500 font-sans mt-0.5">Integrate the core client with local WebSocket servers or external gateways.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/5">
            <span className={`w-2 h-2 rounded-full ${
              testWsStatus === 'CONNECTED' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
              testWsStatus === 'CONNECTING' ? 'bg-amber-400 animate-ping' :
              testWsStatus === 'ERROR' ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
              'bg-zinc-600'
            }`} />
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-white">
              {testWsStatus}
            </span>
          </div>
        </div>

        {/* Config Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-sans text-white mb-1.5 font-bold">WebSocket Server Target Address</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={testWsUrl}
                onChange={e => setTestWsUrl(e.target.value)}
                placeholder="ws://localhost:3000/ws"
                disabled={testWsStatus === 'CONNECTED' || testWsStatus === 'CONNECTING'}
                className="flex-1 bg-[#07070a] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500/40 font-mono transition-all disabled:opacity-50"
              />
              {testWsStatus === 'DISCONNECTED' || testWsStatus === 'ERROR' ? (
                <button
                  type="button"
                  onClick={() => connectTestWs(testWsUrl)}
                  className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-black font-sans font-bold text-xs rounded-xl transition-all shadow-md hover:shadow-amber-500/10 active:scale-95 cursor-pointer shrink-0"
                >
                  Connect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={disconnectTestWs}
                  className="px-5 py-3 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 font-sans font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  Disconnect
                </button>
              )}
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 font-sans">
              Auto-detect internal or local gateway addresses:
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                  const url = `${proto}//${window.location.host}/ws`;
                  setTestWsUrl(url);
                  setTestWsLogs(prev => [...prev, { type: 'sys', message: `Mendeteksi internal gateway: ${url}`, timestamp: new Date().toLocaleTimeString() }]);
                }}
                disabled={testWsStatus === 'CONNECTED' || testWsStatus === 'CONNECTING'}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/75 text-[10px] font-mono rounded-lg border border-white/5 transition-all cursor-pointer disabled:opacity-50"
              >
                📍 Auto-Detect Internal
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = 'ws://localhost:6121/ws';
                  setTestWsUrl(url);
                }}
                disabled={testWsStatus === 'CONNECTED' || testWsStatus === 'CONNECTING'}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/75 text-[10px] font-mono rounded-lg border border-white/5 transition-all cursor-pointer disabled:opacity-50"
              >
                🖥️ Localhost Port 6121
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Custom Packet Sender */}
        <div className="pt-4 border-t border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-sans text-white/80 font-bold">Send Diagnostic Packet (TX)</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTestWsMsg(JSON.stringify({ type: "ping", origin: "Airi Client" }, null, 2))}
                className="text-[9px] uppercase tracking-wider text-amber-500/70 hover:text-amber-500 font-mono transition-colors"
              >
                Ping Template
              </button>
              <span className="text-white/20">|</span>
              <button
                type="button"
                onClick={() => setTestWsMsg(JSON.stringify({ type: "chat", data: { text: "Airi, how are you today?", viewer: "Developer" } }, null, 2))}
                className="text-[9px] uppercase tracking-wider text-cyan-400/70 hover:text-cyan-400 font-mono transition-colors"
              >
                Chat Template
              </button>
            </div>
          </div>

          <div className="relative">
            <textarea
              value={testWsMsg}
              onChange={e => setTestWsMsg(e.target.value)}
              rows={4}
              className="w-full bg-[#07070a] border border-white/5 rounded-xl p-4 text-xs text-white focus:outline-none focus:border-cyan-500/40 font-mono transition-all"
              placeholder='{"type": "chat_message", "text": "Subjek is speaking"}'
            />
            <button
              type="button"
              onClick={sendTestWsMsg}
              disabled={testWsStatus !== 'CONNECTED'}
              className="absolute bottom-3 right-3 px-4 py-2 bg-cyan-500 text-black text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-600 cursor-pointer shadow-lg disabled:cursor-not-allowed"
            >
              🚀 Send Packet
            </button>
          </div>
        </div>

        {/* Real-Time Message Traffic Log Sniffer Component */}
        <div className="pt-4 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] uppercase tracking-wider font-mono text-zinc-500">Live Traffic Monitor (TX/RX Log Stream)</label>
            <button
              type="button"
              onClick={clearTestWsLogs}
              className="text-[9px] uppercase tracking-wider text-rose-400 hover:text-rose-300 font-mono transition-colors"
            >
              Clear Log List
            </button>
          </div>

          <div className="bg-[#050508] border border-white/[0.03] rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {testWsLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic">
                <span>Waiting for packet transmission...</span>
              </div>
            ) : (
              testWsLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2 items-start leading-relaxed hover:bg-white/[0.02] p-1 rounded transition-colors break-all">
                  <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                  {log.type === 'rx' && (
                    <span className="text-cyan-400 shrink-0 font-bold">[RX]</span>
                  )}
                  {log.type === 'tx' && (
                    <span className="text-purple-400 shrink-0 font-bold">[TX]</span>
                  )}
                  {log.type === 'sys' && (
                    <span className="text-amber-500 shrink-0 font-bold">[SYS]</span>
                  )}
                  <span className={`${
                    log.type === 'rx' ? 'text-zinc-300' :
                    log.type === 'tx' ? 'text-purple-300/90' : 'text-zinc-400'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 2. Google Linkage & External Moderator Configuration */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4 font-sans">
        <div>
          <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-zinc-500 mb-2">Google OAuth Linkage (Stage-Web)</label>
          <div className="flex justify-between items-center p-3 bg-black/40 border border-[#ffffff05] rounded-xl font-sans">
            <span className="text-xs text-white/40">{user ? `Signed in as ${user.email}` : 'Linked status: Disarmed'}</span>
            {!user ? (
              <button 
                type="button"
                onClick={() => StorageService.signInWithGoogle()}
                className="px-4 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[9px] border border-cyan-500/20 uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                Authenticate
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => StorageService.logout()}
                className="px-4 py-1.5 bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 border border-white/5 uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                Sever Connection
              </button>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 font-sans mb-1.5">
          <label className="block text-[9px] uppercase tracking-[0.2em] font-mono text-zinc-500 mb-2">Live Stream Moderator Topic</label>
          <input
            type="text"
            placeholder="Enter Live Moderation Topic..."
            value={currentLiveTopic || ''}
            onChange={(e) => setCurrentLiveTopic && setCurrentLiveTopic(e.target.value)}
            className="w-full bg-[#07070a] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-cyan-500/55"
          />
        </div>

        {handleSimulateLive && (
          <div className="pt-4 border-t border-white/5 flex justify-between items-center">
            <div>
              <h5 className="text-xs font-bold text-white tracking-wide">Simulation Stream Injection</h5>
              <p className="text-[10px] text-white/30 uppercase mt-0.5">Test stream commentary flow rate</p>
            </div>
            <button
              type="button"
              onClick={handleSimulateLive}
              className="px-5 py-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[10px] uppercase tracking-widest rounded-xl border border-purple-400/20 transition-all font-bold cursor-pointer"
            >
              Trigger Simulation
            </button>
          </div>
        )}
      </div>

      {/* 3. Cross-Platform Telegram Pairing Gateway */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-5 relative overflow-hidden font-sans">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/5 blur-[50px] rounded-full pointer-events-none" />
        
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#0ea5e9] font-bold font-sans">Cross-Platform Pairing Gateway</h4>
            <p className="text-[10px] text-zinc-500 font-sans mt-0.5">
              Pair your Telegram account for cross-platform synchronization.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/5">
            <span className={`w-2 h-2 rounded-full ${
              pairingLinked ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(14,165,233,0.6)]' : 'bg-zinc-600'
            }`} />
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-white">
              {pairingLinked ? 'LINKED' : 'UNPAIRED'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {pairingLinked ? (
            <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-4 text-xs space-y-3">
              <div className="flex items-center gap-2.5 text-cyan-400 font-semibold">
                <span>✨</span>
                <span>Successfully Linked with Telegram!</span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-[11px] font-sans">
                Airi has linked your identity (<strong>{perceivedName}</strong>) on the Web platform with your Telegram account. You can now receive notifications, task updates, and interact seamlessly.
              </p>
              
              <div className="space-y-1.5 pt-2 border-t border-white/[0.03]">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">Daftar Akun Tertaut:</span>
                <div className="flex flex-wrap gap-1.5">
                  {pairingLinkedAccounts.filter(acc => acc.toLowerCase().includes('telegram')).map((acc, index) => (
                    <span key={index} className="px-2.5 py-1 bg-black/40 border border-white/5 text-[10px] text-cyan-300 rounded font-mono">
                      🔗 {acc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 leading-relaxed">
              <div className="space-y-3 font-sans">
                <span className="text-[11px] font-bold text-zinc-300 block uppercase tracking-wider font-mono">Pairing Steps:</span>
                <ol className="list-decimal pl-4 space-y-2 text-[11px] text-zinc-400 font-sans">
                  <li>Click <strong className="text-white">"Generate Pairing OTP"</strong> to get a unique 6-digit code.</li>
                  <li>Open Telegram and locate your Bot.</li>
                  <li>Send <code className="text-cyan-400 font-mono bg-black/50 px-1 py-0.5 rounded">/pair [otp_code]</code> or simply type <code className="text-cyan-400 font-mono bg-black/50 px-1 py-0.5 rounded">[otp_code]</code> to the bot.</li>
                  <li>Airi will instantly pair with your Telegram identity!</li>
                </ol>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center space-y-3 min-h-[140px] relative font-sans">
                {pairingLoading ? (
                  <div className="text-xs text-cyan-400 animate-pulse font-mono flex items-center gap-2">
                    <span>⏳</span>
                    <span>Generating pairing tunnel...</span>
                  </div>
                ) : pairingCode ? (
                  <div className="text-center space-y-2 font-sans">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono block">Your OTP Code:</span>
                    <div className="text-2xl font-bold tracking-[0.2em] text-cyan-400 font-mono select-all bg-black/55 border border-white/10 px-4 py-2 rounded-xl shadow-lg">
                      {pairingCode.substring(0, 3)} {pairingCode.substring(3)}
                    </div>
                    <span className="text-[9px] text-zinc-400 font-sans block">
                      Expires in 10 minutes. Send <code className="text-cyan-300 font-mono bg-black/40 px-1.5 py-0.5 rounded">/pair {pairingCode}</code> to the Telegram bot.
                    </span>
                  </div>
                ) : (
                  <div className="text-center space-y-2 font-sans">
                    <span className="text-[10px] text-zinc-500 font-sans block">No active OTP code generated yet.</span>
                    <button
                      type="button"
                      onClick={generatePairingCode}
                      className="px-5 py-2.5 bg-gradient-to-r from-cyan-600/25 to-sky-600/25 hover:from-cyan-500/35 hover:to-sky-500/35 text-cyan-200 border border-cyan-500/30 text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg hover:shadow-cyan-500/5 block mx-auto font-sans"
                    >
                      🔑 Generate Pairing OTP
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reverse Pairing */}
          <div className="border-t border-white/5 pt-5 mt-4 space-y-3 font-sans">
            <div className="flex items-center gap-2">
              <span className="p-1 px-2 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-mono uppercase font-bold">Reverse Pairing</span>
              <h5 className="text-[11px] font-bold text-zinc-200">Alternative Method: Enter Bot OTP Code</h5>
            </div>
            <p className="text-[10px] text-zinc-400 font-sans leading-relaxed">
              If Airi generates a 6-digit code on Telegram/Discord for <strong>{perceivedName}</strong>, enter it here to instantly link your accounts.
            </p>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Example: 123456"
                  value={botPairingCode}
                  onChange={(e) => setBotPairingCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono tracking-widest text-[#0ea5e9] placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 text-center uppercase"
                />
              </div>
              
              <button
                type="button"
                onClick={claimBotPairingCode}
                disabled={botPairingLoading || !botPairingCode || botPairingCode.length !== 6}
                className={`px-4 py-2 text-xs font-semibold rounded-xl border font-sans transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                  botPairingLoading || botPairingCode.length !== 6
                    ? 'bg-zinc-800/40 text-zinc-500 border-zinc-800 cursor-not-allowed'
                    : 'bg-purple-600/25 border-purple-500/30 text-purple-200 hover:bg-purple-500/35 hover:border-purple-400/40'
                }`}
              >
                {botPairingLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>🔌 Complete Connection</span>
                )}
              </button>
            </div>

            {botPairingMessage && (
              <div className={`text-[11px] p-2.5 px-3.5 rounded-xl border ${
                botPairingMessage.type === 'success'
                  ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/5 border-rose-500/10 text-rose-400'
              }`}>
                {botPairingMessage.type === 'success' ? '✅ ' : '❌ '}
                {botPairingMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Telegram Bot Daemon Controller */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4 font-sans relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 blur-[50px] rounded-full pointer-events-none" />
        
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-amber-500 font-bold">Telegram Daemon Controller</h4>
            <p className="text-[10px] text-zinc-500 font-sans mt-0.5">
              Force restart the Telegram bot daemon in case of disconnections.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          <div className="text-[11px] text-zinc-400 font-sans max-w-md leading-relaxed">
            If your Telegram bot loses connection or stops responding, you can trigger a daemon reboot safely without interrupting the main Airi system.
          </div>
          
          <button
            type="button"
            onClick={handleRestartTelegram}
            disabled={restartLoading}
            className={`px-5 py-3 text-xs font-semibold rounded-xl border font-sans transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
              restartLoading
                ? 'bg-zinc-800/40 text-zinc-500 border-zinc-800 cursor-not-allowed'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/30'
            }`}
          >
            {restartLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
                <span>Rebooting...</span>
              </>
            ) : (
              <>
                <span>🔄 Restart Telegram Daemon</span>
              </>
            )}
          </button>
        </div>

        {restartStatus && (
          <div className={`text-[11px] p-2.5 px-3.5 rounded-xl border ${
            restartStatus.type === 'success'
              ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
              : 'bg-rose-500/5 border-rose-500/10 text-rose-400'
          }`}>
            {restartStatus.type === 'success' ? '✅ ' : '❌ '}
            {restartStatus.text}
          </div>
        )}
      </div>
    </div>
  );
};
