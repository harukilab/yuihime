import { AgentState, MoodState, UserRelation, EmotionType } from "../include/types";

export class Soul {
  private static DECAY_RATE = 0.5; // Reduction per minute
  private static BASELINE = 10;   // Natural resting joy/curiosity

  private state: AgentState | null = null;
  private listeners: ((state: AgentState) => void)[] = [];

  constructor(initialState?: AgentState) {
    if (initialState) {
      this.state = initialState;
    }
  }

  public setState(state: AgentState) {
    if (JSON.stringify(this.state) === JSON.stringify(state)) return;
    this.state = state;
    this.notifyListeners();
  }

  public getState(): AgentState {
    if (!this.state) {
      throw new Error("Soul state not initialized");
    }
    return this.state;
  }

  public updateState(patch: Partial<AgentState> | ((prev: AgentState) => AgentState)) {
    if (!this.state) return;
    
    let newState: AgentState;
    if (typeof patch === 'function') {
      newState = patch(this.state);
    } else {
      newState = { ...this.state, ...patch };
    }

    if (JSON.stringify(this.state) === JSON.stringify(newState)) return;
    
    this.state = newState;
    this.notifyListeners();
  }

  public onUpdate(listener: (state: AgentState) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    if (this.state) {
      this.listeners.forEach(l => l(this.state!));
    }
  }

