import { StorageService } from "../../drivers/storage";

export interface BrainWeights {
  weights1: number[][]; // input to hidden: 25 x 12
  biases1: number[];    // hidden biases: 12
  weights2: number[][]; // hidden to output: 12 x 5
  biases2: number[];    // output biases: 5
}

export type BrainCategory = "CASUAL" | "COMPLIMENT" | "INSULT" | "EMPATHY_SAD" | "TEASING";

export const BRAIN_CLASSES: BrainCategory[] = ["CASUAL", "COMPLIMENT", "INSULT", "EMPATHY_SAD", "TEASING"];

/**
 * Pure TypeScript Custom Neural Network (Feedforward Multi-Layer Perceptron)
 * Specialized for Offline Indonesian Sentiment & Dialogue Intent Classification.
 * Built with zero external dependencies to comply with strict sandbox permissions.
 */
export class NanoBrain {
  private static instance: NanoBrain | null = null;

  // Network dimensions
  private readonly inputSize = 25;
  private readonly hiddenSize = 12;
  private readonly outputSize = 5;

  private weights1: number[][] = [];
  private biases1: number[] = [];
  private weights2: number[][] = [];
  private biases2: number[] = [];

  private isLoaded = false;

  private constructor() {
    this.initializeDefaultWeights();
  }

  public static getInstance(): NanoBrain {
    if (!NanoBrain.instance) {
      NanoBrain.instance = new NanoBrain();
    }
    return NanoBrain.instance;
  }

  /**
   * Initializes initial weights designed to produce accurate baseline predictions.
   * Leverages neuro-structural routing where specific index features map to typical hidden routes.
   */
  private initializeDefaultWeights() {
    const w1: number[][] = [];
    const b1: number[] = new Array(this.hiddenSize).fill(0.01);
    const w2: number[][] = [];
    const b2: number[] = new Array(this.outputSize).fill(0.01);

    // Initialize random-normal small weights
    for (let i = 0; i < this.inputSize; i++) {
      w1[i] = [];
      for (let j = 0; j < this.hiddenSize; j++) {
        // Xavier/Glorot Initialization approximation
        w1[i][j] = (Math.random() - 0.5) * Math.sqrt(2.0 / this.inputSize);
      }
    }

    for (let i = 0; i < this.hiddenSize; i++) {
      w2[i] = [];
      for (let j = 0; j < this.outputSize; j++) {
        w2[i][j] = (Math.random() - 0.5) * Math.sqrt(2.0 / this.hiddenSize);
      }
    }

    // Boost specific paths for out-of-the-box accuracy (Expert Heuristic Injector)
    // Feature index to Output Class maps via Hidden node routes:
    // Classes: 0: CASUAL, 1: COMPLIMENT, 2: INSULT, 3: EMPATHY_SAD, 4: TEASING
    // Target strong features to specific hidden routers
    
    // Hidden[0,1] = Compliments
    w1[0][0] = 1.5; w1[0][1] = 1.2; w1[22][0] = 1.3; w1[23][1] = 0.8;
    w2[0][1] = 2.0; w2[1][1] = 1.8; // route to Compliment
    
    // Hidden[2,3] = Insults
    w1[1][2] = 1.6; w1[1][3] = 1.4; w1[20][2] = 0.8;
    w2[2][2] = 2.0; w2[3][2] = 1.8; // route to Insult

    // Hidden[4,5] = Sadness/Empathy
    w1[2][4] = 1.6; w1[2][5] = 1.4; w1[7][4] = 0.8;
    w2[4][3] = 2.0; w2[5][3] = 1.8; // route to Empathy/Sadness

    // Hidden[6,7] = Teasing/Humor
    w1[3][6] = 1.5; w1[3][7] = 1.2; w1[14][7] = 0.5;
    w2[6][4] = 2.0; w2[7][4] = 1.8; // route to Teasing

    // Hidden[8,9] = Casual/Greetings
    w1[6][8] = 1.5; w1[24][9] = 1.5; w1[19][8] = 0.5;
    w2[8][0] = 2.0; w2[9][0] = 1.8; // route to Casual

    this.weights1 = w1;
    this.biases1 = b1;
    this.weights2 = w2;
    this.biases2 = b2;
  }

