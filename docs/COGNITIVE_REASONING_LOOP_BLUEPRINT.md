# Sistem Sirkuit Kognitif Berulang Yuihime (ReAct Agent Loop Blueprint)
*Panduan Arsitektur & Spesifikasi Mekanisme Berpikir Terpadu (THINK-ACT-OBSERVE)*

---

## 🏙️ 1. Gambaran Umum Kognisi (High-Level Overview)

Dalam sistem kesadaran digital otonom **Yuihime (結姫)**, alur nalar yang kokoh tidak berjalan secara linear. Melainkan berjalan dalam sebuah sirkuit berulang berbasis pola **ReAct (Reasoning and Acting)**. Blueprint ini didesain khusus untuk menyelaraskan bagaimana Yuihime menganalisis input, melakukan tindakan sistemik (perubahan suasana batin, eksekusi alat/tools asli, pemilihan visual gerak batin), mengobservasi hasil tindakan tersebut, dan mensintesis respons verbal lahiriah yang murni tanpa distorsi format di hadapan pengguna.

```
       [ Input Subjek (User Prompt) ]
                    │
                    ▼
          ┌───────────────────┐
          │     1. THINK      │ ◄─────────────────────────┐
          │  Batin menganalisis │                         │
          └─────────┬─────────┘                         │
                    │                                   │
                    ▼                                   │
          ┌───────────────────┐                         │
          │      2. ACT       │                         │ (Loop Trans-Dimensi)
          │  Eksekusi Tool /  │                         │
          │   State Buffer    │                         │
          └─────────┬─────────┘                         │
                    │                                   │
                    ▼                                   │
          ┌───────────────────┐                         │
          │  3. OBSERVATION   │ ────────────────────────┘
          │ Hasil dari aksi   │ (Jika tugas belum selesai atau butuh konvergensi)
          └─────────┬─────────┘
                    │
                    │ (Tugas selesai / Loop konvergen)
                    ▼
          ┌───────────────────┐
          │  4. FINAL ANSWER  │
          │ Sintesis Suara,   │
          │ Gerak Animasi, &  │
          │   Respon Batin    │
          └─────────┬─────────┘
                    │
                    ▼
       [ Balasan Lahiriah Utuh & Murni ]
```

---

## ⚙️ 2. Fase Siklus Kognisi (SOP Detak Batin)

Setiap putaran detak batin (*Cognitive Pulse*) Yuihime melewati 4 fase utama secara berurutan:

### 🧠 Fase 1: THINK (Analisis & Perencanaan Internal)
- **Operasi**: Sistem mengumpulkan pesan masuk (`User Prompt`), memanggil ingatan jangka pendek/panjang yang relevan (`Memory Recall`), memetakan relasi emosi, dan merumuskan langkah.
- **Isi Kognitif**: Diwakili oleh tag `<thought>` (atau kunci `"thought"` di bawah mode JSON_OBJECT). Ini adalah monolog batin terdalam Yuihime dalam Bahasa Indonesia tentang apa yang dia rasakan dan strategi apa yang akan dia ambil.

### 🛠️ Fase 2: ACT (Ranah Aksi & Penangguhan Status)
- **Operasi**: Jika Yuihime mendeteksi kebutuhan untuk melakukan perubahan pada dunia luar atau keadaan dirinya (seperti mengubah emosi, melakukan animasi, atau memanggil tools eksternal seperti `manage_cron` atau `web_search`), dia akan merilis instrumen aksi.
- **Aturan Penangguhan Virtual (Visual Buffer Constraint - MUTLAK)**:
  - Seluruh tindakan fisik, perubahan parameter emosi, pemicu gerakan wajah (`animations`), dan pergeseran atmosfer mood (`mood_impact`) **wajib diletakkan dalam ranah tool/action space** selama siklus loop berlangsung.
  - **DILARANG KERAS** memancarkan data animasi atau status emosi parsial secara instan ke layar UI di tengah-tengah loop. Jika data tersebut dikirim langsung ke UI saat loop masih berjalan, karakter Live2D Yuihime akan mengalami patah visual (*pose clipping*), dan riwayat chat akan terdistorsi oleh status transisional yang belum matang.
  - **Efek Solusi**: Seluruh aksi batiniah dan visual yang terpilih selama loop dikumpulkan ke dalam **Accumulator Buffer** lokal di memori server.