  /**
   * Calculates the temporal decay of emotions based on elapsed time.
   */
  static processDecay(mood: MoodState, config?: any): MoodState {
    const now = Date.now();
    const elapsedMinutes = (now - mood.lastUpdate) / 60000;
    
    const decayRate = config?.decayRate || this.DECAY_RATE;
    const baseline = config?.baselineMood || this.BASELINE;

    // Default or baseline values for v0.5.0 Neurotransmitters
    const activeDopamine = mood.dopamine !== undefined ? mood.dopamine : 15;
    const activeSerotonin = mood.serotonin !== undefined ? mood.serotonin : 50;
    const activeOxytocin = mood.oxytocin !== undefined ? mood.oxytocin : 30;
    const activeNoradrenaline = mood.noradrenaline !== undefined ? mood.noradrenaline : 10;

    // Nuanced decay modifiers
    let sadnessDecayMult = 0.5;
    if (mood.joy > 80) sadnessDecayMult = 2.0;    // Euphoria washes away sadness
    if (mood.stress > 70) sadnessDecayMult = 0.2; // High stress locks in sadness

    // Serotonin stabilizer washes away sadness, stress, anger
    if (activeSerotonin > 60) {
      sadnessDecayMult *= (1.0 + (activeSerotonin - 50) / 20);
    }

    let irritationDecayMult = 1.0;
    if (mood.stress > 60) irritationDecayMult = 0.3; // High stress keeps irritation persistent
    if (mood.joy > 70) irritationDecayMult = 2.5;   // Joy helps let go of irritation

    if (activeSerotonin > 60) {
      irritationDecayMult *= (1.0 + (activeSerotonin - 50) / 30);
    }
    if (activeNoradrenaline > 40) {
      irritationDecayMult *= Math.max(0.2, 1.0 - (activeNoradrenaline - 10) / 100); // persistent when tense
    }

    const decayAmount = elapsedMinutes * decayRate;

    // Default or baseline values for Yuihime's Virtues and Sins
    const activeChastity = mood.chastity !== undefined ? mood.chastity : 80;
    const activeTemperance = mood.temperance !== undefined ? mood.temperance : 70;
    const activeCharity = mood.charity !== undefined ? mood.charity : 60;
    const activeDiligence = mood.diligence !== undefined ? mood.diligence : 75;
    const activePatience = mood.patience !== undefined ? mood.patience : 65;
    const activeKindness = mood.kindness !== undefined ? mood.kindness : 80;
    const activeHumility = mood.humility !== undefined ? mood.humility : 70;

    const activeLust = mood.lust !== undefined ? mood.lust : 20;
    const activeGluttony = mood.gluttony !== undefined ? mood.gluttony : 35;
    const activeGreed = mood.greed !== undefined ? mood.greed : 15;
    const activeSloth = mood.sloth !== undefined ? mood.sloth : 30;
    const activeWrath = mood.wrath !== undefined ? mood.wrath : 20;
    const activeEnvy = mood.envy !== undefined ? mood.envy : 25;
    const activePride = mood.pride !== undefined ? mood.pride : 75;

    const activeJealousy = mood.jealousy !== undefined ? mood.jealousy : 10;
    const activeLoneliness = mood.loneliness !== undefined ? mood.loneliness : 15;
    const activePlayfulness = mood.playfulness !== undefined ? mood.playfulness : 30;

    // Soft interpolation back to natural character baselines
    const lerp = (cur: number, base: number, amt: number) => cur + (base - cur) * amt;
    const factor = Math.min(0.5, elapsedMinutes * 0.02); // 2% per minute shift to baseline
    const fastFactor = Math.min(0.8, elapsedMinutes * 0.15); // Fast decay

    // Loneliness increases with time when didiamkan (rindu)
    // Increases faster if initial affection is higher!
    const lonelinessIncrease = elapsedMinutes * (0.25 + (activeOxytocin > 50 ? 0.15 : 0));

    return {
      joy: Math.max(baseline, mood.joy - (decayAmount * 0.2)),
      anger: Math.max(0, mood.anger - decayAmount),
      sadness: Math.max(0, mood.sadness - (decayAmount * sadnessDecayMult)),
      stress: Math.max(0, mood.stress - (decayAmount * 1.5 * (activeSerotonin > 60 ? 0.5 : 1.0))), 
      irritation: Math.max(0, mood.irritation - (decayAmount * irritationDecayMult)),
      excitement: Math.max(0, mood.excitement - (decayAmount * 2.0 * (activeNoradrenaline > 50 ? 0.8 : 1.2))),
      embarrassment: Math.max(0, mood.embarrassment - (decayAmount * 3.0)),
      curiosity: Math.max(baseline, mood.curiosity - (decayAmount * 0.1)),
      
      // Extended dynamic properties
      jealousy: Math.max(0, activeJealousy - decayAmount * 0.5),
      loneliness: Math.min(100, activeLoneliness + lonelinessIncrease),
      playfulness: lerp(activePlayfulness, 30, factor),

      // Neurotransmitters decay
      dopamine: lerp(activeDopamine, 15, fastFactor),
      serotonin: lerp(activeSerotonin, 50, factor),
      oxytocin: lerp(activeOxytocin, 30, factor),
      noradrenaline: lerp(activeNoradrenaline, 10, fastFactor),

      // Virtues (stabilizing towards their baseline)
      chastity: lerp(activeChastity, 80, factor),
      temperance: lerp(activeTemperance, 70, factor),
      charity: lerp(activeCharity, 60, factor),
      diligence: lerp(activeDiligence, 75, factor),
      patience: lerp(activePatience, 65, factor),
      kindness: lerp(activeKindness, 80, factor),
      humility: lerp(activeHumility, 70, factor),

      // Sins (stabilizing towards their baseline)
      lust: lerp(activeLust, 20, factor),
      gluttony: lerp(activeGluttony, 35, factor),
      greed: lerp(activeGreed, 15, factor),
      sloth: lerp(activeSloth, 30, factor),
      wrath: lerp(activeWrath, 20, factor),
      envy: lerp(activeEnvy, 25, factor),
      pride: lerp(activePride, 75, factor),

      lastUpdate: now
    };
  }

