import { useRef } from 'react';

export interface UseGazeTrackingProps {
  disableMouseTracking?: boolean;
  status?: string;
  isSpeakingRef: React.MutableRefObject<boolean>;
}

export function useGazeTracking({
  disableMouseTracking = false,
  status = '',
  isSpeakingRef,
}: UseGazeTrackingProps) {
  const gazeOverrideRef = useRef<{ x: number; y: number } | null>(null);
  const gazeTimeoutRef = useRef<any>(null);
  const currentGazeX = useRef(0);
  const currentGazeY = useRef(0);

  // Trigger temporary glance at a coordinate (e.g. for animations/events)
  const setGazeOverride = (x: number, y: number, durationMs = 3000) => {
    if (gazeTimeoutRef.current) {
      clearTimeout(gazeTimeoutRef.current);
    }
    gazeOverrideRef.current = { x, y };
    gazeTimeoutRef.current = setTimeout(() => {
      gazeOverrideRef.current = null;
    }, durationMs);
  };

  // Compute final smoothed gaze coordinates based on mouse position, status, and physical elapsed time
  const updateGaze = (
    time: number,
    mouseX: number,
    mouseY: number,
    screenWidth: number,
    screenHeight: number,
    lerpSpeed = 0.12
  ) => {
    const rawTargetX = disableMouseTracking || screenWidth === 0
      ? 0
      : (mouseX - screenWidth / 2) / (screenWidth / 2);
    
    const rawTargetY = disableMouseTracking || screenHeight === 0
      ? 0
      : (mouseY - screenHeight / 2) / (screenHeight / 2);

    let saccadeX = 0;
    let saccadeY = 0;
    const isAdventureStatus =
      status?.toLowerCase() === 'ekspedisi' ||
      status?.toLowerCase() === 'expedition' ||
      status?.toLowerCase() === 'adventure';

    if (isAdventureStatus) {
      const scanPeriod = 1.6;
      saccadeX = Math.sin(Math.floor(time / scanPeriod) * 123.4) * 0.45;
      saccadeY = Math.cos(Math.floor(time / scanPeriod) * 567.8) * 0.28;
    } else if (!isSpeakingRef.current && !gazeOverrideRef.current) {
      const scanPeriod = 4.5;
      const scanTime = time % scanPeriod;
      if (scanTime > 4.2) {
        saccadeX = Math.sin(Math.floor(time / scanPeriod) * 12.3) * 0.18;
        saccadeY = Math.cos(Math.floor(time / scanPeriod) * 8.7) * 0.1;
      }
    }

    const targetX = gazeOverrideRef.current
      ? gazeOverrideRef.current.x
      : Math.max(-1.0, Math.min(1.0, rawTargetX + saccadeX));

    const targetY = gazeOverrideRef.current
      ? gazeOverrideRef.current.y
      : Math.max(-1.0, Math.min(1.0, rawTargetY + saccadeY));

    currentGazeX.current += (targetX - currentGazeX.current) * lerpSpeed;
    currentGazeY.current += (targetY - currentGazeY.current) * lerpSpeed;

    return {
      gazeX: currentGazeX.current,
      gazeY: currentGazeY.current,
    };
  };

  return {
    gazeOverrideRef,
    gazeTimeoutRef,
    currentGazeX,
    currentGazeY,
    setGazeOverride,
    updateGaze,
  };
}
