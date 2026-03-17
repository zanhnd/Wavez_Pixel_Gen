/**
 * processor.js — Pixel Art Processing Engine
 * Pipeline: Remove BG → Auto Crop → Detect Grid & Downscale → Median Filter → Color Quantize
 */

export class PixelArtProcessor {
  constructor() {
    this.original = null;   // ImageData of loaded image
    this.width = 0;
    this.height = 0;
  }

  // ─── Load image from File / URL ───
  loadFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          this.original = ctx.getImageData(0, 0, c.width, c.height);
          this.width = c.width;
          this.height = c.height;
          resolve({ width: c.width, height: c.height });
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ─── Step 1: Remove Background ───
  removeBackground(imageData) {
    const d = new Uint8ClampedArray(imageData.data);
    const w = imageData.width, h = imageData.height;

    // Check if already has transparency
    let hasAlpha = false;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) { hasAlpha = true; break; }
    }
    if (hasAlpha) return new ImageData(d, w, h);

    // Sample 4 corners (5x5 patches)
    const corners = [
      this._samplePatch(d, w, h, 0, 0, 5),
      this._samplePatch(d, w, h, w - 5, 0, 5),
      this._samplePatch(d, w, h, 0, h - 5, 5),
      this._samplePatch(d, w, h, w - 5, h - 5, 5),
    ];

    // Check if corners are similar
    const ref = corners[0];
    const threshold = 30;
    const allSimilar = corners.every(c =>
      Math.abs(c[0] - ref[0]) < threshold &&
      Math.abs(c[1] - ref[1]) < threshold &&
      Math.abs(c[2] - ref[2]) < threshold
    );

    if (!allSimilar) return new ImageData(d, w, h);

    // Flood fill from all 4 corners
    const bgColor = ref;
    const visited = new Uint8Array(w * h);
    const tol = 35;

    const matchesBg = (idx) => {
      const i4 = idx * 4;
      return Math.abs(d[i4] - bgColor[0]) < tol &&
             Math.abs(d[i4 + 1] - bgColor[1]) < tol &&
             Math.abs(d[i4 + 2] - bgColor[2]) < tol;
    };

    const floodFill = (startX, startY) => {
      const stack = [[startX, startY]];
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const idx = y * w + x;
        if (visited[idx]) continue;
        if (!matchesBg(idx)) continue;
        visited[idx] = 1;
        d[idx * 4 + 3] = 0; // Make transparent
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    };

    floodFill(0, 0);
    floodFill(w - 1, 0);
    floodFill(0, h - 1);
    floodFill(w - 1, h - 1);

    return new ImageData(d, w, h);
  }

  _samplePatch(data, w, h, sx, sy, size) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = sy; y < Math.min(sy + size, h); y++) {
      for (let x = sx; x < Math.min(sx + size, w); x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        count++;
      }
    }
    return [r / count, g / count, b / count];
  }

  // ─── Step 2: Auto Crop ───
  autoCrop(imageData) {
    const d = imageData.data, w = imageData.width, h = imageData.height;
    let top = h, bottom = 0, left = w, right = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (top > bottom || left > right) return imageData; // nothing visible

    const cw = right - left + 1, ch = bottom - top + 1;
    const cropped = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const srcI = ((top + y) * w + (left + x)) * 4;
        const dstI = (y * cw + x) * 4;
        cropped[dstI] = d[srcI];
        cropped[dstI + 1] = d[srcI + 1];
        cropped[dstI + 2] = d[srcI + 2];
        cropped[dstI + 3] = d[srcI + 3];
      }
    }
    return new ImageData(cropped, cw, ch);
  }

  // ─── Step 3: Detect Pixel Grid & Downscale ───
  detectGridSize(imageData) {
    const d = imageData.data, w = imageData.width, h = imageData.height;
    // Horizontal edge detection — count color transitions per column
    const colTransitions = new Float64Array(w);
    for (let x = 1; x < w; x++) {
      let transitions = 0;
      for (let y = 0; y < h; y++) {
        const i1 = (y * w + (x - 1)) * 4;
        const i2 = (y * w + x) * 4;
        const diff = Math.abs(d[i1] - d[i2]) + Math.abs(d[i1 + 1] - d[i2 + 1]) +
                     Math.abs(d[i1 + 2] - d[i2 + 2]);
        if (diff > 30) transitions++;
      }
      colTransitions[x] = transitions;
    }

    // Find repeating period using autocorrelation
    const bestSize = this._findPeriod(colTransitions, w);
    return Math.max(1, bestSize);
  }

  _findPeriod(signal, len) {
    const maxPeriod = Math.min(64, Math.floor(len / 3));
    let bestPeriod = 1, bestScore = -Infinity;
    for (let p = 2; p <= maxPeriod; p++) {
      let score = 0, count = 0;
      for (let i = p; i < len; i++) {
        score += signal[i] * signal[i - p];
        count++;
      }
      score /= count || 1;
      if (score > bestScore) {
        bestScore = score;
        bestPeriod = p;
      }
    }
    return bestPeriod;
  }

  downscaleNearest(imageData, cellSize) {
    const sw = imageData.width, sh = imageData.height;
    const dw = Math.round(sw / cellSize);
    const dh = Math.round(sh / cellSize);
    if (dw < 1 || dh < 1) return imageData;

    const out = new Uint8ClampedArray(dw * dh * 4);
    const sd = imageData.data;

    for (let dy = 0; dy < dh; dy++) {
      for (let dx = 0; dx < dw; dx++) {
        // Average the cell block
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        const sy0 = Math.floor(dy * cellSize);
        const sx0 = Math.floor(dx * cellSize);
        const sy1 = Math.min(Math.floor((dy + 1) * cellSize), sh);
        const sx1 = Math.min(Math.floor((dx + 1) * cellSize), sw);
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            const i = (sy * sw + sx) * 4;
            r += sd[i]; g += sd[i + 1]; b += sd[i + 2]; a += sd[i + 3];
            cnt++;
          }
        }
        const di = (dy * dw + dx) * 4;
        out[di] = r / cnt;
        out[di + 1] = g / cnt;
        out[di + 2] = b / cnt;
        out[di + 3] = a / cnt;
      }
    }
    return new ImageData(out, dw, dh);
  }

  downscaleBilinear(imageData, targetWidth) {
    const sw = imageData.width;
    const sh = imageData.height;
    const dw = targetWidth;
    const dh = Math.round(sh * (targetWidth / sw));
    if (dw < 1 || dh < 1) return imageData;
    
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = sw;
    srcCanvas.height = sh;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.putImageData(imageData, 0, 0);
    
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = dw;
    dstCanvas.height = dh;
    const dstCtx = dstCanvas.getContext('2d');
    
    dstCtx.imageSmoothingEnabled = true;
    dstCtx.imageSmoothingQuality = 'high';
    dstCtx.drawImage(srcCanvas, 0, 0, dw, dh);
    
    return dstCtx.getImageData(0, 0, dw, dh);
  }

  // ─── Step 4: Median Filter ───
  medianFilter(imageData, radius) {
    if (radius < 1) return imageData;
    const w = imageData.width, h = imageData.height;
    const src = imageData.data;
    const dst = new Uint8ClampedArray(src.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rs = [], gs = [], bs = [];
        for (let fy = -radius; fy <= radius; fy++) {
          for (let fx = -radius; fx <= radius; fx++) {
            const nx = Math.max(0, Math.min(w - 1, x + fx));
            const ny = Math.max(0, Math.min(h - 1, y + fy));
            const i = (ny * w + nx) * 4;
            rs.push(src[i]); gs.push(src[i + 1]); bs.push(src[i + 2]);
          }
        }
        rs.sort((a, b) => a - b);
        gs.sort((a, b) => a - b);
        bs.sort((a, b) => a - b);
        const mid = Math.floor(rs.length / 2);
        const di = (y * w + x) * 4;
        dst[di] = rs[mid];
        dst[di + 1] = gs[mid];
        dst[di + 2] = bs[mid];
        dst[di + 3] = src[di + 3]; // preserve alpha
      }
    }
    return new ImageData(dst, w, h);
  }

  // ─── Step 5: Color Quantization (Median Cut) ───
  quantize(imageData, maxColors, lockedColors = [], dither = false) {
    const w = imageData.width, h = imageData.height;
    const src = imageData.data;

    // Collect opaque pixels
    const pixels = [];
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] > 128) pixels.push([src[i], src[i + 1], src[i + 2]]);
    }
    if (pixels.length === 0) return { imageData, palette: lockedColors };

    // Median Cut (reduce budget by number of locked colors)
    const cutCount = Math.max(1, maxColors - lockedColors.length);
    let palette = this._medianCut(pixels, cutCount);

    // Merge locked colors into final palette
    palette = [...lockedColors, ...palette];

    const dst = new Uint8ClampedArray(src.length);
    
    if (!dither) {
      // Map each pixel to nearest palette color
      for (let i = 0; i < src.length; i += 4) {
        if (src[i + 3] <= 128) {
          dst[i + 3] = 0; // transparent
          continue;
        }
        const nearest = this._nearestColor([src[i], src[i + 1], src[i + 2]], palette);
        dst[i] = nearest[0];
        dst[i + 1] = nearest[1];
        dst[i + 2] = nearest[2];
        dst[i + 3] = 255;
      }
    } else {
      // Floyd-Steinberg Dithering
      const errArr = new Float32Array(src); // working copy for accumulating error
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (errArr[i + 3] <= 128) {
            dst[i + 3] = 0;
            continue;
          }
          
          const oldR = errArr[i];
          const oldG = errArr[i + 1];
          const oldB = errArr[i + 2];
          
          const nearest = this._nearestColor([oldR, oldG, oldB], palette);
          const newR = nearest[0];
          const newG = nearest[1];
          const newB = nearest[2];
          
          dst[i] = newR;
          dst[i + 1] = newG;
          dst[i + 2] = newB;
          dst[i + 3] = 255;
          
          const errR = oldR - newR;
          const errG = oldG - newG;
          const errB = oldB - newB;
          
          // Distribute error
          // right
          if (x + 1 < w) {
            const idx = (y * w + (x + 1)) * 4;
            if (errArr[idx + 3] > 128) {
               errArr[idx] += errR * 7/16;
               errArr[idx+1] += errG * 7/16;
               errArr[idx+2] += errB * 7/16;
            }
          }
          // below-left
          if (x - 1 >= 0 && y + 1 < h) {
            const idx = ((y + 1) * w + (x - 1)) * 4;
            if (errArr[idx + 3] > 128) {
               errArr[idx] += errR * 3/16;
               errArr[idx+1] += errG * 3/16;
               errArr[idx+2] += errB * 3/16;
            }
          }
          // below
          if (y + 1 < h) {
            const idx = ((y + 1) * w + x) * 4;
            if (errArr[idx + 3] > 128) {
               errArr[idx] += errR * 5/16;
               errArr[idx+1] += errG * 5/16;
               errArr[idx+2] += errB * 5/16;
            }
          }
          // below-right
          if (x + 1 < w && y + 1 < h) {
            const idx = ((y + 1) * w + (x + 1)) * 4;
            if (errArr[idx + 3] > 128) {
               errArr[idx] += errR * 1/16;
               errArr[idx+1] += errG * 1/16;
               errArr[idx+2] += errB * 1/16;
            }
          }
        }
      }
    }
    
    return { imageData: new ImageData(dst, w, h), palette };
  }

  _medianCut(pixels, maxColors) {
    let buckets = [pixels];
    while (buckets.length < maxColors) {
      // Find bucket with largest range
      let bestIdx = 0, bestRange = -1, bestChannel = 0;
      for (let i = 0; i < buckets.length; i++) {
        for (let ch = 0; ch < 3; ch++) {
          const vals = buckets[i].map(p => p[ch]);
          const range = Math.max(...vals) - Math.min(...vals);
          if (range > bestRange) {
            bestRange = range;
            bestIdx = i;
            bestChannel = ch;
          }
        }
      }
      if (bestRange <= 0) break;
      const bucket = buckets.splice(bestIdx, 1)[0];
      bucket.sort((a, b) => a[bestChannel] - b[bestChannel]);
      const mid = Math.floor(bucket.length / 2);
      buckets.push(bucket.slice(0, mid), bucket.slice(mid));
    }

    return buckets.map(b => {
      const avg = [0, 0, 0];
      for (const p of b) { avg[0] += p[0]; avg[1] += p[1]; avg[2] += p[2]; }
      return [Math.round(avg[0] / b.length), Math.round(avg[1] / b.length), Math.round(avg[2] / b.length)];
    });
  }

  _nearestColor(pixel, palette) {
    let best = palette[0], bestDist = Infinity;
    for (const c of palette) {
      const dist = (pixel[0] - c[0]) ** 2 + (pixel[1] - c[1]) ** 2 + (pixel[2] - c[2]) ** 2;
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
  }

  // ─── Outline Generation ───
  addOutline(imageData, hexColor) {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    const w = imageData.width;
    const h = imageData.height;
    
    const nw = w + 2;
    const nh = h + 2;
    const out = new Uint8ClampedArray(nw * nh * 4);
    
    // Copy original image to center
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const dstIdx = ((y + 1) * nw + (x + 1)) * 4;
        out[dstIdx] = imageData.data[srcIdx];
        out[dstIdx + 1] = imageData.data[srcIdx + 1];
        out[dstIdx + 2] = imageData.data[srcIdx + 2];
        out[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }

    const finalOut = new Uint8ClampedArray(out);
    
    const isSolid = (x, y) => {
      if (x < 0 || x >= nw || y < 0 || y >= nh) return false;
      return out[(y * nw + x) * 4 + 3] > 128; // original solid pixel
    };

    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const idx = (y * nw + x) * 4;
        // Outline where current is transparent but touching solid
        if (out[idx + 3] < 128) {
          if (isSolid(x - 1, y) || isSolid(x + 1, y) || isSolid(x, y - 1) || isSolid(x, y + 1)) {
            finalOut[idx] = r;
            finalOut[idx + 1] = g;
            finalOut[idx + 2] = b;
            finalOut[idx + 3] = 255;
          }
        }
      }
    }
    return new ImageData(finalOut, nw, nh);
  }

  // ─── Count unique colors ───
  countUniqueColors(imageData) {
    const colors = new Set();
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 128) {
        colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      }
    }
    return colors.size;
  }

  // ─── Full pipeline ───
  process({ medianRadius = 1, maxColors = null, targetWidth = null, lockedColors = [], photoMode = false, outline = false, outlineColor = '#000000', dither = false }) {
    if (!this.original) throw new Error('No image loaded');
    let data = new ImageData(
      new Uint8ClampedArray(this.original.data),
      this.original.width, this.original.height
    );

    // 1. Remove BG
    data = this.removeBackground(data);

    // 2. Auto Crop
    data = this.autoCrop(data);

    // 3. Downscale
    let cellSize = 1;
    if (photoMode) {
      // Photo mode: Bilinear resize to target width (default 64 if not set)
      const tw = (targetWidth && targetWidth > 0) ? targetWidth : 64;
      if (data.width > tw) {
        data = this.downscaleBilinear(data, tw);
        cellSize = this.original.width / data.width;
      }
    } else {
      // Pixel mode: Detect grid and nearest-neighbor downscale
      if (targetWidth && targetWidth > 0) {
        cellSize = data.width / targetWidth;
      } else {
        cellSize = this.detectGridSize(data);
      }
      if (cellSize > 1) {
        data = this.downscaleNearest(data, cellSize);
      }
    }

    // 4. Median filter
    if (medianRadius > 0) {
      data = this.medianFilter(data, medianRadius);
    }

    // 5. Count unique colors & recommend
    const uniqueColors = this.countUniqueColors(data);
    const recommended = Math.min(uniqueColors, Math.max(8, Math.ceil(uniqueColors * 0.6)));
    const finalMaxColors = maxColors || recommended;

    // 6. Quantize
    let { imageData: quantized, palette } = this.quantize(data, finalMaxColors, lockedColors, dither);

    // 7. Outline
    if (outline) {
      quantized = this.addOutline(quantized, outlineColor);
      
      const r = parseInt(outlineColor.slice(1, 3), 16);
      const g = parseInt(outlineColor.slice(3, 5), 16);
      const b = parseInt(outlineColor.slice(5, 7), 16);
      const exists = palette.some(c => c[0]===r && c[1]===g && c[2]===b);
      if (!exists) palette.push([r, g, b]);
    }

    return {
      imageData: quantized,
      width: quantized.width,
      height: quantized.height,
      palette,
      detectedCellSize: Math.round(cellSize),
      uniqueColorsBefore: uniqueColors,
      recommendedColors: recommended
    };
  }
}