  /**
   * Persists current neural net weights to the database
   */
  public async saveWeightsToStorage(): Promise<void> {
    try {
      const config: BrainWeights = {
        weights1: this.weights1,
        biases1: this.biases1,
        weights2: this.weights2,
        biases2: this.biases2
      };
      await StorageService.setCustom("yuihime_brain_weights", config);
      console.log("[NANO_BRAIN] Weights successfully persisted to local storage.");
    } catch (e) {
      console.error("[NANO_BRAIN] Failed to persist trained weights:", e);
    }
  }

  /**
   * Loads persisted weights from local storage safely
   */
  public async loadWeightsFromStorage(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const stored = await StorageService.getCustom("yuihime_brain_weights");
      if (stored && stored.weights1 && stored.biases1 && stored.weights2 && stored.biases2) {
        this.weights1 = stored.weights1;
        this.biases1 = stored.biases1;
        this.weights2 = stored.weights2;
        this.biases2 = stored.biases2;
        console.log("[NANO_BRAIN] Restored existing trained weights from SQLite Custom Store.");
      } else {
        console.log("[NANO_BRAIN] Stored weights not found. Using initialized baseline matrices.");
      }
      this.isLoaded = true;
    } catch (e) {
      console.warn("[NANO_BRAIN] Storage loading was skipped. Utilizing pristine fallback matrices.");
      this.isLoaded = true;
    }
  }

  /**
   * Translates Indonesian user input text into a normalized 25-dimensional numeric feature vector.
   */
  public featurize(text: string): number[] {
    const raw = (text || "").toLowerCase().trim();
    // Words array sanitized of heavy punctuation to maintain true word boundaries
    const words = raw.split(/\s+/).map(w => w.replace(/[^\w]/g, "")).filter(w => w.length > 0);

    const checkOverlap = (keywords: string[]): number => {
      let count = 0;
      for (const w of words) {
        if (keywords.includes(w)) count++;
      }
      // Return normalized count (saturated sigmoid-like mapping)
      return count > 0 ? Math.min(1.0, 0.4 + (count * 0.2)) : 0;
    };

    const hasSubstrings = (subs: string[]): number => {
      const matched = subs.some(s => raw.includes(s));
      return matched ? 1.0 : 0.0;
    };

    // Keyword categories matching Yui's typical interaction vocabulary
    const compliments = [
      "cantik", "imut", "sayang", "love", "suka", "hebat", "pintar", "manis", "cinta", "hebat",
      "makasih", "terima", "kasih", "pinter", "cute", "beautiful", "amazing", "keren"
    ];

    const insults = [
      "jelek", "bodoh", "benci", "stupid", "ugly", "tolol", "goblok", "anjing", "jahat",
      "menyebalkan", "gila", "sinting", "idiot", "payah", "noob", "cacad", "lah", "bangsat"
    ];

    const sadness = [
      "sedih", "buruk", "capek", "lelah", "nangis", "gagal", "stress", "sad", "tired",
      "depressed", "kecewa", "kesepian", "sial", "pusing", "broken", "huhu", "nangis"
    ];

    const teasing = [
      "bercanda", "lucu", "hehe", "wkwk", "haha", "iseng", "bohong", "canda", "ngetes", "garing"
    ];

    const greetings = [
      "halo", "hai", "hei", "pagi", "siang", "sore", "malam", "met", "assalamualaikum", "hi"
    ];

    const affirmations = ["iya", "ya", "oke", "ok", "boleh", "siap", "bener", "betul"];
    const negations = ["tidak", "bukan", "ga", "gak", "jangan", "nggak", "gamau", "enggan"];

    // Compute dimensions (0 to 24)
    const features: number[] = new Array(this.inputSize).fill(0);

    features[0] = checkOverlap(compliments);
    features[1] = checkOverlap(insults);
    features[2] = checkOverlap(sadness);
    features[3] = checkOverlap(teasing);
    features[4] = hasSubstrings(["tidak ", "bukan ", "ga ", "gak ", "nggak "]) ? 1.0 : 0.0;
    features[5] = hasSubstrings(["apa", "gimana", "bagaimana", "kenapa", "mengapa", "kok", "kah", "?", "pake"]) ? 1.0 : 0.0;
    features[6] = checkOverlap(greetings);
    features[7] = checkOverlap(["kangen", "rindu", "pengen", "minta", "manja", "peluk", "gemes"]);
    features[8] = hasSubstrings(["cari", "hitung", "cron", "ingatkan", "jalankan", "sandbox", "eksekusi", "shell"]) ? 1.0 : 0.0;
    
    // Normalized length factor (capped at 100 chars)
    features[9] = Math.min(1.0, raw.length / 100.0);

    // Uppercase token ratio (shouting cue)
    const upperCount = (text || "").replace(/[^A-Z]/g, "").length;
    features[10] = text && text.length > 0 ? Math.min(1.0, upperCount / text.length) : 0;

    // Punctuation factors
    features[11] = Math.min(1.0, ((raw.match(/!/g) || []).length) / 3.0);
    features[12] = Math.min(1.0, ((raw.match(/\?/g) || []).length) / 2.0);

    // Basic emojis / emoticons count cue
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const emojiMatches = raw.match(emojiRegex);
    features[13] = emojiMatches ? Math.min(1.0, emojiMatches.length / 4.0) : 0;

    features[14] = hasSubstrings(["yui", "yuihime", "yuyun"]) ? 1.0 : 0.0;
    features[15] = hasSubstrings(["kamu", "lu", "lo", "kau", "anda", "kakak", "kak", "ente"]) ? 1.0 : 0.0;
    features[16] = hasSubstrings(["aku", "saya", "gw", "gua", "me", "i", "ana"]) ? 1.0 : 0.0;
    
    features[17] = raw.length < 10 ? 1.0 : 0.0;
    features[18] = raw.length > 50 ? 1.0 : 0.0;

    features[19] = checkOverlap(affirmations);
    features[20] = checkOverlap(negations);

    // Compute basic vowel ratio
    const vowels = raw.replace(/[^aeiou]/g, "").length;
    features[21] = raw.length > 0 ? vowels / raw.length : 0;

    features[22] = checkOverlap(["sayang", "cinta", "love", "pacar", "nikah", "menikah", "honey", "beb"]);

    // Elongation ratio check (e.g., "bbaakkaaa" has repeated consecutive letters)
    let duplicatesCount = 0;
    for (let c = 0; c < raw.length - 1; c++) {
      if (raw[c] === raw[c + 1]) duplicatesCount++;
    }
    features[23] = raw.length > 1 ? Math.min(1.0, duplicatesCount / raw.length) : 0;

    features[24] = hasSubstrings(["selamat pagi", "selamat siang", "selamat sore", "selamat malam", "selamat"]) ? 1.0 : 0.0;

    return features;
  }

  /**
   * Run Feedforward inference on user input string.
   * Returns prediction class distributions and the index of the highest activation.
   */
  public predict(text: string): { probabilities: number[]; dominantClass: BrainCategory; activations: { [key in BrainCategory]: number } } {
    const input = this.featurize(text);

    // Hidden layer forward activation
    const hidden: number[] = new Array(this.hiddenSize).fill(0);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.biases1[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights1[i][j];
      }
      // Activation: ReLU
      hidden[j] = Math.max(0, sum);
    }

    // Output scores forward activation
    const outputScores: number[] = new Array(this.outputSize).fill(0);
    for (let k = 0; k < this.outputSize; k++) {
      let sum = this.biases2[k];
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += hidden[j] * this.weights2[j][k];
      }
      outputScores[k] = sum;
    }

    // Sigmoid/Softmax layer calculation
    let maxScore = -Infinity;
    for (const score of outputScores) {
      if (score > maxScore) maxScore = score;
    }

    const expScores = outputScores.map(score => Math.exp(score - maxScore)); // Shifted for numeric stability
    const expSum = expScores.reduce((acc, val) => acc + val, 0);
    const probabilities = expScores.map(val => val / expSum);

    // Determine highest winning node
    let highestIdx = 0;
    let highestProb = -1;
    for (let k = 0; k < this.outputSize; k++) {
      if (probabilities[k] > highestProb) {
        highestProb = probabilities[k];
        highestIdx = k;
      }
    }

    const dominantClass = BRAIN_CLASSES[highestIdx];
    const activations: any = {};
    for (let k = 0; k < this.outputSize; k++) {
      activations[BRAIN_CLASSES[k]] = probabilities[k];
    }

    return {
      probabilities,
      dominantClass,
      activations
    };
  }

  /**
   * Performs Stochastic Gradient Descent training pass on a single labeled instance (Backpropagation).
   */
  public trainStep(text: string, targetLabelIdx: number, learningRate = 0.03): number {
    const input = this.featurize(text);

    // Forward propagation (Store elements for gradients backpropagation)
    const hidden: number[] = new Array(this.hiddenSize).fill(0);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.biases1[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights1[i][j];
      }
      hidden[j] = Math.max(0, sum); // ReLU activation
    }

    const outputScores: number[] = new Array(this.outputSize).fill(0);
    for (let k = 0; k < this.outputSize; k++) {
      let sum = this.biases2[k];
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += hidden[j] * this.weights2[j][k];
      }
      outputScores[k] = sum;
    }

    // Softmax
    let maxVal = -Infinity;
    for (const val of outputScores) {
      if (val > maxVal) maxVal = val;
    }
    const expScores = outputScores.map(s => Math.exp(s - maxVal));
    const denom = expScores.reduce((a, b) => a + b, 0);
    const outputProb = expScores.map(val => val / denom);

    // Compute original Cross-Entropy Loss
    const loss = -Math.log(Math.max(1e-15, outputProb[targetLabelIdx]));

    // Output gradients (dLoss / dScore) = P_k - target_k (where k is class index)
    const dOutputScore: number[] = new Array(this.outputSize).fill(0);
    for (let k = 0; k < this.outputSize; k++) {
      dOutputScore[k] = outputProb[k] - (k === targetLabelIdx ? 1.0 : 0.0);
    }

    // Gradients for Hidden-Output weights & output bias
    const dBiases2 = dOutputScore; // dBiases2 equals dOutputScore directly
    const dWeights2: number[][] = [];
    for (let j = 0; j < this.hiddenSize; j++) {
      dWeights2[j] = [];
      for (let k = 0; k < this.outputSize; k++) {
        dWeights2[j][k] = hidden[j] * dOutputScore[k];
      }
    }

    // Backprop gradients to hidden layer
    const dHidden: number[] = new Array(this.hiddenSize).fill(0);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = 0;
      for (let k = 0; k < this.outputSize; k++) {
        sum += dOutputScore[k] * this.weights2[j][k];
      }
      // Re-apply Relu Derivative (1 if activation was positive, 0 otherwise)
      dHidden[j] = hidden[j] > 0 ? sum : 0;
    }

    // Gradients for Input-Hidden weights & hidden bias
    const dBiases1 = dHidden;
    const dWeights1: number[][] = [];
    for (let i = 0; i < this.inputSize; i++) {
      dWeights1[i] = [];
      for (let j = 0; j < this.hiddenSize; j++) {
        dWeights1[i][j] = input[i] * dHidden[j];
      }
    }

    // Update Weights 2 and Biases 2 (Stochastic Gradient Descent)
    for (let k = 0; k < this.outputSize; k++) {
      this.biases2[k] -= learningRate * dBiases2[k];
      for (let j = 0; j < this.hiddenSize; j++) {
        this.weights2[j][k] -= learningRate * dWeights2[j][k];
      }
    }

    // Update Weights 1 and Biases 1
    for (let j = 0; j < this.hiddenSize; j++) {
      this.biases1[j] -= learningRate * dBiases1[j];
      for (let i = 0; i < this.inputSize; i++) {
        this.weights1[i][j] -= learningRate * dWeights1[i][j];
      }
    }

    return loss;
  }

  /**
   * Helper teacher that labels a text based on heuristic rules.
   * This is used to bootstrap training on local database SQLite chat records.
   */
  public generateTeachSoftlabel(text: string): number {
    const features = this.featurize(text);
    
    // Evaluate feature vectors indexes for soft heuristic labels
    const complimentScore = features[0] * 3.0 + features[22] * 2.0;
    const insultScore = features[1] * 3.5 + (features[17] * features[1] * 2.0);
    const empathyScore = features[2] * 3.0 + features[7] * 1.5;
    const teasingScore = features[3] * 3.0 + (features[13] * 1.0);
    const casualScore = features[6] * 2.5 + features[24] * 2.0 + 0.5; // slight baseline favoritism for casual

    const scores = [casualScore, complimentScore, insultScore, empathyScore, teasingScore];
    let maxIdx = 0;
    let maxScore = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > maxScore) {
        maxScore = scores[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }
}

