/**
 * app.js — UI Controller for Pixel Art Processor
 */
import { PixelArtProcessor } from './processor.js';

const processor = new PixelArtProcessor();

// ── DOM refs ──
const $ = (s) => document.querySelector(s);
const dropzone       = $('#dropzone');
const fileInput      = $('#fileInput');
const inputCanvas    = $('#inputCanvas');
const outputCanvas   = $('#outputCanvas');
const inputEmpty     = $('#inputEmpty');
const outputEmpty    = $('#outputEmpty');
const inputDim       = $('#inputDim');
const outputDim      = $('#outputDim');
const statusText     = $('#statusText');
const medianSlider   = $('#medianRadius');
const medianVal      = $('#medianVal');
const colorsSlider   = $('#maxColors');
const colorsVal      = $('#colorsVal');
const targetWidth    = $('#targetWidth');
const btnProcess     = $('#btnProcess');
const btnExport      = $('#btnExport');
const overlay        = $('#processingOverlay');
const paletteBar     = $('#paletteBar');
const paletteColors  = $('#paletteColors');
const paletteCount   = $('#paletteCount');
const infoGroup      = $('#infoGroup');
const chipCellSize   = $('#chipCellSize');
const chipOrigSize   = $('#chipOrigSize');
const chipUnique     = $('#chipUniqueColors');
const badgeRecommend = $('#badgeRecommend');
const inputBody      = $('#inputBody');
const outputBody     = $('#outputBody');
const inputZoomCtrl  = $('#inputZoomControls');
const outputZoomCtrl = $('#outputZoomControls');
const inputZoomLvl   = $('#inputZoomLevel');
const outputZoomLvl  = $('#outputZoomLevel');
const lockedColorsGroup = $('#lockedColorsGroup');
const lockedColorsList  = $('#lockedColorsList');
const photoModeCb       = $('#photoMode');
const ditherModeCb      = $('#ditherMode');
const outlineModeCb     = $('#outlineMode');
const outlineColorGroup = $('#outlineColorGroup');
const outlineColorInput = $('#outlineColor');
const batchFileList     = $('#batchFileList');
const batchSettingsGroup= $('#batchSettingsGroup');
const exportBtnText     = $('#exportBtnText');
const batchPrefix       = $('#batchPrefix');
const batchStartIndex   = $('#batchStartIndex');

let lastResult = null;
let lockedColors = [];
let loadedFiles = [];

// ── Zoom State ──
const zoomState = {
  input: { scale: 1, min: 0.25, max: 32 },
  output: { scale: 1, min: 0.25, max: 64 }
};

// ── Drag & Drop ──
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length > 0) handleFiles(files);
});
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files).filter(f => f.type.startsWith('image/'));
  if (files.length > 0) handleFiles(files);
});

// ── Sliders & Controls ──
medianSlider.addEventListener('input', () => {
  medianVal.textContent = medianSlider.value;
});
colorsSlider.addEventListener('input', () => {
  colorsVal.textContent = colorsSlider.value;
});

outlineModeCb.addEventListener('change', () => {
  outlineColorGroup.style.display = outlineModeCb.checked ? 'flex' : 'none';
});

// ── Load Image ──
async function handleFiles(files) {
  loadedFiles = files;
  
  if (loadedFiles.length > 1) {
    batchSettingsGroup.style.display = 'block';
    batchFileList.style.display = 'block';
    let html = loadedFiles.slice(0, 5).map(f => `<div>${f.name}</div>`).join('');
    if (loadedFiles.length > 5) html += `<div>+ ${loadedFiles.length - 5} file khác</div>`;
    batchFileList.innerHTML = html;
    exportBtnText.textContent = '📦 Xuất Batch (ZIP)';
  } else {
    batchSettingsGroup.style.display = 'none';
    batchFileList.style.display = 'none';
    exportBtnText.textContent = '💾 Xuất PNG';
  }

  // Load first file as preview
  await handleFile(loadedFiles[0]);
}

