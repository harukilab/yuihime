import { useEffect, useRef } from 'react';
import { SpeechService } from '../../core/speech';

export interface UseSpeechSyncProps {
  isSpeaking?: boolean;
  volume: number;
  typedSubtitle?: string;
  activeSubtitle?: string;
}

export function useSpeechSync({
  isSpeaking,
  volume,
  typedSubtitle = '',
  activeSubtitle = '',
}: UseSpeechSyncProps) {
  // Common refs used by rendering loops
  const isSpeakingRef = useRef(false);
  const volumeRef = useRef(0);
  const typedSubtitleRef = useRef('');
  const activeSubtitleRef = useRef('');
  const currentVowel = useRef<'a' | 'i' | 'u' | 'e' | 'o' | 'consonant' | 'pause'>('pause');

  // Sync incoming React props to refs
  useEffect(() => {
    isSpeakingRef.current = !!isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    typedSubtitleRef.current = typedSubtitle;
  }, [typedSubtitle]);

  useEffect(() => {
    activeSubtitleRef.current = activeSubtitle;
  }, [activeSubtitle]);

  // Handle frame-perfect SpeechService tick subscriptions
  useEffect(() => {
    if (typeof SpeechService.subscribeTick === 'function') {
      const unsub = SpeechService.subscribeTick((ev) => {
        if (ev.speaking) {
          isSpeakingRef.current = true;
          volumeRef.current = ev.intensity;
          currentVowel.current = ev.vowel;
          typedSubtitleRef.current = ev.currentSpokenText.substring(0, ev.charIndex + 1);
        } else {
          isSpeakingRef.current = false;
          volumeRef.current = 0;
          currentVowel.current = 'pause';
        }
      });
      return unsub;
    }
  }, []);

  return {
    isSpeakingRef,
    volumeRef,
    typedSubtitleRef,
    activeSubtitleRef,
    currentVowel,
  };
}
