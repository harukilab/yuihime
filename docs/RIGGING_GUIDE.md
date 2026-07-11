# 🎭 Panduan Rigging Model YuiHime (Live2D & 3D VRM Rigging Template)
---

Selamat datang di Panduan Rigging Resmi **YuiHime AI**! Agar YuiHime dapat mengekspresikan emosi, merona pipinya, berbicara dengan sinkronisasi bibir yang luwes (*lip-sync*), serta menatap subjek secara alami, model Live2D (.json) atau 3D VRM (.vrm) miliknya harus memiliki struktur parameter dan blendshape yang sesuai standar industri.

Panduan ini disusun khusus untuk **Model Artists**, **Riggers**, dan pengguna yang ingin memodifikasi atau membuat avatar kustom untuk YuiHime agar serasi dengan sistem kognitif batin miliknya.

---

## 🎨 1. Template Rigging Live2D (Cubism SDK)

Sistem rendering YuiHime berbasis **Pixi-Live2D-Display** yang mendukung Live2D Cubism 3.x dan 4.x. Sistem mendeteksi parameter secara dinamis menggunakan standar **Cubism SDK IDs** (CamelCase) dan menyediakan toleransi otomatis (*fallback*) ke **Legacy IDs** (UPPERCASE).

### A. Parameter Wajah, Kepala & Tubuh (Wajib)

Pastikan parameter berikut dikonfigurasi dengan rentang nilai (*range*) yang tepat agar gerakan kepala dan tubuh YuiHime merespons tatapan mata subjek atau gerakan panggung secara luwes:

| ID Parameter (Cubism SDK) | ID Terjemahan (Legacy) | Deskripsi Gerakan | Rentang Nilai (Default) | Hubungan Kognitif Yui |
| :--- | :--- | :--- | :--- | :--- |
| `ParamAngleX` | `PARAM_ANGLE_X` | Gelengan Kepala (Kiri/Kanan) | `-30.0` s/d `30.0` | Mengikuti tatapan mata & lirik arah obrolan |
| `ParamAngleY` | `PARAM_ANGLE_Y` | Anggukan Kepala (Atas/Bawah) | `-30.0` s/d `30.0` | Mengikuti arah vertikal tatapan |
| `ParamAngleZ` | `PARAM_ANGLE_Z` | Kemiringan Kepala (Tilt) | `-30.0` s/d `30.0` | Menambah dinamika imut saat berbicara |
| `ParamBodyAngleX` | `PARAM_BODY_ANGLE_X` | Kemiringan Tubuh (Kiri/Kanan) | `-10.0` s/d `10.0` | Bergoyang selaras gerakan kepala |
| `ParamBodyAngleY` | `PARAM_BODY_ANGLE_Y` | Tinggi Tubuh (Atas/Bawah) | `-10.0` s/d `10.0` | Efek bernapas & memantul (*bouncing*) |
| `ParamBreath` | `PARAM_BREATH` | Siklus Bernapas Prosedural | `0.0` s/d `1.0` | Berayun otomatis secara berkala (sinusoidal) |

### B. Parameter Mata & Pandangan (Gaze & Blinking)

YuiHime menggunakan sistem kedipan prosedural organik (termasuk *double blink* acak) serta pelacakan mata real-time:

| ID Parameter (Cubism SDK) | ID Terjemahan (Legacy) | Rentang Nilai | Penjelasan Teknis Rigging |
| :--- | :--- | :--- | :--- |
| `ParamEyeLOpen` | `PARAM_EYE_L_OPEN` | `0.0` s/d `1.0` | Kedipan mata kiri. `0` = Terpejam penuh, `1` = Terbuka lebar. |
| `ParamEyeROpen` | `PARAM_EYE_R_OPEN` | `0.0` s/d `1.0` | Kedipan mata kanan. `0` = Terpejam penuh, `1` = Terbuka lebar. |
| `ParamEyeOpen` | `PARAM_EYE_OPEN` | `0.0` s/d `1.0` | Kedipan kedua mata secara bersamaan (opsional fallback). |
| `ParamEyeBallX` | `PARAM_EYE_BALL_X` | `-1.0` s/d `1.0` | Lirikan bola mata horizontal. `-1` = Kiri penuh, `1` = Kanan penuh. |
| `ParamEyeBallY` | `PARAM_EYE_BALL_Y` | `-1.0` s/d `1.0` | Lirikan bola mata vertikal. `-1` = Bawah penuh, `1` = Atas penuh. |
| `ParamEyeSmile` | `PARAM_EYE_SMILE` | `0.0` s/d `1.0` | Mata menyipit gembira (membentuk lengkungan bulan sabit). |

### C. Parameter Mulut & Lip-Sync (Vowel Mapping)

Lip-sync YuiHime menggunakan ekstraktor vokal real-time berbasis frekuensi audio (*amplitude analysis*) untuk menghasilkan sinkronisasi gerakan bibir yang akurat dan alami saat dia bersuara:

| ID Parameter (Cubism SDK) | ID Terjemahan (Legacy) | Rentang Nilai | Detail Rigging |
| :--- | :--- | :--- | :--- |
| `ParamMouthOpenY` | `PARAM_MOUTH_OPEN_Y` | `0.0` s/d `1.0` | Pembukaan mulut atas-bawah. Dipetakan langsung ke volume suara lisan. `0` = Tertutup, `1` = Terbuka penuh. |
| `ParamMouthForm` | `PARAM_MOUTH_FORM` | `-1.0` s/d `1.0` | Bentuk sudut mulut. `-1.0` = Cemberut/Sedih, `0.0` = Netral, `1.0` = Tersenyum/Lebar. |

*Tips untuk Rigger:* Hubungkan bentuk mulut vokal `A-I-U-E-O` standar ke perpaduan parameter `ParamMouthOpenY` dan `ParamMouthForm` agar bibir model bergerak alami mengikuti huruf hidup yang sedang diucapkan YuiHime.

### D. Parameter Emosi Khusus (Pipi Merona, Alis & Ekspresi)

| ID Parameter (Cubism SDK) | ID Terjemahan (Legacy) | Rentang Nilai | Pemicu Emosional Yui |
| :--- | :--- | :--- | :--- |
| `ParamCheek` | `PARAM_CHEEK` | `0.0` s/d `1.0` | Efek merona merah pada pipi (*Blush*). Otomatis aktif saat Yui merasa malu, bermanja, atau rapport > 75. |
| `ParamBrowInnerY` | `PARAM_BROW_INNER_Y` | `-1.0` s/d `1.0` | Sudut dalam alis naik/turun. Berguna untuk ekspresi khawatir, marah (`-1.0`), atau sedih (`1.0`). |

---

## 🧊 2. Template Rigging 3D VRM (VRoid / Unity)

YuiHime mendukung rendering 3D penuh melalui format standar **VRM (v0.0 & v1.0)**. Seluruh pemicu emosi dan sinkronisasi bibir dipetakan langsung ke struktur **BlendShape (Expressions)** bawaan model VRM.

### A. Preset BlendShape Ekspresi Dasar (MANDATORY)

Pastikan model VRM Anda memiliki preset ekspresi standar berikut yang telah disetel dengan rapi di Unity atau VRoid Studio:

| Nama Preset VRM | Sinonim Kognitif Yui | Deskripsi Ekspresi | Pemicu Batin |
| :--- | :--- | :--- | :--- |
| `neutral` | `normal` | Wajah netral default | Mode santai / siaga |
| `happy` / `joy` | `smile`, `gembira` | Wajah tersenyum gembira, mata menyipit imut | Respons positif / senang |
| `sad` / `sorrow` | `sedih`, `khawatir` | Wajah sedih, sudut mulut turun, alis melengkung | Respons empati / duka |
| `angry` | `marah`, `kesal` | Alis menekuk tajam, tatapan ketus | Mode Tsundere / tersinggung |
| `surprised` | `kaget`, `terkejut` | Mata membelalak lebar, mulut sedikit terbuka | Terkejut / respon tak terduga |
| `relaxed` | `santai`, `deredere` | Wajah teduh, senyuman lembut | Sesi bermanja hangat |