async function handleFile(file) {
  statusText.textContent = 'Đang tải ảnh…';
  try {
    const info = await processor.loadFromFile(file);
    
    // Clear previous state
    lastResult = null;
    lockedColors = [];
    renderLockedColors();
    lockedColorsGroup.style.display = 'none';

    showInputCanvas(processor.original, info.width, info.height);
    inputDim.textContent = `${info.width} × ${info.height}`;
    statusText.textContent = `Đã tải — ${info.width}×${info.height}`;
    btnProcess.disabled = false;

    // Clear previous output
    outputCanvas.style.display = 'none';
    outputEmpty.style.display = '';
    outputDim.textContent = '—';
    paletteBar.style.display = 'none';
    infoGroup.style.display = 'none';
    btnExport.disabled = true;
  } catch (err) {
    statusText.textContent = 'Lỗi tải ảnh!';
    console.error(err);
  }
}

function showInputCanvas(imageData, w, h) {
  inputCanvas.width = w;
  inputCanvas.height = h;
  inputCanvas.getContext('2d').putImageData(imageData, 0, 0);
  inputCanvas.style.display = '';
  inputEmpty.style.display = 'none';
  inputZoomCtrl.style.display = '';
  zoomFit('input');
}

// ── Locked Colors ──
inputCanvas.addEventListener('click', (e) => {
  if (!processor.original) return;
  const rect = inputCanvas.getBoundingClientRect();
  
  // Calculate clicked coordinate relative to original image size
  const scaleX = inputCanvas.width / rect.width;
  const scaleY = inputCanvas.height / rect.height;
  
  const cx = Math.floor((e.clientX - rect.left) * scaleX);
  const cy = Math.floor((e.clientY - rect.top) * scaleY);

  if (cx >= 0 && cx < inputCanvas.width && cy >= 0 && cy < inputCanvas.height) {
    const ctx = inputCanvas.getContext('2d');
    
    // Sample a 5x5 area around the click
    const radius = 2;
    const sx = Math.max(0, cx - radius);
    const sy = Math.max(0, cy - radius);
    const sw = Math.min(inputCanvas.width - sx, cx - sx + radius + 1);
    const sh = Math.min(inputCanvas.height - sy, cy - sy + radius + 1);
    
    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      if (imgData[i + 3] > 128) { // Ignore transparent
        r += imgData[i];
        g += imgData[i + 1];
        b += imgData[i + 2];
        count++;
      }
    }
    
    if (count > 0) {
      const rgb = [Math.round(r/count), Math.round(g/count), Math.round(b/count)];
      
      // Euclidean color distance
      const colorDist = (c1, c2) => Math.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2);
      const THRESHOLD = 30; // visual similarity threshold
      
      const similarIndex = lockedColors.findIndex(c => colorDist(c, rgb) < THRESHOLD);
      
      if (similarIndex !== -1) {
        // Average with existing locked color to refine it
        const ex = lockedColors[similarIndex];
        lockedColors[similarIndex] = [
          Math.round((ex[0] + rgb[0]) / 2),
          Math.round((ex[1] + rgb[1]) / 2),
          Math.round((ex[2] + rgb[2]) / 2)
        ];
        renderLockedColors();
      } else if (lockedColors.length < 16) {
        lockedColors.push(rgb);
        renderLockedColors();
      }
    }
  }
});

function renderLockedColors() {
  lockedColorsGroup.style.display = lockedColors.length > 0 ? '' : 'none';
  lockedColorsList.innerHTML = '';
  
  lockedColors.forEach((color, index) => {
    const swatch = document.createElement('div');
    swatch.className = 'locked-swatch';
    swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    swatch.title = 'Click để xóa';
    
    // Calculate luminance for text color contrast
    const luminance = (0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]) / 255;
    if (luminance > 0.6) {
      swatch.style.color = 'black';
      swatch.style.textShadow = 'none';
    }

    swatch.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering canvas click
      lockedColors.splice(index, 1);
      renderLockedColors();
    });
    
    lockedColorsList.appendChild(swatch);
  });
}

// ── Process ──
btnProcess.addEventListener('click', () => {
  runProcess();
});

