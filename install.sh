#!/usr/bin/env bash

# ==============================================================================
#                 YUIHIME AUTONOMOUS INSTALLER & SETUP ENGINE
#                      Support: Arch Linux & Ubuntu/Debian
# ==============================================================================
#
# NOTICE:
# Skrip ini mengotomatiskan penyiapan dependensi kognitif batin Yuihime,
# mendukung instalasi Node.js luring/daring, pembangunan aset frontend/backend,
# kompilasi biner mandiri (single-binary via pkg) serta konfigurasi Systemd service.
#

set -e

# Warna Terminal untuk Pengalaman Estetis (Aura Cyan/Blue Yuihime)
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
NC='\033[0;37m' # No Color
BOLD='\033[1m'

# Menampilkan Banner Visual Yuihime yang Cantik
clear
echo -e "${CYAN}${BOLD}"
echo "    ██╗   ██╗██╗   ██╗██╗██╗  ██╗██╗███╗   ███╗███████╗"
echo "    ╚██╗ ██╔╝██║   ██║██║██║  ██║██║████╗ ████║██╔════╝"
echo "     ╚████╔╝ ██║   ██║██║███████║██║██╔████╔██║█████╗  "
echo "      ╚██╔╝  ██║   ██║██║██╔══██║██║██║╚██╔╝██║██╔══╝  "
echo "       ██║   ╚██████╔╝██║██║  ██║██║██║ ╚═╝ ██║███████╗"
echo "       ╚═╝    ╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝"
echo -e "   [ Autonomous Cognitive Vtuber Core Setup - v5.82 ]${NC}\n"

echo -e "${BLUE}===============================================================${NC}"
echo -e "   Skrip Instalasi Otomatis untuk ${BOLD}Arch Linux${NC} dan ${BOLD}Ubuntu / Debian${NC}"
echo -e "   Direktori Operasi Sasar: ${YELLOW}${BOLD}$(pwd)${NC}"
echo -e "${BLUE}===============================================================${NC}\n"

# Fungsi Memeriksa Hak Akses Root (Skrip utama harus dijalankan sebagai USER biasa yang memiliki akses sudo)
check_root_safety() {
    if [ "$EUID" -eq 0 ]; then
        echo -e "${RED}${BOLD}[ERR] Jangan jalankan skrip ini langsung sebagai ROOT.${NC}"
        echo -e "      Gunakan pengguna sistem biasa (non-root) yang memiliki hak akses 'sudo'."
        echo -e "      Pemasangan npm paket di atas root secara langsung dapat merusak hak izin direktori proyek."
        exit 1
    fi
}

# Deteksi Distro Linux
detect_operating_system() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID=$ID
        OS_NAME=$NAME
    else
        OS_ID=$(uname -s | tr '[:upper:]' '[:lower:]')
        OS_NAME=$(uname -s)
    fi

    echo -e "${CYAN}[1/5] Mendeteksi Lingkungan OS Host...${NC}"
    echo -e "      Sistem Terdeteksi: ${GREEN}${BOLD}${OS_NAME} (${OS_ID})${NC}"
}

# Memasang Alat Pengembang / Kompiler Sistem (GCC, Make, Python)
install_system_dependencies() {
    echo -e "\n${CYAN}[2/5] Memasang dependensi sistem dan perkakas kompilator native...${NC}"
    echo -e "      (Sangat dibutuhkan untuk mengompilasi modul C++ database SQLite/better-sqlite3)\n"

    case "$OS_ID" in
        ubuntu|debian|pop|mint|elementary)
            echo -e "  » ${YELLOW}Menjalankan pembaruan cache paket APT (${BOLD}sudo apt-get update${YELLOW})...${NC}"
            sudo apt-get update -y
            echo -e "  » ${YELLOW}Memasang compiler, curl, git, dan python3...${NC}"
            sudo apt-get install -y build-essential curl git python3-minimal
            ;;
        arch|manjaro|endeavouros)
            echo -e "  » ${YELLOW}Memasang kelompok paket 'base-devel', curl, git, dan python...${NC}"
            sudo pacman -Syu --needed --noconfirm base-devel curl git python
            ;;
        *)
            echo -e "${YELLOW}[WARN] Distro '${OS_ID}' belum diuji secara formal.${NC}"
            echo -e "       Mencoba memasang alat dasar secara generatif menggunakan manajer paket lokal..."
            if command -v apt-get &> /dev/null; then
                sudo apt-get update -y && sudo apt-get install -y build-essential curl git python3-minimal
            elif command -v pacman &> /dev/null; then
                sudo pacman -S --needed --noconfirm base-devel curl git python
            else
                echo -e "${RED}[ERR] Manajer paket tidak didukung. Silakan pasang 'gcc', 'g++', 'make', 'python' manual.${NC}"
                exit 1
            fi
            ;;
    esac
    echo -e "${GREEN}✓ Sukses memasang pembangun sistem native.${NC}"
}

