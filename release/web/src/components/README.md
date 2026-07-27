# @yui/interfaces - Frontend UI Components

Layer ini mencakup semua antarmuka pengguna yang digunakan untuk berinteraksi, memantau, dan mengkonfigurasi agen.

## 🎨 Layout & Design

UI dibangun menggunakan **React 19** dan **Tailwind CSS v4** dengan fokus pada estetika *Cybernetic/Modern*.

### 1. Dashboard (`App.tsx`)
Pusat kendali utama yang berisi tab untuk:
-   **Console**: Chat interaktif dan feed sistem.
-   **Knowledge**: Grafik visual informasi yang dipelajari.
-   **Memory**: Pencarian memori jangka panjang.
-   **Settings**: Konfigurasi model AI, suara, dan identiti.

### 2. VTuber Avatar (`VTuberAvatar.tsx`)
Komponen visual yang merender model Live2D. 
-   Menggunakan **PixiJS**.
-   Merespon secara otomatis terhadap emosi yang dihasilkan oleh `Soul` melalui sinkronisasi emosi (*expression sync*).

### 3. Neural Chain (`VisualWorkflowEditor.tsx`)
Visualisasi real-time dari arsitektur kognitif. Menampilkan modul apa saja yang sedang aktif di dalam **Registry**.

## 🛠️ Cara Menambah UI Baru

1. Buat komponen baru di `src/components/`.
2. Gunakan **Motion/React** untuk animasi transisi yang halus.
3. Ikuti standar desain di `index.css` (Gunakan variabel tema `@theme`).
4. Daftarkan router atau tab baru di `App.tsx`.

## 📱 Mobile Responsiveness
UI didesain dengan pendekatan *Desktop-First* namun tetap *Fluid* di perangkat mobile. Gunakan utility classes `sm:`, `md:`, dan `lg:` untuk penyesuaian tata letak.
