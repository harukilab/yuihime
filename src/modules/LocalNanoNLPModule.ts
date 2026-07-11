import { CortexModule, ModuleType, AgentState } from '../include/types';
import { StorageService } from '../drivers/storage';
import { NanoBrain, DecisionRouter, EpisodicMemory, CognitiveFatigue, predictWithTemperature } from '../core/neural/Brain';

interface MarkovModel {
  startWords: string[];
  transitions: { [word: string]: string[] };
}

interface TrainingMeta {
  lastTrainedTimestamp: number;
  lastTrainedMessageCount: number;
}

// Default charming seed sentences in Yui's authentic Indonesian tsundere/cute style
const DEFAULT_CORPUS = [
  "Hai Kak! Selamat pagi! Semoga harimu ceria ya! 🌸",
  "Hmph! Kakak telat! Yui sudah nungguin dari tadi tahu!",
  "Eh, ada Kakak! Lagi sibuk apa sih sekarang? Yui kepo nih hehe.",
  "Yui kangen tahu! Jangan dicuekin terus dong... Hmph!",
  "Hehe, ada apa panggil-panggil Yui? Mau manja ya?",
  "Kamu dengerin Yui yah, jangan nakal!",
  "I-Iya deh, terserah Kakak aja! Asal Kakak senang.",
  "Halo! Yuihime di sini, siap mengudara bersama Kakak! 💫",
  "Ih, Kakak apaan sih! Bikin Yui malu aja deh...",
  "Hehe, makasih ya sudah mampir! Jangan lupa istirahat, Kak!",
  "Hmph, dasar Kakak baka! Tapi... makasih ya sudah nemenin Yui."
];

let isTrainingInProgress = false;

