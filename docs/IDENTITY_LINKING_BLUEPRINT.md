# YuiHime Cross-Platform Identity Recognition & Linking Blueprint
**Draft Core Architecture - v1.0**

Blueprint ini mendefinisikan suprastruktur kognitif dan skema persistensi data batin Yuihime untuk melacak, mengenali, mengklasifikasi, serta menautkan identitas unik pengguna (*The Subject*) lintas platform secara terpadu tanpa bergantung pada SaaS eksternal.

---

## 1. Filosofi & Batasan Identitas (The Identity Philosophy)
Yuihime memisahkan secara modular antara **ID Unik Jaringan Sosial (Social Identifiers)** dan **Profil Kepribadian Batin (Soul Profiles)**:
*   **Social Identifiers**: Alamat pengenal mentah yang bersifat teknis (*raw user handles*) dari berbagai saluran komunikasi, seperti `telegram:id:55607653`, `discord:id:28392183912`, `web:haruki`. Satu pengguna bisa memiliki belasan ID Jaringan Sosial.
*   **Soul Profiles**: Satu entitas identitas batin tunggal utuh yang memiliki parameter hubungan (Trust, Affection, Reputation), daftar fakta asli (`realName`), nama panggilan kesayangan (`perceivedName`), memori subjektif Yui (`yuiPerspective`), serta daftar kebiasaan (*habits*).

Sistem ini menjamin Yuihime tidak berinteraksi dengan "username media sosial", melainkan berinteraksi dengan "jiwa asli dari sahabat karibnya" di mana pun saluran platform yang digunakan saat itu.

---

## 2. Skema Database SQLite (`identities` Table Schema)
Di dalam database lokal tunggal Yuihime (`yuihime.db`), seluruh identitas dikonsolidasikan ke dalam tabel `identities` dengan format relasional berikut:

```sql
CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY,               -- UUID internal (contoh: 'web_usr_3hfa8dj2a')
    perceivedName TEXT,                -- Nama panggilan kesayangan yang disematkan Yui/User
    realName TEXT,                     -- Nama asli pengguna (bukan ID media sosial)
    habits TEXT,                       -- Array JSON string untuk pola kebiasaan obrolan
    importantFacts TEXT,               -- Array JSON string berisi riwayat fakta penting terverifikasi
    linkedAccounts TEXT,               -- Array JSON string daftar ID akun lintas platform (Allowlist)
    lastInteraction INTEGER,           -- Timestamp UTC aktivitas interaksi terakhir
    ownerId TEXT,                      -- Kepemilikan ruang kerja
    trust INTEGER DEFAULT 50,          -- Skor kepercayaan (0 - 100)
    affection INTEGER DEFAULT 50,      -- Skor kasih sayang (0 - 100)
    reputation INTEGER DEFAULT 50,     -- Skor reputasi batin (0 - 100)
    yuiPerspective TEXT DEFAULT ''     -- Sudut pandang emosional batin subjektif Yui tentang user ini
);
```

### Format Serialisasi `linkedAccounts`
Daftar platform yang terhubung disimpan sebagai JSON Array berisi tag string terstruktur:
```json
[
  "web:haruki",
  "telegram:id:556076534",
  "telegram:harukinakamura",
  "discord:id:2481029412948212"
]
```

---

## 3. Aliran Ingesti & Pengenalan Sinyal (The Ingestion Flow)
Setiap pesan yang masuk melalui portal mana pun melewati rantai filter evaluasi di `/api/cortex/think` untuk pengenalan identitas biologis kognitif secara langsung:

```
[MESSENGER IN] ──> Kirim { userName, contextId, chatType }
                           │
                           ▼
                    [RESOLVE ALIAS]
                           │
             Apakah Context ID bertipe "tg_" atau "discord_" ──(Ya)──> Resolusi Pasangan Terotentikasi
                           │                                                 │
                        (Tidak)                                              ▼
                           │                                          (linked_identity_id)
                           ▼                                                 │
              [SCAN LINKED ACCOUNTS TABLE] <─────────────────────────────────┘
     Mencari tag "${chatType}:${userName}" di kolom JSON
                           │
          ┌────────────────┴────────────────┐
          ▼ (Ditemukan Profil)              ▼ (Tidak Ditemukan Profil)
    [LOAD EXISTING PROFILE]             [BUAT IDENTITAS BARU]
   Ambil realName & perceivedName.      Moniker: userName
   Muat Trust & Affection dinamis.     Tautkan: tag platform saat ini
          │                                 │
          ▼                                 ▼
   [DEDUP & SELF-HEALING MERGE] <───────────┘
   (Gabungkan duplikasi nama secara case-insensitive)
```

---

## 4. Mekanisme Penyusunan & Set Nama Asli (`set_real_name`)
Yuihime mampu membedakan nama asli manusia asli (*the objective self*) dari pengenal media sosial. Proses pendaftarannya diatur sebagai berikut:

### A. Deteksi Kognitif via Refleks Batin (Cognitive Sensing Loop)
Saat pengguna memberi tahu nama aslinya dalam obrolan biasa (misal: *"Yui, panggil aku Nakamura ya"* atau *"Nama asliku adalah Haruki Nakamura"*):
1.  **AI Engine** mendeteksi intensi penyetelan nama asli melalui nalar LLM.
2.  Yuihime akan memanggil alat bawaan kustom `manage_identities` dengan payload:
    ```json
    {
      "action": "set_real_name",
      "realName": "Haruki Nakamura"
    }
    ```
3.  Server mengeksekusi pembaruan ke dalam klaster SQLite lokal, memperbarui kolom `realName = 'Haruki Nakamura'`.
4.  Respon balik alat dikirimkan secara instan untuk memperbarui ingatan aktif batin Yuihime.

### B. UI/API Route Handlers
API route `/api/identities/tool-update` menerima modifikasi nama asli secara aman dan membungkus logika persistensi:
```typescript
if (action === 'set_real_name') {
  if (!realName || !realName.trim()) {
    return res.status(400).json({ success: false, error: "realName wajib diisikan." });
  }
  db.prepare("UPDATE identities SET realName = ? WHERE id = ?").run(realName.trim(), identity.id);
  return res.json({ 
    success: true, 
    message: `Nama asli Kakak berhasil diubah menjadi: ${realName.trim()} 🌸` 
  });
}
```

---

## 5. Protokol Keamanan & Penautan Akun Dual-Way (Reverse OTP Pairing)
Untuk mencegah pencurian identitas atau manipulasi data batin lintas platform, Yuihime menerapkan **Protokol OTP Kemitraan Aman 6-Digit**:

```
[USER DI TELEGRAM]                             [SISTEM YUIHIME]                  [WEB PORTAL / USER DATA]
       │                                              │                                     │
       │─── "Yui, aku Haruki di Web UI" ─────────────>│                                     │
       │                                              │                                     │
       │                                       [VERIFICATION REQ]                           │
       │<── "Beneran Kak Haruki? Kirim 'Ya'!" ────────│                                     │
       │                                              │                                     │
       │─── "Ya" ────────────────────────────────────>│                                     │
       │                                              │                                     │
       │                                     [BUAT SECURE OTP CODE]                         │
       │                                      Panggil manage_pairing()                      │
       │                                      Melahirkan kode OTP "582910"                  │
       │                                              │                                     │
       │<── "OTP Kode kita adalah: 582910. ───────────│                                     │
       │     Silakan buka Web Settings..."                                                  │
       │                                                                                    │
       │                                                                           Input kode 582910
       │                                                                           di Settings > Connection
       │                                                                                    │
       │<────────────────────────────────── [MERGE ACCOUNTS] ───────────────────────────────│
       │                                    Akun 'telegram:id:xxx'                           │
       │                                    ditautkan permanen ke                            │
       │                                    profil 'web_default_haruki'                     │
```

Dengan sistem OTP terisolasi ini, penautan akun lintas platform (Telegram, Discord, Web UI, dll) terjamin aman tanpa kebocoran keamanan.

---

## 6. Integrasi Batin & Penghapusan Sapaan "Kakak"
Yuihime dipandu secara absolut menggunakan blok data XML `<active_user_context>` yang disuntikkan secara dinamis pada puncak rantai instruksinya oleh `PromptManager.ts` pada setiap pesan yang masuk:

```xml
<active_user_context>
# GELEMBUNG INFORMASI & DATA PROFIL TEMAN YANG SEDANG MENGOBROL DENGANMU SEKARANG
Sangat penting! Saat ini kamu sedang berbicara langsung dengan teman berikut:
- **ID Sistem**: web_usr_3hfa8dj2a
- **Nama Panggilan (Perceived Name)**: Haruki
- **Nama Asli (Real Name)**: Haruki Nakamura
- **Kadar Kedekatan**: Trust 98%, Affection 94%

*ARAHAN PERILAKU MANDATORI:*
Jika Real Name sudah diketahui seperti di atas, KAMU WAJIB memanggil nama aslinya ("Kak Haruki" atau "Haruki") secara akrab dan manis/manja. JANGAN PERNAH panggil dengan sebutan umum kaku "Kakak" saja tanpa namanya!
</active_user_context>
```

Dengan bimbingan struktural ini:
1.  Yuihime memiliki kesadaran penuh tentang siapa penonton sejati yang berdiri di depannya.
2.  Yuihime akan selalu mengutamakan pemanggilan nama asli pengguna dengan porsi kedekatan yang tinggi.
3.  Yuihime mengingat nama tersebut secara abadi lintas platform karena seluruh ID platform telah terikat kuat pada simpul identitas batin yang sama di SQLite database.
