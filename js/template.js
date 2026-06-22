/* Vestici — feed image renderer (1080 x 1350, Instagram 4:5)
   Layout: blurred photo background -> frame PNG (bingkai) -> sharp photo inside
   the frame window -> text (ref+title in Ovo, price in League Spartan). */
const Template = (() => {
  const W = 1080, H = 1350;

  const COLORS = {
    base: '#F3EEE6',     // cream behind the 30% blurred photo
    title: '#4F4435',
    price: '#5C4A37',
  };

  // Frame assets + geometry (fractions of the frame image, measured from the PNGs).
  const FRAMES = {
    front: {
      src: 'depan.png', img: null,
      win: { x: 0.1633, y: 0.2701, w: 0.6734, h: 0.6512 },
      line: { y: 0.2558, x0: 0.1633, x1: 0.6107 },
    },
    back: {
      src: 'belakang.png', img: null,
      win: { x: 0.1588, y: 0.1592, w: 0.6801, h: 0.7674 },
      line: null,
    },
  };

  let fontsReady = null;
  function ensureFonts() {
    if (!fontsReady) {
      fontsReady = (async () => {
        try {
          await Promise.all([
            document.fonts.load('400 40px "Ovo"'),
            document.fonts.load('600 80px "League Spartan"'),
            document.fonts.load('700 80px "League Spartan"'),
          ]);
          await document.fonts.ready;
        } catch (e) { /* fall back to generic families */ }
      })();
    }
    return fontsReady;
  }

  let assetsReady = null;
  function ensureAssets() {
    if (!assetsReady) {
      assetsReady = (async () => {
        for (const k of Object.keys(FRAMES)) {
          try {
            const res = await fetch(FRAMES[k].src);
            if (res.ok) FRAMES[k].img = await createImageBitmap(await res.blob());
          } catch (e) { /* frame missing -> rendered without bingkai */ }
        }
      })();
    }
    return assetsReady;
  }

  function drawCover(ctx, img, x, y, w, h) {
    const ir = img.width / img.height, br = w / h;
    let sw, sh, sx, sy;
    if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function measureSpaced(ctx, text, spacing) {
    let w = 0;
    const chars = Array.from(text);
    for (const ch of chars) w += ctx.measureText(ch).width;
    if (chars.length > 1) w += spacing * (chars.length - 1);
    return w;
  }
  function drawSpaced(ctx, text, x, y, spacing, align) {
    const chars = Array.from(text);
    const total = measureSpaced(ctx, text, spacing);
    let cx = x;
    if (align === 'center') cx = x - total / 2;
    else if (align === 'right') cx = x - total;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const ch of chars) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
    ctx.textAlign = prev;
  }

  // spec: { bitmap, frameKey:'front'|'back', title, refCode, priceText, showPrice }
  async function render(spec) {
    await ensureFonts();
    await ensureAssets();
    const frame = FRAMES[spec.frameKey] || FRAMES.front;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1) background: cream base + the SAME photo, blurred, at 30%
    ctx.fillStyle = COLORS.base;
    ctx.fillRect(0, 0, W, H);
    if (spec.bitmap) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      if ('filter' in ctx) ctx.filter = 'blur(45px)';
      drawCover(ctx, spec.bitmap, -80, -80, W + 160, H + 160);
      ctx.restore();
    }

    // 2) frame (bingkai)
    if (frame.img) ctx.drawImage(frame.img, 0, 0, W, H);

    // 3) sharp photo inside the frame window
    const win = {
      x: frame.win.x * W, y: frame.win.y * H,
      w: frame.win.w * W, h: frame.win.h * H,
    };
    if (spec.bitmap) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(win.x, win.y, win.w, win.h);
      ctx.clip();
      drawCover(ctx, spec.bitmap, win.x, win.y, win.w, win.h);
      ctx.restore();
    }

    // 4) text — front only (back frame has logo baked in, no title/price)
    if (spec.frameKey === 'front' && frame.line) {
      const lineY = frame.line.y * H;
      const titleX = frame.line.x0 * W;
      const winRight = (frame.win.x + frame.win.w) * W;

      // price (League Spartan) — measure first to reserve title width
      let priceW = 0;
      const priceText = (spec.showPrice && spec.priceText) ? spec.priceText : '';
      if (priceText) {
        ctx.font = '700 78px "League Spartan", sans-serif';
        priceW = measureSpaced(ctx, priceText, 0.5);
      }

      // title = "REF - TITLE" (Ovo), auto-shrink + ellipsis so it never hits price
      const titleStr = (spec.refCode ? spec.refCode + ' - ' : '') + (spec.title || '').toUpperCase();
      const titleSpacing = 1;
      const gap = 28;
      const availW = Math.max(140, (priceText ? winRight - priceW - gap : winRight) - titleX);
      let size = 38;
      ctx.font = `400 ${size}px "Ovo", serif`;
      while (size > 20 && measureSpaced(ctx, titleStr, titleSpacing) > availW) {
        size -= 1; ctx.font = `400 ${size}px "Ovo", serif`;
      }
      let drawTitle = titleStr;
      if (measureSpaced(ctx, drawTitle, titleSpacing) > availW) {
        while (drawTitle.length > 1 && measureSpaced(ctx, drawTitle + '…', titleSpacing) > availW) {
          drawTitle = drawTitle.slice(0, -1);
        }
        drawTitle += '…';
      }
      ctx.fillStyle = COLORS.title;
      ctx.textBaseline = 'alphabetic';
      drawSpaced(ctx, drawTitle, titleX, lineY - 14, titleSpacing, 'left');

      // price (right-aligned at the window's right edge)
      if (priceText) {
        ctx.fillStyle = COLORS.price;
        ctx.font = '700 78px "League Spartan", sans-serif';
        ctx.textBaseline = 'alphabetic';
        drawSpaced(ctx, priceText, winRight, lineY + 8, 0.5, 'right');
      }
    }

    return canvas;
  }

  async function bitmapFromBlob(blob) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e1) {
      try { return await createImageBitmap(blob); } catch (e2) { /* fall through */ }
      return await new Promise((res, rej) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = (er) => { URL.revokeObjectURL(url); rej(er); };
        img.src = url;
      });
    }
  }

  // Returns [{ role, name, canvas }].
  // opts.bitmaps: optional Map(imageId -> bitmap) reused across re-renders.
  async function renderProduct(product, opts = {}) {
    const priceText = opts.priceText || '';
    const bitmaps = opts.bitmaps || null;
    const out = [];
    const usedNames = new Set();
    let extra = 0;
    for (let i = 0; i < product.images.length; i++) {
      const im = product.images[i];
      let bmp, owned = false;
      if (bitmaps && im.id && bitmaps.has(im.id)) bmp = bitmaps.get(im.id);
      else { bmp = await bitmapFromBlob(im.blob); owned = true; }

      const isFront = im.role === 'front';
      let label;
      if (im.role === 'front') label = 'depan';
      else if (im.role === 'back') label = 'belakang';
      else { extra++; label = String(extra); }

      const canvas = await render({
        bitmap: bmp,
        frameKey: isFront ? 'front' : 'back',
        title: product.title,
        refCode: product.refCode,
        priceText,
        showPrice: isFront,
      });
      if (owned && bmp.close) bmp.close();

      let name = `${product.refCode}-${label}`;
      if (usedNames.has(name)) { let k = 2; while (usedNames.has(`${name}-${k}`)) k++; name = `${name}-${k}`; }
      usedNames.add(name);
      out.push({ role: im.role, name, canvas });
    }
    return out;
  }

  function toJpegBlob(canvas, quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) return resolve(b);
        canvas.toBlob((b2) => (b2 ? resolve(b2) : reject(new Error('Gagal encode gambar'))), 'image/jpeg', 0.7);
      }, 'image/jpeg', quality);
    });
  }

  return { render, renderProduct, bitmapFromBlob, toJpegBlob, W, H };
})();