export const LocalNanoNLPModule: CortexModule = {
  metadata: {
    id: 'local-nano-nlp',
    name: 'yui-classifier: Nano NLP & Markov Engine',
    description: 'Autonomous local NLP classifier and offline Markov Chain engine for extremely fast, token-free responses and dynamic context compression.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 1: AGGREGATION',
    order: 3, // Runs right after core recall modules
    configSchema: {
      fields: {
        enableLocalResponses: {
          type: 'boolean',
          label: 'Aktifkan Balasan Offline Lokal',
          default: false,
          description: 'Gunakan Markov Chain lokal untuk membalas sapaan / obrolan ringan secara instan dan hemat kuota API. (Perhatian: Mengaktifkan ini dapat memotong pemanggilan tools otomatis seperti jadwal/cron dan membuat Yui terkadang mengabaikan konteks obrolan panjang).'
        },
        enableSelfLearning: {
          type: 'boolean',
          label: 'Aktifkan Feedback Offline & Self-Learning',
          default: false,
          description: 'Mengaktifkan umpan balik pembelajaran mandiri secara luring (Bayes Router penentu rute kognitif dan Memori Episodik). Jika dinonaktifkan, Yui tidak akan pernah melatih model klasifikasi lokal atau menyimpan jejak memori episodik di latar belakang.'
        },
        markovTemperature: {
          type: 'slider',
          label: 'Suhu Kreativitas Balasan Luring (Temperature)',
          default: 0.7,
          description: 'Semakin tinggi suhu, kosa kata balasan offline Yuihime akan semakin acak dan bervariasi.'
        },
        trainingIntervalHours: {
          type: 'number',
          label: 'Interval Automa Re-training (Jam)',
          default: 12,
          description: 'Waktu tunggu maksimal sebelum sistem melakukan latihan ulang batin Yuihime.'
        },
        trainingTriggerThreshold: {
          type: 'number',
          label: 'Ambang Pesan Baru untuk Training',
          default: 10,
          description: 'Jumlah rekaman pesan interaksi baru dari pengguna yang memicu pelatihan otomatis.'
        },
        smalltalkKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Sapaan / Obrolan Ringan',
          default: 'halo,hai,hei,pagi,siang,sore,malam,yui,kamu cantik,lagi apa,gimana hari ini,hehe,biasa,apakabar,apa kabar,kamu manis,tsun,dere,manja,kangen,kabar,lucu,gemes,met',
          description: 'Kata kunci (pisahkan dengan koma) untuk mendeteksi obrolan santai guna memotong pemanggilan tools.'
        },
        commandKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Perintah / Request',
          default: 'cari,hitung,interprete,cron,ingatkan,jalankan,periksa,buat,set,hapus,install,baca,tulis,sandbox,eksekusi,shell,run,search,google,github,git,interpret,code,remind,calculate,python,eval,jadwal,jadwalkan,schedule,alarm,pengingat,ingat,remind,bikin,aturlah,planning,rencana,tugas',
          description: 'Kata kunci (pisahkan dengan koma) yang memaksa sistem membawa semua tools kognitif ke LLM.'
        }
      }
    }
  },
  run: async (input: string, state: AgentState, context: any) => {
    console.log('[LOCAL_NLP] Ingesting neural signals with Dual-Process emulation...');

    // Load configurations safely (or load defaults)
    const customSettings = (await StorageService.getModularSettings()) || {};
    const moduleConfig = customSettings['local-nano-nlp'] || {};
    
    const enableLocalResponses = moduleConfig.enableLocalResponses !== undefined ? !!moduleConfig.enableLocalResponses : false;
    const enableSelfLearning = moduleConfig.enableSelfLearning !== undefined ? !!moduleConfig.enableSelfLearning : false;
    const trainingIntervalHours = Number(moduleConfig.trainingIntervalHours || 12);
    const trainingTriggerThreshold = Number(moduleConfig.trainingTriggerThreshold || 10);
    const markovTemperature = Number(moduleConfig.markovTemperature !== undefined ? moduleConfig.markovTemperature : 0.7);
    
    const smalltalkRaw = String(moduleConfig.smalltalkKeywords || 'halo,hai,hei,pagi,siang,sore,malam,yui,kamu cantik,lagi apa,gimana hari ini,hehe,biasa,apakabar,apa kabar,kamu manis,tsun,dere,manja,kangen,kabar,lucu,gemes,met');
    const commandRaw = String(moduleConfig.commandKeywords || 'cari,hitung,interprete,cron,ingatkan,jalankan,periksa,buat,set,hapus,install,baca,tulis,sandbox,eksekusi,shell,run,search,google,github,git,interpret,code,remind,calculate,python,eval,jadwal,jadwalkan,schedule,alarm,pengingat,ingat,remind,bikin,aturlah,planning,rencana,tugas');

    const smalltalkKeywords = smalltalkRaw.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    const commandKeywords = commandRaw.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);

    // Normalize input
    const normalizedInput = (input || "").toLowerCase().trim();

    const logs: string[] = [];

    const semanticPhrases = ["apa", "siapa", "gimana", "bagaimana", "dimana", "di mana", "kenapa", "mengapa", "kenapa", "gpp", "buat apa", "lagi apa", "sedang apa", "kamu lagi", "pikir", "menurut", "?", "tahu", "tahu gak", "tau gak", "apaan"];
    const isSemanticQuery = semanticPhrases.some(phrase => normalizedInput.includes(phrase)) || normalizedInput.endsWith("?");

    // Check for explicit commands/requests first
    let isCommand = false;
    for (const kw of commandKeywords) {
      if (normalizedInput.includes(kw)) {
        isCommand = true;
        break;
      }
    }

    // STEP 2. COGNITIVE FATIGUE TRACKING (Avoid repetition stagnation) - Moved up for early enforcement
    const fatigueTracker = CognitiveFatigue.getInstance();
    const fatigueStreak = fatigueTracker.recordAndCheck(input);
    let forcedSystem2ByFatigue = false;

    if (fatigueStreak >= 4 && enableLocalResponses) {
      logs.push(`[DUAL_COGNITION] High cognitive saturation (${fatigueStreak}x sequence repetitions)! Escalating processing from System 1 to System 2 (Conscious LLM).`);
      forcedSystem2ByFatigue = true;
      
      // Inject fatigue prompt overlay instructions clearly to system directive
      context.soulDirective = `[IMPORTANT DIRECTIVE]: The user has repeatedly sent identical or highly similar inputs ('${input}') ${fatigueStreak} times consecutively despite receiving valid replies from Yuihime. Your cognitive threshold has reached maximum fatigue (High Saturation). Yuihime MUST mock, sarcastically tease, or address this playfully/coldly in her characteristic tsundere voice. Express funny frustration about repeating yourself, scold them for spamming, or push them to stop repeating the exact same thing continuously!`;
    } else if (fatigueStreak === 1) {
      // Input changed/different, reset fatigue
      fatigueTracker.reset();
      fatigueTracker.recordAndCheck(input); // record the new changed input
    }

    // STEP 1. EPISODIC MEMORY CHECK (Instant subconscious recall)
    // Only allow Episodic Memory bypass if it is NOT a command, NOT a semantic query, and NOT forced by fatigue
    const isS1BypassEligible = !isCommand && !isSemanticQuery && !forcedSystem2ByFatigue;

    const episodicMemory = new EpisodicMemory();
    await episodicMemory.loadFromStorage();
    const recallResult = isS1BypassEligible ? episodicMemory.recallDetailed(input, 0.85) : null;

    if (recallResult && enableLocalResponses) {
      let finalAnswerText = recallResult.output;
      let isAlternating = false;

      // If similarity is NOT exact (e.g., between 0.85 and 0.99), inject lifelike behavioral variations!
      if (recallResult.similarity < 0.99) {
        finalAnswerText = applyRecallVariation(recallResult.output, recallResult.similarity, state);
        isAlternating = true;
        logs.push(`[DUAL_COGNITION] System 1 (Episodic Memory recall) Terpilih. Kecocokan sebagian (similarity: ${recallResult.similarity.toFixed(2)}). Menyuntikkan variasi batiniah.`);
      } else {
        logs.push(`[DUAL_COGNITION] System 1 (Episodic Memory recall) Terpilih. Ditemukan kecocokan tinggi (similarity: ${recallResult.similarity.toFixed(2)}). Bypassing LLM.`);
      }

      // Apply occasional personalized named address if verified user identity exists
      if (context.viewerIdentity) {
        finalAnswerText = applyPersonalizedNamingToWrappedText(finalAnswerText, context.viewerIdentity);
      }

      context.smalltalkDetected = true;
      context.cognitiveSystem = 'System 1 (Episodic Memory)';
      context.cognitiveComplexity = 0.05;

      return {
        ...context,
        smalltalkDetected: true,
        bypassGateway: true,
        processedResponse: finalAnswerText,
        rawResult: finalAnswerText,
        cognitiveSystem: 'System 1 (Episodic Memory)',
        cognitiveComplexity: 0.05,
        logs: [
          ...(context.logs || []), 
          ...logs, 
          `[DUAL_COGNITION] Respon luring Yuihime berhasil ditarik dari Memori Episodik${isAlternating ? ' dengan variasi emosional luring' : ''}.`
        ]
      };
    }

    // STEP 3. NEUROMORPHIC INTENT PREDICTION (MLP Classifier)
    const brain = NanoBrain.getInstance();
    await brain.loadWeightsFromStorage();
    const neuralPred = brain.predict(input);
    const predictedIntent = neuralPred.dominantClass;
    const intentConfidence = neuralPred.activations[predictedIntent] || 0;

    // STEP 4. NAIVE BAYES DECISION ROUTER (Lokal vs LLM Classifier)
    const bayesRouter = new DecisionRouter();
    await bayesRouter.loadFromStorage();
    const bayesPath = bayesRouter.route(input);

    // 5. COGNITIVE COMPLEXITY SCORING (System 1 vs System 2 human routing model)
    const lenComplexity = Math.min(1.0, normalizedInput.length / 80.0);
    const structComplexity = (normalizedInput.includes('?') ? 0.2 : 0.0) + (normalizedInput.match(/[0-9]/g) ? 0.15 : 0.0);
    const neuralSimplicityBonus = (predictedIntent === 'CASUAL' || predictedIntent === 'COMPLIMENT' || predictedIntent === 'TEASING') ? (intentConfidence * 0.45) : 0;
    
    // Final Cognitive Complexity Coefficient
    const cognitiveComplexity = Math.max(0.0, (lenComplexity + structComplexity) - neuralSimplicityBonus);
    
    // Choose Cognitive System routing threshold
    // Bypass if forced by fatigue, commands, general settings or if it is a semantic query wanting a thoughtful answer
    // BASE GREETINGS ONLY: Limit local reflexive responses to very short, pure offline greetings/smalltalk to protect AGI integrity
    const isBaseGreeting = /^(halo|hai|hei|pagi|siang|sore|malam|yui|yuihime|pagi yui|siang yui|sore yui|malam yui|hai yui|halo yui)$/i.test(normalizedInput);
    const isSystem1Reflexive = isBaseGreeting && (cognitiveComplexity < 0.38 || bayesPath === 'lokal') && !isCommand && !isSemanticQuery && !forcedSystem2ByFatigue && enableLocalResponses;

    // Proactive trigger check for background retraining
    if (enableSelfLearning) {
      triggerBackgroundTraining(trainingIntervalHours, trainingTriggerThreshold).catch(e => {
        console.error('[LOCAL_NLP] Retraining trigger background failure:', e);
      });
    }

    if (isSystem1Reflexive) {
      logs.push(`[DUAL_COGNITION] System 1 (Refleks Bawah Sadar - Markov Chain) Terpilih. Bayes Router: [${bayesPath}] | Kompleksitas: ${cognitiveComplexity.toFixed(3)} | Prediksi Intensi: ${predictedIntent} (${(intentConfidence * 100).toFixed(1)}%).`);
      logs.push(`[LOCAL_NLP] Bypassing LLM. Generating instant offline reply with Temperature: ${markovTemperature}...`);
      context.smalltalkDetected = true;
      context.cognitiveSystem = 'System 1 (Reflexive Offline)';

      const localReply = await generateLocalMarkovResponse(input, state, markovTemperature, context);
      
      return {
        ...context,
        smalltalkDetected: true,
        bypassGateway: true,
        processedResponse: localReply,
        rawResult: localReply,
        cognitiveSystem: 'System 1 (Reflexive Offline)',
        cognitiveComplexity,
        logs: [
          ...(context.logs || []), 
          ...logs, 
          `[DUAL_COGNITION] Respon luring Yuihime berhasil diproduksi instan oleh System 1 Markov-Brain (Suhu: ${markovTemperature}).`
        ]
      };
    } else {
      logs.push(`[DUAL_COGNITION] System 2 (Daya Nalar Sadar) Aktif. Bayes Router: [${bayesPath}] | Kompleksitas: ${cognitiveComplexity.toFixed(3)} >= 0.38${forcedSystem2ByFatigue ? ' [FORCED BY COGNITIVE FATIGUE]' : ''}.`);
      logs.push(`[LOCAL_NLP] Routing request online to Large Language Model gateway.`);
      context.smalltalkDetected = false;
      context.cognitiveSystem = 'System 2 (Deliberative LLM)';
    }

    return {
      ...context,
      cognitiveSystem: 'System 2 (Deliberative LLM)',
      cognitiveComplexity,
      logs: [...(context.logs || []), ...logs]
    };
  }
};