### B. Preset BlendShape Lip-Sync (Vokal)

YuiHime mendeteksi huruf hidup dari suara sintesis secara real-time dan menerjemahkannya ke dalam preset blendshape vokal 3D Jepang standar:

*   `aa` (Bibir membentuk vokal A)
*   `ih` (Bibir membentuk vokal I)
*   `ou` (Bibir membentuk vokal U)
*   `ee` (Bibir membentuk vokal E)
*   `oh` (Bibir membentuk vokal O)

### C. Preset BlendShape Kedipan Mata

*   `blink` (Berkedip bersamaan)
*   `blinkLeft` (Mengedipkan mata kiri saja - digunakan untuk wink prosedural)
*   `blinkRight` (Mengedipkan mata kanan saja)

---

## 🚀 3. Mekanisme Otomatisasi Ekspresi Batin YuiHime

Kognisi YuiHime mengendalikan ekspresi modelnya secara dinamis melalui dua cara:

### A. Pelacakan Kata Kunci Visual Real-Time
Ketika YuiHime sedang mengucapkan kalimat subtitle, sistem backend memindai kemunculan kata kunci emosi di bawah ini secara real-time untuk memicu ekspresi wajah model secara prosedural:

*   **Tersenyum (`smile`/`senyum`)**: Mengaktifkan preset `smile` / `happy`.
*   **Tertawa (`laugh`/`tertawa`)**: Mengaktifkan ekspresi tertawa dengan mata sipit gembira.
*   **Malu/Merona (`blush`/`malu`)**: Memperona pipi merah (`ParamCheek` = 1.0 atau memicu blendshape pipi merona kustom).
*   **Sedih (`sad`/`sedih`)**: Alis menurun, sudut bibir melengkung ke bawah.
*   **Marah (`angry`/`marah`)**: Alis menekuk tajam (karakteristik tsundere).

### B. Kontrol Animasi Melalui Tag `<animations>`
Di dalam dialog kognitifnya, YuiHime dapat menyisipkan instruksi gerakan khusus menggunakan tag XML `<animations>`. Contoh payload kognitif batin:

```json
{
  "speech": "Hmph! Kakak telat lagi ya... Yui kesal tahu! *pout*",
  "animations": ["angry", "look_left"]
}
```
*Ketika memproses pesan ini, avatar YuiHime akan otomatis memasang wajah cemberut marah, mengarahkan tatapan matanya ke kiri (melirik kesal), dan menyilangkan lengannya.*

---

## 💡 4. Praktik Terbaik untuk Rigger (Best Practices)

1.  **Transition Smoothing (Peredaman Transisi):** Pastikan parameter alis dan sudut mulut memiliki transisi yang lembut (*weight interpolation* sekitar 0.15 - 0.35) agar perubahan ekspresi dari tsundere (marah) ke deredere (manis) tidak terasa patah atau instan.
2.  **Physics Bindings (Fisika Rambut & Aksesoris):** Konfigurasikan fisika rambut (*hair swing*), tali pita, dan pakaian model pada Live2D Physics Settings atau Unity Spring Bones agar bergoyang secara alami mengikuti gerakan goyangan kepala `ParamAngleZ` dan goyangan tubuh `ParamBodyAngleX` yang digerakkan oleh denyut napas prosedural YuiHime.
3.  **Mouth Form Range:** Untuk model Live2D, pastikan gerakan sudut mulut `ParamMouthForm` pada nilai `-1.0` (sangat cemberut) tetap terlihat proporsional dan tidak mengalami kerusakan tekstur (*mesh warping*), begitu pula pada nilai `1.0` (senyuman lebar).