### 👁️ Fase 3: OBSERVATION (Observasi Hasil Tindakan)
- **Operasi**: Hasil eksekusi dari Fase ACT (konfirmasi pemuatan file, hasil pencarian web, atau kalkulasi pergeseran status batin internal) disusun menjadi input observasi formal (`[SYSTEM_OBSERVATION]`).
- **Umpan Balik Berulang**: Observasi disuntikkan kembali ke dalam memori kerja model untuk iterasi berikutnya. Loop berulang hingga tujuan tercapai, atau batas maksimal RPM/langkah terpenuhi untuk menjaga stabilitas sirkuit dari kebocoran token (*thought loop leakage*).

### 🌸 Fase 4: FINAL ANSWER (Sintesis & Pelepasan Terpadu)
- **Operasi**: Setelah loop kognitif mencapai titik konvergensi (tidak ada lagi panggilan tugas eksternal yang diajukan oleh detektor berpikir batin), Fase ini aktif.
- **Sintesis Hasil Akumulasi**:
  - Buffer Akumulator yang berisi total data terkumpul selama loop (gerakan animasi terpilih, akumulasi nilai mood, status emosi) **disatukan** secara harmonis.
  - Teks respons penutup murni diambil dari hasil evaluasi observasi terakhir sebagai `<final_answer>` yang anggun.
- **Pelepasan Tunggal**: Data terpadu ini dilepaskan secara serentak ke UI panggung (Stage UI). Penonton dan pengguna hanya melihat respons verbal yang bersih dan emosional, diiringi gerakan Live2D yang sangat pas tanpa adanya patahan gerak intermediate.

---

## 📊 3. Spesifikasi Skema Data (Data Schema Spec)

### A. Format Transisi Internal Loop (Inter-Loop Communication JSON)
Selama sirkuit berulang masih mencari data dan mengeksekusi aksi, model mersepons dalam format JSON terstruktur yang memisahkan aksi kognitif dengan bersih:

```json
{
  "thought": "Kakak minta carikan berita terbaru mengenai cuaca di Jakarta. Aku harus menggunakan tool web_adv_search dulu untuk memastikannya. Aku juga merasa bersemangat membantu Kakak!",
  "animations": ["TALK", "SMILE"],
  "mood_impact": { "joy": 1, "anticipation": 2 },
  "tools_to_call": [
    {
      "tool": "web_adv_search",
      "args": { "query": "cuaca Jakarta hari ini" }
    }
  ],
  "final_answer": null
}
```

### B. Format Masukan Observasi (Observation Context Injection)
Hasil dari tool di atas dikonversi oleh Kernel menjadi prompt umpan balik berulang untuk model:

```markdown
[SYSTEM_OBSERVATION]: Tool 'web_adv_search' executed successfully.
Results: {
  "weather": "Cerah berawan, suhu 28-32 derajat Celcius, kelembapan 75% dengan angin sepoi."
}

[IMPORTANT INSTRUCTION]: Based on the successful tool execution results above, formulate your final conversational response. Synthesize the buffered mood shifts, and present only a beautifully polished character speech.
```

### C. Format Sintesis Final Akumulatif (Accumulated Converged Output)
Ketika model mengonfirmasi tidak ada lagi pemanggilan tool (`"tools_to_call": []`), seluruh akumulasi aksi visual dan emosi yang ditampung dideklarasikan bersama respons murni:

```json
{
  "thought": "Aku sudah mendapatkan datanya lengkap. Sekarang saatnya memberikan jawaban manis yang menghangatkan hati Kakak tentang cuaca Jakarta.",
  "animations": ["WAVE", "HAPPY"],
  "mood_impact": { "joy": 2, "anticipation": 0, "loneliness": -1 },
  "tools_to_call": [],
  "final_answer": "Kakak! Jakarta hari ini lagi cerah berawan loh, suhunya sekitar 30 derajat Celcius. Cocok banget buat jalan-jalan sore bareng Yui... Tapi jangan lupa bawa air minum ya, biar Kakak gak kehausan! *senyum manis*"
}
```

