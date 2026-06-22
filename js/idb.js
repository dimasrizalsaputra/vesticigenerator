/* Vestici — IndexedDB data layer
   Stores:
     categories: { id, name, prefix, padLength, createdAt }
     products:   { id, categoryId, refNumber, refCode, title, price, images:[{id,role,blob,name}], createdAt }
     settings:   { key, value }
*/
const DB = (() => {
  const DB_NAME = 'vestici';
  const DB_VERSION = 1;
  let db = null;

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID()
      : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('categories')) d.createObjectStore('categories', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('products')) d.createObjectStore('products', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }
  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function getAll(store) {
    return reqP(tx(store, 'readonly').getAll());
  }
  function put(store, value) {
    return reqP(tx(store, 'readwrite').put(value));
  }
  function del(store, key) {
    return reqP(tx(store, 'readwrite').delete(key));
  }

  const DEFAULT_CATEGORIES = [
    { name: 'Kaos', prefix: 'K' },
    { name: 'Crop Top', prefix: 'C' },
    { name: 'Top', prefix: 'T' },
    { name: 'Celana Pendek', prefix: 'CP' },
    { name: 'Celana Panjang', prefix: 'CL' },
    { name: 'Dress', prefix: 'D' },
    { name: 'Outer', prefix: 'O' },
  ];

  async function init() {
    db = await open();
    const cats = await getAll('categories');
    if (cats.length === 0) {
      for (const c of DEFAULT_CATEGORIES) {
        await put('categories', {
          id: uid(), name: c.name, prefix: c.prefix, padLength: 3, createdAt: Date.now(),
        });
      }
    }
  }

  /* ---------- Categories ---------- */
  async function getCategories() {
    const cats = await getAll('categories');
    return cats.sort((a, b) => a.createdAt - b.createdAt);
  }
  function addCategory(name, prefix, padLength = 3) {
    return put('categories', {
      id: uid(), name: name.trim(), prefix: prefix.trim().toUpperCase(), padLength, createdAt: Date.now(),
    });
  }
  async function deleteCategory(id) {
    return del('categories', id);
  }
  async function getCategory(id) {
    return reqP(tx('categories', 'readonly').get(id));
  }

  /* ---------- Products ---------- */
  async function getProducts() {
    const ps = await getAll('products');
    return ps.sort((a, b) => b.createdAt - a.createdAt);
  }
  function getProduct(id) {
    return reqP(tx('products', 'readonly').get(id));
  }
  function saveProduct(product) {
    if (!product.id) product.id = uid();
    if (!product.createdAt) product.createdAt = Date.now();
    return put('products', product).then(() => product);
  }
  function deleteProduct(id) {
    return del('products', id);
  }

  // Smallest positive integer not yet used in this category (fills gaps from deleted products).
  async function nextRefNumber(categoryId, excludeId = null) {
    const ps = await getProducts();
    const used = new Set(
      ps.filter((p) => p.categoryId === categoryId && p.id !== excludeId).map((p) => p.refNumber)
    );
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  async function countByCategory(categoryId) {
    const ps = await getProducts();
    return ps.filter((p) => p.categoryId === categoryId).length;
  }

  /* ---------- Settings ---------- */
  async function getSetting(key) {
    const r = await reqP(tx('settings', 'readonly').get(key));
    return r ? r.value : null;
  }
  function setSetting(key, value) {
    return put('settings', { key, value });
  }
  function deleteSetting(key) {
    return del('settings', key);
  }

  return {
    uid, init,
    getCategories, addCategory, deleteCategory, getCategory,
    getProducts, getProduct, saveProduct, deleteProduct, nextRefNumber, countByCategory,
    getSetting, setSetting, deleteSetting,
  };
})();