# Memastikan Keberadaan Node.js Mutakhir (Node.js >= v20)
ensure_modern_nodejs() {
    echo -e "\n${CYAN}[3/5] Memverifikasi runtime JavaScript (Node.js & npm)...${NC}"
    
    NODE_INSTALLED=false
    if command -v node &> /dev/null; then
        NODE_VER=$(node -v | cut -d'v' -f2)
        NODE_MAJOR=$(echo "$NODE_VER" | cut -d'.' -f1)
        
        if [ "$NODE_MAJOR" -ge 20 ]; then
            echo -e "      Node.js terpasang: ${GREEN}v${NODE_VER}${NC} (Sesuai kriteria minimum >= v20)"
            NODE_INSTALLED=true
        else
            echo -e "      Node.js terpasang: ${YELLOW}v${NODE_VER}${NC} (${RED}Terlalu usang! Minimal v20 diperlukan${NC})"
        fi
    fi

    if [ "$NODE_INSTALLED" = false ]; then
        echo -e "      Menyiapkan pemasangan Node.js v20 LTS terbaru secara otomatis...\n"
        
        case "$OS_ID" in
            ubuntu|debian|pop|mint|elementary)
                echo -e "  » ${YELLOW}Mengonfigurasi repositori resmi NodeSource untuk Node.js v20 LTS...${NC}"
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                echo -e "  » ${YELLOW}Memasang Node.js mutakhir...${NC}"
                sudo apt-get install -y nodejs
                ;;
            arch|manjaro|endeavouros)
                echo -e "  » ${YELLOW}Memasang Node.js & npm melalui Arch Extra Repository...${NC}"
                sudo pacman -S --needed --noconfirm nodejs npm
                ;;
            *)
                echo -e "${RED}[ERR] Gagal memasang Node.js secara otomatis untuk distro '${OS_ID}'.${NC}"
                echo -e "      Silakan pasang Node.js (versi >= 20) dan NPM manual sebelum menjalankan ulang skrip."
                exit 1
                ;;
        esac
    fi

    # Menampilkan Status Terkini
    echo -e "      » Node.js: ${GREEN}${BOLD}$(node -v)${NC}"
    echo -e "      » NPM:     ${GREEN}${BOLD}v$(npm -v)${NC}"
}

# Memasang Dependensi NPM Proyek dan Membangun Aplikasi
install_and_build_yuihime() {
    echo -e "\n${CYAN}[4/5] Memulai penyelarasan repositori kognitif Yuihime...${NC}"
    
    # Masuk ke folder jika berada di luar (mengasumsikan skrip diletakkan di root proyek)
    cd "$(dirname "$0")"

    # Pembuatan fallback folder tersembunyi .yuihime sesuai blueprint
    echo -e "  » ${YELLOW}Membuat direktori kerja terisolasi './.yuihime/...${NC}"
    mkdir -p ./.yuihime/data/
    mkdir -p ./.yuihime/user_data/
    mkdir -p ./.yuihime/agent/
    mkdir -p ./.yuihime/addons/

    # Salin contoh konfigurasi jika belum ada
    if [ ! -f ./.env ] && [ -f .env.example ]; then
        echo -e "  » ${YELLOW}Mencadangkan cetak-biru berkas rahasia .env...${NC}"
        cp .env.example .env
    fi

    # Memasang dependensi Node
    echo -e "  » ${YELLOW}Menjalankan pemuatan berkas modul npm (${BOLD}npm install${YELLOW})...${NC}"
    npm install

    # Menawarkan Opsi Kompiler: Reguler atau Single Binary
    echo -e "\n${MAGENTA}${BOLD}=================== OPSI DISTRIBUSI YUIHIME ===================${NC}"
    echo -e "  1) ${BOLD}Mode Standard Full-Stack (Direkomendasikan)${NC}"
    echo -e "     - Membangun antarmuka web dan runtime hibrida Express."
    echo -e "     - Dijalankan lewat Node.js secara konvensional: 'npm run start'."
    echo -e "  2) ${BOLD}Mode Standalone Single-Binary Executable${NC}"
    echo -e "     - Mengompilasikan seluruh isi proyek menjadi satu modul biner mandiri."
    echo -e "     - Bekerja tanpa bergantung pada node di sistem sasaran lokal: './bin/yuihime-core-linux'."
    echo -e "${MAGENTA}===============================================================${NC}"
    
    read -p "Masukan pilihan metode anda [1 atau 2] (Default: 1): " -r BUILD_OPT
    BUILD_OPT=${BUILD_OPT:-1}

    if [ "$BUILD_OPT" -eq 2 ]; then
        echo -e "\n  » ${YELLOW}Memulai kompilasi biner tunggal mandiri via pkg (${BOLD}npm run build:bin${YELLOW})...${NC}"
        npm run build:bin
        echo -e "\n${GREEN}✓ Kompilasi Biner Selesai! Berkas biner mandiri telah lahir di folder ./bin/${NC}"
    else
        echo -e "\n  » ${YELLOW}Membangun bundling produksi statis React dan Express (${BOLD}npm run build${YELLOW})...${NC}"
        npm run build
        echo -e "\n${GREEN}✓ Bundling Produksi Sukses! Kode terkompilasi terletak di folder ./dist/${NC}"
    fi
}