async function runProcess() {
  overlay.classList.add('active');
  statusText.textContent = 'Đang xử lý…';
  btnProcess.disabled = true;

  // Run on next frame to let overlay paint
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const tw = targetWidth.value ? parseInt(targetWidth.value) : null;
    const result = processor.process({
      medianRadius: parseInt(medianSlider.value),
      maxColors: parseInt(colorsSlider.value),
      targetWidth: tw,
      lockedColors: lockedColors,
      photoMode: photoModeCb.checked,
      dither: ditherModeCb.checked,
      outline: outlineModeCb.checked,
      outlineColor: outlineColorInput.value
    });

    lastResult = result;

    // Show output
    showOutputCanvas(result.imageData, result.width, result.height);
    outputDim.textContent = `${result.width} × ${result.height}`;

    // Palette
    showPalette(result.palette);

    // Info chips
    infoGroup.style.display = '';
    chipCellSize.textContent = `Cell: ${result.detectedCellSize}px`;
    chipOrigSize.textContent = `Gốc: ${processor.width}×${processor.height}`;
    chipUnique.textContent = `${result.uniqueColorsBefore} màu gốc`;
    badgeRecommend.textContent = `Đề xuất: ${result.recommendedColors}`;

    // Update slider recommended hint
    colorsSlider.value = parseInt(colorsSlider.value); // keep user's choice

    statusText.textContent = `Xong — ${result.width}×${result.height}, ${result.palette.length} màu`;
    btnExport.disabled = false;
    btnProcess.disabled = false;
  } catch (err) {
    statusText.textContent = 'Lỗi xử lý!';
    console.error(err);
    btnProcess.disabled = false;
  } finally {
    overlay.classList.remove('active');
  }
}

function showOutputCanvas(imageData, w, h) {
  outputCanvas.width = w;
  outputCanvas.height = h;
  outputCanvas.getContext('2d').putImageData(imageData, 0, 0);
  outputCanvas.style.display = '';
  outputEmpty.style.display = 'none';
  outputZoomCtrl.style.display = '';
  outputCanvas.classList.add('animate-in');
  setTimeout(() => outputCanvas.classList.remove('animate-in'), 400);
  // Auto fit-to-view for tiny pixel art
  zoomFit('output');
}

function showPalette(palette) {
  paletteColors.innerHTML = '';
  palette.forEach(([r, g, b]) => {
    const hex = rgbToHex(r, g, b);
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.background = hex;

    const tip = document.createElement('span');
    tip.className = 'palette-swatch__tooltip';
    tip.textContent = hex.toUpperCase();
    swatch.appendChild(tip);

    swatch.addEventListener('click', () => {
      navigator.clipboard.writeText(hex.toUpperCase()).catch(() => {});
      tip.textContent = 'Copied!';
      setTimeout(() => tip.textContent = hex.toUpperCase(), 1200);
    });

    paletteColors.appendChild(swatch);
  });
  paletteCount.textContent = `${palette.length} màu`;
  paletteBar.style.display = '';
  paletteBar.classList.add('animate-in');
  setTimeout(() => paletteBar.classList.remove('animate-in'), 400);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── Export ──
btnExport.addEventListener('click', async () => {
  if (loadedFiles.length > 1) {
    exportBtnText.textContent = 'Đang nén...';
    btnExport.disabled = true;
    btnProcess.disabled = true;
    
    const zip = new JSZip();
    const prefix = batchPrefix.value || 'pixel_';
    let startIndex = parseInt(batchStartIndex.value) || 1;
    
    const tw = targetWidth.value ? parseInt(targetWidth.value) : null;
    const opts = {
      medianRadius: parseInt(medianSlider.value),
      maxColors: parseInt(colorsSlider.value),
      targetWidth: tw,
      lockedColors: lockedColors,
      photoMode: photoModeCb.checked,
      dither: ditherModeCb.checked,
      outline: outlineModeCb.checked,
      outlineColor: outlineColorInput.value
    };

    for (let i = 0; i < loadedFiles.length; i++) {
      const file = loadedFiles[i];
      statusText.textContent = `Xử lý ${i+1}/${loadedFiles.length}...`;
      await new Promise(r => setTimeout(r, 10)); // UI yield
      
      await processor.loadFromFile(file);
      const res = processor.process(opts);
      
      const c = document.createElement('canvas');
      c.width = res.width;
      c.height = res.height;
      c.getContext('2d').putImageData(res.imageData, 0, 0);
      
      const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
      
      const idxStr = startIndex.toString().padStart(2, '0');
      zip.file(`${prefix}${idxStr}.png`, blob);
      startIndex++;
    }
    
    statusText.textContent = 'Đang lưu ZIP...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const defaultName = `pixel_art_batch_${Date.now()}.zip`;
    
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.saveFile) {
      const buffer = await zipBlob.arrayBuffer();
      const saved = await window.electronAPI.saveFile(defaultName, new Uint8Array(buffer));
      if (saved) statusText.textContent = `Đã lưu: ${saved}`;
    } else if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
        statusText.textContent = `Đã lưu ZIP`;
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      statusText.textContent = `Đã tải ZIP`;
    }
    
    exportBtnText.textContent = '📦 Xuất Batch (ZIP)';
    btnExport.disabled = false;
    btnProcess.disabled = false;
    
    // restore preview of the first file using current settings
    await handleFile(loadedFiles[0]);
    runProcess(); // re-process preview
    
  } else {
    // Single file export
    if (!lastResult) return;
    const { imageData, width, height } = lastResult;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d').putImageData(imageData, 0, 0);

    c.toBlob(async (blob) => {
      const buffer = await blob.arrayBuffer();
      const defaultName = `pixel_art_${width}x${height}.png`;

      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.saveFile) {
        const saved = await window.electronAPI.saveFile(defaultName, new Uint8Array(buffer));
        if (saved) {
          statusText.textContent = `Đã lưu: ${saved}`;
        }
      } else if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          statusText.textContent = `Đã lưu: ${handle.name}`;
        } catch (err) {
          if (err.name !== 'AbortError') console.error(err);
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        statusText.textContent = `Đã tải xuống: ${defaultName}`;
      }
    }, 'image/png');
  }
});