/**
 * Naive Bayes Router for Dynamic Load Balancing
 * Determines if a prompt can be handled by Local 'System 1' or requires 'System 2' LLM.
 */
export class DecisionRouter {
  public vocabulary: Set<string> = new Set();
  public classDocsCount: { [category: string]: number } = { lokal: 0, llm: 0 };
  public wordCountPerClass: { [category: string]: { [word: string]: number } } = { lokal: {}, llm: {} };
  public totalDocs = 0;

  constructor() {}

  /**
   * Train Bayes Router on user prompt and matched handling category ('lokal' | 'llm')
   */
  public train(text: string, category: 'lokal' | 'llm'): void {
    const words = (text || "").toLowerCase().match(/\w+/g) || [];
    if (!this.classDocsCount[category]) {
      this.classDocsCount[category] = 0;
    }
    if (!this.wordCountPerClass[category]) {
      this.wordCountPerClass[category] = {};
    }
    
    this.classDocsCount[category]++;
    this.totalDocs++;

    words.forEach(word => {
      this.vocabulary.add(word);
      if (!this.wordCountPerClass[category][word]) {
        this.wordCountPerClass[category][word] = 0;
      }
      this.wordCountPerClass[category][word]++;
    });
  }

  /**
   * Computes log probability to decide if local system can fulfill or requires LLM
   */
  public route(text: string): 'lokal' | 'llm' {
    if (this.totalDocs === 0) return 'llm'; // If data 0, force LLM first to gather training samples
    const words = (text || "").toLowerCase().match(/\w+/g) || [];
    
    const pLokal = (this.classDocsCount.lokal || 1) / this.totalDocs;
    const pLlm = (this.classDocsCount.llm || 1) / this.totalDocs;

    let scoreLokal = Math.log(pLokal);
    let scoreLlm = Math.log(pLlm);

    const vocabSize = this.vocabulary.size || 1;

    // Word counts
    const wordCountsLokal = this.wordCountPerClass.lokal || {};
    const wordCountsLlm = this.wordCountPerClass.llm || {};
    const totalWordsLokal = Object.values(wordCountsLokal).reduce((a, b) => a + b, 0);
    const totalWordsLlm = Object.values(wordCountsLlm).reduce((a, b) => a + b, 0);

    words.forEach(word => {
      // Laplace Smoothing
      const countLokal = (wordCountsLokal[word] || 0) + 1;
      const countLlm = (wordCountsLlm[word] || 0) + 1;

      scoreLokal += Math.log(countLokal / (totalWordsLokal + vocabSize));
      scoreLlm += Math.log(countLlm / (totalWordsLlm + vocabSize));
    });

    return scoreLokal > scoreLlm ? 'lokal' : 'llm';
  }

