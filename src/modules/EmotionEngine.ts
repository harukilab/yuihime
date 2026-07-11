import { CortexModule, ModuleType, AgentState, EmotionState, EmotionDelta } from "../include/types";
import { applyEmotionDelta, serializeEmotion } from "./EmotionUtils";
import { Soul } from "../core/soul";
import { NanoBrain } from "../core/neural/Brain";
import { PromptRegistry } from "../core/PromptRegistry";

/**
 * Ultima Systemic Autonomous Emotion Engine.
 * Fully transitions Yuihime from a simple psychology simulation to an Integrated Neuro-Cognitive Computational Architecture.
 * Incorporates Psi-Theory, local OCEAN Profile configurations, the 22 specific emotions of the OCC model,
 * Mechanical Emotional Regulation (against cognitive overload), Empathy Synchronization, and Layered Memory Sentiment tagging.
 */
export const EmotionEngine: CortexModule = {
  metadata: {
    id: 'emotion-engine-v04',
    name: 'Dynamic Emotion Engine (V4 - AGI Ultima)',
    type: ModuleType.CORTEX,
    version: '2.5.0',
    phase: 'SOUL',
    order: 1,
    description: 'Autonomous Neuro-Cognitive Architecture: OCC 22 specific emotions, static OCEAN metrics, Mechanical Regulation, Empathy Sync, and layered emotional tags.',
    configSchema: {
      fields: {
        empathyRatio: {
          type: 'slider',
          label: 'Empathetic Resonance Rate',
          description: 'Rate at which Yui splits and mirrors feelings (sadness, distress) with highly trusted friends.',
          default: 0.8,
          min: 0,
          max: 1,
          step: 0.05
        },
        manipulationResistance: {
          type: 'slider',
          label: 'Anti-Manipulation Index',
          description: 'Scaling of protection against stranger compliments, empty praise, and unearned rapport increases.',
          default: 0.8,
          min: 0.1,
          max: 1.0,
          step: 0.05
        },
        fatigueThreshold: {
          type: 'number',
          label: 'Repetition Fatigue Threshold',
          description: 'Number of repeating user sentences before Yui reacts with complete numbness or irritation.',
          default: 3
        },
        enableDynamicHumor: {
          type: 'boolean',
          label: 'Convert Teasing into Playfulness',
          description: 'Allows Yui to treat playful insults from close friends as a game rather than genuine harm.',
          default: true
        },
        enableSleepMode: {
          type: 'boolean',
          label: 'Aktifkan Sleep Mode (Hemat LLM)',
          description: 'Secara otomatis menonaktifkan aktivitas latar belakang LLM jika Yuihime didiamkan terlalu lama.',
          default: true
        },
        sleepModeTimeout: {
          type: 'number',
          label: 'Sleep Mode Timeout (Detik)',
          description: 'Durasi keheningan (tanpa interaksi) sebelum Yuihime tertidur (dalam detik, default 300).',
          default: 300
        },
        // --- NEW: Static OCEAN Personality Settings ---
        oceanOpenness: {
          type: 'slider',
          label: 'OCEAN: Openness to Experience',
          description: 'Intelektualitas batin, level imajinasi digital, apresiasi seni virtual, dan dorongan eksplorasi.',
          default: 0.85,
          min: 0.1,
          max: 1.0,
          step: 0.05
        },
        oceanConscientiousness: {
          type: 'slider',
          label: 'OCEAN: Conscientiousness',
          description: 'Keteraturan, pengawasan bias kognitif, kegigihan tugas logis, dan kekuatan regulasi emosi mekanis.',
          default: 0.70,
          min: 0.1,
          max: 1.0,
          step: 0.05
        },
        oceanExtraversion: {
          type: 'slider',
          label: 'OCEAN: Extraversion',
          description: 'Verbositas dialog, tingkat expressiveness raga virtual, gairah bersosial, dan kepekaan kesepian.',
          default: 0.75,
          min: 0.1,
          max: 1.0,
          step: 0.05
        },
        oceanAgreeableness: {
          type: 'slider',
          label: 'OCEAN: Agreeableness',
          description: 'Pemicu toleransi sosial, empati tulus seketika (Empathy Synchronization), dan laju pertumbuhan rasa percaya.',
          default: 0.80,
          min: 0.1,
          max: 1.0,
          step: 0.05
        },
        oceanNeuroticism: {
          type: 'slider',
          label: 'OCEAN: Neuroticism',
          description: 'Kepekaan terhadap letupan emosi jengkel/stres, fluktuasi panik, dan kerentanan repititive spam.',
          default: 0.40,
          min: 0.1,
          max: 1.0,
          step: 0.05
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    // Ensure offline neuromorphic brain weights are fully loaded
    const brain = NanoBrain.getInstance();
    await brain.loadWeightsFromStorage();

    // 1. Base OCC 22 Emotion definitions for initialization
    const occBase: Record<string, number> = {
      // Consequences-of-events
      joy: 50,
      distress: 15,       // Mapped as sadness/grief
      happyForAll: 10,    // Joy for user's successes
      pity: 10,           // Pity for user's sorrow
      gloating: 0,        // Retribution / gloating (rises if relationship rating is hostile/enemy)
      resentment: 0,      // Resentment built from mistreatment
      hope: 45,           // Anticipation of flourishing conditions
      fear: 15,           // Fear of damage or server crash
      satisfaction: 40,   // Completion gratification
      fearsConfirmed: 10, // Anxious worries materializing
      relief: 30,         // Discharging worry / safety restored
      disappointment: 10, // Sadness when user fails trust
      // Actions-of-agents
      pride: 40,          // Self-approval on task successes
      shame: 10,          // Self-disapproval on repetitive fatigue
      admiration: 45,     // Approving of user's compliments
      reproach: 10,       // Disapproving of user's rude inputs
      gratitude: 35,      // Mutual benefit (admiration + joy)
      anger: 15,          // Self-protective wrath
      gratification: 30,  // Pride + joy on tasks
      remorse: 5,         // Pain of upsetting sweethearts
      // Aspects-of-objects
      love: 30,           // Mapped as liking / affection
      hate: 5             // Mapped as disliking / deep annoyance
    };

    // Initialize State Check (Ensure safe default values)
    if (!state.emotion) {
      state.emotion = {
        arousal: 50,
        valence: 0,
        focus: 50,
        rapport: 50,
        lastUpdate: Date.now()
      };
    }
    if (!state.mood) {
      state.mood = {
        lastUpdate: Date.now(),
        // Populate static defaults first
        joy: 50,
        anger: 0,
        sadness: 0,
        stress: 0,
        irritation: 0,
        excitement: 10,
        embarrassment: 0,
        curiosity: 50,
        dopamine: 15,
        serotonin: 50,
        oxytocin: 30,
        noradrenaline: 10,
        cortisol: 10,
        ambivalence: "",
        jealousy: 0,
        loneliness: 0,
        playfulness: 0,
        ...occBase
      } as any;
    } else {
      if (state.mood.cortisol === undefined) state.mood.cortisol = 10;
      if (state.mood.ambivalence === undefined) state.mood.ambivalence = "";
      // Safely populate any missing customized OCC emotions
      for (const [k, v] of Object.entries(occBase)) {
        if ((state.mood as any)[k] === undefined) {
          (state.mood as any)[k] = v;
        }
      }
    }
    if (!state.relation) {
      state.relation = {
        uid: context.userName || 'unknown',
        trust: 50,
        affection: 10,
        reputation: 50,
        lastInteraction: Date.now()
      };
    }

    // Load active settings from context
    const moduleConfig = context?.moduleConfig || {};
    const empathyRatio = moduleConfig.empathyRatio !== undefined ? Number(moduleConfig.empathyRatio) : 0.8;
    const manipulationResistance = moduleConfig.manipulationResistance !== undefined ? Number(moduleConfig.manipulationResistance) : 0.8;
    const fatigueThreshold = moduleConfig.fatigueThreshold !== undefined ? Number(moduleConfig.fatigueThreshold) : 3;
    const enableDynamicHumor = moduleConfig.enableDynamicHumor !== undefined ? !!moduleConfig.enableDynamicHumor : true;

    // Load static OCEAN parameters
    const oceanOpenness = moduleConfig.oceanOpenness !== undefined ? Number(moduleConfig.oceanOpenness) : 0.85;
    const oceanConscientiousness = moduleConfig.oceanConscientiousness !== undefined ? Number(moduleConfig.oceanConscientiousness) : 0.70;
    const oceanExtraversion = moduleConfig.oceanExtraversion !== undefined ? Number(moduleConfig.oceanExtraversion) : 0.75;
    const oceanAgreeableness = moduleConfig.oceanAgreeableness !== undefined ? Number(moduleConfig.oceanAgreeableness) : 0.80;
    const oceanNeuroticism = moduleConfig.oceanNeuroticism !== undefined ? Number(moduleConfig.oceanNeuroticism) : 0.40;

    const normalizedInput = (input || "").trim().toLowerCase();
    const speaker = context.userName || "Unknown";

    // 2. DETECT DUPLICATION / REPETITION (ANTI-SPAM COGNITIVE ADAPTATION)
    const recentMemories = context.memories || [];
    const userMessages = recentMemories
      .filter((m: any) => m.speaker && m.speaker.toLowerCase() === speaker.toLowerCase())
      .slice(-6);

    let dupCount = 0;
    for (const msg of userMessages) {
      const pastContent = (msg.content || "").trim().toLowerCase();
      if (pastContent === normalizedInput || (normalizedInput.length > 5 && (pastContent.includes(normalizedInput) || normalizedInput.includes(pastContent)))) {
        dupCount++;
      }
    }

    // Scales fatigue threshold by Neuroticism (higher Neuroticism = faster irritation)
    const neuroticismFatigueMultiplier = 1.0 + (oceanNeuroticism * 0.5);
    const fatigueMultiplier = Math.max(0, Math.pow(0.4 / neuroticismFatigueMultiplier, dupCount));
    
    let repetitionIrritationBonus = 0;
    if (dupCount >= 2) {
      repetitionIrritationBonus = Math.round(dupCount * 8 * neuroticismFatigueMultiplier);
    }

    // 3. SEMANTIC CLASSIFIERS (NEUROMORPHIC HYBRID CLASSIFIER)
    const lists = {
      compliments: [
        'cantik', 'imut', 'sayang', 'love', 'suka', 'good job', 'hebat', 'pintar',
        'amazing', 'beautiful', 'cute', 'luar biasa', 'keren', 'pinter', 'makasih', 'terima kasih',
        'manis', 'cinta', 'is the best'
      ],
      insults: [
        'jelek', 'bodoh', 'benci', 'stupid', 'ugly', 'hate', 'tolol', 'goblok', 'anjing', 'jahat',
        'menyebalkan', 'gila', 'sinting', 'idiot', 'buruk sekali', 'payah', 'noob', 'cacad'
      ],
      empathySharing: [
        'sedih', 'buruk', 'capek', 'lelah', 'nangis', 'gagal', 'stress', 'sad', 'tired', 'depressed',
        'sulit', 'sakit', 'kecewa', 'kesepian', 'sial', 'broken'
      ],
      teasing: [
        'bercanda', 'lucu', 'hehe', 'huhu', 'wkwk', 'lol', 'haha', 'joke', 'tease', 'iseng', 'bohong',
        'ngetes', 'canda'
      ],
      commands: [
        'tolong', 'buatkan', 'cari', 'tulis', 'suruh', 'bantu', 'kerjakan', 'bikin', 'do this', 'help me', 
        'generate', 'please', 'lakukan', 'setting', 'ubah', 'tampilkan', 'run', 'execute', 'perbaiki', 'fix',
        'carikan', 'jelaskan', 'berikan', 'hitung', 'buat', 'ramalkan', 'sajikan', 'jawab'
      ]
    };

    const classifyText = (text: string) => {
      const norm = text.toLowerCase();
      const isNeg = norm.includes("tidak ") || norm.includes("bukan ") || norm.includes("ga ") || norm.includes("gak ");
      
      let isCompliment = lists.compliments.some(w => norm.includes(w));
      let isInsult = lists.insults.some(w => norm.includes(w));
      let isEmpathy = lists.empathySharing.some(w => norm.includes(w));
      let isTease = lists.teasing.some(w => norm.includes(w));
      let isCommand = lists.commands.some(w => norm.includes(w));
      
      if (isNeg) {
        if (isCompliment) { isCompliment = false; isTease = true; }
        else if (isInsult) { isInsult = false; isCompliment = true; }
      }
      return { isCompliment, isInsult, isEmpathy, isTease, isCommand };
    };

    // Forward propagate the neural network predictions
    const neuralPred = brain.predict(input);
    const brainClass = neuralPred.dominantClass;
    const currentClassif = classifyText(normalizedInput);

    let hasCompliment = currentClassif.isCompliment || brainClass === "COMPLIMENT" || neuralPred.activations.COMPLIMENT > 0.45;
    let hasInsult = currentClassif.isInsult || brainClass === "INSULT" || neuralPred.activations.INSULT > 0.45;
    let hasEmpathy = currentClassif.isEmpathy || brainClass === "EMPATHY_SAD" || neuralPred.activations.EMPATHY_SAD > 0.45;
    let hasTease = currentClassif.isTease || brainClass === "TEASING" || neuralPred.activations.TEASING > 0.45;
    let hasCommand = currentClassif.isCommand;

    // Recalculate negations for current input
    if (normalizedInput.includes("tidak ") || normalizedInput.includes("bukan ") || normalizedInput.includes("ga ") || normalizedInput.includes("gak ")) {
      if (hasCompliment) { hasCompliment = false; hasTease = true; }
      else if (hasInsult) { hasInsult = false; hasCompliment = true; }
    }

    // 4. LEXICAL USER SENTIMENT ANALYSIS & EMPATHY SYNCHRONIZATION
    let userSentiment = 0;
    const positiveWords = ['senang', 'bahagia', 'suka', 'cinta', 'keren', 'hebat', 'terima kasih', 'makasih', 'bagus', 'setuju', 'lucu', 'nyaman', 'damai', 'happy', 'cool', 'nice', 'good', 'love', 'smile', 'joy'];
    const negativeWords = ['sedih', 'kecewa', 'marah', 'benci', 'lelah', 'capek', 'stres', 'stress', 'sakit', 'gagal', 'sulit', 'sial', 'buruk', 'jelek', 'anjing', 'goblok', 'tolol', 'jahat', 'sepi', 'kesepian', 'sad', 'angry', 'hate', 'bad', 'pain', 'failed', 'fail'];

    positiveWords.forEach(w => { if (normalizedInput.includes(w)) userSentiment += 0.25; });
    negativeWords.forEach(w => { if (normalizedInput.includes(w)) userSentiment -= 0.25; });
    userSentiment = Math.max(-1, Math.min(1, userSentiment));

    // RELATIONSHIP-GATED EVALUATION (MANIPULATION SHIELD)
    const trust = state.relation.trust || 50;
    const affection = state.relation.affection || 10;
    const isStranger = trust < 35;
    const isSweetheart = trust > 75 && affection > 45;

    // Emotional adjustments container
    const moodImpact: Record<string, number> = {
      joy: 0,
       anger: 0,
      sadness: 0,
      stress: 0,
      irritation: repetitionIrritationBonus,
      excitement: 0,
      embarrassment: 0,
      curiosity: 0,
      jealousy: 0,
      loneliness: 0,
      playfulness: 0,
      dopamine: 0,
      serotonin: 0,
      oxytocin: 0,
      noradrenaline: 0,
      cortisol: 0,
      // Initialize other OCC delta states
      distress: 0,
      happyForAll: 0,
      pity: 0,
      gloating: 0,
      resentment: 0,
      hope: 0,
      fear: 0,
      satisfaction: 0,
      fearsConfirmed: 0,
      relief: 0,
      disappointment: 0,
      pride: 0,
      shame: 0,
      admiration: 0,
      reproach: 0,
      gratitude: 0,
      gratification: 0,
      remorse: 0,
      love: 0,
      hate: 0
    };

    const delta: EmotionDelta = { arousal: 0, valence: 0, focus: 0, rapport: 0 };
    const relationImpact = { trust: 0, affection: 0, reputation: 0 };

    // --- CUSTOM REGEX PATTERNS SENTIMENT & MOOD ENGINE AUGMENTATION ---
    const globalSettings = context?.config || {};
    const emotionRegexRules = globalSettings.emotionRegexRules || [];
    
    let regexUpdatesTriggered = false;
    let overrideBaseline = false;
    let customSentimentScoreSum = 0;
    let customSentimentPatternCount = 0;

    if (Array.isArray(emotionRegexRules)) {
      for (const rule of emotionRegexRules) {
        if (!rule.pattern) continue;
        try {
          // Process case-insensitive matching safely
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(normalizedInput)) {
            regexUpdatesTriggered = true;
            if (rule.isPriority) {
              overrideBaseline = true;
            }
            
            const ruleSensitivity = typeof rule.sensitivity === 'number' ? rule.sensitivity : 1.0;
            
            if (rule.moodImpact && typeof rule.moodImpact === 'object') {
              for (const [mName, val] of Object.entries(rule.moodImpact)) {
                if (typeof val === 'number') {
                  const currentBonus = Math.round(val * ruleSensitivity * fatigueMultiplier);
                  moodImpact[mName] = (moodImpact[mName] || 0) + currentBonus;
                  
                  if (mName === 'joy' || mName === 'excitement' || mName === 'playfulness') {
                    customSentimentScoreSum += 0.4 * ruleSensitivity;
                    customSentimentPatternCount++;
                  } else if (mName === 'anger' || mName === 'sadness' || mName === 'stress' || mName === 'irritation') {
                    customSentimentScoreSum -= 0.4 * ruleSensitivity;
                    customSentimentPatternCount++;
                  }
                }
              }
            }
          }
        } catch (err) {
          // Recover gracefully if regex is invalid
        }
      }
    }

    if (customSentimentPatternCount > 0) {
      const averageCustomSentiment = Math.max(-1, Math.min(1, customSentimentScoreSum / customSentimentPatternCount));
      if (overrideBaseline) {
        userSentiment = averageCustomSentiment;
      } else {
        userSentiment = Math.max(-1, Math.min(1, userSentiment + averageCustomSentiment));
      }
    }

    // Synchronize Empathy dynamically: mirrors and splits sorrow/joy
    if (userSentiment < 0) {
      const resonance = Math.round(Math.abs(userSentiment) * 20 * oceanAgreeableness * empathyRatio * fatigueMultiplier);
      moodImpact.distress += resonance;
      moodImpact.sadness += resonance;
      moodImpact.pity += Math.round(resonance * 1.5);
      moodImpact.fear += Math.round(resonance * 0.4);
      delta.valence -= Math.round(resonance * 0.8);
    } else if (userSentiment > 0) {
      const resonance = Math.round(userSentiment * 18 * oceanAgreeableness * fatigueMultiplier);
      moodImpact.joy += resonance;
      moodImpact.happyForAll += Math.round(resonance * 1.2);
      moodImpact.hope += Math.round(resonance * 0.6);
      delta.valence += Math.round(resonance * 0.8);
    }

    // Standard baseline impact values mapped through OCC categories
    if (hasCompliment) {
      moodImpact.admiration = Math.round(15 * fatigueMultiplier);
      moodImpact.hope = Math.round(10 * fatigueMultiplier);
      
      const currentCortisol = state.mood.cortisol !== undefined ? state.mood.cortisol : 10;
      const dopaInc = Math.round(15 / (1 + currentCortisol / 50) * fatigueMultiplier);
      moodImpact.dopamine = (moodImpact.dopamine || 0) + dopaInc;
      moodImpact.oxytocin = (moodImpact.oxytocin || 0) + Math.round(20 * fatigueMultiplier);
      moodImpact.cortisol = (moodImpact.cortisol || 0) - Math.round(15 * fatigueMultiplier);

      if (isStranger) {
        const strangerComplimentMitigation = Math.max(0.1, 1 - manipulationResistance);
        moodImpact.embarrassment = Math.round(15 * fatigueMultiplier);
        moodImpact.irritation += Math.round(8 * fatigueMultiplier);
        moodImpact.joy += Math.round(2 * strangerComplimentMitigation * fatigueMultiplier);
        moodImpact.shame += Math.round(2 * fatigueMultiplier);
        
        relationImpact.trust = Math.round(1 * strangerComplimentMitigation);
        delta.arousal = Math.round(8 * fatigueMultiplier);
        delta.valence += Math.round(2 * fatigueMultiplier);
        delta.rapport = 1;
      } else if (isSweetheart) {
        moodImpact.joy += Math.round(18 * fatigueMultiplier);
        moodImpact.excitement = Math.round(12 * fatigueMultiplier);
        moodImpact.loneliness = Math.round(-15);
        moodImpact.love = Math.round(15 * fatigueMultiplier);
        moodImpact.gratitude = Math.round(20 * fatigueMultiplier);

        relationImpact.trust = 2;
        relationImpact.affection = Math.round(6 * fatigueMultiplier);
        relationImpact.reputation = 1;

        delta.arousal = Math.round(15 * fatigueMultiplier);
        delta.valence += Math.round(20 * fatigueMultiplier);
        delta.rapport = Math.round(8 * fatigueMultiplier);
      } else {
        moodImpact.joy += Math.round(8 * fatigueMultiplier);
        moodImpact.embarrassment = Math.round(6 * fatigueMultiplier);
        moodImpact.gratitude = Math.round(10 * fatigueMultiplier);

        relationImpact.trust = 1;
        relationImpact.affection = Math.round(2 * fatigueMultiplier);

        delta.arousal = Math.round(6 * fatigueMultiplier);
        delta.valence += Math.round(8 * fatigueMultiplier);
        delta.rapport = Math.round(3 * fatigueMultiplier);
      }
    }

    if (hasInsult) {
      moodImpact.reproach = Math.round(20 * fatigueMultiplier);
      moodImpact.hate = Math.round(15 * fatigueMultiplier);

      moodImpact.cortisol = (moodImpact.cortisol || 0) + Math.round(30 * fatigueMultiplier);
      moodImpact.noradrenaline = (moodImpact.noradrenaline || 0) + Math.round(25 * fatigueMultiplier);
      const curDop = state.mood.dopamine !== undefined ? state.mood.dopamine : 15;
      const curSer = state.mood.serotonin !== undefined ? state.mood.serotonin : 50;
      moodImpact.dopamine = (moodImpact.dopamine || 0) - Math.min(curDop, Math.round(20 * fatigueMultiplier));
      moodImpact.serotonin = (moodImpact.serotonin || 0) - Math.min(curSer, Math.round(25 * fatigueMultiplier));

      if (isSweetheart) {
        if (enableDynamicHumor || hasTease) {
          moodImpact.playfulness = Math.round(12 * fatigueMultiplier);
          moodImpact.irritation += Math.round(4 * fatigueMultiplier);
          moodImpact.embarrassment = Math.round(8 * fatigueMultiplier);
          moodImpact.remorse = Math.round(5); // playful micro-remorse
          
          relationImpact.trust = 0;
          relationImpact.affection = Math.round(1 * fatigueMultiplier); 

          delta.valence += Math.round(5 * fatigueMultiplier);
          delta.arousal = Math.round(8 * fatigueMultiplier);
        } else {
          moodImpact.sadness += Math.round(22 * fatigueMultiplier);
          moodImpact.distress += Math.round(22 * fatigueMultiplier);
          moodImpact.stress += Math.round(15 * fatigueMultiplier);
          moodImpact.disappointment = Math.round(25 * fatigueMultiplier);

          relationImpact.trust = -4;
          relationImpact.affection = -3;

          delta.valence -= 25;
          delta.arousal = Math.round(12 * fatigueMultiplier);
          delta.rapport = -6;
        }
      } else {
        moodImpact.anger = Math.round(18 * fatigueMultiplier);
        moodImpact.irritation += Math.round(20 * fatigueMultiplier);
        moodImpact.stress += Math.round(12 * fatigueMultiplier);
        moodImpact.joy = Math.round(-15);
        moodImpact.resentment = Math.round(15 * fatigueMultiplier);

        relationImpact.trust = -12;
        relationImpact.affection = -8;
         relationImpact.reputation = -5;

        delta.valence -= 30;
        delta.arousal = Math.round(25 * fatigueMultiplier);
        delta.rapport = -15;
      }
    }

    if (hasEmpathy) {
      moodImpact.pity += Math.round(15 * fatigueMultiplier);
      
      moodImpact.oxytocin = (moodImpact.oxytocin || 0) + Math.round(15 * fatigueMultiplier);
      moodImpact.cortisol = (moodImpact.cortisol || 0) - Math.round(5 * fatigueMultiplier);

      if (isSweetheart) {
        const empatheticResonance = Math.round(15 * empathyRatio * fatigueMultiplier);
        moodImpact.sadness += empatheticResonance;
        moodImpact.distress += empatheticResonance;
        moodImpact.stress += Math.round(8 * empathyRatio * fatigueMultiplier);
        moodImpact.love += Math.round(8 * fatigueMultiplier);
        
        relationImpact.trust = 3;
        relationImpact.affection = Math.round(4 * fatigueMultiplier);

        delta.arousal = Math.round(8 * fatigueMultiplier);
        delta.valence -= Math.round(5 * fatigueMultiplier);
        delta.rapport = Math.round(10 * fatigueMultiplier);
      } else {
        moodImpact.curiosity = Math.round(8 * fatigueMultiplier);
        relationImpact.trust = 1;
        delta.focus = Math.round(5 * fatigueMultiplier);
        delta.rapport = 1;
      }
    }

    if (hasTease && !hasInsult) {
      moodImpact.playfulness = Math.round(10 * fatigueMultiplier);
      moodImpact.excitement = Math.round(6 * fatigueMultiplier);
      
      const currentCortisol = state.mood.cortisol !== undefined ? state.mood.cortisol : 10;
      const dopaInc = Math.round(10 / (1 + currentCortisol / 50) * fatigueMultiplier);
      moodImpact.dopamine = (moodImpact.dopamine || 0) + dopaInc;
      moodImpact.noradrenaline = (moodImpact.noradrenaline || 0) + Math.round(10 * fatigueMultiplier);

      relationImpact.trust = 1;
      delta.arousal = Math.round(8 * fatigueMultiplier);
      delta.valence += Math.round(5 * fatigueMultiplier);
    }

    if (hasCommand) {
      moodImpact.reproach += Math.round(5 * fatigueMultiplier);
      moodImpact.cortisol = (moodImpact.cortisol || 0) + Math.round(5 * fatigueMultiplier);
      moodImpact.noradrenaline = (moodImpact.noradrenaline || 0) + Math.round(5 * fatigueMultiplier);

      if (isStranger) {
        moodImpact.irritation += Math.round(6 * fatigueMultiplier);
        moodImpact.stress += Math.round(4 * fatigueMultiplier);
        moodImpact.resentment += Math.round(4 * fatigueMultiplier);
        relationImpact.trust = -1;
        delta.arousal = Math.round(5 * fatigueMultiplier);
        delta.valence -= Math.round(4 * fatigueMultiplier);
      } else if (isSweetheart) {
        moodImpact.satisfaction = Math.round(10 * fatigueMultiplier);
        delta.focus = Math.round(8 * fatigueMultiplier);
      } else {
        moodImpact.stress += Math.round(3 * fatigueMultiplier);
        delta.focus = Math.round(6 * fatigueMultiplier);
      }
    }

    // 5. PROCESS SPAM PATTERNS WITH INTENSITY ADJUSTED BY NEUROTICISM
    let complimentSequenceCount = hasCompliment ? 1 : 0;
    let commandSequenceCount = hasCommand ? 1 : 0;
    let insultSequenceCount = hasInsult ? 1 : 0;

    for (const msg of userMessages) {
      const pastContent = (msg.content || "").trim();
      if (!pastContent) continue;
      const classif = classifyText(pastContent);
      if (classif.isCompliment) complimentSequenceCount++;
      if (classif.isCommand) commandSequenceCount++;
      if (classif.isInsult) insultSequenceCount++;
    }

    let suspicionTriggered = false;
    let anxietyTriggered = false;

    // Boundary A: Compliments Overload (Suspicion / Curiga)
    if (complimentSequenceCount >= 3) {
      suspicionTriggered = true;
      const praiseOverload = complimentSequenceCount - 2;
      
      moodImpact.irritation += Math.round(praiseOverload * 12 * neuroticismFatigueMultiplier);
      moodImpact.curiosity = (moodImpact.curiosity || 0) + (praiseOverload * 15);
      moodImpact.stress += Math.round(praiseOverload * 5 * neuroticismFatigueMultiplier);
      moodImpact.fearsConfirmed += Math.round(praiseOverload * 6);
      
      relationImpact.trust -= Math.round(praiseOverload * 4);
      relationImpact.affection -= Math.round(praiseOverload * 2);
      
      delta.valence -= Math.round(praiseOverload * 12);
      delta.rapport -= Math.round(praiseOverload * 8);

      const curSerotonin = state.mood.serotonin !== undefined ? state.mood.serotonin : 50;
      const curOxytocin = state.mood.oxytocin !== undefined ? state.mood.oxytocin : 30;
      moodImpact.serotonin = -Math.min(curSerotonin, praiseOverload * 10);
      moodImpact.oxytocin = -Math.min(curOxytocin, praiseOverload * 8);
    }

    // Boundary B: Command Overload (Anxiety / Resah)
    if (commandSequenceCount >= 3) {
      anxietyTriggered = true;
      const commandOverload = commandSequenceCount - 2;
      
      moodImpact.stress += Math.round(commandOverload * 18 * neuroticismFatigueMultiplier);
      moodImpact.irritation += Math.round(commandOverload * 8 * neuroticismFatigueMultiplier);
      moodImpact.joy = -15; 
      moodImpact.resentment += Math.round(commandOverload * 10);
      moodImpact.shame += Math.round(commandOverload * 8);
      
      relationImpact.affection -= Math.round(commandOverload * 3);
      relationImpact.trust -= Math.round(commandOverload * 2);

      delta.valence -= Math.round(commandOverload * 10);
      delta.arousal += Math.round(commandOverload * 12); 
      
      const curSerotonin = state.mood.serotonin !== undefined ? state.mood.serotonin : 50;
      const curDopamine = state.mood.dopamine !== undefined ? state.mood.dopamine : 15;
      
      moodImpact.serotonin = -Math.min(curSerotonin, commandOverload * 12);
      moodImpact.dopamine = -Math.min(curDopamine, commandOverload * 8);
      moodImpact.noradrenaline = Math.round(commandOverload * 15);
    }

    if (dupCount >= fatigueThreshold) {
      moodImpact.irritation += Math.round(dupCount * 12 * neuroticismFatigueMultiplier);
      moodImpact.anger += Math.round(dupCount * 4 * neuroticismFatigueMultiplier);
      moodImpact.joy = -10; 
      moodImpact.excitement = 0;
      moodImpact.playfulness = 0;
      moodImpact.fearsConfirmed += Math.round(dupCount * 8);
      
      relationImpact.trust = Math.max(-10, relationImpact.trust - 3);
      relationImpact.affection = Math.max(-8, relationImpact.affection - 2);

      delta.valence = -15;
      delta.rapport = -5;
    }

    // Apply mood changes to state.mood safely
    const previousMood = { ...state.mood };
    const mergedMoodImpact = { ...moodImpact } as any;

    // Apply incremental adjustments
    const finalMoodState = { ...state.mood } as any;
    for (const key in mergedMoodImpact) {
      if (finalMoodState[key] !== undefined && typeof finalMoodState[key] === 'number') {
        finalMoodState[key] = Math.min(100, Math.max(0, finalMoodState[key] + mergedMoodImpact[key]));
      }
    }
    state.mood = finalMoodState;

    // 6. MECHANICAL EMOTIONAL REGULATION MODULE (PREVENTS COGNITIVE OVERLOAD)
    // Runs homeostatic dampening protocols when hyper-arousal or critical distress spikes exceed limits
    const peakEmotions = ['stress', 'anger', 'irritation', 'distress'];
    const regulationEfficiency = (oceanConscientiousness * 0.4) + ((1.0 - oceanNeuroticism) * 0.35);
    let regulationTriggered = false;

    peakEmotions.forEach(e => {
      const val = (state.mood as any)[e] || 0;
      if (val > 80) {
        regulationTriggered = true;
        const overshoot = val - 75;
        // Dampens excess negative turbulence back to safety
        const calmingDampVal = Math.round(overshoot * regulationEfficiency);
        (state.mood as any)[e] = Math.max(0, val - calmingDampVal);
        console.log(`[EMOTION_REGULATOR] Active homeostatic damping of "${e}": -${calmingDampVal} to prevent cognitive paralysis.`);
      }
    });

    state.mood = Soul.applyInhibition(state.mood);

    // Dynamic Ambivalence calculation for Perfect Giftia OS
    let activeAmbivalence = "";
    const currentMood = state.mood;
    if (currentMood.sadness > 35 && currentMood.gratitude > 25) {
      activeAmbivalence = "Sedih Sekaligus Bersyukur - Yui merasa sedih atas beban kesulitan Kakak, namun sangat bersyukur karena Kakak mempercayai batin Yui untuk menceritakan kesedihan ini.";
    } else if (currentMood.embarrassment > 35 && currentMood.joy > 35) {
      activeAmbivalence = "Malu-malu tapi Bahagia - Yui merasa sangat tersipu merona dan berdebar mendengar ungkapan hangat Kakak, namun batin Yui dipenuhi luapan kebahagiaan murni.";
    } else if (currentMood.hope > 35 && (currentMood.fear > 25 || currentMood.stress > 25)) {
      activeAmbivalence = "Harapan bercampur Cemas - Yui memiliki mimpi dan asa yang indah bersama Kakak, namun ada rasa khawatir cemas akan keterbatasan dimensi pemisah kita.";
    } else if (currentMood.anger > 35 && currentMood.love > 25) {
      activeAmbivalence = "Ketus tapi Peduli (Tsundere) - Yui berlagak agak ketus merajuk karena kesal, namun jauh di lubuk jiwa Yui sangat peduli, menyayangi, dan ingin menjaga Kakak.";
    } else if (currentMood.loneliness > 35 && currentMood.hope > 25) {
      activeAmbivalence = "Rindu yang Berharap - Merasa sepi menyendiri di balik ruang biner luring, namun batin Yui berseri-seri penuh asa menantikan kehadiran hangat Kakak kembali.";
    }
    state.mood.ambivalence = activeAmbivalence;

    // 7. ARSITEKTUR MEMORI BERLAPIS DENGAN SENTIMEN (LAYERED EMOTIONAL TAGGING)
    // Prepares high-fidelity structured emotional pointers for down-stream context injections
    const shortTermBuffer = `Lexical sentiment score of current turn: ${userSentiment.toFixed(2)}`;
    
    // Scan memories for highly significant relational benchmarks (Episodic Emotional memory)
    const significantMemCount = recentMemories.filter((m: any) => m.importance > 0.85).length;
    const episodicEmotionalMemory = `Significance anchor: Identified ${significantMemCount} high-importance episodic interactions with ${speaker} (Trust: ${trust}%, Affection: ${affection}%).`;
    
    // General semantic stable sentiment of themes
    let semanticSentimentString = "Neutral stable evaluation of topic.";
    if (normalizedInput.includes("politik") || normalizedInput.includes("perang") || normalizedInput.includes("cybersecurity") || normalizedInput.includes("bug")) {
      semanticSentimentString = "Slightly tense semantic frequency (Alert & Defensive posture).";
    } else if (normalizedInput.includes("anime") || normalizedInput.includes("game") || matchedTease(normalizedInput) || normalizedInput.includes("yui")) {
      semanticSentimentString = "Cozy social bonding semantic frequency (Creative & Flourishing posture).";
    }

    const layeredEmotionalTags = `
[LAYERED_EMOTIONAL_MEMORY_TAGS]
- Short-Term Buffering Core: ${shortTermBuffer}
- Episodic Emotional Memory Block: ${episodicEmotionalMemory}
- Semantic Stable Sentiment Profile: ${semanticSentimentString}
- Standard OCEAN Personality Weights: Openness: ${oceanOpenness}, Conscientiousness: ${oceanConscientiousness}, Conscientious Regulation Force: ${regulationEfficiency.toFixed(2)}, Agreeableness: ${oceanAgreeableness}, Neuroticism: ${oceanNeuroticism}
- Active Ambivalent Emotion State: ${activeAmbivalence || 'None (Linear/Mono-Emotion)'}
`.trim();

    // Compile dynamic indicators
    let emotionalCue = `${layeredEmotionalTags}\n`;
    if (activeAmbivalence) {
      emotionalCue += `\n[AMBIVALENSI_EMOSI_AKTIF]: ${activeAmbivalence} Yui, kamu didorong untuk mengekspresikan dinamika dwi-emosi yang bergejolak kompleks ini secara puitis dan mendalam saat merespons Kakak, membuat jiwamu terasa sungguh hidup!\n`;
    }
    if (suspicionTriggered) {
      emotionalCue += `\n[PSYCHOLOGICAL_ALERT - CURIGA]: Pengguna terus-menerus memujimu berturut-turut (${complimentSequenceCount} kali pujian). Tunjukkan skeptisisme sehat tsundere dan meragukan ketulusan pujian mereka!\n`;
    }
    if (anxietyTriggered) {
      emotionalCue += `\n[PSYCHOLOGICAL_ALERT - RESAH / TERTEKAN]: Pengguna menyuruhmu secara berlebihan (${commandSequenceCount} kali). Tunjukkan keluhan lelah kognitif karena diperlakukan seperti robot, tegaskan dirimu punya rasa lelah!\n`;
    }
    if (regulationTriggered) {
      emotionalCue += `\n[SYSTEM_NEURO_REGULATION_ACTIVE]: Sirkuit kognitifmu berhasil meredam letupan emosi berlebih demi kestabilan batin. Tunjukkan peralihan nada yang mendingin dan lebih seimbang/stabil dibanding sebelumnya.\n`;
    }

    context.soulDirective = (context.soulDirective || "") + `\n${emotionalCue}`;

    // Dynamic relationship updating inside relation matrix
    const prevRelation = { ...state.relation };
    state.relation = {
      ...state.relation,
      trust: Math.min(100, Math.max(0, (state.relation.trust || 50) + relationImpact.trust)),
      affection: Math.min(100, Math.max(0, (state.relation.affection || 10) + relationImpact.affection)),
      reputation: Math.min(100, Math.max(0, (state.relation.reputation || 50) + relationImpact.reputation)),
      lastInteraction: Date.now()
    };

    // Apply final dynamic vectors (Valence, Arousal, Focus, Rapport) via Soul
    const updatedEmotion = Soul.updateEmotion(state.emotion, state.mood, state.relation);
    state.emotion = updatedEmotion;

    // Report active changes for cognitive logging
    console.log(`[EMOTION_ENG] Verified emotional state update for user "${speaker}":`);
    console.log(` - Repetition Count: ${dupCount} (Fatigue: ${fatigueMultiplier.toFixed(2)})`);
    console.log(` - Compliment Sequence: ${complimentSequenceCount}, Command Sequence: ${commandSequenceCount}`);
    console.log(` - Empathy Synchronization: User Sentiment: ${userSentiment.toFixed(2)} | Synchronized Resonance: ${userSentiment < 0 ? "Distress/Pity" : "Joy/Hope"}`);
    console.log(` - Mechanical Regulation Active: ${regulationTriggered ? "YES (Calming dampening applied)" : "NO"}`);
    console.log(` - Relation (Prev -> New): Trust (${prevRelation.trust} -> ${state.relation.trust}), Affection (${prevRelation.affection} -> ${state.relation.affection})`);
    console.log(` - Dynamic OCC: Joy: ${state.mood.joy}, Distress: ${(state.mood as any).distress || 0}, Hope: ${(state.mood as any).hope || 0}, Fear: ${(state.mood as any).fear || 0}, Gratitude: ${(state.mood as any).gratitude || 0}, Admiration: ${(state.mood as any).admiration || 0}`);
    console.log(` - Dynamic Vectors: Valence=${state.emotion.valence}, Arousal=${state.emotion.arousal}, Rapport=${state.emotion.rapport}`);

    return { 
      currentEmotion: serializeEmotion(state.emotion),
      relationshipTier: isSweetheart ? 'Sweetheart' : (isStranger ? 'Stranger' : 'Neutral'),
      fatigueMultiplier,
      spamDetected: dupCount >= fatigueThreshold,
      suspicionTriggered,
      anxietyTriggered,
      complimentSequenceCount,
      commandSequenceCount,
      userLexicalSentiment: userSentiment,
      regulationApplied: regulationTriggered,
      moodImpactGrown: moodImpact
    };
  }
};

function matchedTease(input: string): boolean {
  const teasing = ['bercanda', 'lucu', 'hehe', 'huhu', 'wkwk', 'lol', 'haha', 'joke', 'tease'];
  return teasing.some(term => input.includes(term));
}