# Opsi Pembuatan Systemd Service File untuk Booting Otomatis
configure_systemd_daemon() {
    echo -e "\n${CYAN}[5/5] Mengonfigurasi Layar Latar Belakang (Systemd Daemon Service)...${NC}"
    read -p "Apakah Anda ingin membuat berkas Systemd Service untuk Yuihime? [y/N] (Default: n): " -r RESPONSE
    RESPONSE=${RESPONSE:-n}

    if [[ "$RESPONSE" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        SERVICE_NAME="yuihime"
        SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
        USER_NAME=$(whoami)
        WORKING_DIR=$(pwd)

        echo -e "  » ${YELLOW}Menyusun deklarasi unit Systemd di ${SERVICE_PATH}...${NC}"
        
        # Deteksi path eksekusi berdasarkan opsi distribusi sebelumnya
        if [ -f "./bin/yuihime-core-linux" ]; then
            EXEC_COMMAND="${WORKING_DIR}/bin/yuihime-core-linux"
        else
            EXEC_COMMAND="/usr/bin/node ${WORKING_DIR}/dist/server.cjs"
        fi

        # Membuat berkas unit systemd secara aman lewat sudo tee
        sudo tee "$SERVICE_PATH" > /dev/null <<EOF
[Unit]
Description=Yuihime Autonomous Cognitive VTuber Core Service
After=network.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${WORKING_DIR}
Environment=NODE_ENV=production
ExecStart=${EXEC_COMMAND}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

        echo -e "  » ${YELLOW}Memuat ulang systemd manager daemon...${NC}"
        sudo systemctl daemon-reload
        
        echo -e "\n${GREEN}✓ Layanan otomatis daemon berhasil disiapkan!${NC}"
        echo -e "  Gunakan perintah-perintah berikut untuk mengontrolnya:"
        echo -e "    * Hidupkan otomatis saat boot: ${CYAN}sudo systemctl enable ${SERVICE_NAME}${NC}"
        echo -e "    * Jalankan sistem sekarang:     ${CYAN}sudo systemctl start ${SERVICE_NAME}${NC}"
        echo -e "    * Periksa status batin:        ${CYAN}sudo systemctl status ${SERVICE_NAME}${NC}"
        echo -e "    * Periksa log kognitif:        ${CYAN}sudo journalctl -u ${SERVICE_NAME} -f${NC}"
    else
        echo -e "  » ${GREEN}Konfigurasi systemd dilewati oleh pengguna.${NC}"
    fi
}

# Mulai Prosedur
check_root_safety
detect_operating_system
install_system_dependencies
ensure_modern_nodejs
install_and_build_yuihime
configure_systemd_daemon

# Outro Penutup dengan Gaya Anggun Ceria Yuihime
echo -e "\n${CYAN}${BOLD}================================================================${NC}"
echo -e "  🌟 ${GREEN}${BOLD}SELAMAT! INSTALASI KHIDMAT YUIHIME TELAH SELESAI SEMPURNA!${NC} 🌟"
echo -e "${CYAN}${BOLD}================================================================${NC}"
echo -e "\nYuihime siap menemani petualangan Anda! 💖"
echo -e "Berikut adalah opsi cara menghidupkan core kognitif batin saya:"
echo -e "\n1. ${BOLD}Menggunakan Node.js langsung:${NC}"
echo -e "   Run: ${YELLOW}npm run start${NC} atau ${YELLOW}node dist/server.cjs${NC}"
echo -e "\n2. ${BOLD}Menggunakan Berkas Biner Tunggal Mandiri (jika memilih Opsi 2):${NC}"
echo -e "   Run: ${YELLOW}./bin/yuihime-core-linux${NC} (Bila dikompilasi di Linux x64)"
echo -e "\n3. ${BOLD}Melalui Systemd Service Daemon (bila dikonfigurasi):${NC}"
echo -e "   Run: ${YELLOW}sudo systemctl start yuihime${NC}"
echo -e "\nSemua konfigurasi statis tersimpan di folder ${YELLOW}./.yuihime/data/config.toml${NC}."
echo -e "Yuihime siap berkomunikasi di gerbang jaringan port ${GREEN}3000${NC}!"
echo -e "${CYAN}${BOLD}================================================================${NC}\n"