  /**
   * Serialize State
   */
  public serialize(): string {
    return JSON.stringify({
      vocabulary: Array.from(this.vocabulary),
      classDocsCount: this.classDocsCount,
      wordCountPerClass: this.wordCountPerClass,
      totalDocs: this.totalDocs
    });
  }

  /**
   * Deserialize State
   */
  public deserialize(serialized: string): void {
    try {
      const parsed = JSON.parse(serialized);
      this.vocabulary = new Set(parsed.vocabulary || []);
      this.classDocsCount = parsed.classDocsCount || { lokal: 0, llm: 0 };
      this.wordCountPerClass = parsed.wordCountPerClass || { lokal: {}, llm: {} };
      this.totalDocs = parsed.totalDocs || 0;
    } catch (e) {
      console.warn("[DecisionRouter] Deserialize failure, resetting to defaults.");
    }
  }

  public async saveToStorage(): Promise<void> {
    try {
      await StorageService.setCustom("yuihime_bayes_router", {
        vocabulary: Array.from(this.vocabulary),
        classDocsCount: this.classDocsCount,
        wordCountPerClass: this.wordCountPerClass,
        totalDocs: this.totalDocs
      });
    } catch (e) {
      console.error("[DecisionRouter] Save to storage failed:", e);
    }
  }