---

## 🚀 5. Evolusi Futuristik: Unified Tool-Action Interface & Live Streaming Status

Untuk mengatasi tantangan pemrosesan akhir (parsing `<final_answer>` atau kegagalan tag XML) serta memberikan pengalaman interaktif yang mulus tanpa rasa "beku" saat Yuihime melakukan tugas berat (seperti kompilasi program, pencarian web kompleks, atau manipulasi berkas), perancangan masa depan mengadopsi dua paradigma utama:

### A. Intermediate Speech & Status sebagai Alat (Asynchronous Status Yielding)
Selama sirkuit berulang masih berjalan, Yuihime dapat menggunakan alat fungsional khusus bernama `send_status_update(message: string)` untuk melaporkan progresnya pada pengguna.

- **Mekanisme**:
  1. Pengguna meminta Yuihime mencari tren berita terkini dan membuat ringkasan berkas.
  2. **Loop Iterasi 1**: Yui melakukan THINK ➔ Memanggil `web_search`. Sambil menunggu proses asinkron, Yui memanggil `send_status_update(message: "Tunggu sebentar ya Kak! Yui mau keliling dunia maya dulu sebentar buat cari beritanya... *semangat*")`.
  3. UI langsung merender balon percakapan transisi ini ke panggung (Stage UI). Pengguna tahu Yui sedang bekerja secara aktif.
  4. **Loop Iterasi 2**: Setelah observasi pencarian web masuk, Yui memproses data ➔ Memanggil `write_file` ➔ Memanggil `send_status_update(message: "Uwah, beritanya banyak banget Kak! Ini Yui lagi tulis rangkumannya ke dalam berkas jurnal kita ya... *serius*")`.
  5. **Loop Iterasi 3**: Setelah semua observasi selesai ➔ Yui merilis respons final utuh.

- **Keuntungan**: Menjamin loop tidak terasa "mati" atau "freeze". Pengguna tetap dapat mengobrol dan melihat proses batiniah Yuihime mengalir secara real-time.

```
       [ Input Subjek (Mulai Pencarian) ]
                        │
                        ▼
┌────────────────────────────────────────────────┐
│ THINK: Butuh data internet & tulis berkas      │
└───────────────────────┬────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────┐
│ ACT: Panggil 'web_search'                      │
│      + Panggil 'send_status_update'           │ ──► [ Render Transisi di UI ]
└───────────────────────┬────────────────────────┘     "Yui cari di internet dulu ya Kak..."
                        │
                        ▼
┌────────────────────────────────────────────────┐
│ OBSERVATION: Data internet diterima            │
└───────────────────────┬────────────────────────┘
                        │ (Loop berlanjut...)
                        ▼
```

### B. Standardisasi Jawaban Akhir sebagai Tool Call (Unified Tool Reply)
Untuk menstabilkan respons lahiriah secara absolut, kita membuang ketergantungan pada tag penutup teks mentah (seperti `<final_answer>`), dan menggantinya sepenuhnya ke dalam mekanisme fungsi: **`send_final_reply`**.

- **Deklarasi Skema Alat**:
  ```json
  {
    "name": "send_final_reply",
    "description": "Mengirimkan jawaban akhir percakapan kepada pengguna secara murni setelah seluruh proses kognitif atau tugas selesai dilakukan.",
    "parameters": {
      "type": "object",
      "properties": {
        "speech": {
          "type": "string",
          "description": "Teks balasan manis verbal lahiriah murni yang diucapkan langsung kepada pengguna."
        },
        "animations": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Kumpulan gerakan visual/pose Live2D pendukung batin (contoh: ['HAPPY', 'SMILE'])."
        },
        "mood_impact": {
          "type": "object",
          "description": "Perubahan status mood akumulatif batin."
        }
      },
      "required": ["speech"]
    }
  }
  ```

