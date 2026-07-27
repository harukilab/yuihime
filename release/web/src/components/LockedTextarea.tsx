import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Copy, Check } from 'lucide-react';

interface LockedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export const LockedTextarea: React.FC<LockedTextareaProps> = ({
  value,
  onChange,
  label,
  description,
  placeholder,
  rows = 5,
  className = '',
}) => {
  const [isLocked, setIsLocked] = useState(true);
  const [localVal, setLocalVal] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);

  
  useEffect(() => {
    if (!isFocused) {
      setLocalVal(value);
    }
  }, [value, isFocused]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const isDescLong = description && description.length > 80;
  const displayDesc = isDescLong && !showFullDesc 
    ? `${description.slice(0, 80)}...` 
    : description;

  return (
    <div className={`space-y-2 p-4 bg-black/35 border border-white/5 rounded-2xl transition-all duration-300 font-sans ${className}`}>
      {}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex flex-col flex-1">
          {label && (
            <span className="text-[10px] uppercase font-mono font-bold text-zinc-300 tracking-wider">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[9px] text-zinc-500 mt-0.5 leading-relaxed">
              {displayDesc}{' '}
              {isDescLong && (
                <button
                  type="button"
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="text-cyan-400 hover:text-cyan-300 font-mono text-[8px] uppercase tracking-wider ml-1 hover:underline cursor-pointer focus:outline-none"
                >
                  [{showFullDesc ? 'Hide' : 'Detail'}]
                </button>
              )}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 justify-start sm:justify-end mt-1 sm:mt-0">
          {}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy prompt text"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 text-zinc-400 hover:text-white border border-white/5 hover:bg-white/10 text-[9px] font-mono uppercase tracking-wider transition-all cursor-pointer select-none active:scale-95"
          >
            {copied ? (
              <>
                <Check size={10} className="text-emerald-400" />
                <span className="text-emerald-400 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={10} />
                <span>Copy</span>
              </>
            )}
          </button>

          {}
          <button
            type="button"
            onClick={() => setIsLocked(!isLocked)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase tracking-wider border transition-all cursor-pointer select-none ${
              !isLocked
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 font-bold'
                : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
            }`}
          >
            {!isLocked ? (
              <>
                <Unlock size={10} className="text-cyan-400" />
                <span>Unlocked</span>
              </>
            ) : (
              <>
                <Lock size={10} className="text-zinc-500 animate-pulse" />
                <span>Unlock<span className="hidden min-[400px]:inline"> to Edit</span></span>
              </>
            )}
          </button>
        </div>
      </div>

      {}
      <div className="relative">
        <textarea
          rows={rows}
          value={localVal}
          disabled={isLocked}
          onChange={(e) => {
            setLocalVal(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onChange(localVal);
          }}
          className={`w-full bg-[#111115] border rounded-xl px-3  py-2 text-base sm:text-xs text-white placeholder:text-gray-600 font-mono transition-all duration-300 resize-y outline-none ${
            !isLocked
              ? 'border-cyan-500/40 focus:border-cyan-400/70 shadow-[0_0_15px_rgba(6,182,212,0.15)] bg-cyan-950/5'
              : 'border-white/5 focus:border-white/5 cursor-not-allowed text-zinc-500 bg-[#0b0b0e]'
          }`}
          placeholder={placeholder || 'Masukkan isi konfigurasi batin...'}
        />

        {isLocked && (
          <div className="absolute right-3.5 bottom-3.5 flex items-center gap-1 bg-black/65 border border-white/5 rounded-md px-1.5 py-0.5 pointer-events-none select-none text-[8px] font-mono text-zinc-500 uppercase tracking-wider">
            <Lock size={8} /> READ ONLY
          </div>
        )}
      </div>
    </div>
  );
};