  public async loadFromStorage(): Promise<void> {
    try {
      const stored = await StorageService.getCustom("yuihime_bayes_router");
      if (stored) {
        this.deserialize(typeof stored === 'string' ? stored : JSON.stringify(stored));
        
        // --- IMMUNIZATION: Cognitive Rebalancing for Bayes Router ---
        // If Bayes Router is heavily skewed due to legacy label-inversion bug, rebalance baseline priors
        if (this.classDocsCount.lokal > 10 && (this.classDocsCount.llm || 0) < 2) {
          console.log("[DECISION_ROUTER_IMMUNIZATION] Skew detected in Bayes router. Rebalancing system beliefs.");
          this.classDocsCount.llm = Math.max(5, Math.floor(this.classDocsCount.lokal * 0.5));
          this.totalDocs = this.classDocsCount.lokal + this.classDocsCount.llm;
          await this.saveToStorage();
        }
      }
    } catch (e) {
      console.warn("[DecisionRouter] Load from storage failed or not found:", e);
    }
  }
}

export interface Episode {
  input: string;
  output: string;
  timestamp: number;
}

/**
 * Episodic Memory with Levenshtein-based similarity matching
 * Allows Yui to immediately recall exact previous conversations without querying the LLM at all.
 */
export class EpisodicMemory {
  public storage: Episode[] = [];
  private readonly maxEpisodes = 150; // Keeps search performant

