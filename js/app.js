/* Vestici — app controller
   Photos are kept in memory only (for preview + export). They are NOT persisted —
   the catalog stores just metadata (category, ref code, title, price). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---- shared state ----
  let categories = [];
  let objectUrls = [];
  const form = {
    editing: null,                 // product being edited, or null
    images: [],                    // { id, role, blob, url } — memory only
  };
  const formBitmaps = new Map();   // imageId -> decoded bitmap (preview cache)
  let previewToken = 0;
  let detailProduct = null;

  const MAX_PHOTO_EDGE = 1600;

  // ---------- helpers ----------
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }

  function trimNum(v) { return (Math.round(v * 10) / 10).toString().replace(/\.0$/, ''); }
  function formatPrice(n) {
    if (n == null || n === '' || isNaN(n)) return '';
    n = Number(n);
    if (n >= 1000000) return trimNum(n / 1000000) + 'M';
    if (n >= 1000) return trimNum(n / 1000) + 'K';
    return String(n);
  }

  function trackUrl(blob) { const u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
  function revokeUrls() { objectUrls.forEach((u) => URL.revokeObjectURL(u)); objectUrls = []; }

  function catName(id) { const c = categories.find((x) => x.id === id); return c ? c.name : '—'; }

  // Downscale + re-encode so previews/exports stay light and EXIF orientation is baked in.
  async function downscaleImage(file, maxEdge = MAX_PHOTO_EDGE, quality = 0.9) {
    try {
      let bmp;
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) { bmp = await createImageBitmap(file); }
      const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
      const tw = Math.round(bmp.width * scale), th = Math.round(bmp.height * scale);
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      c.getContext('2d').drawImage(bmp, 0, 0, tw, th);
      if (bmp.close) bmp.close();
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
      c.width = c.height = 0;
      return blob || file;
    } catch (e) { console.warn('downscale failed', e); return file; }
  }

  function clearFormBitmaps() {
    formBitmaps.forEach((b) => { if (b && b.close) b.close(); });
    formBitmaps.clear();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- navigation ----------
  function showView(name) {
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    window.scrollTo(0, 0);
  }

  $$('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.view;
      if (v === 'form') openForm(null);
      else if (v === 'catalog') { renderCatalog(); showView('catalog'); }
      else if (v === 'categories') { renderCategories(); showView('categories'); }
      else if (v === 'settings') { renderSettings(); showView('settings'); }
    });
  });

  // ============================================================
  //  CATALOG
  // ============================================================
  let allProducts = [];

  async function renderCatalog() {
    allProducts = await DB.getProducts();
    populateFilter();
    drawCatalog();
  }

  function populateFilter() {
    const sel = $('#filter-category');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Semua kategori</option>' +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    sel.value = cur || '';
  }

  function drawCatalog() {
    const grid = $('#catalog-grid');
    const q = $('#search').value.trim().toLowerCase();
    const fcat = $('#filter-category').value;

    let list = allProducts;
    if (fcat) list = list.filter((p) => p.categoryId === fcat);
    if (q) list = list.filter((p) =>
      (p.title || '').toLowerCase().includes(q) || (p.refCode || '').toLowerCase().includes(q));

    $('#catalog-empty').hidden = list.length !== 0;
    grid.innerHTML = '';
    for (const p of list) {
      const card = document.createElement('button');
      card.className = 'card';
      card.type = 'button';
      card.innerHTML = `
        <span class="card-cat">${escapeHtml(catName(p.categoryId))}</span>
        <span class="card-code">${escapeHtml(p.refCode)}</span>
        <div class="card-title">${escapeHtml(p.title)}</div>
        <div class="card-price">${formatPrice(p.price)}</div>`;
      card.addEventListener('click', () => openDetail(p.id));
      grid.appendChild(card);
    }
  }

  $('#search').addEventListener('input', drawCatalog);
  $('#filter-category').addEventListener('change', drawCatalog);

  // ============================================================
  //  FORM (add / edit)
  // ============================================================
  function fillCategorySelect() {
    $('#f-category').innerHTML = categories.map((c) =>
      `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.prefix)})</option>`).join('');
  }

  async function openForm(product) {
    // accept an id or a product object or null
    if (typeof product === 'string') product = await DB.getProduct(product);
    form.editing = product || null;
    form.images = [];
    clearFormBitmaps();
    revokeUrls();
    fillCategorySelect();
    $('#f-title').value = '';
    $('#f-price').value = '';
    $('#f-price-preview').querySelector('b').textContent = '—';
    $('#form-preview').innerHTML = '';
    $('#f-files').value = '';

    if (form.editing) {
      const p = form.editing;
      $('#form-title').textContent = 'Edit Produk';
      $('#f-category').value = p.categoryId;
      $('#f-title').value = p.title;
      $('#f-price').value = p.price == null ? '' : p.price;
      $('#f-price-preview').querySelector('b').textContent = formatPrice(p.price) || '—';
    } else {
      $('#form-title').textContent = 'Tambah Produk';
    }
    renderPhotoList();
    await updateRefPreview();
    showView('form');
  }

  async function updateRefPreview() {
    const catId = $('#f-category').value;
    const cat = categories.find((c) => c.id === catId);
    if (!cat) { $('#f-refcode').textContent = '—'; return; }
    // editing + same category -> keep its existing code; otherwise next available
    if (form.editing && form.editing.categoryId === catId) {
      $('#f-refcode').textContent = form.editing.refCode;
    } else {
      const n = await DB.nextRefNumber(catId, form.editing ? form.editing.id : null);
      $('#f-refcode').textContent = cat.prefix + String(n).padStart(cat.padLength || 3, '0');
    }
  }

  $('#f-category').addEventListener('change', () => { updateRefPreview(); schedulePreview(); });
  $('#f-title').addEventListener('input', schedulePreview);
  $('#f-price').addEventListener('input', () => {
    $('#f-price-preview').querySelector('b').textContent = formatPrice($('#f-price').value) || '—';
    schedulePreview();
  });

  // ---- photo handling (memory only) ----
  $('#f-files').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const uploader = document.querySelector('.uploader[for="f-files"]');
    const prevHtml = uploader ? uploader.innerHTML : '';
    if (uploader) uploader.innerHTML = '<span class="spinner"></span> Memproses foto…';
    for (const f of files) {
      const blob = await downscaleImage(f);
      let role = 'extra';
      if (!form.images.some((im) => im.role === 'front')) role = 'front';
      else if (!form.images.some((im) => im.role === 'back')) role = 'back';
      form.images.push({ id: DB.uid(), role, blob, url: trackUrl(blob) });
    }
    if (uploader) uploader.innerHTML = prevHtml;
    renderPhotoList();
    schedulePreview();
  });

  function renderPhotoList() {
    const wrap = $('#f-photos');
    wrap.innerHTML = '';
    form.images.forEach((im, idx) => {
      const row = document.createElement('div');
      row.className = 'photo-row';
      row.innerHTML = `
        <img class="photo-thumb" src="${im.url}" alt="" />
        <div class="photo-ctrl">
          <select class="input select photo-role">
            <option value="front" ${im.role === 'front' ? 'selected' : ''}>Depan (ada harga)</option>
            <option value="back" ${im.role === 'back' ? 'selected' : ''}>Belakang</option>
            <option value="extra" ${im.role === 'extra' ? 'selected' : ''}>Tambahan</option>
          </select>
        </div>
        <div class="photo-btns">
          <button class="icon-btn" data-act="up" title="Naik">↑</button>
          <button class="icon-btn" data-act="down" title="Turun">↓</button>
          <button class="icon-btn del" data-act="del" title="Hapus">✕</button>
        </div>`;
      row.querySelector('.photo-role').addEventListener('change', (ev) => {
        const v = ev.target.value;
        if (v === 'front' || v === 'back') {
          form.images.forEach((o, j) => { if (j !== idx && o.role === v) o.role = 'extra'; });
        }
        im.role = v;
        renderPhotoList();
        schedulePreview();
      });
      row.querySelector('[data-act="up"]').addEventListener('click', () => movePhoto(idx, -1));
      row.querySelector('[data-act="down"]').addEventListener('click', () => movePhoto(idx, 1));
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        form.images.splice(idx, 1); renderPhotoList(); schedulePreview();
      });
      wrap.appendChild(row);
    });
  }

  function movePhoto(idx, dir) {
    const ni = idx + dir;
    if (ni < 0 || ni >= form.images.length) return;
    const t = form.images[idx]; form.images[idx] = form.images[ni]; form.images[ni] = t;
    renderPhotoList(); schedulePreview();
  }

  // ---- live preview ----
  let previewTimer = null;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderFormPreview, 450); }

  function currentRefCode() { return $('#f-refcode').textContent.trim() || 'PREVIEW'; }

  async function renderFormPreview() {
    const box = $('#form-preview');
    if (form.images.length === 0) { clearFormBitmaps(); box.innerHTML = ''; return; }
    const myToken = ++previewToken;
    box.innerHTML = '<div class="loading-note"><span class="spinner"></span>Membuat preview…</div>';

    const liveIds = new Set(form.images.map((im) => im.id));
    for (const id of Array.from(formBitmaps.keys())) {
      if (!liveIds.has(id)) { const b = formBitmaps.get(id); if (b && b.close) b.close(); formBitmaps.delete(id); }
    }
    try {
      for (const im of form.images) {
        if (!formBitmaps.has(im.id)) formBitmaps.set(im.id, await Template.bitmapFromBlob(im.blob));
        if (myToken !== previewToken) return;
      }
    } catch (err) {
      console.error(err);
      if (myToken === previewToken) box.innerHTML = '<div class="loading-note">Gagal membaca foto.</div>';
      return;
    }

    const product = {
      refCode: currentRefCode(),
      title: $('#f-title').value || 'Judul Produk',
      images: form.images.map((im) => ({ id: im.id, role: im.role, blob: im.blob })),
    };
    try {
      const rendered = await Template.renderProduct(product, {
        priceText: formatPrice($('#f-price').value),
        bitmaps: formBitmaps,
      });
      if (myToken !== previewToken) return;
      box.innerHTML = '';
      rendered.forEach((r) => box.appendChild(previewItem(r)));
    } catch (err) {
      console.error(err);
      if (myToken === previewToken) box.innerHTML = '<div class="loading-note">Gagal membuat preview.</div>';
    }
  }

  function previewItem(r) {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.appendChild(r.canvas);
    const cap = document.createElement('div');
    cap.className = 'preview-cap';
    cap.innerHTML = `<span>${escapeHtml(r.name)}.jpg</span><span>1080×1350</span>`;
    item.appendChild(cap);
    return item;
  }

  $('#btn-refresh-preview').addEventListener('click', renderFormPreview);
  $('#btn-cancel').addEventListener('click', () => { renderCatalog(); showView('catalog'); });

  // ---- export current form photos ----
  async function exportImages(refCode, title, priceText, btn) {
    if (form.images.length === 0) { toast('Tambah foto dulu sebelum download'); return; }
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Menyiapkan foto…'; }
    try {
      const product = {
        refCode, title: title || 'Produk',
        images: form.images.map((im) => ({ id: im.id, role: im.role, blob: im.blob })),
      };
      const rendered = await Template.renderProduct(product, { priceText, bitmaps: formBitmaps });
      // download each image as a separate .jpg (no zip); stagger so the browser
      // doesn't drop rapid-fire downloads
      for (let i = 0; i < rendered.length; i++) {
        const blob = await Template.toJpegBlob(rendered[i].canvas, 0.92);
        downloadBlob(blob, `${rendered[i].name}.jpg`);
        if (i < rendered.length - 1) await new Promise((res) => setTimeout(res, 450));
      }
      toast(`${rendered.length} foto ter-download ✓`);
    } catch (e) {
      console.error(e); toast('Gagal download');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  }

  $('#btn-form-download').addEventListener('click', () => {
    exportImages(currentRefCode(), $('#f-title').value.trim(), formatPrice($('#f-price').value), $('#btn-form-download'));
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---- save (metadata only) ----
  $('#btn-save').addEventListener('click', async () => {
    const btn = $('#btn-save');
    if (btn.disabled) return;

    const catId = $('#f-category').value;
    const title = $('#f-title').value.trim();
    const price = $('#f-price').value === '' ? null : Number($('#f-price').value);

    if (!catId) return toast('Pilih kategori dulu');
    if (!title) return toast('Judul belum diisi');

    btn.disabled = true;
    try {
      const cat = categories.find((c) => c.id === catId);
      let product;
      if (form.editing) {
        product = form.editing;
        if (product.categoryId !== catId) {
          const n = await DB.nextRefNumber(catId, product.id);
          product.categoryId = catId;
          product.refNumber = n;
          product.refCode = cat.prefix + String(n).padStart(cat.padLength || 3, '0');
        }
      } else {
        const n = await DB.nextRefNumber(catId, null);
        product = {
          id: DB.uid(), categoryId: catId, refNumber: n,
          refCode: cat.prefix + String(n).padStart(cat.padLength || 3, '0'),
          createdAt: Date.now(),
        };
      }
      product.title = title;
      product.price = price;
      product.imageCount = form.images.length;   // metadata only — photos not stored

      await DB.saveProduct(product);
      toast(form.editing ? 'Produk diperbarui' : 'Produk disimpan ✓');
      await renderCatalog();
      showView('catalog');
    } catch (e) {
      console.error(e); toast('Gagal menyimpan');
    } finally {
      btn.disabled = false;
    }
  });

  // ============================================================
  //  DETAIL (metadata only)
  // ============================================================
  async function openDetail(id) {
    detailProduct = await DB.getProduct(id);
    const p = detailProduct;
    $('#detail-meta').innerHTML = `
      <span class="detail-code">${escapeHtml(p.refCode)}</span>
      <div class="detail-name">${escapeHtml(p.title)}</div>
      <div class="detail-price">${formatPrice(p.price)}</div>
      <div class="hint">${escapeHtml(catName(p.categoryId))}${p.imageCount ? ' · ' + p.imageCount + ' foto saat dibuat' : ''}</div>`;
    showView('detail');
  }

  $('#btn-back').addEventListener('click', () => { renderCatalog(); showView('catalog'); });
  $('#btn-edit').addEventListener('click', () => { if (detailProduct) openForm(detailProduct); });
  $('#btn-detail-export').addEventListener('click', () => { if (detailProduct) openForm(detailProduct); });

  $('#btn-delete').addEventListener('click', async () => {
    if (!detailProduct) return;
    if (!confirm(`Hapus produk ${detailProduct.refCode} — ${detailProduct.title}?\nKode ${detailProduct.refCode} bisa dipakai produk baru setelah ini.`)) return;
    await DB.deleteProduct(detailProduct.id);
    toast('Produk dihapus');
    detailProduct = null;
    await renderCatalog();
    showView('catalog');
  });

  // ============================================================
  //  CATEGORIES
  // ============================================================
  async function renderCategories() {
    const list = $('#cat-list');
    list.innerHTML = '';
    for (const c of categories) {
      const count = await DB.countByCategory(c.id);
      const item = document.createElement('div');
      item.className = 'cat-item';
      item.innerHTML = `
        <span class="cat-badge">${escapeHtml(c.prefix)}</span>
        <span class="cat-name">${escapeHtml(c.name)}</span>
        <span class="cat-count">${count} produk</span>
        <button class="icon-btn del" title="Hapus">✕</button>`;
      item.querySelector('.icon-btn').addEventListener('click', async () => {
        if (count > 0) return toast(`Tidak bisa dihapus, masih ada ${count} produk`);
        if (!confirm(`Hapus kategori "${c.name}"?`)) return;
        await DB.deleteCategory(c.id);
        categories = await DB.getCategories();
        renderCategories();
        toast('Kategori dihapus');
      });
      list.appendChild(item);
    }
  }

  $('#btn-add-cat').addEventListener('click', async () => {
    const name = $('#c-name').value.trim();
    const prefix = $('#c-prefix').value.trim().toUpperCase();
    if (!name) return toast('Nama kategori belum diisi');
    if (!prefix) return toast('Kode huruf belum diisi');
    if (categories.some((c) => c.prefix.toUpperCase() === prefix)) return toast(`Kode "${prefix}" sudah dipakai`);
    await DB.addCategory(name, prefix);
    categories = await DB.getCategories();
    $('#c-name').value = ''; $('#c-prefix').value = '';
    renderCategories();
    toast('Kategori ditambahkan ✓');
  });

  // ============================================================
  //  SETTINGS
  // ============================================================
  async function renderSettings() { renderStorageInfo(); }

  async function renderStorageInfo() {
    const el = $('#storage-info');
    if (!el) return;
    try {
      const prods = await DB.getProducts();
      el.innerHTML = `Tersambung ke <b>Supabase</b> ✓ · ${prods.length} produk, ${categories.length} kategori (sync semua device)`;
    } catch (e) {
      el.innerHTML = '<span style="color:#9A3B2E">Gagal konek ke Supabase.</span>';
    }
  }

  // ============================================================
  //  BOOT
  // ============================================================
  async function boot() {
    try {
      await DB.init();
      categories = await DB.getCategories();
      await renderCatalog();
      showView('catalog');
    } catch (e) {
      console.error(e);
      const msg = String(e && e.message || e);
      const missingTable = /does not exist|schema cache|find the table|42P01|PGRST205/i.test(msg);
      document.body.innerHTML =
        '<div style="padding:40px;font-family:sans-serif;color:#4F4435;max-width:560px;margin:0 auto">' +
        '<h2>' + (missingTable ? 'Tabel Supabase belum dibuat' : 'Tidak bisa konek ke Supabase') + '</h2>' +
        (missingTable
          ? '<p>Buka Supabase dashboard → SQL Editor → jalankan isi file <code>supabase/schema.sql</code>, lalu refresh halaman ini.</p>'
          : '<p>Cek koneksi internet & pastikan URL/anon key di <code>js/config.js</code> benar.</p>') +
        '<pre style="white-space:pre-wrap;color:#9A3B2E;background:#f6f1e9;padding:12px;border-radius:8px">' + escapeHtml(msg) + '</pre></div>';
    }
  }

  boot();
})();
