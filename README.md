# Vestici — Katalog Generator

Web app untuk bikin feed katalog Instagram (1080×1350) dari foto produk thrift Vestici.
Foto cuma dipakai sementara buat preview & download — **tidak disimpan**. Data produk
(kategori, kode, judul, harga) disimpan di **Supabase** biar sync di PC & iPhone.

## Setup Supabase (sekali aja)
1. Buka Supabase dashboard → project kamu → **SQL Editor** → **New query**.
2. Paste isi [supabase/schema.sql](supabase/schema.sql) → **Run**.
3. URL + anon key sudah diisi di [js/config.js](js/config.js).

## Cara jalankan (lokal, Windows)
Buka lewat **server lokal** (bukan double-click `index.html`).

**Gampang:** double-click **`start-vestici.bat`** → otomatis buka `http://localhost:8123`.

**Manual:**
```powershell
cd "C:\Dimas\Coding\Claude Personal\Thrift shop"
python -m http.server 8123
```

## Cara pakai
1. **Kategori** (tab bawah): atur kategori + kode huruf (cth `C` untuk Crop Top).
2. **Tambah** (`+`): pilih kategori → kode ref otomatis (cth `C001`) → isi judul & harga →
   upload foto (pertama = **Depan**, ada harga) → lihat preview →
   **Download semua foto (.jpg)** → lalu **Simpan ke katalog**.
3. **Foto tidak disimpan**: cuma dipakai pas bikin & download. Yang tersimpan cuma kode, judul
   & harga. Mau export ulang? Buka produk → **Upload foto & export ulang** → upload foto lagi.
4. **Template**: pakai bingkai `depan.png` & `belakang.png` (logo Vestici nyatu di bingkai).
   Background = foto sama tapi blur 50% → bingkai → foto di dalamnya.
   Font: kode & judul = **Ovo**, harga = **League Spartan**.

## Export
Satu klik **Download semua foto** = tiap foto produk turun sebagai file `.jpg` terpisah
(cth `C002-depan.jpg`, `C002-belakang.jpg`) — bukan ZIP. Browser mungkin minta izin
"download beberapa file" sekali; pilih izinkan.

## Kode Ref
- Format: prefix kategori + nomor urut (`C001`, `C002`). Unik per kategori.
- Kalau produk dihapus, nomornya bisa dipakai produk baru.

## Catatan
- Foto **Depan** = satu-satunya yang ada **harga**. Output selalu **1080×1350** (4:5).
- Anon key di `config.js` itu public (aman), tapi RLS sekarang terbuka — siapa pun yang tahu
  URL live bisa nulis ke katalog. Tambah login Supabase nanti kalau mau dikunci.
