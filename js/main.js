/**
 * main.js — APA Aluminum Profile Optimizer
 * Vanilla JS ES Module. No framework.
 */

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const END_TRIM = 75;            // mm trimmed each end of a bar
const MIN_GAP  = 300;           // min gap between bar lengths in auto-optimize
const STANDARD_LENGTHS = [];    // built dynamically 4500–6400 step 100
for (let l = 4500; l <= 6400; l += 100) STANDARD_LENGTHS.push(l);

const PIECE_COLORS = [
  '#3b82f6','#ef4444','#8b5cf6','#f59e0b','#10b981',
  '#ec4899','#06b6d4','#f97316','#84cc16','#14b8a6',
  '#a855f7','#dc2626',
];

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let profiles    = [];   // {id,name,barLen,kerf,stock}
let pieces      = [];   // {id,profId,label,size,qty}
let pid         = 0;
let rid         = 0;
let lastResult  = null;
let lastOptResult = null;
let allData     = [];   // processor extracted rows
let filteredData = [];
let db          = null;
let curProjId   = null;
let curProjName = 'โปรเจกต์ใหม่';
let unsaved     = false;

// Processor UI state
let procPage    = 1;
const PROC_PAGE_SIZE = 50;
let procSort    = { col: null, dir: 1 };

// ═══════════════════════════════════════════════════════════
//  INDEXEDDB
// ═══════════════════════════════════════════════════════════
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('aluminumOptimizer', 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('projects')) {
        d.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess  = e => { db = e.target.result; resolve(); };
    req.onerror    = e => reject(e.target.error);
  });
}

