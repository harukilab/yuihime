# @yui/cognition - The AI & Reasoning Layer

Bagian ini adalah otak dari Yuihime, tempat semua proses berpikir dan simulasi kepribadian terjadi.

## 🧩 Komponen Utama

### 1. Cortex (`cortex.ts`)
Orkestrator utama dari loop berpikir (ReAct Loop). 
- Menghubungkan input pengguna dengan memori dan alat.
- Mengontrol iterasi pemikiran AI.

### 2. Soul (`soul.ts`)
Mengelola kondisi emosional (mood, temperamen). Emosi ini diekstrak dari respon AI dan memengaruhi avatar Live2D serta gaya bahasa di masa depan.

### 3. Registry (`registry.ts`)
Daftar inventori modul kognitif dan alat sistem. Digunakan oleh Cortex untuk mencari kemampuan apa saja yang tersedia saat ini.

### 4. Dynamic Loader (`DynamicLoader.ts`)
Memungkinkan sistem memuat plugin baru dari folder `/addons` secara otomatis tanpa harus memodifikasi kode inti atau melakukan build ulang.

### 5. Memory Hub (`MemoryModule.ts`, `RAGModule.ts`)
Mengelola pengambilan konteks dari masa lalu (Short-Term & Long-Term Memory).

## 🔄 Cognitive Workflow

Ketika input masuk:
1.  **Cortex** memicu `eventBus` untuk memberi tahu sistem bahwa proses berpikir dimulai.
2.  **Context Compression** merangkas sejarah obrolan agar hemat token namun tetap relevan.
3.  **Knowledge Retrieval** menarik fakta penting dari grafik pengetahuan.
4.  **Neural Sync** mengirim prompt ke LLM.
5.  Hasil divalidasi oleh **Neural Validator**.
6.  Jika AI memanggil **Tools**, sistem mengeksekusi aksi dan mengembalikan hasilnya ke siklus berpikir berikutnya.

## 💡 Keamanan & Integritas
- **AI Centralization**: Semua akses ke penyedia LLM (Gemini, dll) harus melalui `ProviderGatewayModule`.
- **Zod Enforcement**: Setiap input ke kognisi divalidasi agar meminimalisir kesalahan pemrosesan.
