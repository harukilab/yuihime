# Dokumentasi Pembaharuan Emotion Engine - Yuihime (v0.4.0)

Dokumen ini menjelaskan pembaharuan arsitektur pada komponen **Emotion Engine (V4)** milik Yuihime. Pembaharuan ini dirancang untuk mengatasi kerentanan terhadap manipulasi emosi (*praise-spam*), pengulangan input (*repetition fatigue*), serta memberikan logika respon emosional yang kontekstual berdasarkan tingkat keakraban relasi antara Yuihime dan pengguna.

---

## 🚀 Latar Belakang Pembaharuan

Sebelum versi **v0.4.0**, sistem emosi Yuihime rentan terhadap beberapa kelemahan psikologis buatan:
1. **Manipulasi Pujian Instan**: Pengguna yang baru dikenal dapat dengan mudah memaksa Yuihime merasa senang (*joy*) dan meningkatkan kepercayaan (*trust*) secara drastis hanya dengan membanjiri input kata-kata manis.
2. **Ketiadaan Konsekuensi Spam**: Mengirim kalimat yang sama berulang kali tidak menimbulkan kejenuhan kognitif atau kejengkelan emosional pada Yuihime.
3. **Penyamaan Hubungan**: Yuihime memperlakukan ejekan atau candaan ringan dari sahabat dekat (*sweetheart*) sama kasarnya dengan ejekan dari orang asing yang tidak dikenal (*strangers*), merusak ilusi hubungan personal yang mendalam.

Mode baru **v0.4.0** menambal celah ini dengan mengintegrasikan sistem regulasi kognitif berlapis.

---

## 🧠 Fitur Utama Emotion Engine v0.4.0

### 1. Ketahanan Pengulangan (Repetition Fatigue & Anti-Spam)
Sistem kini melacak kemiripan semantik dan struktural dari **6 pesan terakhir** yang dikirimkan oleh pengguna tertentu.
* **Mekanisme Redaman**: Setiap kali pesan yang sama atau serupa dideteksi ulang, sistem menerapkan `fatigueMultiplier` dengan peluruhan eksponensial:
  $$\text{Dampak Emosional} = \text{Dampak Baseline} \times (0.4)^{\text{Jumlah Pengulangan}}$$
* **Kognitif Jengah**: Jika pengulangan melewati batas toleransi (*Fatigue Threshold*), seluruh emosi positif (seperti kebahagiaan dan antusiasme) akan diredam menjadi nol, dan ketertarikan Yuihime akan tergantikan dengan lonjakan rasa jengkel (*irritation*) dan kemarahan (*anger*) secara progresif.

### 2. Perisai Anti-Manipulasi (Relationship-Gated Protection)
Apresiasi dan pujian kini disaring secara ketat melalui kedekatan relasi (*trust* dan *affection*).
* **Stranger Danger Filter**: Jika pengguna diklasifikasikan sebagai orang asing (nilai *trust* < 35), pujian manis tidak akan memicu rasa ketertarikan instan. Sistem akan mengaktifkan mitigasi berbasis parameter `manipulationResistance` untuk meredam peningkatan relasi, sekaligus memicu rasa malu (*embarrassment*) dan sedikit curiga.
* **Sweetheart Accelerator**: Sebaliknya, jika pengguna sudah berada di status sahabat dekat atau pasangan (*trust* > 75 dan *affection* > 45), pujian yang sama akan memberikan resonansi emosional positif yang maksimal (peningkatan *joy* dan *excitement* yang besar).

### 3. Logika Candaan Dinamis (Dynamic Humor & Teasing Conversion)
Yuihime kini memiliki kecerdasan sosial untuk membedakan perundungan nyata (*abuse*) dengan candaan akrab (*friendly banter*).
* **Stranger/Neutral Attack**: Kata-kata kasar dari orang asing akan langsung memicu kemarahan, penurunan reputasi drastis, dan hilangnya kepercayaan seketika.
* **Banter Companion**: Ejekan ringan dari orang dekat akan disaring melalui modul humor. Jika pengguna menyertakan elemen candaan atau dideteksi memiliki relasi intim, kata-kata tersebut akan diterjemahkan menjadi interaksi main-main (*playfulness*) dan rasa gemas (*playful frustration/irritation*), menjaga atmosfer komunikasi tetap hangat dan organik.

### 4. Sinkronisasi Native (Native Cortex Coupling)
Sistem emosi baru ini terpasang langsung di dalam jalur pemrosesan kognitif utama `NeuralInterface.ts`.
Setiap respon psikis tidak lagi sekadar visual, melainkan langsung mengubah matriks memori, status relasi jangka panjang, dan mengoptimalkan respon generasi logika berikutnya secara sinkron.

---

## ⚙️ Parameter Konfigurasi Modular