function dbSaveProject(name, id = null) {
  return new Promise((resolve, reject) => {
    const snap = { profiles: JSON.parse(JSON.stringify(profiles)), pieces: JSON.parse(JSON.stringify(pieces)) };
    const tx   = db.transaction('projects', 'readwrite');
    const st   = tx.objectStore('projects');
    const now  = new Date().toISOString();
    const obj  = id
      ? { id, name, updatedAt: now, snap }
      : { name, createdAt: now, updatedAt: now, snap };
    const req  = id ? st.put(obj) : st.add(obj);
    req.onsuccess = e => resolve(typeof e.target.result === 'number' ? e.target.result : id);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbListProjects() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('projects', 'readonly');
    const req = tx.objectStore('projects').getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDeleteProject(id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('projects', 'readwrite');
    const req = tx.objectStore('projects').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('th-TH'); }
function fmtPct(r) { return (r * 100).toFixed(1) + '%'; }

function colorForLabel(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return PIECE_COLORS[h % PIECE_COLORS.length];
}

function markUnsaved() {
  unsaved = true;
  el('projUnsaved').hidden = false;
}

function el(id) { return document.getElementById(id); }

function showModal(id)  { el(id).hidden = false; }
function hideModal(id)  { el(id).hidden = true; }

// ═══════════════════════════════════════════════════════════
//  RESET / NEW PROJECT
// ═══════════════════════════════════════════════════════════
function newProject(fullReset = false) {
  profiles = [];
  pieces   = [];
  pid = 0; rid = 0;
  lastResult = null; lastOptResult = null;
  curProjId  = null;
  curProjName = 'โปรเจกต์ใหม่';
  unsaved = false;

  if (fullReset) {
    allData = []; filteredData = [];
    el('fileInfo').hidden  = true;
    el('procStats').hidden = true;
    el('procTableCard').hidden = true;
    renderProcTable();
  }

  // Add default profile
  addProfile('รายการตัด', '6400', 2, null);

  el('projNameDisplay').textContent = curProjName;
  el('projUnsaved').hidden = true;
  renderAll();
  el('stdResults').hidden = true;
  el('stdResults').innerHTML = '';
  el('autoResults').hidden = true;
  el('autoResults').innerHTML = '';
}

// ═══════════════════════════════════════════════════════════
//  PROFILES
// ═══════════════════════════════════════════════════════════
function addProfile(name = 'โปรไฟล์ใหม่', barLen = '6400', kerf = 2, stock = null) {
  pid++;
  profiles.push({ id: pid, name, barLen, kerf, stock });
  renderProfileRow(pid);
  updateBadges();
  markUnsaved();
}

function deleteProfile(id) {
  profiles = profiles.filter(p => p.id !== id);
  pieces   = pieces.filter(r => r.profId !== id);
  renderAll();
  markUnsaved();
}

function renderProfileRow(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  renderProfileRowInto(p, 'profTbody2');
  renderProfileRowInto(p, 'profTbody3');
  updateBadges();
}

function renderProfileRowInto(p, tbodyId) {
  const suffix  = tbodyId === 'profTbody2' ? '' : '_3';
  const rowId   = `prof${suffix}-${p.id}`;
  const tbody   = el(tbodyId);
  let row = document.getElementById(rowId);

  if (!row) {
    row = document.createElement('tr');
    row.id = rowId;
    tbody.appendChild(row);
  }

  row.innerHTML = `
    <td><input class="input" type="text"   value="${escHtml(p.name)}"   id="pname${suffix}-${p.id}"   style="min-width:160px;" /></td>
    <td><input class="input" type="text"   value="${escHtml(p.barLen)}" id="pbarlen${suffix}-${p.id}" style="width:130px;" placeholder="6400 หรือ 6400,5500" /></td>
    <td><input class="input" type="number" value="${p.stock ?? ''}"     id="pstock${suffix}-${p.id}"  style="width:80px;" placeholder="∞" min="0" /></td>
    <td><input class="input" type="number" value="${p.kerf}"            id="pkerf${suffix}-${p.id}"   style="width:60px;" min="0" /></td>
    <td><button class="del-btn" data-del-prof="${p.id}">
      <span class="material-symbols-outlined">close</span>
    </button></td>
  `;

  // bind inputs
  row.querySelector(`#pname${suffix}-${p.id}`)  .addEventListener('change', e => { p.name = e.target.value; syncProfileName(p); markUnsaved(); });
  row.querySelector(`#pbarlen${suffix}-${p.id}`).addEventListener('change', e => { p.barLen = e.target.value.trim(); syncProfile(p, suffix === '' ? '_3' : ''); markUnsaved(); });
  row.querySelector(`#pstock${suffix}-${p.id}`) .addEventListener('change', e => { p.stock = e.target.value === '' ? null : parseInt(e.target.value); syncProfile(p, suffix === '' ? '_3' : ''); markUnsaved(); });
  row.querySelector(`#pkerf${suffix}-${p.id}`)  .addEventListener('change', e => { p.kerf  = parseFloat(e.target.value) || 0; syncProfile(p, suffix === '' ? '_3' : ''); markUnsaved(); });
  row.querySelector(`[data-del-prof="${p.id}"]`).addEventListener('click',  () => deleteProfile(p.id));
}

function syncProfileName(p) {
  // sync name across both tables
  for (const suffix of ['', '_3']) {
    const inp = document.getElementById(`pname${suffix}-${p.id}`);
    if (inp) inp.value = p.name;
  }
  // refresh piece dropdowns
  renderPieceDropdowns();
}

function syncProfile(p, otherSuffix) {
  const s = otherSuffix;
  const barInp   = document.getElementById(`pbarlen${s}-${p.id}`);
  const stockInp = document.getElementById(`pstock${s}-${p.id}`);
  const kerfInp  = document.getElementById(`pkerf${s}-${p.id}`);
  if (barInp)   barInp.value   = p.barLen;
  if (stockInp) stockInp.value = p.stock ?? '';
  if (kerfInp)  kerfInp.value  = p.kerf;
}

function renderAllProfiles() {
  el('profTbody2').innerHTML = '';
  el('profTbody3').innerHTML = '';
  profiles.forEach(p => {
    renderProfileRowInto(p, 'profTbody2');
    renderProfileRowInto(p, 'profTbody3');
  });
}

// ═══════════════════════════════════════════════════════════
//  PIECES
// ═══════════════════════════════════════════════════════════
function addPiece(profId = null, label = '', size = 0, qty = 1) {
  rid++;
  const pid0 = profId ?? (profiles[0]?.id ?? 1);
  pieces.push({ id: rid, profId: pid0, label, size, qty });
  renderPieceRow(rid);
  updateSummary();
  updateBadges();
  markUnsaved();
}

function deletePiece(id) {
  pieces = pieces.filter(r => r.id !== id);
  el(`piece-${id}`)?.remove();
  el(`piece_3-${id}`)?.remove();
  updateSummary();
  updateBadges();
  markUnsaved();
}

function renderPieceRow(id) {
  const r = pieces.find(x => x.id === id);
  if (!r) return;
  renderPieceRowInto(r, 'pieceTbody2');
  renderPieceRowInto(r, 'pieceTbody3');
}

function renderPieceRowInto(r, tbodyId) {
  const suffix = tbodyId === 'pieceTbody2' ? '' : '_3';
  const rowId  = `piece${suffix}-${r.id}`;
  const tbody  = el(tbodyId);
  let row = document.getElementById(rowId);

  if (!row) {
    row = document.createElement('tr');
    row.id = rowId;
    tbody.appendChild(row);
  }

  const profOptions = profiles.map(p =>
    `<option value="${p.id}" ${p.id === r.profId ? 'selected' : ''}>${escHtml(p.name)}</option>`
  ).join('');

  row.innerHTML = `
    <td><select class="input" id="psel${suffix}-${r.id}" style="min-width:120px;">${profOptions}</select></td>
    <td><input class="input" type="text"   value="${escHtml(r.label)}" id="plbl${suffix}-${r.id}"  style="width:90px;" /></td>
    <td><input class="input" type="number" value="${r.size  || ''}"    id="psz${suffix}-${r.id}"   style="width:80px;" min="1" placeholder="mm" /></td>
    <td><input class="input" type="number" value="${r.qty   || 1}"     id="pqty${suffix}-${r.id}"  style="width:60px;" min="1" /></td>
    <td class="text-right" id="ptot${suffix}-${r.id}">${fmtNum(r.size * r.qty)}</td>
    <td><button class="del-btn" data-del-piece="${r.id}">
      <span class="material-symbols-outlined">close</span>
    </button></td>
  `;

  const refreshTotal = () => {
    const tot = el(`ptot${suffix}-${r.id}`);
    if (tot) tot.textContent = fmtNum(r.size * r.qty);
    syncPieceOther(r, suffix);
    updateSummary();
    markUnsaved();
  };

  row.querySelector(`#psel${suffix}-${r.id}`).addEventListener('change', e => { r.profId = parseInt(e.target.value); syncPieceOther(r, suffix); markUnsaved(); });
  row.querySelector(`#plbl${suffix}-${r.id}`).addEventListener('change', e => { r.label  = e.target.value; syncPieceOther(r, suffix); markUnsaved(); });
  row.querySelector(`#psz${suffix}-${r.id}`) .addEventListener('change', e => { r.size   = parseFloat(e.target.value) || 0; refreshTotal(); });
  row.querySelector(`#pqty${suffix}-${r.id}`).addEventListener('change', e => { r.qty    = parseInt(e.target.value)   || 1; refreshTotal(); });
  row.querySelector(`[data-del-piece="${r.id}"]`).addEventListener('click', () => deletePiece(r.id));
}

function syncPieceOther(r, thisSuffix) {
  const other = thisSuffix === '' ? '_3' : '';
  const s = other;
  const sel = document.getElementById(`psel${s}-${r.id}`);
  const lbl = document.getElementById(`plbl${s}-${r.id}`);
  const sz  = document.getElementById(`psz${s}-${r.id}`);
  const qty = document.getElementById(`pqty${s}-${r.id}`);
  const tot = document.getElementById(`ptot${s}-${r.id}`);
  if (sel) sel.value = r.profId;
  if (lbl) lbl.value = r.label;
  if (sz)  sz.value  = r.size;
  if (qty) qty.value = r.qty;
  if (tot) tot.textContent = fmtNum(r.size * r.qty);
}

function renderPieceDropdowns() {
  pieces.forEach(r => {
    for (const suffix of ['', '_3']) {
      const sel = document.getElementById(`psel${suffix}-${r.id}`);
      if (!sel) continue;
      sel.innerHTML = profiles.map(p =>
        `<option value="${p.id}" ${p.id === r.profId ? 'selected' : ''}>${escHtml(p.name)}</option>`
      ).join('');
    }
  });
}

function renderAllPieces() {
  el('pieceTbody2').innerHTML = '';
  el('pieceTbody3').innerHTML = '';
  pieces.forEach(r => {
    renderPieceRowInto(r, 'pieceTbody2');
    renderPieceRowInto(r, 'pieceTbody3');
  });
  updateSummary();
}

function renderAll() {
  renderAllProfiles();
  renderAllPieces();
  updateBadges();
}

function updateSummary() {
  const valid = pieces.filter(r => r.size > 0 && r.qty > 0);
  const totalMm = valid.reduce((s, r) => s + r.size * r.qty, 0);
  const totalPcs = valid.reduce((s, r) => s + r.qty, 0);
  const txt = valid.length === 0
    ? '—'
    : `${fmtNum(valid.length)} ประเภท · ${fmtNum(totalPcs)} ชิ้น · รวม ${fmtNum(totalMm)} mm`;
  el('pieceSummary2').textContent = txt;
  el('pieceSummary3').textContent = txt;
}

function updateBadges() {
  const stdCount = pieces.length;
  for (const id of ['badge-std','badge-auto']) {
    const b = el(id);
    b.textContent = stdCount;
    b.classList.toggle('tab-badge--empty', stdCount === 0);
  }
  const procCount = allData.length;
  const bp = el('badge-proc');
  bp.textContent = procCount;
  bp.classList.toggle('tab-badge--empty', procCount === 0);
}

// ═══════════════════════════════════════════════════════════
//  ALGORITHMS
// ═══════════════════════════════════════════════════════════

/** Group pieces by profile name, merging multi-row same-name profiles */
function buildNameGroups(validPieces) {
  const groups = {};

  // First pass: build groups from all profiles
  for (const p of profiles) {
    const key = p.name;
    if (!groups[key]) {
      groups[key] = { name: key, barLens: [], stockMap: {}, kerf: p.kerf, pieces: [] };
    }
    const g = groups[key];
    const lensArr = p.barLen.split(',').map(x => parseInt(x.trim())).filter(x => x > 0);
    for (const L of lensArr) {
      if (!g.barLens.includes(L)) g.barLens.push(L);
      if (p.stock == null) {
        g.stockMap[L] = null; // infinite
      } else {
        if (g.stockMap[L] == null) {
          // stays null (infinite) once set to null
        } else {
          g.stockMap[L] = (g.stockMap[L] ?? 0) + p.stock;
        }
      }
    }
  }

  // Second pass: attach pieces
  for (const r of validPieces) {
    const prof = profiles.find(p => p.id === r.profId);
    if (!prof) continue;
    const g = groups[prof.name];
    if (g) g.pieces.push(r);
  }

  // Drop groups with no pieces
  return Object.values(groups).filter(g => g.pieces.length > 0);
}

/**
 * Best-Fit Decreasing with size-diversity constraint.
 * Returns { bars, unfulfilled, stockUsed }
 */
function solveWithOption(pieceList, barLens, kerf, maxSizes, stockMap) {
  const sortedLens = [...barLens].sort((a, b) => b - a);
  const maxLen     = sortedLens[0] ?? 6400;

  // Expand pieces
  let items = [];
  for (const r of pieceList) {
    for (let i = 0; i < r.qty; i++) {
      items.push({ size: r.size, label: r.label || '__noLabel__' });
    }
  }

  // Detect and handle oversized
  const oversizedBars = [];
  const filtered = items.filter(it => {
    if (it.size > maxLen - 2 * END_TRIM) {
      const special = it.size + 2 * END_TRIM;
      if (!sortedLens.includes(special)) sortedLens.push(special);
    }
    return it.size <= maxLen - 2 * END_TRIM || true; // keep all for now; filter below
  });

  // Remove truly unfittable even in oversized bar
  const unfulfilled = [];
  const workItems   = [];
  for (const it of items) {
    const fits = sortedLens.some(L => it.size <= L - 2 * END_TRIM);
    if (fits) workItems.push(it);
    else unfulfilled.push(it);
  }

  workItems.sort((a, b) => b.size - a.size);

  const bins      = [];
  const stockUsed = {};

  const canOpenBin = (L) => {
    if (stockMap[L] == null) return true;
    return (stockUsed[L] ?? 0) < stockMap[L];
  };

  const openBin = (L) => {
    stockUsed[L] = (stockUsed[L] ?? 0) + 1;
    return { pieces: [], barLen: L, used: 0, remaining: L - 2 * END_TRIM, sizes: new Set(), labels: new Set() };
  };

  for (const it of workItems) {
    // Try best-fit into existing bin
    let bestBin  = null;
    let bestLeft = Infinity;

    for (const bin of bins) {
      const needed = it.size + (bin.pieces.length > 0 ? kerf : 0);
      if (bin.remaining < needed) continue;
      const newSizes = new Set(bin.sizes);
      newSizes.add(it.size);
      if (newSizes.size > maxSizes) continue;
      const leftover = bin.remaining - needed;
      if (leftover < bestLeft) { bestLeft = leftover; bestBin = bin; }
    }

    if (bestBin) {
      const needed = it.size + (bestBin.pieces.length > 0 ? kerf : 0);
      bestBin.pieces.push(it);
      bestBin.used      += needed;
      bestBin.remaining -= needed;
      bestBin.sizes.add(it.size);
      bestBin.labels.add(it.label);
      continue;
    }

    // Open new bin — pick barLen with highest density
    let chosen    = null;
    let bestDens  = -1;

    for (const L of sortedLens) {
      if (!canOpenBin(L)) continue;
      const usable = L - 2 * END_TRIM;
      if (it.size > usable) continue;
      // how many of this item fit?
      const maxFit = Math.floor((usable + kerf) / (it.size + kerf));
      const dens   = (maxFit * it.size + Math.max(0, maxFit - 1) * kerf) / usable;
      if (dens > bestDens || (dens === bestDens && (chosen == null || L < chosen))) {
        bestDens = dens; chosen = L;
      }
    }

    if (chosen == null) {
      unfulfilled.push(it);
      continue;
    }

    const bin = openBin(chosen);
    bin.pieces.push(it);
    bin.used      += it.size;
    bin.remaining -= it.size;
    bin.sizes.add(it.size);
    bin.labels.add(it.label);
    bins.push(bin);
  }

  // Convert Set→Array for serialization
  return {
    bars: bins.map(b => ({ ...b, sizes: [...b.sizes], labels: [...b.labels] })),
    unfulfilled,
    stockUsed,
  };
}

/**
 * Pattern-based solver used in Auto Optimizer.
 */
function solve(pieceList, barLens, kerf, stockMap) {
  const sortedLens = [...barLens].sort((a, b) => b - a);
  const maxLen     = sortedLens[0] ?? 6400;

  let items = [];
  for (const r of pieceList) {
    for (let i = 0; i < r.qty; i++) {
      items.push({ size: r.size, label: r.label || '__noLabel__' });
    }
  }

  // Oversized expansion
  for (const it of items) {
    if (it.size > maxLen - 2 * END_TRIM) {
      const special = it.size + 2 * END_TRIM;
      if (!sortedLens.includes(special)) sortedLens.push(special);
    }
  }

  const unfulfilled = [];
  let   workItems   = [];
  for (const it of items) {
    const fits = sortedLens.some(L => it.size <= L - 2 * END_TRIM);
    if (fits) workItems.push(it);
    else unfulfilled.push(it);
  }
  workItems.sort((a, b) => b.size - a.size);

  const stockUsed = {};
  const bars      = [];

  const canUse = (L) => stockMap[L] == null || (stockUsed[L] ?? 0) < stockMap[L];

  while (workItems.length > 0) {
    // For each bar length, compute best pattern
    let bestPat = null; let bestL = null; let bestEff = -1;

    for (const L of sortedLens) {
      if (!canUse(L)) continue;
      const usable    = L - 2 * END_TRIM;
      // Greedy pattern
      const counts    = {};
      let   remaining = usable;
      for (const it of workItems) {
        if (it.size <= remaining) {
          const needed = it.size + (Object.values(counts).reduce((a,b)=>a+b,0) > 0 ? kerf : 0);
          if (needed <= remaining) {
            counts[it.size] = (counts[it.size] ?? 0) + 1;
            remaining -= needed;
          }
        }
      }
      const used = usable - remaining;
      const eff  = usable > 0 ? used / usable : 0;
      if (eff > bestEff || (eff === bestEff && (bestL == null || L < bestL))) {
        bestEff = eff; bestPat = counts; bestL = L;
      }
    }

    if (!bestL || bestEff <= 0) break;

    // How many times can we repeat this pattern?
    const usable   = bestL - 2 * END_TRIM;
    let   maxTimes = Infinity;
    for (const [szStr, cnt] of Object.entries(bestPat)) {
      const sz    = Number(szStr);
      const avail = workItems.filter(it => it.size === sz).length;
      maxTimes    = Math.min(maxTimes, Math.floor(avail / cnt));
    }
    if (maxTimes === Infinity || maxTimes === 0) maxTimes = 1;

    // Limit by stock
    if (stockUsed[bestL] != null || bestL in stockUsed) {
      const remaining_stock = (stockMap[bestL] ?? Infinity) - (stockUsed[bestL] ?? 0);
      maxTimes = Math.min(maxTimes, remaining_stock);
    } else if (stockMap[bestL] != null) {
      maxTimes = Math.min(maxTimes, stockMap[bestL]);
    }
    if (maxTimes <= 0) maxTimes = 1;

    // Push bars
    for (let t = 0; t < maxTimes; t++) {
      const barPieces = [];
      let   used      = 0;
      for (const [szStr, cnt] of Object.entries(bestPat)) {
        const sz = Number(szStr);
        for (let c = 0; c < cnt; c++) {
          const idx = workItems.findIndex(it => it.size === sz);
          if (idx < 0) continue;
          const it  = workItems.splice(idx, 1)[0];
          const k   = barPieces.length > 0 ? kerf : 0;
          used += it.size + k;
          barPieces.push(it);
        }
      }
      bars.push({ pieces: barPieces, barLen: bestL, used, remaining: usable - used });
      stockUsed[bestL] = (stockUsed[bestL] ?? 0) + 1;
    }
  }

  // Remaining go to unfulfilled
  unfulfilled.push(...workItems);

  return { bars, unfulfilled, stockUsed };
}

/** Calculate overall efficiency */
function calcEff(bars) {
  if (!bars.length) return 0;
  const totUsable = bars.reduce((s, b) => s + b.barLen - 2 * END_TRIM, 0);
  const totUsed   = bars.reduce((s, b) => s + b.used, 0);
  return totUsable > 0 ? totUsed / totUsable : 0;
}

/** Auto-optimize: brute-force search through bar length combinations */
async function optimizeBarLengths(pieceList, kerf, maxLevel, stockMap, onProgress) {
  let best = { eff: -1, lens: null, result: null };

  function tryLens(candidate) {
    // Validate min gap between adjacent sizes
    if (candidate.length > 1) {
      const sorted = [...candidate].sort((a,b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i-1] < MIN_GAP) return;
      }
    }
    const stockMapLocal = {};
    for (const L of candidate) { stockMapLocal[L] = stockMap[L] ?? null; }
    const res = solveWithOption(pieceList, candidate, kerf, 3, stockMapLocal);
    const eff = calcEff(res.bars);
    if (eff > best.eff) { best = { eff, lens: candidate, result: res }; }
  }

  const TARGET = 0.985;
  const all    = STANDARD_LENGTHS;

  function combinations(arr, k) {
    const result = [];
    function helper(start, combo) {
      if (combo.length === k) { result.push([...combo]); return; }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    }
    helper(0, []);
    return result;
  }

  for (let level = 1; level <= maxLevel; level++) {
    const combos = combinations(all, level);
    for (let i = 0; i < combos.length; i++) {
      tryLens(combos[i]);
      // yield every 200 iterations
      if (i % 200 === 0) {
        const progress = ((level - 1) / maxLevel + (i / combos.length) / maxLevel) * 100;
        onProgress(Math.min(progress, 99), `Level ${level}/${maxLevel} — ${i+1}/${combos.length} combinations`);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    onProgress(Math.min((level / maxLevel) * 100, 99), `Level ${level} เสร็จแล้ว — eff: ${fmtPct(best.eff)}`);
    await new Promise(r => setTimeout(r, 0));
    if (best.eff >= TARGET) break;
  }

  return best;
}

// ═══════════════════════════════════════════════════════════
//  CALCULATION — STANDARD
// ═══════════════════════════════════════════════════════════
function calcStandard() {
  const maxSizes   = parseInt(document.querySelector('#sizesPerBar .toggle-btn--active')?.dataset.val ?? '2');
  const validPieces = pieces.filter(r => r.size > 0 && r.qty > 0);

  if (!validPieces.length) {
    alert('ไม่มีรายการชิ้นงาน'); return;
  }

  const groups   = buildNameGroups(validPieces);
  const results  = [];
  const allUnfulfilled = [];

  for (const g of groups) {
    if (!g.barLens.length) continue;
    const res = solveWithOption(g.pieces, g.barLens, g.kerf, maxSizes, g.stockMap);
    results.push({ name: g.name, barLens: g.barLens, ...res });
    allUnfulfilled.push(...res.unfulfilled);
  }

  lastResult = results;

  if (allUnfulfilled.length) {
    const body = el('stockWarnBody');
    body.innerHTML = `<p>รายการต่อไปนี้ไม่สามารถตัดได้เนื่องจากสต็อกไม่เพียงพอ:</p>
      <ul style="margin-top:8px;padding-left:18px;">${allUnfulfilled.map(u => `<li>${u.size} mm (${u.label})</li>`).join('')}</ul>`;
    showModal('modalStockWarn');
  }

  renderStdResults(results);
}

// ═══════════════════════════════════════════════════════════
//  CALCULATION — AUTO
// ═══════════════════════════════════════════════════════════
async function calcAuto() {
  const maxLevel   = parseInt(document.querySelector('#maxBarLevels .toggle-btn--active')?.dataset.val ?? '4');
  const validPieces = pieces.filter(r => r.size > 0 && r.qty > 0);

  if (!validPieces.length) { alert('ไม่มีรายการชิ้นงาน'); return; }

  el('btnCalcAuto').disabled = true;
  el('autoProgress').hidden  = false;
  el('autoResults').hidden   = true;

  const groups  = buildNameGroups(validPieces);
  const results = [];

  for (const g of groups) {
    if (!g.barLens.length) g.barLens = [6400];

    // Before: use existing barLens
    const before = solveWithOption(g.pieces, g.barLens, g.kerf, 3, g.stockMap);

    // After: auto-optimize
    const opt = await optimizeBarLengths(
      g.pieces, g.kerf, maxLevel, g.stockMap,
      (pct, label) => {
        el('autoProgressBar').style.width = pct + '%';
        el('autoProgressLabel').textContent = `${g.name}: ${label}`;
      }
    );

    results.push({ name: g.name, before, after: opt.result ?? before, bestLens: opt.lens ?? g.barLens });
  }

  lastOptResult = results;
  el('autoProgress').hidden = true;
  el('btnCalcAuto').disabled = false;
  renderAutoResults(results);
}

// ═══════════════════════════════════════════════════════════
//  RENDERING — RESULTS
// ═══════════════════════════════════════════════════════════

function renderStdResults(results) {
  const container = el('stdResults');
  container.hidden = false;
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  toolbar.innerHTML = `
    <button class="btn btn--sm" id="btnExportExcel">
      <span class="material-symbols-outlined">download</span> Export Excel
    </button>
    <button class="btn btn--sm btn--ghost" id="btnPrint">
      <span class="material-symbols-outlined">print</span> พิมพ์
    </button>
  `;
  container.appendChild(toolbar);
  toolbar.querySelector('#btnExportExcel').addEventListener('click', () => exportExcelResult(results, 'standard'));
  toolbar.querySelector('#btnPrint').addEventListener('click', () => window.print());

  // Global stats
  const allBars = results.flatMap(r => r.bars);
  appendGlobalStats(container, allBars);

  for (const r of results) {
    container.appendChild(buildProfileResultCard(r.name, r.barLens, r.bars, r.unfulfilled, false));
  }
}

function renderAutoResults(results) {
  const container = el('autoResults');
  container.hidden = false;
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  toolbar.innerHTML = `
    <button class="btn btn--sm btn--success" id="btnExportExcelAuto">
      <span class="material-symbols-outlined">download</span> Export Excel
    </button>
  `;
  container.appendChild(toolbar);
  toolbar.querySelector('#btnExportExcelAuto').addEventListener('click', () => exportExcelResult(results.map(r => ({ ...r.after, name: r.name, barLens: r.bestLens })), 'auto'));

  const allBarsAfter = results.flatMap(r => r.after.bars);
  appendGlobalStats(container, allBarsAfter);

  for (const r of results) {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.marginBottom = '0';

    // header
    const hdr = document.createElement('div');
    hdr.className = 'result-profile-header result-profile-header--green';
    hdr.innerHTML = `<span class="result-profile-header__name">${escHtml(r.name)}</span>
      <span class="result-profile-header__meta">Best: ${(r.bestLens ?? []).join(', ')} mm | Eff: ${fmtPct(calcEff(r.after.bars))}</span>`;
    wrap.appendChild(hdr);

    // best lens badge
    const badge = document.createElement('div');
    badge.style.padding = '10px 16px';
    badge.style.background = '#f1f8f2';
    badge.innerHTML = `<span class="best-lens-badge">
      <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span>
      ความยาวที่แนะนำ: <strong>${(r.bestLens ?? []).join(' + ')} mm</strong>
    </span>`;
    wrap.appendChild(badge);

    const compare = document.createElement('div');
    compare.className = 'auto-compare';
    compare.style.padding = '0 16px 16px';

    const panelBefore = buildComparePanel('ก่อน Optimize', r.before.bars, r.before.unfulfilled, false);
    const panelAfter  = buildComparePanel('หลัง Optimize', r.after.bars,  r.after.unfulfilled,  true);

    compare.appendChild(panelBefore);
    compare.appendChild(panelAfter);
    wrap.appendChild(compare);

    container.appendChild(wrap);
  }
}

function buildComparePanel(title, bars, unfulfilled, isAfter) {
  const div  = document.createElement('div');
  div.className = 'compare-panel';

  const titleEl = document.createElement('div');
  titleEl.className = 'compare-panel__title' + (isAfter ? ' compare-panel__title--after' : '');
  titleEl.textContent = title + ` — Eff: ${fmtPct(calcEff(bars))} | ${bars.length} เส้น`;
  div.appendChild(titleEl);

  appendBarDiagrams(div, bars, 'small');
  return div;
}

function appendGlobalStats(container, bars) {
  const totBars   = bars.length;
  const eff       = calcEff(bars);
  const totUsable = bars.reduce((s, b) => s + b.barLen - 2 * END_TRIM, 0);
  const totWaste  = totUsable - bars.reduce((s, b) => s + b.used, 0);
  const totPieces = bars.reduce((s, b) => s + b.pieces.length, 0);

  const row = document.createElement('div');
  row.className = 'global-stats';
  row.innerHTML = `
    <div class="stat-card"><div class="stat-card__val">${fmtNum(totBars)}</div><div class="stat-card__label">เส้นทั้งหมด</div></div>
    <div class="stat-card"><div class="stat-card__val">${fmtPct(eff)}</div><div class="stat-card__label">ประสิทธิภาพ</div></div>
    <div class="stat-card"><div class="stat-card__val">${fmtNum(Math.round(totWaste))}</div><div class="stat-card__label">เศษรวม (mm)</div></div>
    <div class="stat-card"><div class="stat-card__val">${fmtNum(totPieces)}</div><div class="stat-card__label">ชิ้นทั้งหมด</div></div>
  `;
  container.appendChild(row);
}

function buildProfileResultCard(name, barLens, bars, unfulfilled, isGreen) {
  const card = document.createElement('div');
  card.className = 'result-card';

  const eff     = calcEff(bars);
  const usable  = bars.reduce((s, b) => s + b.barLen - 2 * END_TRIM, 0);
  const waste   = usable - bars.reduce((s, b) => s + b.used, 0);
  const avgWaste = bars.length ? Math.round(waste / bars.length) : 0;

  const hdr = document.createElement('div');
  hdr.className = 'result-profile-header' + (isGreen ? ' result-profile-header--green' : '');
  hdr.innerHTML = `
    <span class="result-profile-header__name">${escHtml(name)}</span>
    <span class="result-profile-header__meta">ความยาวเส้น: ${barLens.join(', ')} mm</span>
  `;
  card.appendChild(hdr);

  const stats = document.createElement('div');
  stats.className = 'result-stats-row';
  stats.innerHTML = `
    <div class="result-stat"><div class="result-stat__val">${bars.length}</div><div class="result-stat__label">เส้น</div></div>
    <div class="result-stat"><div class="result-stat__val">${fmtPct(eff)}</div><div class="result-stat__label">ประสิทธิภาพ</div></div>
    <div class="result-stat"><div class="result-stat__val">${fmtNum(Math.round(waste))}</div><div class="result-stat__label">เศษรวม (mm)</div></div>
    <div class="result-stat"><div class="result-stat__val">${fmtNum(avgWaste)}</div><div class="result-stat__label">เศษ avg/เส้น</div></div>
  `;
  card.appendChild(stats);

  const barsWrap = document.createElement('div');
  barsWrap.className = 'result-bars-wrap';
  appendBarDiagrams(barsWrap, bars, 'full');
  card.appendChild(barsWrap);

  if (unfulfilled && unfulfilled.length) {
    const uf = document.createElement('div');
    uf.className = 'unfulfilled-box';
    uf.innerHTML = `<strong>⚠ ตัดไม่ได้ (สต็อกหมด):</strong> ${unfulfilled.map(u => `${u.size} mm (${u.label})`).join(', ')}`;
    barsWrap.appendChild(uf);
  }

  return card;
}

function appendBarDiagrams(container, bars, size) {
  // Group consecutive identical patterns
  const groups = [];
  for (const bar of bars) {
    const sig = bar.pieces.map(p => `${p.size}:${p.label}`).join('|') + `@${bar.barLen}`;
    if (groups.length && groups[groups.length-1].sig === sig) {
      groups[groups.length-1].count++;
    } else {
      groups.push({ sig, bar, count: 1 });
    }
  }

  for (const grp of groups) {
    const b     = grp.bar;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'bar-group';

    const label = document.createElement('div');
    label.className = 'bar-group__label';
    label.textContent = grp.count > 1
      ? `${b.barLen} mm × ${grp.count} เส้น`
      : `${b.barLen} mm`;
    groupDiv.appendChild(label);

    const diag = document.createElement('div');
    diag.className = 'bar-diagram';

    const trimPct  = (END_TRIM / b.barLen * 100).toFixed(2);
    const usable   = b.barLen - 2 * END_TRIM;
    const wastePx  = usable - b.used;
    const wastePct = (wastePx / b.barLen * 100).toFixed(2);

    // Left trim
    const leftTrim = makeSeg('trim', trimPct, '✂', `ตัดทิ้ง ${END_TRIM} mm`);
    diag.appendChild(leftTrim);

    // Pieces
    let usedSoFar = 0;
    for (let i = 0; i < b.pieces.length; i++) {
      const p   = b.pieces[i];
      const pct = (p.size / b.barLen * 100).toFixed(2);
      const color = colorForLabel(p.label);
      const txt   = parseFloat(pct) > 8 ? `${p.size}-${p.label}` : '';
      const seg   = makeSeg('piece', pct, txt, `${p.size} mm (${p.label})`);
      seg.style.background = color;
      diag.appendChild(seg);
    }

    // Waste
    if (parseFloat(wastePct) > 0.1) {
      const ws = makeSeg('waste', wastePct, parseFloat(wastePct) > 5 ? `${Math.round(wastePx)}` : '', `เศษ ${Math.round(wastePx)} mm`);
      diag.appendChild(ws);
    }

    // Right trim
    const rightTrim = makeSeg('trim', trimPct, '✂', `ตัดทิ้ง ${END_TRIM} mm`);
    diag.appendChild(rightTrim);

    groupDiv.appendChild(diag);
    container.appendChild(groupDiv);
  }
}

function makeSeg(type, pct, text, tooltip) {
  const seg       = document.createElement('div');
  seg.className   = `bar-seg bar-seg--${type}`;
  seg.style.width = pct + '%';
  seg.style.flexShrink = '0';
  seg.title       = tooltip;

  if (text) {
    const sp = document.createElement('span');
    sp.textContent = text;
    sp.style.overflow   = 'hidden';
    sp.style.textOverflow = 'ellipsis';
    sp.style.whiteSpace = 'nowrap';
    sp.style.fontSize   = '10px';
    sp.style.padding    = '0 2px';
    seg.appendChild(sp);
  }
  return seg;
}

// ═══════════════════════════════════════════════════════════
//  EXPORT EXCEL
// ═══════════════════════════════════════════════════════════
function exportExcelResult(results, mode) {
  if (!window.XLSX) { alert('XLSX library not loaded'); return; }
  const wb = XLSX.utils.book_new();

  for (const r of results) {
    const bars = r.bars || [];
    const rows = [['เส้นที่','ความยาวเส้น (mm)','ชิ้นที่','ขนาด (mm)','Label','เศษ (mm)','ประสิทธิภาพ']];
    bars.forEach((bar, bi) => {
      const usable = bar.barLen - 2 * END_TRIM;
      const waste  = usable - bar.used;
      const eff    = (bar.used / usable * 100).toFixed(1) + '%';
      bar.pieces.forEach((p, pi) => {
        rows.push([bi+1, bar.barLen, pi+1, p.size, p.label, pi === bar.pieces.length-1 ? Math.round(waste) : '', pi === 0 ? eff : '']);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, (r.name || 'Result').slice(0, 31));
  }

  XLSX.writeFile(wb, `cutting_plan_${mode}.xlsx`);
}

// ═══════════════════════════════════════════════════════════
//  PROCESSOR
// ═══════════════════════════════════════════════════════════
let procFile = null;

function handleFileSelect(file) {
  if (!file) return;
  procFile = file;
  el('fileInfo').hidden  = false;
  el('fileName').textContent = file.name;
  el('fileSize').textContent = `(${(file.size/1024).toFixed(1)} KB)`;
}

function processExcelFile() {
  if (!procFile) { alert('กรุณาเลือกไฟล์ก่อน'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      allData  = [];

      for (const sheetName of wb.SheetNames) {
        const ws   = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        parseSheet(sheetName, data);
      }

      filteredData = [...allData];
      updateProcStats();
      renderProcTable();
      el('procStats').hidden    = false;
      el('procTableCard').hidden = false;
      updateBadges();
    } catch(err) {
      alert('ไม่สามารถอ่านไฟล์ได้: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(procFile);
}

function parseSheet(sheetName, data) {
  // Find the row with profile names (contains cell with numeric prefix like "1.")
  let nameRowIdx  = -1;
  let codeRowIdx  = -1;

  for (let r = 0; r < Math.min(data.length, 20); r++) {
    const row = data[r];
    const hasNumPrefix = row.some(c => typeof c === 'string' && /^\d+\./.test(c.trim()));
    if (hasNumPrefix && nameRowIdx < 0) { nameRowIdx = r; continue; }
    // Code row: next row after nameRow with mostly numeric/code-like cells
    if (nameRowIdx >= 0 && codeRowIdx < 0) {
      const numericCells = row.filter((c,i) => i > 0 && String(c).trim() !== '').length;
      if (numericCells > 1) { codeRowIdx = r; break; }
    }
  }

  if (nameRowIdx < 0) return; // can't parse this sheet

  const nameRow = data[nameRowIdx] || [];
  const codeRow = codeRowIdx >= 0 ? (data[codeRowIdx] || []) : nameRow;

  // Build profile map: col → { name, code }
  const profMap = {};
  for (let c = 1; c < nameRow.length; c++) {
    const rawName = String(nameRow[c] || '').trim();
    if (!rawName) continue;
    const cleanName = rawName.replace(/^\d+\./, '').trim();
    const code      = String(codeRow[c] || '').trim();
    const display   = code ? `${code} ${cleanName}` : cleanName;
    profMap[c] = { name: display, code };
  }

  // Data rows: from codeRowIdx+1 or nameRowIdx+2
  const startRow = Math.max(nameRowIdx, codeRowIdx) + 1;

  for (let r = startRow; r < data.length; r++) {
    const row  = data[r];
    const size = parseFloat(row[0]);
    if (!size || isNaN(size) || size <= 0) continue;

    for (const [colStr, prof] of Object.entries(profMap)) {
      const col = parseInt(colStr);
      const qty = parseInt(row[col]);
      if (!qty || isNaN(qty) || qty <= 0) continue;
      allData.push({ sheet: sheetName, code: prof.code, profile: prof.name, size, qty });
    }
  }
}

function updateProcStats() {
  const sheets = new Set(allData.map(r => r.sheet)).size;
  const codes  = new Set(allData.map(r => r.code)).size;
  const items  = allData.length;
  const totQty = allData.reduce((s, r) => s + r.qty, 0);
  el('statSheets').textContent = sheets;
  el('statCodes').textContent  = codes;
  el('statItems').textContent  = items;
  el('statQty').textContent    = fmtNum(totQty);
}

function renderProcTable() {
  const tbody = el('procTbody');
  if (!tbody) return;

  const filter = (el('procFilter')?.value || '').toLowerCase();
  filteredData = allData.filter(r =>
    !filter ||
    r.sheet.toLowerCase().includes(filter) ||
    r.code.toLowerCase().includes(filter)  ||
    r.profile.toLowerCase().includes(filter)
  );

  // Sort
  if (procSort.col) {
    filteredData.sort((a, b) => {
      const av = a[procSort.col]; const bv = b[procSort.col];
      return (av < bv ? -1 : av > bv ? 1 : 0) * procSort.dir;
    });
  }

  const totalPages = Math.ceil(filteredData.length / PROC_PAGE_SIZE) || 1;
  procPage = Math.min(procPage, totalPages);
  const start = (procPage - 1) * PROC_PAGE_SIZE;
  const page  = filteredData.slice(start, start + PROC_PAGE_SIZE);

  tbody.innerHTML = page.map(r => `
    <tr>
      <td>${escHtml(r.sheet)}</td>
      <td>${escHtml(r.code)}</td>
      <td>${escHtml(r.profile)}</td>
      <td class="text-right">${fmtNum(r.size)}</td>
      <td class="text-right">${fmtNum(r.qty)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="empty-state">ไม่พบข้อมูล</td></tr>`;

  renderProcPagination(totalPages);
}

function renderProcPagination(total) {
  const pag = el('procPagination');
  if (!pag) return;
  pag.innerHTML = '';
  if (total <= 1) return;

  const mkBtn = (label, page, active) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' page-btn--active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { procPage = page; renderProcTable(); });
    return b;
  };

  pag.appendChild(mkBtn('‹', Math.max(1, procPage-1), false));
  for (let i = 1; i <= total; i++) {
    if (total > 10 && Math.abs(i - procPage) > 2 && i !== 1 && i !== total) {
      if (i === 2 || i === total-1) { const sp = document.createElement('span'); sp.textContent='…'; sp.style.padding='0 4px'; pag.appendChild(sp); }
      continue;
    }
    pag.appendChild(mkBtn(i, i, i === procPage));
  }
  pag.appendChild(mkBtn('›', Math.min(total, procPage+1), false));
}

function sendToOptimizer() {
  if (!allData.length) { alert('ไม่มีข้อมูล'); return; }

  // Keep existing profiles; add new ones as needed
  pieces = [];
  rid    = 0;

  const profByName = {};
  for (const p of profiles) profByName[p.name] = p;

  for (const row of allData) {
    let prof = profByName[row.profile];
    if (!prof) {
      pid++;
      prof = { id: pid, name: row.profile, barLen: '6400', kerf: 2, stock: null };
      profiles.push(prof);
      profByName[row.profile] = prof;
    }
    rid++;
    pieces.push({ id: rid, profId: prof.id, label: row.code, size: row.size, qty: row.qty });
  }

  renderAll();
  switchTab('page2');
}

// ═══════════════════════════════════════════════════════════
//  IMPORT EXCEL (piece table)
// ═══════════════════════════════════════════════════════════
function importExcelPieces(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Expect: col0=label/code, col1=size(mm), col2=qty
      let added = 0;
      for (const row of rows) {
        const label = String(row[0] || '').trim();
        const size  = parseFloat(row[1]);
        const qty   = parseInt(row[2]) || 1;
        if (!size || isNaN(size) || size <= 0) continue;
        addPiece(profiles[0]?.id, label, size, qty);
        added++;
      }
      if (!added) alert('ไม่พบข้อมูลในไฟล์ (คาดว่าคอลัมน์: Label | ขนาด(mm) | จำนวน)');
    } catch(err) {
      alert('ไม่สามารถอ่านไฟล์ได้: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════
//  SAMPLE DATA
// ═══════════════════════════════════════════════════════════
function loadSample() {
  newProject();
  profiles[0].name = '26183 บานกระทุ้ง';
  profiles[0].barLen = '6400,5500';
  pid++;
  profiles.push({ id: pid, name: '26226 วงกบนอก', barLen: '6400', kerf: 2, stock: null });

  const samples = [
    [1, 'W1',  700, 4],
    [1, 'W2', 1200, 2],
    [1, 'W3',  850, 6],
    [1, 'D1', 2100, 3],
    [1, 'D2', 1500, 4],
    [2, 'F1', 3000, 2],
    [2, 'F2', 2400, 3],
    [2, 'F3', 1800, 5],
  ];
  for (const [pi, lbl, sz, qty] of samples) {
    rid++;
    pieces.push({ id: rid, profId: pi, label: lbl, size: sz, qty });
  }
  renderAll();
}

// ═══════════════════════════════════════════════════════════
//  PROJECT PERSISTENCE
// ═══════════════════════════════════════════════════════════
async function saveProject() {
  const name = el('saveNameInput').value.trim() || curProjName;
  try {
    const newId = await dbSaveProject(name, curProjId);
    curProjId   = newId;
    curProjName = name;
    el('projNameDisplay').textContent = name;
    unsaved = false;
    el('projUnsaved').hidden = true;
    hideModal('modalSave');
  } catch(e) {
    alert('บันทึกไม่สำเร็จ: ' + e.message);
  }
}

async function openProjectModal() {
  const projects = await dbListProjects();
  const list = el('projectList');
  list.innerHTML = '';

  if (!projects.length) {
    list.innerHTML = '<div class="empty-state">ยังไม่มีโปรเจกต์ที่บันทึกไว้</div>';
  } else {
    for (const p of projects.sort((a,b) => b.id - a.id)) {
      const item = document.createElement('div');
      item.className = 'proj-item';
      item.innerHTML = `
        <div>
          <div class="proj-item__name">${escHtml(p.name)}</div>
          <div class="proj-item__date">${new Date(p.updatedAt).toLocaleString('th-TH')}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn--sm btn--primary" data-load="${p.id}">เปิด</button>
          <button class="btn btn--sm btn--danger"  data-del="${p.id}">ลบ</button>
        </div>
      `;
      item.querySelector(`[data-load="${p.id}"]`).addEventListener('click', () => loadProject(p));
      item.querySelector(`[data-del="${p.id}"]`).addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`ลบ "${p.name}"?`)) {
          await dbDeleteProject(p.id);
          openProjectModal();
        }
      });
      list.appendChild(item);
    }
  }
  showModal('modalOpen');
}

function loadProject(p) {
  profiles   = p.snap.profiles;
  pieces     = p.snap.pieces;
  pid        = profiles.reduce((m, x) => Math.max(m, x.id), 0);
  rid        = pieces.reduce((m, x) => Math.max(m, x.id), 0);
  curProjId  = p.id;
  curProjName = p.name;
  unsaved    = false;
  el('projNameDisplay').textContent = p.name;
  el('projUnsaved').hidden = true;
  hideModal('modalOpen');
  renderAll();
  el('stdResults').hidden   = true;
  el('autoResults').hidden  = true;
  el('stdResults').innerHTML  = '';
  el('autoResults').innerHTML = '';
}

function exportJson() {
  const obj = {
    name: curProjName,
    exportedAt: new Date().toISOString(),
    version: 'CP4.3',
    profiles: JSON.parse(JSON.stringify(profiles)),
    pieces:   JSON.parse(JSON.stringify(pieces)),
  };
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${curProjName}.json`; a.click();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj = JSON.parse(e.target.result);
      profiles  = obj.profiles || [];
      pieces    = obj.pieces   || [];
      pid       = profiles.reduce((m, x) => Math.max(m, x.id), 0);
      rid       = pieces.reduce((m, x) => Math.max(m, x.id), 0);
      curProjName = obj.name || 'Imported';
      curProjId   = null;
      el('projNameDisplay').textContent = curProjName;
      markUnsaved();
      renderAll();
    } catch(err) {
      alert('ไฟล์ไม่ถูกต้อง: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════════════════════
function switchTab(pageId) {
  document.querySelectorAll('.page').forEach(p => p.hidden = true);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
  el(pageId).hidden = false;
  document.querySelector(`[data-tab="${pageId}"]`)?.classList.add('tab-btn--active');
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════
//  INIT + EVENT LISTENERS
// ═══════════════════════════════════════════════════════════
async function init() {
  await initDB();
  newProject();

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => { if (e.target === bd) bd.hidden = true; });
  });

  // Profile add buttons
  el('btnAddProfile2').addEventListener('click', () => addProfile());
  el('btnAddProfile3').addEventListener('click', () => addProfile());

  // Piece add buttons
  el('btnAddPiece2').addEventListener('click', () => addPiece(profiles[0]?.id));
  el('btnAddPiece3').addEventListener('click', () => addPiece(profiles[0]?.id));

  // Sizes per bar toggle
  document.querySelectorAll('#sizesPerBar .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sizesPerBar .toggle-btn').forEach(b => b.classList.remove('toggle-btn--active'));
      btn.classList.add('toggle-btn--active');
    });
  });

  // Max bar levels toggle
  document.querySelectorAll('#maxBarLevels .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#maxBarLevels .toggle-btn').forEach(b => { b.classList.remove('toggle-btn--active','toggle-btn--green'); });
      btn.classList.add('toggle-btn--active','toggle-btn--green');
    });
  });

  // Calculate buttons
  el('btnCalcStd').addEventListener('click', calcStandard);
  el('btnCalcAuto').addEventListener('click', calcAuto);

  // Project bar
  el('btnNew').addEventListener('click',  () => { if (!unsaved || confirm('มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการดำเนินการต่อ?')) newProject(true); });
  el('btnOpen').addEventListener('click', openProjectModal);
  el('btnSave').addEventListener('click', () => {
    el('saveNameInput').value = curProjName;
    showModal('modalSave');
  });
  el('btnDoSave').addEventListener('click', saveProject);
  el('btnExportJson').addEventListener('click', exportJson);
  el('btnImportJson').addEventListener('click', () => el('importJsonInput').click());
  el('importJsonInput').addEventListener('change', e => { if (e.target.files[0]) importJson(e.target.files[0]); });

  // Processor
  el('fileInput').addEventListener('change', e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); });
  el('btnProcess').addEventListener('click', processExcelFile);
  el('btnClearProc').addEventListener('click', () => newProject(true));
  el('btnSendToOpt').addEventListener('click', sendToOptimizer);
  el('procFilter').addEventListener('input', () => { procPage = 1; renderProcTable(); });

  // Processor table sort
  document.querySelectorAll('#procTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (procSort.col === col) procSort.dir *= -1;
      else { procSort.col = col; procSort.dir = 1; }
      renderProcTable();
    });
  });

  // Drop zone
  const dz = el('dropZone');
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });

  // Import Excel into piece table
  el('btnImportExcel2').addEventListener('click', () => el('importExcel2Input').click());
  el('importExcel2Input').addEventListener('change', e => { if (e.target.files[0]) importExcelPieces(e.target.files[0]); });

  // Sample data
  el('btnLoadSample').addEventListener('click', loadSample);

  // Clear pieces
  el('btnClearPieces').addEventListener('click', () => {
    if (!pieces.length || confirm('ล้างรายการชิ้นงานทั้งหมด?')) {
      pieces = []; rid = 0;
      el('pieceTbody2').innerHTML = '';
      el('pieceTbody3').innerHTML = '';
      updateSummary(); updateBadges(); markUnsaved();
    }
  });
}

init();