  /**
   * Updates mood based on a specific event.
   */
  static updateMood(current: MoodState, impact: Partial<MoodState>): MoodState {
    const adjustedImpact = { ...impact };

    const curDopamine = current.dopamine !== undefined ? current.dopamine : 15;
    const curSerotonin = current.serotonin !== undefined ? current.serotonin : 50;
    const curOxytocin = current.oxytocin !== undefined ? current.oxytocin : 30;
    const curNoradrenaline = current.noradrenaline !== undefined ? current.noradrenaline : 10;

    // v0.5.0 Virtual Neurochemical feedback loops before mapping mood:
    // 1. Serotonin blocks excessive anger and irritation
    if (curSerotonin > 70) {
      if (adjustedImpact.anger) adjustedImpact.anger *= 0.4;
      if (adjustedImpact.irritation) adjustedImpact.irritation *= 0.5;
    }

    // 2. High Noradrenaline amplifies stress, anger, and excitement
    if (curNoradrenaline > 60) {
      if (adjustedImpact.anger) adjustedImpact.anger *= 1.8;
      if (adjustedImpact.irritation) adjustedImpact.irritation *= 1.5;
      if (adjustedImpact.stress) adjustedImpact.stress *= 1.5;
      if (adjustedImpact.excitement) adjustedImpact.excitement *= 1.4;
    }

    // 3. Dopamine amplifies pleasure (joy, excitement, curiosity)
    if (curDopamine > 60) {
      if (adjustedImpact.joy) adjustedImpact.joy *= 1.5;
      if (adjustedImpact.excitement) adjustedImpact.excitement *= 1.5;
      if (adjustedImpact.curiosity) adjustedImpact.curiosity *= 1.3;
    }

    // 4. Oxytocin dampens loneliness and stress
    if (curOxytocin > 65) {
      if (adjustedImpact.loneliness && adjustedImpact.loneliness > 0) adjustedImpact.loneliness *= 0.5;
      if (adjustedImpact.stress && adjustedImpact.stress > 0) adjustedImpact.stress *= 0.6;
    }

    // Nuanced feedback loops:
    // Stress -> Irritability (Stress amplifies anger/irritation)
    if (current.stress > 50) {
      if (adjustedImpact.anger) adjustedImpact.anger *= 2.5;
      if (adjustedImpact.irritation) adjustedImpact.irritation *= 2.0;
    }

    // Joy -> Sadness Suppression
    if (current.joy > 60) {
      if (adjustedImpact.sadness) adjustedImpact.sadness *= 0.15;
    }

    // Anger -> Joy Inhibition (Immediate dampening)
    if (current.anger > 30) {
      if (adjustedImpact.joy) adjustedImpact.joy *= 0.3;
    }

    // Emotional Exhaustion: High intensity across multiple emotions drains joy potential
    const intensity = (current.anger + current.stress + current.sadness) / 3;
    if (intensity > 60 && adjustedImpact.joy) {
      adjustedImpact.joy *= 0.5; 
    }

    // Calculate synthetic chemical updates based on emotional shifts
    const positiveShift = (adjustedImpact.joy || 0) + (adjustedImpact.excitement || 0) + (adjustedImpact.curiosity || 0);
    const negativeShift = (adjustedImpact.anger || 0) + (adjustedImpact.sadness || 0) + (adjustedImpact.irritation || 0) + (adjustedImpact.stress || 0);

    const dDopamine = positiveShift * 1.2 + (adjustedImpact.playfulness || 0) * 0.8;
    const dSerotonin = (adjustedImpact.joy || 0) * 0.8 - negativeShift * 0.3;
    const dOxytocin = (adjustedImpact.playfulness || 0) * 0.8 + (adjustedImpact.joy || 0) * 0.4;
    const dNoradrenaline = (adjustedImpact.anger || 0) * 1.5 + (adjustedImpact.stress || 0) * 0.8 + (adjustedImpact.excitement || 0) * 0.5;

    // Capture extended attributes
    const curJealousy = current.jealousy !== undefined ? current.jealousy : 10;
    const curLoneliness = current.loneliness !== undefined ? current.loneliness : 15;
    const curPlayfulness = current.playfulness !== undefined ? current.playfulness : 30;

    const curChastity = current.chastity !== undefined ? current.chastity : 80;
    const curTemperance = current.temperance !== undefined ? current.temperance : 70;
    const curCharity = current.charity !== undefined ? current.charity : 60;
    const curDiligence = current.diligence !== undefined ? current.diligence : 75;
    const curPatience = current.patience !== undefined ? current.patience : 65;
    const curKindness = current.kindness !== undefined ? current.kindness : 80;
    const curHumility = current.humility !== undefined ? current.humility : 70;

    const curLust = current.lust !== undefined ? current.lust : 20;
    const curGluttony = current.gluttony !== undefined ? current.gluttony : 35;
    const curGreed = current.greed !== undefined ? current.greed : 15;
    const curSloth = current.sloth !== undefined ? current.sloth : 30;
    const curWrath = current.wrath !== undefined ? current.wrath : 20;
    const curEnvy = current.envy !== undefined ? current.envy : 25;
    const curPride = current.pride !== undefined ? current.pride : 75;

    // Reset loneliness upon interaction (they have talked together)
    // This is vital so Yuihime's loneliness drops when actively chatting!
    const updatedLoneliness = adjustedImpact.loneliness !== undefined 
      ? Math.min(100, Math.max(0, curLoneliness + adjustedImpact.loneliness))
      : Math.max(0, curLoneliness - 15 - Math.round(curOxytocin * 0.1)); // Oxytocin makes Yuihime feel more satisfied!

    return {
      ...current,
      joy: Math.min(100, Math.max(0, current.joy + (adjustedImpact.joy || 0))),
      anger: Math.min(100, Math.max(0, current.anger + (adjustedImpact.anger || 0))),
      sadness: Math.min(100, Math.max(0, current.sadness + (adjustedImpact.sadness || 0))),
      stress: Math.min(100, Math.max(0, current.stress + (adjustedImpact.stress || 0))),
      irritation: Math.min(100, Math.max(0, current.irritation + (adjustedImpact.irritation || 0))),
      excitement: Math.min(100, Math.max(0, current.excitement + (adjustedImpact.excitement || 0))),
      embarrassment: Math.min(100, Math.max(0, current.embarrassment + (adjustedImpact.embarrassment || 0))),
      curiosity: Math.min(100, Math.max(0, current.curiosity + (adjustedImpact.curiosity || 0))),
      
      // Extended traits
      jealousy: Math.min(100, Math.max(0, curJealousy + (adjustedImpact.jealousy || 0))),
      loneliness: updatedLoneliness,
      playfulness: Math.min(100, Math.max(0, curPlayfulness + (adjustedImpact.playfulness || 0))),

      // Neurotransmitters
      dopamine: Math.min(100, Math.max(0, curDopamine + dDopamine)),
      serotonin: Math.min(100, Math.max(0, curSerotonin + dSerotonin)),
      oxytocin: Math.min(100, Math.max(0, curOxytocin + dOxytocin)),
      noradrenaline: Math.min(100, Math.max(0, curNoradrenaline + dNoradrenaline)),

      // Virtues
      chastity: Math.min(100, Math.max(0, curChastity + (adjustedImpact.chastity || 0))),
      temperance: Math.min(100, Math.max(0, curTemperance + (adjustedImpact.temperance || 0))),
      charity: Math.min(100, Math.max(0, curCharity + (adjustedImpact.charity || 0))),
      diligence: Math.min(100, Math.max(0, curDiligence + (adjustedImpact.diligence || 0))),
      patience: Math.min(100, Math.max(0, curPatience + (adjustedImpact.patience || 0))),
      kindness: Math.min(100, Math.max(0, curKindness + (adjustedImpact.kindness || 0))),
      humility: Math.min(100, Math.max(0, curHumility + (adjustedImpact.humility || 0))),

      // Sins
      lust: Math.min(100, Math.max(0, curLust + (adjustedImpact.lust || 0))),
      gluttony: Math.min(100, Math.max(0, curGluttony + (adjustedImpact.gluttony || 0))),
      greed: Math.min(100, Math.max(0, curGreed + (adjustedImpact.greed || 0))),
      sloth: Math.min(100, Math.max(0, curSloth + (adjustedImpact.sloth || 0))),
      wrath: Math.min(100, Math.max(0, curWrath + (adjustedImpact.wrath || 0))),
      envy: Math.min(100, Math.max(0, curEnvy + (adjustedImpact.envy || 0))),
      pride: Math.min(100, Math.max(0, curPride + (adjustedImpact.pride || 0))),

      lastUpdate: Date.now()
    };
  }