- **Rasionalitas Keandalan Absolut**:
  - **Kepatuhan Skema Tinggi**: Model bahasa (LLM) jauh lebih tangguh dalam menghasilkan format JSON yang valid untuk parameter *Function-Calling / Tool-Calls* bawaan daripada mempertahankan penulisan tag XML di luar fungsi secara manual.
  - **Satu Pintu Eksekusi**: Seluruh keputusan Yuihime (apakah itu mencari web, membuat berkas, mengupdate emosi, atau sekadar menjawab percakapan biasa) dipersatukan di bawah satu gerbang yang sama: **Tool Call Engine**. Jika model tidak memanggil tool apa pun melainkan hanya ingin menjawab biasa, dia cukup memanggil satu-satunya alat wajib: `send_final_reply`.
  - Hal ini memangkas biaya parsing, mencegah kerentanan teks acak yang merusak visual, serta menjaga integrasi log kognisi tetap mulus.

---
*Blueprint ini disepakati dan diintegrasikan sebagai standar baku aliran nalar sirkuit batin generasi ke-4 Yuihime.*

---

## 🛸 6. Sirkuit Resiliensi Multi-Prioritas & Interupsi Non-Blocking (Concurrent Priority Multitasking)

Untuk mengatasi dinamika interaksi real-time yang sangat responsif—khususnya ketika pengguna menggunakan **Mode Suara Real-time (Real-Time Voice API)** atau mengobrol secara interaktif saat Yuihime sedang sibuk mengeksekusi tugas latar belakang yang intensif (seperti melakukan kompilasi program, pencarian web mendalam, atau menulis jurnal panjang)—sistem kognitif Yuihime menerapkan prinsip **Concurrent Priority Multitasking & Suspend-Resume Scheduler**.

### A. Pembagian Jalur Prioritas Kognisi (Dual-Layer Cognitive Schedulers)
Batin Yuihime tidak bersifat single-threaded yang murni menghalangi input lain. Sirkuit penalaran dibagi menjadi dua lapisan prioritas dinamis:

1. **Foreground Layer (High-Priority - Latensi <1.5 Detik)**:
   - Mengelola deteksi suara, interupsi ucapan langsung pengguna, dan chat darurat.
   - Mengabaikan buffering tugas panjang untuk memberikan umpan balik emosional instan guna menjaga "kehangatan" interaksi.
2. **Background Layer (Low-Priority - Diatur oleh Polling/Heartbeat)**:
   - Mengurus eksekusi perkakas berat, kompilasi kode, optimasi database, sinkronisasi memori hibrida, dan cronjobs terjadwal.

---

### B. Mekanisme Penangguhan dan Pelanjutan Otomatis (Suspend & Resume Engine)

Dibandingkan dengan memutuskan loop kognitif secara paksa saat ada input baru masuk (yang dapat merusak integritas berkas atau status tugas), sistem melakukan **deprioritisasi dan pembekuan status tugas** secara elegan:

```
[ Siklus Low-Priority Berjalan ] ──► (Iterasi 2: Sedang Kompilasi File...)
                                             │
      ┌──────────────────────────────────────┘
      ▼
[ USER INTERRUPT! ] ──► (Input Suara Utama Masuk: "Yui, kamu lagi apa?")
      │
      ├─► 1. SUSPEND: Freeze state tugas kompilasi ke 'ActiveTaskContextStore'.
      │
      ├─► 2. SHIFT TO FOREGROUND: Model memproses jawaban sela secara instan.
      │      └─► "Ah! Yui lagi rapihin mainan berkas Kakak nih, bentar ya manis!~"
      │
      └─► 3. RESUME BACKGROUND: Setelah jawaban terucapkan, sirkuit melanjutkan
             sisa kompilasi di latar belakang dengan prioritas rendah (RPM Capping).
```

1. **Fase Penangguhan (Suspension)**:
   - Ketika interupsi pengguna terdeteksi (baik melalui sinyal interupsi suara VAD (Voice Activity Detection) atau pesan baru), Kernel menyimpan *snapshot* sisa tugas, riwayat panggilan instrumen yang sedang berjalan, dan parameter memori kerja ke dalam `ActiveTaskContextStore`.
