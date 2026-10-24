# 🥷 NETRASH NINJA V-2 — High-Performance Kiosk Edition

Game arcade interaktif berbasis web untuk pameran booth **NETRASH**. Menggunakan **PixiJS v8** (WebGL/WebGPU), pelacakan gestur kamera **MediaPipe Tasks Vision** di background **Web Worker**, dan arsitektur modern **Vite + TypeScript**.

---

## 🚀 Keunggulan Arsitektur V-2

1. **Zero Main-Thread Stutter (Web Worker Multi-Threading)**:
   - Komputasi kecerdasan buatan pelacakan tangan berjalan di Web Worker terpisah.
   - Main thread browser bebas me-render animasi game di 60–120 FPS tanpa terhambat latensi inferensi kamera.
2. **Hardware-Accelerated 2D Rendering (PixiJS v8)**:
   - Menggunakan engine WebGL dan WebGPU dengan *hardware sprite batching*.
   - Ratusan partikel jus dan tebasan terbelah dua (*sliced halves*) dirender dalam 2–3 draw call GPU.
3. **Pemberantasan Bug Tali Laser (Anti-Rope / Anti-Tripwire Guard)**:
   - Algoritma pemotongan memvalidasi jarak maksimum antar-titik (`MAX_POINT_CONNECT_DISTANCE = 160px`).
   - Gerakan melompat antar-tangan tidak akan pernah ditarik garis tebasan yang memotong layar.
4. **Desain Kiosk Netrash**:
   - Background kamera netral gelap (`#000000` dengan dark scrim), tanpa warna hijau keruh.
   - Tipografi `Inter` & `Manrope`.
   - Kontrol pemilihan mode bebas emoji generik AI.
   - Papan target daur ulang berbasis chip kategori Netrash.
5. **Mode Solo & 1 vs 1 Tanding Side-by-Side**:
   - Mode Solo: 1 pemain menaklukkan seluruh layar.
   - Mode 1 vs 1: Partisi simetris kiri-kanan (P1 Hijau vs P2 Cyan) dengan adu poin dan papan komparasi tanding.

---

## 🛠️ Instalasi & Menjalankan Lokal

```bash
# Masuk ke direktori
cd trash-ninja-v2

# Install dependensi
pnpm install

# Jalankan dev server
pnpm dev
# Buka http://localhost:3001
```

### Build Produksi & Menjalankan Preview
```bash
# Jalankan test suite
pnpm test

# Build bundle produksi
pnpm build

# Preview hasil build
pnpm preview
```

---

## 🌐 Deploy ke GitHub Pages

Proyek ini dilengkapi dengan workflow GitHub Actions otomatis di `.github/workflows/deploy.yml`.

1. Buat repositori baru di GitHub:
   ```bash
   gh repo create netrash-ninja-v2 --public --source=. --push
   ```
2. Di GitHub: Buka **Settings** > **Pages** > **Source**, pilih **GitHub Actions**.
3. Setiap commit ke branch `main` akan otomatis memvalidasi unit test, me-compile bundle Vite, dan men-deploy ke `https://<username>.github.io/netrash-ninja-v2/`.