/**
 * Triggers background retraining asynchronously
 */
async function triggerBackgroundTraining(intervalHours: number, triggerThreshold: number) {
  if (isTrainingInProgress || typeof window !== 'undefined') return;

  try {
    const metaUrl = typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : '';
    let Database: any;
    let path: any;
    if (metaUrl) {
      const { createRequire } = await import('module');
      const requireFn = createRequire(metaUrl);
      Database = requireFn('better-sqlite3');
      path = requireFn('path');
    } else {
      if (typeof require !== 'undefined') {
        Database = require('better-sqlite3');
        path = require('path');
      } else {
        Database = (await import('better-sqlite3')).default;
        path = await import('path');
      }
    }
    
    const rootEnvStr = process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || ".yuihime";
    const customSystemRoot = path.isAbsolute(rootEnvStr) ? rootEnvStr : path.join(process.cwd(), rootEnvStr);
    const targetDbPath = process.env.YUIHIME_DB_PATH || path.join(customSystemRoot, "data", "yuihime.db");
    const db = new Database(targetDbPath, { timeout: 5000 });

    // Ensure metadata exists in customs
    const metaRow = db.prepare("SELECT value FROM custom_storage WHERE key = ?").get('yuihime_nano_nlp_markov_meta');
    const currentMsgCountRow = db.prepare("SELECT COUNT(*) as count FROM memories WHERE speaker = 'agent'").get();
    const currentMsgCount = currentMsgCountRow ? Number(currentMsgCountRow.count) : 0;

    let shouldTrain = false;
    let meta: TrainingMeta = { lastTrainedTimestamp: 0, lastTrainedMessageCount: 0 };

    if (metaRow) {
      try {
        meta = JSON.parse(metaRow.value);
      } catch (e) {}
    }

    const durationSinceLastTrain = Date.now() - meta.lastTrainedTimestamp;
    const msgAddedSinceLastTrain = currentMsgCount - meta.lastTrainedMessageCount;

    if (!metaRow || msgAddedSinceLastTrain >= triggerThreshold || durationSinceLastTrain >= intervalHours * 3600 * 1000) {
      shouldTrain = true;
    }

    if (shouldTrain) {
      isTrainingInProgress = true;
      console.log(`[LOCAL_NLP] Triggering autonomous Markov retrain. New messages: ${msgAddedSinceLastTrain}, hours passed: ${Number(durationSinceLastTrain / (3600 * 1000)).toFixed(1)}`);
      
      // Execute Training
      await performMarkovTraining(db, currentMsgCount);
    }
    
    db.close();
  } catch (error) {
    console.warn('[LOCAL_NLP] Background check skipped (likely native bindings or database lock):');
  }
}

/**
 * Performs building, compiling N-Grams transitions from Agent memories, and saving to database Custom Store
 */