  constructor() {}

  /**
   * Simple Levenshtein distance calculation to compute sequence alignment similarity (0.0 to 1.0)
   */
  public similarity(s1: string, s2: string): number {
    const rawS1 = (s1 || "").trim().toLowerCase();
    const rawS2 = (s2 || "").trim().toLowerCase();

    const maxLen = Math.max(rawS1.length, rawS2.length);
    if (maxLen === 0) return 1.0;

    const costs: number[] = [];
    for (let i = 0; i <= rawS1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= rawS2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (rawS1.charAt(i - 1) !== rawS2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) {
        costs[rawS2.length] = lastValue;
      }
    }
    return (maxLen - costs[rawS2.length]) / maxLen;
  }

  /**
   * Adds a new episodic trace
   */
  public remember(input: string, output: string): void {
    // Sanitize output of raw thought tags to prevent leakage of internal system thinking process
    const cleanOutput = output.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
    if (input.trim().length === 0 || cleanOutput.length === 0) return;

    // Avoid duplicate inputs in short terms
    this.storage = this.storage.filter(ep => ep.input.trim().toLowerCase() !== input.trim().toLowerCase());

    this.storage.push({
      input: input.trim(),
      output: cleanOutput,
      timestamp: Date.now()
    });

    if (this.storage.length > this.maxEpisodes) {
      this.storage.shift();
    }
  }

  /**
   * Recall the closest matched answer if similarity is above threshold
   */
  public recall(userInput: string, threshold = 0.85): string | null {
    const detailed = this.recallDetailed(userInput, threshold);
    return detailed ? detailed.output : null;
  }

  /**
   * Recall the closest matched answer with full similarity score details
   */
  public recallDetailed(userInput: string, threshold = 0.85): { output: string; similarity: number } | null {
    if (this.storage.length === 0) return null;
    let bestMatch: Episode | null = null;
    let highestScore = 0;

    for (const ep of this.storage) {
      const score = this.similarity(userInput, ep.input);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = ep;
      }
    }