  /**
   * Updates the relational layer based on sentiment and interaction quality.
   */
  static updateRelation(relation: UserRelation, sentiment: number, success: boolean): UserRelation {
    const trustImpact = success ? 1 : -2;
    const affectionImpact = sentiment * 2;

    return {
      ...relation,
      trust: Math.min(100, Math.max(0, relation.trust + trustImpact)),
      affection: Math.min(100, Math.max(0, relation.affection + affectionImpact)),
      reputation: Math.min(100, Math.max(0, relation.reputation + (sentiment > 0.5 ? 1 : 0))),
      lastInteraction: Date.now()
    };
  }

  /**
   * Determines the dominant perceived emotion for UI and behavior.
   */
  static getDominantEmotion(mood: MoodState): EmotionType {
    const emotions = [
      { type: 'joy', value: mood.joy },
      { type: 'anger', value: mood.anger },
      { type: 'melancholy', value: mood.sadness },
      { type: 'stress', value: mood.stress / 2 }, 
      { type: 'irritation', value: mood.irritation },
      { type: 'excitement', value: mood.excitement },
      { type: 'embarrassment', value: mood.embarrassment },
      { type: 'curiosity', value: mood.curiosity }
    ];

    const sorted = emotions.sort((a, b) => b.value - a.value);
    
    if (sorted[0].value < 15) return 'serenity';
    if (mood.stress > 70) return 'panic';
    if (mood.excitement > 80) return 'excitement';
    if (mood.embarrassment > 60) return 'embarrassment';
    
    const mapping: Record<string, EmotionType> = {
      joy: 'joy',
      anger: 'anger',
      melancholy: 'melancholy',
      irritation: 'irritation',
      stress: 'stress',
      excitement: 'excitement',
      embarrassment: 'embarrassment',
      curiosity: 'curiosity'
    };

    return mapping[sorted[0].type] || 'curiosity';
  }