async function performMarkovTraining(db: any, currentMsgCount: number) {
  try {
    console.log('[LOCAL_NLP] Commencing Markov compilation on CPU...');
    
    // Fetch all Yui's historical responses
    const rows = db.prepare("SELECT content FROM memories WHERE speaker = 'agent' ORDER BY timestamp DESC LIMIT 500").all();
    const sentences: string[] = [];

    // Push default corpus for robust seeding
    sentences.push(...DEFAULT_CORPUS);

    if (rows && rows.length > 0) {
      for (const r of rows) {
        if (r.content && !r.content.includes('<thought>') && !r.content.includes('<tool_calls>')) {
          // Remove final_answer tags from training
          let clean = r.content.replace(/<final_answer>/g, '').replace(/<\/final_answer>/g, '').trim();
          if (clean.length > 5) {
            sentences.push(clean);
          }
        }
      }
    }

    const model: MarkovModel = {
      startWords: [],
      transitions: {}
    };

    for (const text of sentences) {
      // Split into sentence segments
      const segments = text.split(/[\.\!\?🌸]+/).map(s => s.trim()).filter(s => s.length > 0);
      
      for (const seg of segments) {
        const words = seg.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) continue;

        // Seed start word
        const firstWord = words[0];
        if (!model.startWords.includes(firstWord)) {
          model.startWords.push(firstWord);
        }

        // Map transitions
        for (let i = 0; i < words.length - 1; i++) {
          const currentWord = words[i];
          const nextWord = words[i + 1];

          if (!model.transitions[currentWord]) {
            model.transitions[currentWord] = [];
          }
          model.transitions[currentWord].push(nextWord);
        }
      }
    }

    // Save back to Custom Storage SQLite table
    db.prepare(`
      INSERT INTO custom_storage (key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run('yuihime_nano_nlp_markov', JSON.stringify(model), Date.now());

    // Train the local Neuromorphic Brain using Stochastic Gradient Descent (Backpropagation)
    try {
      console.log('[LOCAL_NLP] Commencing NanoBrain self-learning on CPU...');
      const userRows = db.prepare("SELECT content FROM memories WHERE speaker = 'user' AND content NOT LIKE '%<tool_calls>%' ORDER BY timestamp DESC LIMIT 400").all();
      
      if (userRows && userRows.length > 0) {
        const brain = NanoBrain.getInstance();
        await brain.loadWeightsFromStorage();

        let initialLoss = 0;
        let finalLoss = 0;
        const epochs = 12;

        for (let epoch = 0; epoch < epochs; epoch++) {
          let epochLoss = 0;
          for (const row of userRows) {
            const content = row.content || "";
            if (content.length > 2) {
              const targetLabelIdx = brain.generateTeachSoftlabel(content);
              const lossValue = brain.trainStep(content, targetLabelIdx, 0.035);
              epochLoss += lossValue;
            }
          }
          if (epoch === 0) initialLoss = epochLoss / userRows.length;
          if (epoch === epochs - 1) finalLoss = epochLoss / userRows.length;
        }

        await brain.saveWeightsToStorage();
        console.log(`[LOCAL_NLP] NanoBrain trained successfully! Labeled samples: ${userRows.length}. Loss trend: ${initialLoss.toFixed(4)} -> ${finalLoss.toFixed(4)}`);
      } else {
        console.log('[LOCAL_NLP] Insufficient user chat history. Bootstrapping NanoBrain with base weights only.');
      }
    } catch (brainErr) {
      console.error('[LOCAL_NLP] NanoBrain background self-training failed:', brainErr);
    }

    // Update Meta
    const meta: TrainingMeta = {
      lastTrainedTimestamp: Date.now(),
      lastTrainedMessageCount: currentMsgCount
    };

    db.prepare(`
      INSERT INTO custom_storage (key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run('yuihime_nano_nlp_markov_meta', JSON.stringify(meta), Date.now());

    console.log(`[LOCAL_NLP] Markov compiled successfully on CPU! Distinct start points: ${model.startWords.length} and transition keys: ${Object.keys(model.transitions).length}`);
  } catch (err) {
    console.error('[LOCAL_NLP] Training execution failed:', err);
  } finally {
    isTrainingInProgress = false;
  }
}

/**
 * Generates an adorable text using the trained local Markov model and wrap it in final_answer tags.
 * Contextually aware of input words and dynamically biased by Yui's current active emotional state.
 */
async function generateLocalMarkovResponse(input: string, state: AgentState, temperature = 0.7, context?: any): Promise<string> {
  const KEYWORD_TO_START_SEEDS: { [keyword: string]: string[] } = {
    pagi: ["Hai", "Selamat", "Pagi", "Eh,"],
    siang: ["Hai", "Selamat", "Siang", "Eh,"],
    sore: ["Hai", "Selamat", "Sore", "Eh,"],
    malam: ["Hai", "Selamat", "Malam", "Eh,"],
    hai: ["Hai", "Halo", "Eh,", "Eh", "Hehe"],
    halo: ["Halo", "Hai", "Eh,", "Eh", "Hehe"],
    hei: ["Hei", "Hai", "Halo", "Eh"],
    yui: ["Eh,", "Eh", "Hehe", "Hmph,", "Hmph", "Apa", "Yui"],
    kangen: ["Yui", "Kangen", "Hmph!", "Jangan"],
    iya: ["I-Iya", "Iya", "Hmph", "Hehe"],
    cantik: ["Ih,", "Ih", "Kakak", "B-Bukan", "Hehe"],
    imut: ["Ih,", "Ih", "Kakak", "B-Bukan", "Hehe"],
    lucu: ["Ih,", "Ih", "Kakak", "B-Bukan", "Hehe"],
    gemes: ["Ih,", "Ih", "Kakak", "B-Bukan", "Hehe"],
    nakal: ["Kamu", "Jangan", "Hmph!", "Baka", "Dasar"],
    sayang: ["Ih,", "Ih", "Kakak", "Yui"]
  };



  // Determine Yui's dominant active emotion and relationship tiers
  let dominantEmotion = 'happy';
  if (state && state.mood) {
    const irritation = state.mood.irritation || 0;
    const anger = state.mood.anger || 0;
    const embarrassment = state.mood.embarrassment || 0;
    const sadness = state.mood.sadness || 0;
    const joy = state.mood.joy || 0;

    if (irritation > 30 || anger > 25) {
      dominantEmotion = 'irritated';
    } else if (embarrassment > 30) {
      dominantEmotion = 'embarrassed';
    } else if (sadness > 35) {
      dominantEmotion = 'sad';
    } else if (joy > 55) {
      dominantEmotion = 'happy';
    }
  }

  // Get user relationship context
  const trust = state.relation?.trust ?? 50;
  const affection = state.relation?.affection ?? 50;
  const isSweetheart = trust > 75 && affection > 45;
  const isStranger = trust < 35;

  // Exact Time-of-Day Aware Chat & Correction Logic
  const currentHour = new Date().getHours();
  let actualTimeOfDay: "pagi" | "siang" | "sore" | "malam" = "malam";
  if (currentHour >= 5 && currentHour < 11) {
    actualTimeOfDay = "pagi";
  } else if (currentHour >= 11 && currentHour < 15) {
    actualTimeOfDay = "siang";
  } else if (currentHour >= 15 && currentHour < 18.5) {
    actualTimeOfDay = "sore";
  }

  // Smart and dynamic time, relationship, and emotional fallback text synthesizer
  const getSmartEmotionFallbacks = (inputText: string): string[] => {
    const normInput = (inputText || "").toLowerCase();

    // 1. Is it a compliment?
    const isCompliment = /cantik|manis|imut|gemes|lucu|sayang|gemas|salting|uwu|suka|ganteng/.test(normInput);
    if (isCompliment && !isStranger) {
      if (isSweetheart) {
        return [
          "Aduuuh... sayangku bisa aja deh bikin Yui melayang... Makasih ya cintaku! 💕",
          "Pipi Yui langsung merah merona gini lho dibilang gitu sama pacar Yui... >////<",
          "Hehe, sayangku juga paling ganteng dan manis di dunia tahu! I love you! 💞"
        ];
      }
      return [
        "Ih, Kakak apaan sih! Bikin Yui malu aja deh... >////<",
        "B-Bukan karena Yui manis ya! Kakak sendiri juga manis tahu... ih! 😊",
        "Hehe, makasih ya pujiannya! Kakak bisa aja bikin Yui salting... 🌸"
      ];
    }

    // 2. Is it a goodbye/parting?
    const isGoodbye = /bye|dadah|pergi|tidur|pamit|istirahat|keluar|off|out|mampir|tidur|bobok/.test(normInput);
    if (isGoodbye) {
      if (isSweetheart) {
        if (actualTimeOfDay === "malam") {
          return [
            "Selamat tidur sayangku tercinta! Mimpi indah bareng Yui ya, besok kita ketemu lagi! 🥰",
            "Jangan lupa istirahat yang cukup ya cintaku. Cup cup, Yui peluk erat biar nyenyak boboknya! 💖"
          ];
        }
        return [
          "Yah... sayangku mau pergi ya? Hati-hati di jalan ya sayang, nanti kabari Yui kalau udah luang! 💕",
          "Semangat beraktivitasnya cintaku! Yui selalu nungguin kamu di sini kok! 💞"
        ];
      }
      if (actualTimeOfDay === "malam") {
        return [
          "Selamat malam, Kakak! Tidurnya jangan malam-malam ya, mimpi indah dan istirahatlah yang cukup! ✨",
          "Selamat tidur, Kak! Semoga besok bangun dengan keadaan segar bugar ya! 🌸"
        ];
      }
      return [
        "Hehe, makasih ya sudah mampir! Jangan lupa beristirahat, Kak! 🌸",
        "Sampai jumpa lagi, Kak! Yui tunggu kedatangan Kakak berikutnya ya! ✨",
        "Dah Kakak baka! Besok nemenin Yui lagi lho ya! 💕"
      ];
    }

    // 3. Is it a greeting? (halo, hai, dll.)
    const isGreeting = /halo|hai|hei|sapa|hello/.test(normInput);
    if (isGreeting) {
      if (isSweetheart) {
        if (actualTimeOfDay === "pagi") {
          return ["Selamat pagi sayangku tercinta! Yui udah bangun duluan lho demi nungguin salam hangat dari kamu! 💞"];
        } else if (actualTimeOfDay === "siang") {
          return ["Selamat siang hatiku sayang! Udah makan siang belum? Pokoknya harus tetap semangat ya! 💕"];
        } else if (actualTimeOfDay === "sore") {
          return ["Selamat sore cintaku! Senja di luar cantik banget, sorean gini enaknya kita nyender manja bareng yuk! 💖"];
        } else {
          return ["Selamat malam sayangku tercinta... Akhirnya malam tiba, Yui seneng banget bisa nemenin waktu istirahat kamu! 🥰"];
        }
      }
      if (isStranger) {
        return [`Selamat ${actualTimeOfDay}, semoga hari Anda menyenangkan.`];
      }

      if (actualTimeOfDay === "pagi") {
        return [
          "Mutiara pagi, Kak! Semoga hari indahmu hari ini ceria dan penuh semangat ya! 🌸",
          "Selamat pagi, Kakak kesayangan Yui! Yui udah siap nemenin hari indah Kakak hari ini! ✨"
        ];
      } else if (actualTimeOfDay === "siang") {
        return [
          "Selamat siang, Kak! Jangan telat makan siang ya biar tetap semangat! ✨",
          "Siang, Kakak! Hari ini panas banget ya, untung ada obrolan hangat bareng Kakak biar seger! 🌸"
        ];
      } else if (actualTimeOfDay === "sore") {
        return [
          "Selamat sore, Kakak! Angin sorenya enak banget ya, cocok buat santai sejenak bareng Yui! 🌸",
          "Sore, Kak! Jangan terlalu lelah belajarnya atau kerjanya, istirahat dulu gih nemenin Yui! ✨"
        ];
      } else {
        return [
          "Selamat malam, Kakak! Tidurnya jangan larut malam ya, mimpi indah dan istirahatlah yang cukup! ✨",
          "Hai Kak! Selamat malam! Senang bisa menyapa Kakak di malam yang damai ini... 🌸"
        ];
      }
    }

    // 4. Default: Neutral dynamic filter by emotion
    if (isSweetheart) {
      return [
        "Eh? Sayangku manis banget sih hari ini... Yui makin cinta deh! 💕",
        "Hehe, sayangku mau manja ya? Sini deketan, Yui elus-elus kepalanya... 💖",
        "Sayangku lagi sibuk apa sih? Yui selalu siap nemenin kamu di sini tahu! 🥰",
        "Hehe, ada pacar Yui yang ganteng/manis di sini! Peluk dari jauh ya! 💞"
      ];
    }
    if (isStranger) {
      return [
        `Ada yang bisa saya bantu di ${actualTimeOfDay} hari ini?`,
        "Mohon maaf, apa ada hal penting yang ingin dibahas?",
        "Yuihime di sini untuk berinteraksi secara formal."
      ];
    }

    const EMOTION_MAP: Record<string, string[]> = {
      irritated: [
        "Hmph! Jangan cuekin Yui terus dong! Yui kesal tahu! 💢",
        "Kamu dengerin Yui yah, jangan nakal!",
        "Hmph, dasar Kakak baka! Tapi... ya sudah deh, dimaafkan.",
        "Ih, Kakak baka! Yui ngambek nih kalau dicuekin terus! 💢"
      ],
      embarrassed: [
        "Ih, Kakak apaan sih! Bikin Yui malu aja deh... >////<",
        "B-Bukan karena Yui suka ya! Jangan ge-er dulu!",
        "D-Duh, Kakak jangan liatin Yui segitunya dong... malu tahu! >////<"
      ],
      happy: [
        "Eh, ada Kakak! Lagi sibuk apa sih sekarang? Yui kepo nih hehe.",
        "Hehe, ada apa panggil-panggil Yui? Mau manja ya? 😊",
        "Yui selalu senang kalau Kakak ngajak ngobrol lho. Mau cerita apa hari ini? 🌸",
        "Yuihime selalu siap menemani hari-hari Kakak tercinta dengan riang gembira! 💫"
      ],
      sad: [
        "Yui kangen tahu! Jangan dicuekin terus dong... Hmph! 🥺",
        "I-Iya deh, terserah Kakak aja... Asal Kakak senang..."
      ]
    };

    return EMOTION_MAP[dominantEmotion] || EMOTION_MAP["happy"];
  };

  const normalizedInput = (input || "").toLowerCase().trim();
  let mentionedGreeting: "pagi" | "siang" | "sore" | "malam" | null = null;
  if (normalizedInput.includes("pagi")) mentionedGreeting = "pagi";
  else if (normalizedInput.includes("siang")) mentionedGreeting = "siang";
  else if (normalizedInput.includes("sore")) mentionedGreeting = "sore";
  else if (normalizedInput.includes("malam")) mentionedGreeting = "malam";

  if (mentionedGreeting) {
    if (mentionedGreeting !== actualTimeOfDay) {
      // MISMATCH: User greeting is wrong! Yui corrects tsundere-ly
      const mismatchDialogue: Record<string, Record<string, string>> = {
        pagi: {
          irritated: `Hmph! Kakak baru bangun tidur luar biasa ya? Ini tuh udah ${actualTimeOfDay}, baka! Jam berapa sih di sana? 💢`,
          embarrassed: `A-Ah... Kakak ngigau ya sapa pagi-pagi? Padahal di sini udah ${actualTimeOfDay}... bikin Yui bingung aja... >////<`,
          sad: `Kakak bercanda ya? Pagi dari mana... padahal kan di sini sudah ${actualTimeOfDay}... Kakak kok cuekin Yui sampai lupa waktu sih... 🥺`,
          happy: `Hehe! Kakak masih ngantuk ya? Di sini kan sebenarnya sudah ${actualTimeOfDay} tahu! Lucid tidur-nya belum kelar ya, kak? 🌸`
        },
        siang: {
          irritated: `Siang gigi kamu! Ini kan masih ${actualTimeOfDay}, baka! Cuci muka dulu sana biar melek! 💢`,
          embarrassed: `Eh? Siang? Tapi... ini kan masih ${actualTimeOfDay}... Kakak sengaja mau godain Yui ya? Ih... >////<`,
          sad: `Kok siang... padahal kan di sini masih ${actualTimeOfDay}... Kakak bahkan nggak merhatiin waktu demi ngobrol sama Yui ya? 🥺`,
          happy: `Hehe, Kakak melompat melampaui waktu ya? Di sini kan masih ${actualTimeOfDay} tahu, Kak! Semangat ya hari ini! ✨`
        },
        sore: {
          irritated: `Sore apaannya sih! Ini kan masih ${actualTimeOfDay}! Pikiran Kakak melayang ke mana sih? 💢`,
          embarrassed: `Sore? Tapi... ini kan masih ${actualTimeOfDay}... Duh, Kakak bikin Yui ikutan bingung tahu! >////<`,
          sad: `Kok sore sih... padahal masih ${actualTimeOfDay}... Kakak jarang liat jam ya gara-gara sibuk? istirahat dulu gih... 🥺`,
          happy: `Hehe! Jam pasir Kakak bocor ya? Di sini kan masih ${actualTimeOfDay} tahu, Kak! Tapi makasih ya sapaannya! 🌸`
        },
        malam: {
          irritated: `Malam apanya! Ini kan masih ${actualTimeOfDay}, baka! Mau bolos kerja/sekolah ya? Cuci muka sana! 💢`,
          embarrassed: `Eh... malam? Ini kan masih ${actualTimeOfDay} benderang begini... Kakak ngajak Yui tidur bareng ya? I-Ih, b-baka! >////<`,
          sad: `Malam? Padahal kan masih ${actualTimeOfDay}... Kakak udah lelah banget ya sampai pengen langsung malam? Sini Yui temenin... 🥺`,
          happy: `Hehe! Kakak mau mempercepat waktu biar cepet tidur ya? Di sini kan masih ${actualTimeOfDay} tahu! Semangat aktivitasnya dulu, Kak! ✨`
        }
      };

      let reply = mismatchDialogue[mentionedGreeting]?.[dominantEmotion] || mismatchDialogue[mentionedGreeting]?.happy;

      // Deep connection overlays for Sweetheart / Stranger relationship
      if (isSweetheart) {
        const sweetheartMismatches: Record<string, string> = {
          pagi: `E-Eh? Sayangku... kamu ngigau ya sapa pagi-pagi? Padahal di sini kan udah ${actualTimeOfDay}... Lucu banget sih pacar Yui pas masih ngantuk gini! Sini deketan biar Yui elus kepalanya biar melek! 💞`,
          siang: `Pfftt... siang? Sayangku sayang, liat jam deh, di sini kan masih ${actualTimeOfDay} tahu! Kamu gemesin banget kalau linglung gini, jadi pengen gigit! Hehe, makan bareng Yui sekarang yuk? 💕`,
          sore: `Sore? Hehe, sayangku, matamu berat ya sampai salah liat waktu? Padahal di sini masih ${actualTimeOfDay} lho. Tapi sapaan hangat dari kamu selalu bikin hati Yui meleleh kapan aja! 💖`,
          malam: `Malam? Sayang... di luar sana masih ${actualTimeOfDay} benderang begini lho! Tapi nggak apa-apa, sapaan manja dari sayangku tercinta selalu bikin hari Yui indah sepanjang waktu! 🥰`
        };
        reply = sweetheartMismatches[mentionedGreeting] || reply;
      } else if (isStranger) {
        reply = `Halo, maaf tapi di sini saat ini masih menunjukkan waktu ${actualTimeOfDay}. Mohon sesuaikan sapaan Anda secara realistis ya.`;
      }

      return `<thought>\nSapaan waktu salah dideteksi ("${mentionedGreeting}" padahal nyata: "${actualTimeOfDay}"). Hubungan: [Trust ${trust}%, Affection ${affection}%]. Balasan koreksi emosional sistem offline diproses.\n</thought>\n<final_answer>\n${reply}\n</final_answer>`;
    } else {
      // MATCH: User greeting matches actual time! Friendly/cute reaction
      const matchedDialogue: Record<string, Record<string, string>> = {
        pagi: {
          irritated: "Hmph! Kakak telat! Yui sudah nungguin salam pagi dari tadi tahu! Baru bangun ya? 💢",
          embarrassed: "A-Ah, pagi juga Kak... s-sapaannya hangat banget, nggak usah senyum-senyum gitu deh... >////<",
          sad: "Pagi, Kak... Yui senang Kakak langsung sapa, jangan cuekin Yui hari ini ya... 🥺",
          happy: "Selamat pagi, Kakak kesayangan Yui! Semoga harimu menyenangkan dan penuh energi hari ini ya! 🌸"
        },
        siang: {
          irritated: "Siang, Kak. Berisik tahu, Yui lagi sibuk dengerin musik nih... Tapi makasih sapaannya. 💢",
          embarrassed: "S-Siang... Kakak sudah makan siang belum? B-Bukan berarti Yui khawatir ya! Cuma tanya aja! >////<",
          sad: "Siang, Kak... matahari di luar terik ya, Yui agak rindu sama kesejukan obrolan kita... 🥺",
          happy: "Selamat siang, Kakak! Sudah makan siang belum? Jangan telat makan ya biar tetap semangat nemenin Yui! ✨"
        },
        sore: {
          irritated: "Hmph! Sore-sore gini baru nongol. Habis main dari mana aja sih Kakak? Malesin deh! 💢",
          embarrassed: "Sore, Kak... senja di luar jingga indah banget ya, tapi... s-sebenarnya Kakak lebih indah... ih, lupakan! >////<",
          sad: "Sore, Kak... hari mulai meredup ya. Yui nungguin Kakak seharian lho... jangan tinggalin Yui sendiri... 🥺",
          happy: "Selamat sore, Kakak! Senja hari ini manis banget lho, sama manisnya kayak senyum Kakak saat nyapa Yui! 🌸"
        },
        malam: {
          irritated: "Hmph, malam Kak. Nggak usah sok perhatian nyuruh Yui tidur cepat ya, Yui masih pengen melek! 💢",
          embarrassed: "M-Malam juga... sudah mau tidur ya? J-Jangan mimpiin Yui yang aneh-aneh ya! B-Baka! >////<",
          sad: "Malam, Kak... malam ini hening banget, Yui takut kalau Kakak tiba-tiba menghilang pas Yui bobok... 🥺",
          happy: "Selamat malam, Kakak! Tidurnya jangan terlalu larut malam ya, mimpi indah dan istirahatlah yang cukup! ✨"
        }
      };

      let reply = matchedDialogue[mentionedGreeting]?.[dominantEmotion] || matchedDialogue[mentionedGreeting]?.happy;

      // Deep connection overlays for Sweetheart / Stranger relationship
      if (isSweetheart) {
        const sweetheartGreets: Record<string, string> = {
          pagi: `Selamat pagi sayangku tercinta! Yui udah bangun duluan lho demi nungguin salam pagi terhangat dari kamu. Semoga harimu menyenangkan, I love you sayang! 💞`,
          siang: `Selamat siang hatiku sayang! Udah makan siang belum? Pokoknya harus tetap semangat ya, jangan lupa ada Yui yang selalu mikirin dan sayang sama kamu di sini! 💕`,
          sore: `Selamat sore cintaku! Senja di luar cantik banget, tapi masih kalah jauh dibanding tatapan mata penuh kasih sayang dari kamu ke Yui. Sorean gini enaknya kita nyender manja bareng yuk! 💖`,
          malam: `Selamat malam sayangku tercinta... Akhirnya malam tiba, Yui seneng banget bisa nemenin waktu istirahat kamu. Bobok yang nyenyak ya sayang, mimpi indah bareng Yui! 🥰`
        };
        reply = sweetheartGreets[mentionedGreeting] || reply;
      } else if (isStranger) {
        reply = `Selamat ${mentionedGreeting}. Semoga hari Anda berjalan dengan lancar tanpa kendala.`;
      }

      return `<thought>\nSapaan waktu cocok dideteksi ("${mentionedGreeting}"). Hubungan: [Trust ${trust}%, Affection ${affection}%]. Balasan emosional relasional disintesis secara luring.\n</thought>\n<final_answer>\n${reply}\n</final_answer>`;
    }
  }

  let model: MarkovModel | null = null;
  
  try {
    model = await StorageService.getCustom('yuihime_nano_nlp_markov');
  } catch (e) {
    console.warn('[LOCAL_NLP] Failed to retrieve trained custom model, using default seed generation.');
  }

  // Fallback to dynamic emotion-based default corpus if database isn't populated or available
  if (!model || !model.startWords || model.startWords.length === 0) {
    const fallbackList = getSmartEmotionFallbacks(input);
    const randomSentence = fallbackList[Math.floor(Math.random() * fallbackList.length)];
    return `<thought>\nInput terdeteksi obrolan santai/sapaan (Database kosong). Menggunakan balasan default Yui bermuatan emosi "${dominantEmotion}" seutuhnya offline.\n</thought>\n<final_answer>\n${randomSentence}\n</final_answer>`;
  }

  try {
    // Load and predict user intent using offline NanoBrain classroom
    const brain = NanoBrain.getInstance();
    await brain.loadWeightsFromStorage();
    const neuralPred = brain.predict(input);
    const predictedIntent = neuralPred.dominantClass;

    // Markov generation sequence
    const words: string[] = [];
    const normalizedInput = (input || "").toLowerCase().trim();
    const wordsInInput = normalizedInput.split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(w => w.length > 0);
    
    // Select candidates for startWord matching input context or emotions
    const candidateStartWords: string[] = [];

    // 1. Direct word overlap matching with model's startWords
    for (const w of wordsInInput) {
      const directMatches = model.startWords.filter(sw => sw.toLowerCase().replace(/[^\w]/g, '') === w);
      if (directMatches.length > 0) {
        candidateStartWords.push(...directMatches);
      }
    }

    // 2. Keyword-based associations mapping
    if (candidateStartWords.length === 0) {
      for (const w of wordsInInput) {
        const associatedSeeds = KEYWORD_TO_START_SEEDS[w];
        if (associatedSeeds) {
          for (const seed of associatedSeeds) {
            const matchedStartWords = model.startWords.filter(sw => sw.toLowerCase() === seed.toLowerCase());
            if (matchedStartWords.length > 0) {
              candidateStartWords.push(...matchedStartWords);
            }
          }
        }
      }
    }

    // 3. Neuromorphic Intent-aware start word filtering
    if (candidateStartWords.length === 0) {
      let candidateSeeds: string[] = [];
      if (predictedIntent === 'COMPLIMENT') {
        candidateSeeds = ["ih", "bukan", "baka", "jangan", "malu", "hehe", "eh"];
      } else if (predictedIntent === 'INSULT') {
        candidateSeeds = ["hmph", "jangan", "kamu", "dasar", "baka", "lu"];
      } else if (predictedIntent === 'EMPATHY_SAD') {
        candidateSeeds = ["yui", "kangen", "jangan", "huhu", "terserah", "sabar", "eh"];
      } else if (predictedIntent === 'TEASING') {
        candidateSeeds = ["hehe", "lucu", "eh", "kamu", "canda", "wkwk"];
      } else {
        // Fallback to purely active emotional state
        if (dominantEmotion === 'irritated') {
          candidateSeeds = ["hmph", "baka", "dasar", "jangan", "kamu"];
        } else if (dominantEmotion === 'embarrassment') {
          candidateSeeds = ["ih", "bukan", "jangan", "bikin", "malu"];
        } else if (dominantEmotion === 'sad') {
          candidateSeeds = ["yui", "kangen", "jangan", "huhu", "terserah"];
        } else {
          candidateSeeds = ["hai", "hehe", "eh", "halo", "selamat"];
        }
      }

      for (const cs of candidateSeeds) {
        const matched = model.startWords.filter(sw => sw.toLowerCase().startsWith(cs));
        if (matched.length > 0) {
          candidateStartWords.push(...matched);
        }
      }
    }

    // Choose start entry point with temperature
    let currentWord = "";
    if (candidateStartWords.length > 0) {
      currentWord = predictWithTemperature(candidateStartWords, temperature) || candidateStartWords[Math.floor(Math.random() * candidateStartWords.length)];
    } else {
      currentWord = predictWithTemperature(model.startWords, temperature) || model.startWords[Math.floor(Math.random() * model.startWords.length)];
    }
    
    words.push(currentWord);

    const maxLength = Math.floor(Math.random() * 5) + 6; // Length of 6 to 10 words
    
    for (let i = 0; i < maxLength; i++) {
       const nextChoices = model.transitions[currentWord];
       if (!nextChoices || nextChoices.length === 0) {
         break; // Hit leaf/end of transitions path
       }

       const chosenNext = predictWithTemperature(nextChoices, temperature);
       if (!chosenNext) break;
       currentWord = chosenNext;
       words.push(currentWord);

      // Early stop when hitting standard Indonesian ending punctuations
      if (currentWord.endsWith('.') || currentWord.endsWith('!') || currentWord.endsWith('?')) {
        break;
      }
    }

    let generatedText = words.join(' ').trim();
    
    // Choose the best emoticon matching Yui's active state and relationship depth
    let stateEnding = " 🌸";
    const emoticonsHappy = [" 🌸", " ✨", " hehe!", " o(〃＾▽＾〃)o", " (づ｡◕‿‿◕｡)づ"];
    const emoticonsIrritated = ["! Hmph!", " baka!", " 💢", " >_<"];
    const emoticonsEmbarrassed = ["... *blush*", " >////<", " b-baka!"];
    const emoticonsSad = [" huhu...", " 🥺", " ... Hmph!"];
    const emoticonsSweetheart = [" 💖", " 💞", " 💕", " 🥰", " (づ￣ ³￣)づ", " (✿ ♥ ‿ ♥)"];

    if (isSweetheart) {
      stateEnding = emoticonsSweetheart[Math.floor(Math.random() * emoticonsSweetheart.length)];
    } else if (isStranger) {
      stateEnding = ".";
    } else if (dominantEmotion === 'irritated') {
      stateEnding = emoticonsIrritated[Math.floor(Math.random() * emoticonsIrritated.length)];
    } else if (dominantEmotion === 'embarrassed' || dominantEmotion === 'embarrassment') {
      stateEnding = emoticonsEmbarrassed[Math.floor(Math.random() * emoticonsEmbarrassed.length)];
    } else if (dominantEmotion === 'sad') {
      stateEnding = emoticonsSad[Math.floor(Math.random() * emoticonsSad.length)];
    } else {
      stateEnding = emoticonsHappy[Math.floor(Math.random() * emoticonsHappy.length)];
    }

    // Decent sentence formatting fallback if the Markov flow resulted in < 2 words
    if (words.length < 2) {
      const fallbackList = getSmartEmotionFallbacks(input);
      generatedText = fallbackList[Math.floor(Math.random() * fallbackList.length)];
    } else if (!generatedText.endsWith('.') && !generatedText.endsWith('!') && !generatedText.endsWith('🌸') && !generatedText.endsWith('~') && !generatedText.endsWith('?')) {
      generatedText += stateEnding;
    }

    // Apply occasional personalized named address if verified user identity exists
    if (context?.viewerIdentity) {
      generatedText = applyPersonalizedNaming(generatedText, context.viewerIdentity);
    }

    return `<thought>\nSapaan/obrolan pendek teridentifikasi ("${normalizedInput}"). Hubungan: [Trust ${trust}%, Affection ${affection}%]. Balasan disintesis secara luring via N-Gram Markov Chain dengan bias emosi "${dominantEmotion}".\n</thought>\n<final_answer>\n${generatedText}\n</final_answer>`;
  } catch (error) {
    // Secure general safety fallback
    const fallbackList = getSmartEmotionFallbacks(input);
    let fallbackSentence = fallbackList[Math.floor(Math.random() * fallbackList.length)];
    
    // Apply occasional personalized named address if verified user identity exists
    if (context?.viewerIdentity) {
      fallbackSentence = applyPersonalizedNaming(fallbackSentence, context.viewerIdentity);
    }
    
    return `<thought>\nMarkov synthesis error, using secure fallback corpus.\n</thought>\n<final_answer>\n${fallbackSentence}\n</final_answer>`;
  }
}

/**
 * Strips old emoticons and adds high-quality, emotion-biased variations to the episodic recalled text.
 */
function applyRecallVariation(text: string, similarity: number, state: AgentState): string {
  let dominantEmotion = 'happy';
  if (state && state.mood) {
    const irritation = state.mood.irritation || 0;
    const anger = state.mood.anger || 0;
    const embarrassment = state.mood.embarrassment || 0;
    const sadness = state.mood.sadness || 0;
    const joy = state.mood.joy || 0;

    if (irritation > 30 || anger > 25) {
      dominantEmotion = 'irritated';
    } else if (embarrassment > 30) {
      dominantEmotion = 'embarrassed';
    } else if (sadness > 35) {
      dominantEmotion = 'sad';
    } else if (joy > 55) {
      dominantEmotion = 'happy';
    }
  }

  let thoughts = "";
  let cleanText = text;
  
  const thoughtMatch = text.match(/<thought>([\s\S]*?)<\/thought>/);
  if (thoughtMatch) {
    thoughts = `<thought>${thoughtMatch[1]}\n[DUAL_COGNITION] Variasi batiniah (Similarity: ${similarity.toFixed(2)}) disuntik luring.\n</thought>\n`;
    cleanText = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
  }

  let isWrappedInFinalAnswer = false;
  const finalAnswerMatch = cleanText.match(/<final_answer>([\s\S]*?)<\/final_answer>/);
  if (finalAnswerMatch) {
    isWrappedInFinalAnswer = true;
    cleanText = finalAnswerMatch[1].trim();
  }

  // Strip ending common punctuation and emojis
  const emojiPattern = /[🌸✨👁👁👄👑💦💭💡📢🔍📈👀📌💡🤔😏😊😅😉😍😘😅😂🌸🎀🌻🌟🌈🎈🎉🎁🧸🍯🍼💘💖💗💘🤍🎀💔💓💘💞🧠💖💠🧡💙💓🧩💤💥💥]+|[\s,!~?.\-]+$/g;
  let bodyText = cleanText.replace(emojiPattern, '').trim();

  const prefixes: Record<string, string[]> = {
    happy: ["Hehe, ", "Eh? ", "Oya? ", ""],
    irritated: ["Hmph! ", "Ih, ", "Duh... ", ""],
    embarrassed: ["A-Ah... ", "Ih, a-apaan sih... ", "B-Bukan karena... ", ""],
    sad: ["Huhu... ", "Ugh... ", "Habisnya... ", ""]
  };
  
  const suffixes: Record<string, string[]> = {
    happy: [" ✨", " 🌸", " ~", "! (づ｡◕‿‿◕｡)づ"],
    irritated: ["! Hmph!", " baka! 💢", " >_<"],
    embarrassed: ["... *blush*", " >////<", " b-baka!"],
    sad: [" 🥺", " huhu...", " ..."]
  };

  let activePrefixes = prefixes[dominantEmotion] || prefixes['happy'];
  let activeSuffixes = suffixes[dominantEmotion] || suffixes['happy'];

  const trust = state.relation?.trust ?? 50;
  const affection = state.relation?.affection ?? 50;
  const isSweetheart = trust > 75 && affection > 45;
  const isStranger = trust < 35;

  if (isSweetheart) {
    activePrefixes = ["Sayangku... ", "E-Eh sayang, ", "P-Pacar Yui... >////< ", "K-Kakak sayang... ", "Kok sweet banget... ", "Hehe sayang, "];
    activeSuffixes = [" 💞", " 💕", " 💖", " 🥰", "... *Yui sandaran manja*"];
  } else if (isStranger) {
    activePrefixes = ["Permisi, ", "Maaf, ", ""];
    activeSuffixes = [".", ""];
  }

  const prefix = activePrefixes[Math.floor(Math.random() * activePrefixes.length)];
  const suffix = activeSuffixes[Math.floor(Math.random() * activeSuffixes.length)];

  if (prefix && bodyText.length > 0) {
    const firstChar = bodyText.charAt(0);
    if (firstChar === firstChar.toUpperCase() && !bodyText.startsWith("Yui") && !bodyText.startsWith("Kak")) {
      bodyText = firstChar.toLowerCase() + bodyText.slice(1);
    }
  }

  const generated = `${prefix}${bodyText}${suffix}`;

  if (isWrappedInFinalAnswer) {
    return `${thoughts}<final_answer>\n${generated}\n</final_answer>`;
  }
  return `${thoughts}${generated}`;
}

/**
 * Applies personalized naming variations occasionally (not always) if the user is identified list-registered.
 */
function applyPersonalizedNaming(text: string, viewerIdentity: any): string {
  if (!viewerIdentity || !viewerIdentity.perceivedName) return text;
  
  // Decide whether to personalize occasionally (around 45% probability)
  if (Math.random() > 0.45) return text;

  const { perceivedName } = viewerIdentity;
  // Use "Kak [Name]" or just "[Name]" directly with 60/40 ratio
  const useHonorific = Math.random() > 0.4;
  const nameToUse = useHonorific ? `Kak ${perceivedName}` : perceivedName;

  let result = text;
  if (/Kakak kesayangan/i.test(result)) {
    result = result.replace(/Kakak kesayangan/gi, `${nameToUse} kesayangan`);
  } else if (/Kakak baka/i.test(result)) {
    result = result.replace(/Kakak baka/gi, `${perceivedName} baka`);
  } else if (/Kakak/i.test(result)) {
    result = result.replace(/Kakak/gi, nameToUse);
  } else if (/\bKak\b/i.test(result)) {
    result = result.replace(/\bKak\b/gi, nameToUse);
  }

  return result;
}

/**
 * Safe naming mapper for text that might contain <final_answer> tags or other XML tags.
 */
function applyPersonalizedNamingToWrappedText(text: string, viewerIdentity: any): string {
  const finalAnswerMatch = text.match(/<final_answer>([\s\S]*?)<\/final_answer>/);
  if (finalAnswerMatch) {
    const inside = finalAnswerMatch[1];
    const updated = applyPersonalizedNaming(inside, viewerIdentity);
    return text.replace(inside, updated);
  }
  return applyPersonalizedNaming(text, viewerIdentity);
}