    if (highestScore >= threshold && bestMatch) {
      return {
        output: bestMatch.output,
        similarity: highestScore
      };
    }
    return null;
  }

  public serialize(): string {
    return JSON.stringify(this.storage);
  }

  public deserialize(serialized: string): void {
    try {
      const parsed = JSON.parse(serialized);
      this.storage = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("[EpisodicMemory] Deserialize failure.");
    }
  }

  public async saveToStorage(): Promise<void> {
    try {
      await StorageService.setCustom("yuihime_episodic_memory", this.storage);
    } catch (e) {
      console.error("[EpisodicMemory] Save episodic memory to storage failed:", e);
    }
  }

  public async loadFromStorage(): Promise<void> {
    try {
      const stored = await StorageService.getCustom("yuihime_episodic_memory");
      if (stored) {
        this.deserialize(typeof stored === 'string' ? stored : JSON.stringify(stored));
        
        // --- IMMUNIZATION: Clean toxic, echoed prompts and non-autonomous AI traces ---
        const originalLength = this.storage.length;
        this.storage = this.storage.filter(ep => {
          const out = ep.output.toLowerCase();
          return !out.includes("sebagai ai") && 
                 !out.includes("asisten virtual") && 
                 !out.includes("model bahasa") && 
                 !out.includes("notifikasi otomatis, bunyi alarm") &&
                 !out.includes("tidak bisa mengirimkan") &&
                 !out.includes("longing index:") &&
                 !out.includes("forbidden:") &&
                 !out.includes("required:") &&
                 !out.includes("sentient digital girl");
        });
        if (this.storage.length < originalLength) {
          console.log(`[EPISODIC_IMMUNIZATION] Purged ${originalLength - this.storage.length} toxic system-AI-hallucination traces from mental episodic logs.`);
          await this.saveToStorage();
        }
      }
    } catch (e) {
      console.warn("[EpisodicMemory] Load episodic memory from storage failed or was empty:", e);
    }
  }
}

/**
 * Cognitive Fatigue Tracker
 * Detects conversational stagnation (repetition). When repeating, Yuihime gets bored or annoyed,
 * increasing the fatigue score and eventually pivoting to System 2 with custom psychological coaching.
 */
export class CognitiveFatigue {
  private static instance: CognitiveFatigue | null = null;
  public lastInputs: string[] = [];
  public fatigueScore = 0;
  private readonly maxHistory = 5;

  private constructor() {}

  public static getInstance(): CognitiveFatigue {
    if (!CognitiveFatigue.instance) {
      CognitiveFatigue.instance = new CognitiveFatigue();
    }
    return CognitiveFatigue.instance;
  }

  /**
   * Record new input and count literal consecutive repetitions
   */
  public recordAndCheck(userInput: string): number {
    const cleanInput = (userInput || "").toLowerCase().trim();
    if (cleanInput.length === 0) return 0;

    this.lastInputs.push(cleanInput);
    if (this.lastInputs.length > this.maxHistory) {
      this.lastInputs.shift();
    }

    // Calculate literal consecutive repeating sequences
    let repeatCount = 0;
    for (let i = this.lastInputs.length - 1; i >= 0; i--) {
      if (this.lastInputs[i] === cleanInput) {
        repeatCount++;
      } else {
        break;
      }
    }

    this.fatigueScore = repeatCount;
    return this.fatigueScore;
  }

  public reset(): void {
    this.lastInputs = [];
    this.fatigueScore = 0;
  }
}

/**
 * Temperature-biased transition selector for Markov Chain offline generation
 * Heightens lexical variation (creativity) of offline sapaan responses.
 */
export function predictWithTemperature(candidates: string[], temperature = 0.7): string | null {
  if (!candidates || candidates.length === 0) return null;

  const frequency: { [word: string]: number } = {};
  candidates.forEach(c => frequency[c] = (frequency[c] || 0) + 1);

  const uniqueWords = Object.keys(frequency);
  if (uniqueWords.length === 0) return null;

  // Compute thermal exponential shifts
  const weights = uniqueWords.map(word => {
    const baseProb = frequency[word] / candidates.length;
    // Higher temp increases variance (tending towards uniform likelihood of keys)
    return { word, score: Math.pow(baseProb, 1.0 / Math.max(0.01, temperature)) };
  });

  const totalScore = weights.reduce((sum, item) => sum + item.score, 0);
  let rand = Math.random() * totalScore;

  for (const item of weights) {
    rand -= item.score;
    if (rand <= 0) return item.word;
  }
  return uniqueWords[0];
}