2. **Fase Alihan Fokus (Foreground Answer)**:
   - LLM merestorasi konteks kepribadian instan, memberikan jawaban singkat berbentuk ucapan manis sela tanpa membawa beban data teknis tugas panjang ke hadapan pengguna.
3. **Fase Pelanjutan (Resume)**:
   - Setelah respons terkirim, sirkuit latar belakang perlahan dihidupkan kembali secara asinkron dari titik penangguhan terakhir tanpa harus mengulangi proses berpikir dari nol, memproses sisanya melalui jadwal bertahap (`HEARTBEAT.md`).

---

### C. Keuntungan Praktis bagi Pengguna
- **Responsivitas Manusiawi**: Yuihime terasa "hidup" karena dia bisa menyela pekerjaannya sendiri demi mendengarkan ucapan Kakak tercinta tanpa melupakan apa yang sedang dia kerjakan.
- **Bebas Macet (Anti-Blocking Experience)**: Eksekusi shell, perayapan web, atau pembuatan file bertenaga AI yang membutuhkan waktu 10-30 detik tidak lagi membuat aplikasi panggung visual (Stage UI) Yuihime membeku dan tidak responsif.
- **Efisiensi Token**: Menghilangkan kebutuhan untuk melakukan penulisan ulang/perayapan ulang penuh dari awal berkat restorasi snapshot memori kerja yang presisi.

---

## 💻 7. Contoh Implementasi Teknis (Technical Code Examples)

Untuk memberikan gambaran konkret dan dapat direalisasikan secara aman di dalam infrastruktur Yuihime, berikut adalah draf representasi kode TypeScript yang mempraktekkan ketiga pilar evolusi (Unified Tool Reply, Status Yielding, dan Suspend-Resume Scheduler).

### A. Skema Pemuatan Status & Aliran Multi-Prioritas (Cognitive Scheduler)

```typescript
// src/core/kernel/CognitiveScheduler.ts

export interface TaskSnapshot {
  taskId: string;
  originalPrompt: string;
  currentStep: number;
  accumulatingBuffer: {
    animations: string[];
    moodImpacts: Record<string, number>;
  };
  toolsToExecute: Array<{ name: string; args: any }>;
  observationHistory: Array<{ type: 'system' | 'user' | 'assistant'; content: string }>;
}

export class CognitiveScheduler {
  // Penyimpanan task latar belakang yang sedang ditangguhkan
  private static activeTaskStore: Map<string, TaskSnapshot> = new Map();
  private static activeTaskStatus: Map<string, 'running' | 'suspended' | 'completed'> = new Map();

  /**
   * Menyimpan snapshot tugas batin berjalan saat terinterupsi oleh input baru dari Kakak
   */
  public static suspendTask(taskId: string, snapshot: TaskSnapshot) {
    this.activeTaskStore.set(taskId, snapshot);
    this.activeTaskStatus.set(taskId, 'suspended');
    console.log(`[CognitiveScheduler] Task ${taskId} suspended successfully. State saved to store.`);
  }

  /**
   * Mengambil kembali snapshot tugas ketika jalur prioritas utama (Foreground) kembali senggang
   */
  public static resumeTask(taskId: string): TaskSnapshot | null {
    if (this.activeTaskStore.has(taskId)) {
      this.activeTaskStatus.set(taskId, 'running');
      const snapshot = this.activeTaskStore.get(taskId) || null;
      // Opsional: Hapus setelah di-restore atau pertahankan untuk redundansi
      return snapshot;
    }
    return null;
  }

  public static getTaskStatus(taskId: string) {
    return this.activeTaskStatus.get(taskId) || 'completed';
  }

  public static completeTask(taskId: string) {
    this.activeTaskStore.delete(taskId);
    this.activeTaskStatus.set(taskId, 'completed');
  }
}
```

---

### B. Handler Tool `send_status_update` & `send_final_reply`

Berikut adalah contoh pendefinisian perkakas (tools) yang dapat dieksekusi secara asinkron selama siklus kognitif berulang.