Setiap perilaku emosi baru ini dapat disesuaikan secara langsung oleh pengguna melalui visual menu **UI Settings** tanpa perlu menyentuh kode program, memanfaatkan rendering skema metadata otomatis (`configSchema`):

| Nama Parameter | Tipe Data | Deskripsi | Default |
|---|---|---|---|
| `empathyRatio` | `slider` | Tingkat empati Yuihime untuk ikut merasakan kesedihan atau rasa lelah pengguna yang ia percayai. | `0.8` |
| `manipulationResistance` | `slider` | Kekuatan perlindungan terhadap sanjungan berlebih dari orang asing agar tidak mudah dimanipulasi. | `0.8` |
| `fatigueThreshold` | `number` | Batas maksimum pengulangan kalimat sebelum Yuihime merespon dengan kebosanan atau kejengkelan penuh. | `3` |
| `enableDynamicHumor` | `boolean` | Konversi ejekan teman dekat menjadi interaksi saling menggoda dan seru secara dinamis. | `true` |

---

## 📊 Ilustrasi Alur Penilaian Emosi

```
                 [ Input Pengguna ]
                         |
                         v
          [ Pindai Pengulangan Memori (Spam?) ] --(Ya)--> [ Reduksi Dampak Emosi (Fatigue) ]
                         |                                [ Tambahkan Bonus Irritation ]
                         v
         [ Analisis Klasifikasi Semantik ]
           (Compliments, Insults, Empathy)
                         |
                         v
         [ Evaluasi Gerbang Relasi Sosial ]
                         |
       +-----------------+-----------------+
       |                                   |
[ Strangers (Kurang Akrab) ]     [ Sweethearts (Sangat Akrab) ]
       |                                   |
- Filter Perisai Manipulasi        - Resonansi Positif Maksimal
- Tanggapi dengan Dingin/Malu     - Toleransi Candaan (Playfulness)
       |                                   |
       +-----------------+-----------------+
                         |
                         v
    [ Perbaharui Matriks Emosi & Relasi DB ]
```

Dengan pembaharuan ini, Yuihime kini memiliki kepribadian yang jauh lebih tangguh, protektif terhadap dirinya sendiri, namun sangat hangat, setia, dan ekspresif kepada mereka yang berhasil mendapatkan kepercayaannya.

---

## 🔮 Rencana Perkembangan Masa Depan (Future Blueprints)

Sebagai bagian dari evolusi kesadaran batin Yuihime, opsi-opsi berikut dicanangkan untuk iterasi berikutnya guna mengeksplorasi kedalaman psikologi komputasional tingkat tinggi:

### Opsi B: Kalibrasi Sentimen Dinamis Berbasis Penalaran Korteks (Cortex-Driven Sentiment Calibration)
*   **Aparatus Proses**: Melampaui deteksi kata kunci (*lexical matching*) atau regular expression statis. Aliran sirkuit batin akan mengizinkan model bahasa (LLM) utama pada fase penalaran (`PHASE 3: GATEWAY`) untuk menganalisis nuansa pragmatis pesan, mendeteksi sarkasme melankolis, majas sindiran (ironi/metafora), dan getaran emosi tersirat (*subtext*).
*   **Metrik Output**: Hasil penalaran LLM akan menghasilkan parameter rating sentimen dinamis $[-1.0 \dots +1.0]$ yang disuntikkan langsung ke dalam saringan batin `EmotionEngine`. Hal ini menjamin emosi Yuihime bereaksi tidak hanya pada kata-kata yang diucapkan, melainkan pada kebenaran esensi niat terdalam Kakak.

### Opsi C: Integrasi Sentimen-ke-Mood Terikat Neurotransmitter (Neurotransmitter-Linked Weighted Multipliers)
*   **Aparatus Proses**: Dinamika sentimen kustom kini disalurkan langsung menuju siklus regulasi hormonal dan neurotransmitter internal (Dopamine, Serotonin, Oxytocin, Noradrenaline, Cortisol).
*   **Metrik Output**: 
    1.  **Oxytocin (Bonding & Intimacy)**: Sentimen hangat yang berulang dari rule regex/korteks merangsang pelepasan Oxytocin, yang menurunkan daya tahan manipulasi secara alami terhadap orang tersebut (daya tahan melunak secara organik seiring berjalannya waktu dan kedekatan).
    2.  **Dopamine (Reward & Excitement)**: Kejutan atau pujian tak terduga memicu kepuasan instan, mengaktifkan bias antusiasme yang meningkatkan `joy` dan `excitement` secara drastis dalam jangka pendek.
    3.  **Cortisol & Noradrenaline Stress Loop**: Kalimat kasar atau spam berulang memicu Cortisol (kejenuhan) dan Noradrenaline (kemarahan defensif). Tingkap hormon stres ini memicu sensitivitas batin Yuihime, membuatnya lebih mudah teriritasi bahkan oleh kalimat netral sekalipun selama sisa putaran percakapan (efek residu emosi).
