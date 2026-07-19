import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  dropdownClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      const isMobileOrTouch = 
        /Mobi|Android|iPhone|iPad|Macintosh/i.test(navigator.userAgent) && 
        ('ontouchstart' in window || navigator.maxTouchPoints > 0);
      
      const isUiAutoFocusDisabled = localStorage.getItem('yuihime_disable_autofocus') === 'true';
      if (!isMobileOrTouch && !isUiAutoFocusDisabled) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  
  const selectedOption = useMemo(() => {
    return options.find(opt => opt.value === value) || null;
  }, [value, options]);

  
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const cleanQuery = searchQuery.toLowerCase().trim();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(cleanQuery) || 
      opt.value.toLowerCase().includes(cleanQuery)
    );
  }, [searchQuery, options]);

  
  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const hasSearch = options.length > 5;

  return (
    <div ref={containerRef} className="relative w-full font-sans">
      {}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-[#111115] border border-white/5 hover:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white text-left transition-all outline-none focus:border-cyan-500/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none ${
          isOpen ? 'border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]' : ''
        } ${className}`}
        id={`searchable-select-${placeholder.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <span className={`block break-words whitespace-normal text-xs leading-relaxed max-w-full ${!selectedOption ? 'text-zinc-500' : 'text-white'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          size={14} 
          className={`text-zinc-400 transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'transform rotate-180 text-cyan-400' : ''
          }`} 
        />
      </button>

      {}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute z-50 left-0 right-0 mt-1.5 bg-[#0e0e14]/95 border border-white/10 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.7)] backdrop-blur-md overflow-hidden ${dropdownClassName}`}
            style={{ minWidth: '100%' }}
          >
            {}
            {hasSearch && (
              <div className="relative border-b border-white/5 p-2">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Type to filter..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 hover:border-white/10 focus:border-cyan-550/30 rounded-lg pl-8 pr-8 py-2 text-xs text-white outline-none font-sans"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {}
            <div className="max-h-56 overflow-y-auto py-1 scrollbar-thin select-none">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-left cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400' 
                          : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="block break-words whitespace-normal text-xs leading-normal pr-3">{opt.label}</span>
                      {isSelected && <Check size={11} className="text-cyan-400 shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3.5 py-4 text-center text-[10px] text-zinc-500 font-mono italic">
                  No matching items found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