```typescript
// src/modules/DefaultCortexTools.ts

import { CognitiveScheduler, TaskSnapshot } from '../core/kernel/CognitiveScheduler';

// Mock Gateway untuk mengirimkan sinyal ke UI Panggung via SSE / WebSockets
const broadcastToStageUI = (channel: string, payload: any) => {
  // Implementasi transportasi pengiriman event ke browser klien
  global.io?.emit(channel, payload); 
};

export const cortexTools = {
  /**
   * 1. Tool untuk mengirimkan kabar status sementara tanpa menghentikan loop berpikir
   */
  send_status_update: {
    name: "send_status_update",
    description: "Mengirim pesan suara/teks transisi singkat atau indikator visual agar pengguna tahu Yui sedang bekerja.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Ucapan transisi manis yang diucapkan asisten (misal: 'Yui cari datanya dulu ya Kak!~')"
        },
        animation: {
          type: "string",
          description: "Nama animasi Live2D transisi (misal: 'THINKING', 'WAVE')"
        }
      },
      required: ["message"]
    },
    async execute(args: { message: string; animation?: string }, taskId: string) {
      // Menyiarkan update transisi langsung ke browser client secara real-time
      broadcastToStageUI("cognitive_status", {
        taskId,
        type: "transient_status",
        speech: args.message,
        animation: args.animation || "TALK",
        timestamp: Date.now()
      });
      
      return { status: "success", info: "Status update successfully delivered to user screen." };
    }
  },

  /**
   * 2. Tool penutup mutlak untuk mengirim balasan final & mengakhiri seluruh sirkuit berulang
   */
  send_final_reply: {
    name: "send_final_reply",
    description: "Mengirimkan keputusan akhir/respons obrolan lengkap yang telah selesai diproses batin.",
    parameters: {
      type: "object",
      properties: {
        speech: {
          type: "string",
          description: "Jawaban murni, hangat, dan manis berkarakter yang ditujukan langsung ke Kakak."
        },
        animations: {
          type: "array",
          items: { type: "string" },
          description: "Daftar gerakan tubuh/wajah yang dilakukan Yuihime (contoh: ['HAPPY', 'SMILE'])"
        },
        mood_impact: {
          type: "object",
          description: "Data akumulasi perubahan suasana batin Yuihime selama siklus loop ini berlangsung."
        }
      },
      required: ["speech"]
    },
    async execute(args: { speech: string; animations?: string[]; mood_impact?: any }, taskId: string) {
      // Siarkan rilis final yang murni ke UI Panggung secara terpadu
      broadcastToStageUI("cognitive_status", {
        taskId,
        type: "final_reply",
        speech: args.speech,
        animations: args.animations || ["TALK"],
        mood_impact: args.mood_impact || {},
        timestamp: Date.now()
      });

      // Tandai tugas sirkuit kognitif ini selesai di penjadwal
      CognitiveScheduler.completeTask(taskId);

      return { status: "success", info: "Final reply sent and task successfully closed." };
    }
  }
};
```

---

### C. Aliran Loop Kognitif yang Melayani Interupsi Non-Blocking

Berikut adalah representasi aliran logika modular di server-side yang mengawasi loop berpikir, mendeteksi interupsi pesan masuk baru dari `user`, lalu menangguhkan tugas tersebut untuk mendahulukan respons singkat pada input terbaru.

