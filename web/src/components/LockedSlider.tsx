import React, { useState, useEffect } from 'react';
import { Lock, Unlock } from 'lucide-react';

interface LockedSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  description?: string;
  className?: string;
  themeColor?: 'cyan' | 'amber' | 'emerald';
  sliderStyle?: React.CSSProperties;
  sliderClassName?: string;
}

export const LockedSlider: React.FC<LockedSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  description,
  className = '',
  themeColor = 'amber',
  sliderStyle,
  sliderClassName = '',
}) => {
  const [isLocked, setIsLocked] = useState(true);
  const [typedValue, setTypedValue] = useState<string>(value.toString());

  
  useEffect(() => {
    setTypedValue(value.toString());
  }, [value]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      onChange(val);
    }
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const valStr = e.target.value;
    setTypedValue(valStr);

    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      
      const clamped = Math.max(min, Math.min(max, val));
      onChange(clamped);
    }
  };

  const handleManualInputBlur = () => {
    
    setTypedValue(value.toString());
  };

  const colorConfig = {
    amber: {
      text: 'text-amber-400',
      accent: 'accent-amber-500',
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      sliderBg: 'bg-amber-500/10',
    },
    cyan: {
      text: 'text-cyan-400',
      accent: 'accent-cyan-500',
      border: 'border-cyan-500/20',
      bg: 'bg-cyan-500/5',
      badge: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
      sliderBg: 'bg-cyan-500/10',
    },
    emerald: {
      text: 'text-emerald-400',
      accent: 'accent-emerald-500',
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
      sliderBg: 'bg-emerald-500/10',
    }
  };

  const styles = colorConfig[themeColor] || colorConfig.amber;

  return (
    <div className={`space-y-2.5 p-3.5 bg-black/35 border border-white/5 rounded-2xl transition-all duration-300 font-sans ${className}`}>
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
              {description}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsLocked(!isLocked)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase tracking-wider border transition-all cursor-pointer select-none mt-1 sm:mt-0 w-fit shrink-0 ${
            !isLocked ? styles.badge + ' font-bold' : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
          }`}
        >
          {!isLocked ? (
            <>
              <Unlock size={10} className={styles.text} />
              <span>Unlocked</span>
            </>
          ) : (
            <>
              <Lock size={10} className="text-zinc-500 animate-pulse" />
              <span>Unlock<span className="hidden min-[400px]:inline"> to Adjust</span></span>
            </>
          )}
        </button>
      </div>

      {}
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-mono text-white/25 select-none">{min}</span>
        
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={isLocked}
            onChange={handleSliderChange}
            style={sliderStyle}
            className={`w-full h-1.5 rounded-lg appearance-none transition-all outline-none ${sliderClassName} ${
              !isLocked ? `cursor-pointer ${styles.accent} ${styles.sliderBg}` : 'cursor-not-allowed opacity-20 bg-white/5 pointer-events-none'
            }`}
          />
        </div>

        <span className="text-[9px] font-mono text-white/25 select-none">{max}</span>
      </div>

      {}
      <div className="flex justify-between items-center text-[10px] font-mono pt-2 border-t border-white/[0.03]">
        <span className="text-[9px] text-white/35 uppercase tracking-widest">Active Scale:</span>
        
        <div className="flex items-center gap-2">
          {}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={typedValue}
            disabled={isLocked}
            onChange={handleManualInputChange}
            onBlur={handleManualInputBlur}
            className={`w-16 text-center px-1.5 py-0.5 rounded-md border text-[10px] font-mono transition-all outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              !isLocked 
                ? `${styles.text} border-amber-500/20 bg-amber-500/10 focus:border-amber-500/40 focus:ring-1 focus:ring-subtle`
                : 'text-zinc-500 border-white/5 bg-white/[0.01] cursor-not-allowed'
            }`}
            placeholder={value.toString()}
          />
        </div>
      </div>
    </div>
  );
};