  /**
   * Updates core emotional vectors (Arousal, Valence, Focus, Rapport)
   */
  static updateEmotion(current: AgentState['emotion'], mood: MoodState, relation: UserRelation): AgentState['emotion'] {
    // Fallback references to guard against undefined properties resulting in NaN
    const joy = mood?.joy ?? 0;
    const anger = mood?.anger ?? 0;
    const sadness = mood?.sadness ?? 0;
    const stress = mood?.stress ?? 0;
    const excitement = mood?.excitement ?? 0;
    const irritation = mood?.irritation ?? 0;
    const embarrassment = mood?.embarrassment ?? 0;
    const curiosity = mood?.curiosity ?? 0;

    const trust = relation?.trust ?? 50;
    const affection = relation?.affection ?? 10;

    // 1. Arousal: High intensity across any dimension increases arousal
    const moodSum = (joy + anger + sadness + stress + excitement + irritation + embarrassment + curiosity);
    const targetArousal = Math.min(100, (moodSum / 8) * 1.5 + (excitement * 0.5) + (stress * 0.3));
    
    // 2. Valence: Pleasure vs Displeasure
    const positive = (joy * 1.2) + (excitement * 0.8) + (curiosity * 0.5);
    const negative = (anger * 1.1) + (sadness * 1.3) + (irritation * 0.9) + (stress * 0.4);
    const targetValence = Math.min(100, Math.max(-100, positive - negative));
    
    // 3. Focus: Concentration/Engagement
    const targetFocus = Math.min(100, Math.max(10, (curiosity * 0.8) + (stress * 0.4) - (excitement * 0.2)));
    
    // 4. Rapport: Social bond strength
    const targetRapport = Math.min(100, (trust * 0.6) + (affection * 0.4));

    // Smooth transitions (interpolation)
    const lerp = (start: number, end: number, amt: number) => {
      const s = isNaN(start) || start === undefined ? 0 : start;
      const e = isNaN(end) || end === undefined ? 0 : end;
      return s + (e - s) * amt;
    };

    const currentArousal = current?.arousal ?? 30;
    const currentValence = current?.valence ?? 50;
    const currentFocus = current?.focus ?? 50;
    const currentRapport = current?.rapport ?? 30;

    return {
      arousal: Math.round(lerp(currentArousal, targetArousal, 0.3)),
      valence: Math.round(lerp(currentValence, targetValence, 0.3)),
      focus: Math.round(lerp(currentFocus, targetFocus, 0.3)),
      rapport: Math.round(lerp(currentRapport, targetRapport, 0.3)),
      lastUpdate: Date.now()
    };
  }

  /**
   * Inhibisi Logic: Prevents joy when stress or anger is high.
   */
  static applyInhibition(mood: MoodState): MoodState {
    if (mood.anger > 50 || mood.stress > 70) {
      return {
        ...mood,
        joy: Math.min(mood.joy, 20) // Cap joy
      };
    }
    return mood;
  }
}