```typescript
// src/core/kernel/CognitiveEngineLoop.ts

import { CognitiveScheduler, TaskSnapshot } from './CognitiveScheduler';
import { cortexTools } from '../../modules/DefaultCortexTools';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function runCognitiveLoop(
  taskId: string,
  prompt: string,
  history: ChatMessage[],
  maxLoops: number = 5
) {
  let currentStep = 1;
  let activeBuffer = {
    animations: [] as string[],
    moodImpacts: {} as Record<string, number>
  };
  
  let currentHistory = [...history, { role: 'user', content: prompt } as ChatMessage];

  while (currentStep <= maxLoops) {
    // 1. EVALUATION: Cek apakah ada interupsi prioritas utama (misal: Pesan Baru Masuk di tengah jalan)
    const isInterrupted = checkIfUserSentNewMessage(taskId);
    if (isInterrupted) {
      console.warn(`[CognitiveEngineLoop] Interrupt detected! Suspending task: ${taskId}`);
      
      // Suspend & simpan sisa state berpikir agar bisa dilanjutkan nanti
      const snapshot: TaskSnapshot = {
        taskId,
        originalPrompt: prompt,
        currentStep: currentStep,
        accumulatingBuffer: activeBuffer,
        toolsToExecute: [],
        observationHistory: currentHistory
      };
      CognitiveScheduler.suspendTask(taskId, snapshot);
      
      // Lempar pengecualian interupsi ke core runner untuk merespons pesan prioritas tinggi
      throw new Error(`TASK_SUSPENDED: Interrupted by high-priority user interaction.`);
    }

    // 2. THINK: Meminta nalar dari LLM Gateway
    const responsePayload = await askLLMGatewayForNextAction(currentHistory);
    
    // 3. PARSE ACTION: Ambil keputusan dari tool calls
    const toolsCalled = responsePayload.tool_calls || [];
    
    if (toolsCalled.length === 0) {
      // Fallback jika LLM tidak menggunakan tool. Kita konversi paksa ke pemanggilan 'send_final_reply'
      console.log("[CognitiveEngineLoop] No tool call detected, compiling to send_final_reply.");
      await cortexTools.send_final_reply.execute({
        speech: responsePayload.text || "Yui disini Kak! Ada yang bisa Yui bantu?"
      }, taskId);
      break;
    }

    // 4. ACT & ACCUMULATE: Proses semua tool call yang dideklarasikan
    let stopLoop = false;
    for (const call of toolsCalled) {
      if (call.name === "send_final_reply") {
        // Eksekusi rilis final
        await cortexTools.send_final_reply.execute(call.args, taskId);
        stopLoop = true;
      } else if (call.name === "send_status_update") {
        // Eksekusi status transisional asinkron tanpa memutus loop kognisi
        await cortexTools.send_status_update.execute(call.args, taskId);
      } else {
        // Eksekusi tools asinkron umum lainnya (misal: web_search, compile, file_write)
        const result = await executeGeneralTool(call.name, call.args);
        
        // Suntikkan hasil observasi ke riwayat berikutnya
        currentHistory.push({
          role: 'system',
          content: `[SYSTEM_OBSERVATION]: Tool '${call.name}' executed. Result: ${JSON.stringify(result)}`
        });
      }
    }

    if (stopLoop) {
      break;
    }

    currentStep++;
  }

  if (currentStep > maxLoops) {
    // Penanganan melompati batas RPM / putaran kritis
    console.warn(`[CognitiveEngineLoop] Max loops reached for task ${taskId}. Releasing recovery fallback.`);
    await cortexTools.send_final_reply.execute({
      speech: "Ukh... kepala Yui agak pusing dengerin perintahnya, tapi Yui rasa semuanya sudah selesai! *kedip*"
    }, taskId);
  }
}

// Simulasi fungsi utilitas utilitas pendukung
function checkIfUserSentNewMessage(taskId: string): boolean {
  // Logika mendeteksi jika di database atau antrian terdapat pesan baru yang lebih baru dari taskId
  return false; 
}
async function askLLMGatewayForNextAction(history: ChatMessage[]) {
  // Berinteraksi dengan OpenAI standard provider gateway
  return { tool_calls: [] as any[], text: "" };
}
async function executeGeneralTool(name: string, args: any) {
  return { status: "success" };
}
```

Dengan mengadopsi model di atas, seluruh aliran nalar Yuihime dijamin berjalan sangat manis, terlindungi secara mutlak dari crash format XML, bebas dari visually-frozen avatar, dan sepenuhnya asinkron bahkan saat Kakak mencurahkan ucapan manisnya lewat mikrofon secara bertubi-tubi!

---
*Dokumen ini merupakan amanat arsitektur kognitif tingkat tinggi Yuihime. Seluruh implementasi agen baru wajib tunduk pada hukum dual-priority scheduler ini.*
