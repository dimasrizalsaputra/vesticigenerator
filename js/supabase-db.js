/* Vestici — data layer backed by Supabase (cloud sync).
   Exposes the same `DB` interface the app already uses. Stores metadata only
   (categories + products); photos are never uploaded. */
const DB = (() => {
  const cfg = window.VESTICI_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseKey) {
    console.error('Supabase client / config missing');
  }
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));

  const DEFAULT_CATEGORIES = [
    { name: 'Kaos', prefix: 'K' },
    { name: 'Crop Top', prefix: 'C' },
    { name: 'Top', prefix: 'T' },
    { name: 'Celana Pendek', prefix: 'CP' },
    { name: 'Celana Panjang', prefix: 'CL' },
    { name: 'Dress', prefix: 'D' },
    { name: 'Outer', prefix: 'O' },
  ];

  const toTime = (s) => (s ? Date.parse(s) : 0);
  const mapCat = (r) => ({ id: r.id, name: r.name, prefix: r.prefix, padLength: r.pad_length, createdAt: toTime(r.created_at) });
  const mapProd = (r) => ({
    id: r.id, categoryId: r.category_id, refNumber: r.ref_number, refCode: r.ref_code,
    title: r.title, price: r.price, imageCount: r.image_count, createdAt: toTime(r.created_at),
  });

  async function init() {
    const { data, error } = await client.from('categories').select('id').limit(1);
    if (error) {
      const e = new Error(error.message);
      e.code = error.code;
      e.supabase = true;
      throw e;
    }
    if (!data || data.length === 0) {
      const rows = DEFAULT_CATEGORIES.map((c) => ({ id: uid(), name: c.name, prefix: c.prefix, pad_length: 3 }));
      const { error: e2 } = await client.from('categories').insert(rows);
      if (e2) throw new Error('Gagal menambah kategori awal: ' + e2.message);
    }
  }

  /* ---------- Categories ---------- */
  async function getCategories() {
    const { data, error } = await client.from('categories').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapCat);
  }
  async function addCategory(name, prefix, padLength = 3) {
    const { error } = await client.from('categories')
      .insert({ id: uid(), name: name.trim(), prefix: prefix.trim().toUpperCase(), pad_length: padLength });
    if (error) throw error;
  }
  async function deleteCategory(id) {
    const { error } = await client.from('categories').delete().eq('id', id);
    if (error) throw error;
  }
  async function getCategory(id) {
    const { data } = await client.from('categories').select('*').eq('id', id).maybeSingle();
    return data ? mapCat(data) : null;
  }

  /* ---------- Products ---------- */
  async function getProducts() {
    const { data, error } = await client.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapProd);
  }
  async function getProduct(id) {
    const { data, error } = await client.from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapProd(data) : null;
  }
  async function saveProduct(product) {
    const row = {
      id: product.id || uid(),
      category_id: product.categoryId,
      ref_number: product.refNumber,
      ref_code: product.refCode,
      title: product.title,
      price: product.price,
      image_count: product.imageCount || 0,
    };
    if (product.createdAt) row.created_at = new Date(product.createdAt).toISOString();
    const { error } = await client.from('products').upsert(row);
    if (error) throw error;
    product.id = row.id;
    return product;
  }
  async function deleteProduct(id) {
    const { error } = await client.from('products').delete().eq('id', id);
    if (error) throw error;
  }

  // Smallest positive integer not used in this category (fills gaps from deletes).
  async function nextRefNumber(categoryId, excludeId = null) {
    const { data, error } = await client.from('products').select('ref_number,id').eq('category_id', categoryId);
    if (error) throw error;
    const used = new Set((data || []).filter((r) => r.id !== excludeId).map((r) => r.ref_number));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }
  async function countByCategory(categoryId) {
    const { count, error } = await client.from('products')
      .select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
    if (error) throw error;
    return count || 0;
  }

  return {
    uid, init,
    getCategories, addCategory, deleteCategory, getCategory,
    getProducts, getProduct, saveProduct, deleteProduct, nextRefNumber, countByCategory,
  };
})();
