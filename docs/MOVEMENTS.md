# 🎭 Daftar Gerakan VTuber (Animation Movements)

> 💡 **Mencari Panduan Rigging Model?** Jika Anda seorang Model Artist atau Rigger, silakan baca [Panduan Rigging Model YuiHime](./RIGGING_GUIDE.md) untuk mempelajari struktur parameter Live2D dan blendshape VRM yang wajib disiapkan agar avatar dapat bergerak selaras dengan batin Yui.

Berikut adalah daftar perintah gerakan yang dapat dipahami oleh sistem VTuber Avatar. LLM dapat menyertakan perintah ini dalam struktur JSON `animations`.

## Gerakan Fisik (Motions)

| Perintah (Key) | Sinonim / Bahasa Indonesia | Hasil Gerakan (Mapped Motion) |
| :--- | :--- | :--- |
| `nod` | `angguk`, `kait`, `tilts` | Mengangguk (Yes) |
| `shake` | `geleng` | Menggeleng (No) |
| `wave` | `melambai`, `lambai` | Melambaikan tangan |
| `touch` | `tap` | Menepuk tubuh / bereaksi terhadap sentuhan |
| `blink` | `kedip`, `kedipan` | Berkedip (Prosedural) |
| `wink` | `kedip_sebelah` | Mengedipkan satu mata (Kiri) |

## Ekspresi Emosional (Expressions)

| Perintah (Key) | Sinonim / Bahasa Indonesia | Ekspresi |
| :--- | :--- | :--- |
| `smile` | `senyum` | Tersenyum |
| `laugh` | `tawa`, `ketawa`, `tertawa` | Tertawa |
| `surprise` | `kaget`, `terkejut` | Terkejut / Kaget |
| `embarrassed`| `malu`, `blush` | Wajah memerah / Malu |
| `sad` | `sedih` | Sedih |
| `angry` | `marah` | Marah |
| `think` | `pikir`, `mikir` | Pose berpikir |

## Arah Pandangan (Gaze & Look)

Sistem secara otomatis mengarahkan mata dan kepala sesuai arah yang diminta.

| Perintah (Key) | Sinonim / Bahasa Indonesia | Arah Pandangan |
| :--- | :--- | :--- |
| `look_left` | `lirik_kiri` | Melirik ke kiri |
| `look_right` | `lirik_kanan` | Melirik ke kanan |
| `look_up` | `tengok_atas` | Melihat ke atas |
| `look_down` | `tengok_bawah` | Melihat ke bawah |
| `look_center` | `pusat` | Melihat kembali ke tengah (Kamera) |
| `look_at_chat`| - | Melihat ke arah chat |

## Kata Kunci Tambahan (Fuzzy Match)

Sistem juga mendukung pencarian kata kunci di dalam string. Jika kata berikut ada di dalam perintah `animations`, sistem akan mencoba menyesuaikan:
- `left` / `kiri`
- `right` / `kanan`
- `up` / `atas`
- `down` / `bawah`
- `center` / `pusat`

---
*Catatan: Jika model Live2D memiliki gerakan khusus dengan nama yang sama, sistem akan memprioritaskan gerakan asli dari model tersebut.*