// ── Global Drag & Drop (anywhere on window) ──
document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btnProcess.disabled) {
    e.preventDefault();
    runProcess();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (!btnExport.disabled) btnExport.click();
  }
});

// ═══════════════════════════════════════════
// ── Zoom System ──
// ═══════════════════════════════════════════

function getZoomRefs(target) {
  return target === 'input'
    ? { canvas: inputCanvas, body: inputBody, label: inputZoomLvl, state: zoomState.input }
    : { canvas: outputCanvas, body: outputBody, label: outputZoomLvl, state: zoomState.output };
}

function applyZoom(target) {
  const { canvas, label, state } = getZoomRefs(target);
  const w = canvas.width * state.scale;
  const h = canvas.height * state.scale;
  canvas.style.width = `${Math.round(w)}px`;
  canvas.style.height = `${Math.round(h)}px`;
  label.textContent = `${Math.round(state.scale * 100)}%`;
}

function zoomTo(target, newScale) {
  const { state } = getZoomRefs(target);
  state.scale = Math.max(state.min, Math.min(state.max, newScale));
  applyZoom(target);
}

function zoomIn(target) {
  const { state } = getZoomRefs(target);
  // Step: ×1.5 for small, ×1.25 for large
  const factor = state.scale < 4 ? 1.5 : 1.25;
  zoomTo(target, state.scale * factor);
}

function zoomOut(target) {
  const { state } = getZoomRefs(target);
  const factor = state.scale < 4 ? 1.5 : 1.25;
  zoomTo(target, state.scale / factor);
}

function zoomFit(target) {
  const { canvas, body, state } = getZoomRefs(target);
  const containerW = body.clientWidth - 32; // padding
  const containerH = body.clientHeight - 32;
  if (canvas.width === 0 || canvas.height === 0) return;
  const fitScale = Math.min(containerW / canvas.width, containerH / canvas.height);
  state.scale = Math.max(1, Math.round(fitScale)); // At least 1×, snap to integer for crisp pixels
  applyZoom(target);
}

// ── Scroll-wheel zoom on canvas ──
[inputBody, outputBody].forEach((body) => {
  const target = body === inputBody ? 'input' : 'output';
  body.addEventListener('wheel', (e) => {
    // Only zoom when canvas is visible
    const { canvas } = getZoomRefs(target);
    if (canvas.style.display === 'none') return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(target);
    else zoomOut(target);
  }, { passive: false });
});

// ── Zoom button clicks ──
document.querySelectorAll('.zoom-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const action = btn.dataset.action;
    if (action === 'in') zoomIn(target);
    else if (action === 'out') zoomOut(target);
    else if (action === 'fit') zoomFit(target);
  });
});
