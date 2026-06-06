# Aluminum Profile Cutting Optimizer — Design Document

> **Version:** CP4.3
> **Purpose:** A standalone single-file web application for optimizing aluminum profile cutting plans, designed for window/door fabrication companies.
> **Use Case:** Window/door fabricators receive cut lists with hundreds of pieces of varying sizes. This app calculates how many full-length aluminum bars to buy and how to cut them with minimum waste.

---

## 1. Overview

### 1.1 Problem Statement
Aluminum profiles are sold in fixed-length bars (typically 4500–6400 mm). Each cut piece needs to come from one of these bars. The challenge: arrange cuts to minimize waste while respecting real-world constraints (saw blade thickness, end trim, stock availability).

### 1.2 Solution
Three-tab web application:
1. **Profile Processor** — Extract cut data from Excel files into a normalized table
2. **Standard Optimizer** — Calculate cutting plan using user-defined bar lengths
3. **Auto Optimizer** — Search for the best combination of bar lengths automatically

### 1.3 Technology Stack
- **Single HTML file** containing HTML + CSS + JavaScript (~2300 lines)
- **No backend** — runs entirely in browser
- **No framework** — vanilla JS
- **Libraries** (CDN):
  - SheetJS (xlsx) for Excel I/O
  - IndexedDB for project persistence
- **Font:** Prompt (Thai) via Google Fonts

---

## 2. Domain Concepts

### 2.1 Key Terms

| Term | Definition |
|------|-----------|
| **Profile** | An aluminum extrusion type (e.g., "26226 วงกบนอก 95 มม.") |
| **Bar** | A full-length raw material (typically 6400 mm) |
| **Piece** | A cut to be made from a bar (size + quantity + label) |
| **Bar Length** | Length of one full bar (e.g., 6400, 5500, 4500 mm) |
| **Kerf** | Material removed by saw blade per cut (default 2 mm) |
| **End Trim** | Material trimmed from each end of every bar (75 mm × 2 = 150 mm/bar) |
| **Usable Length** | `barLen - 2 × END_TRIM` — the length actually available for cuts |
| **Stock** | Quantity of bars available in inventory per bar length |
| **Label** | A code/name for a piece (e.g., "W10", "EG6") — used for tracking |
| **Sizes-per-bar limit** | Max number of *different sizes* allowed in a single bar |

### 2.2 Constraints (Fixed Constants)

```javascript
END_TRIM = 75              // mm trimmed from each end of every bar
MIN_GAP_BETWEEN_SIZES = 300 // min difference between chosen bar lengths in Auto-Optimize
```

### 2.3 Bar Anatomy (Visual Model)

```
| trim (75) | piece1 | kerf | piece2 | kerf | piece3 | waste | trim (75) |
└─────────────────────── full barLen ──────────────────────────────────┘
            └────────── usable = barLen - 150 ──────────┘
```

---

## 3. Application Architecture

### 3.1 Tab Structure

```
┌─ Top Nav ────────────────────────────────────────────────┐
│  ⬡ APA   📊 Processor  📐 Standard  🎯 Auto             │
└──────────────────────────────────────────────────────────┘
│                                                          │
│  [page1 / page2 / page3 — only one visible at a time]    │
│                                                          │
```

### 3.2 Shared State (Global JS Variables)

```javascript
var profiles = [];      // Array of profile definitions
var pieces = [];        // Array of pieces to cut
var pid = 0;            // Profile ID counter
var rid = 0;            // Piece (row) ID counter
var lastResult = null;  // Last Standard calculation result
var lastOptResult = null; // Last Auto calculation result
var lastProfId = null;  // Most recently used profile (for new piece defaults)
var allData = [];       // Profile Processor extracted data
var filteredData = [];  // Profile Processor filtered view

// Project persistence (IndexedDB)
var db = null;
var curProjId = null;
var curProjName = 'โปรเจกต์ใหม่';
```

### 3.3 Data Models

**Profile object:**
```javascript
{
  id: 1,              // Unique numeric ID
  name: "26183 บานกระทุ้ง",  // Display name (code + description)
  barLen: "6400",     // Bar length(s) as comma-separated string
  kerf: 2,            // Saw kerf in mm
  stock: null         // Stock count (null = infinite, integer = limited)
}
```

**Piece object:**
```javascript
{
  id: 1,              // Unique numeric ID
  profId: 1,          // Reference to profile.id
  label: "W10",       // Display code
  size: 700,          // Length in mm
  qty: 4              // Quantity needed
}
```

**Cut Bar (result):**
```javascript
{
  pieces: [...],      // Array of piece refs assigned to this bar
  used: 5300,         // Sum of piece sizes + kerf cuts
  barLen: 5500        // Which bar length was chosen
}
```

**NameGroup (intermediate calc structure):**
```javascript
{
  pieces: [...],      // All pieces sharing this profile name
  barLens: [6400, 5500, 4500],  // All bar lengths defined for this name
  stockMap: { 6400: null, 5500: 10, 4500: 20 },  // Stock per bar length
  kerf: 2,
  name: "26183 บานกระทุ้ง"
}
```

---

## 4. Tab 1: Profile Processor

### 4.1 Purpose
Extract cut data from a complex Excel workbook (one tab per project room, multi-row headers) into a flat normalized table.

### 4.2 Workflow

```
1. User drags/drops Excel file (or clicks to choose)
2. App reads ALL sheets
3. Per sheet, finds:
   - Profile names row (e.g., "1.วงกบประตู", "2.กรอบบาน")
   - Profile codes row (e.g., "50473", "50475")
   - Cut data rows (size in col A, qty per profile column)
4. Builds normalized table: [sheet, code, profile, size, qty]
5. User can search/filter/sort the table
6. User clicks "Send to Optimizer" → data goes to Standard + Auto tabs
```

### 4.3 UI Components
- File drop zone (drag-drop + click to choose)
- File info badge (name + size)
- "ประมวลผลไฟล์" (Process) button
- "ล้างทั้งหมด" (Reset all) button
- Stats bar: 4 cards showing Sheets / Codes / Items / Total qty
- Filter input
- Sortable, paginated table (50 rows per page)
- "ส่งไป Optimizer" (Send) button → switches to tab 2 with data loaded

### 4.4 Excel Parsing Heuristics
- Profile names: numbers prefix is stripped (e.g., "1.วงกบประตู" → "วงกบประตู")
- Profile display format: `"{code} {name}"` (code first, then name)
- Size column: typically column A
- Quantity columns: one per profile starting from column C
- Skip rows that don't have numeric size values

### 4.5 Send to Optimizer Behavior
- Clears existing pieces (but keeps existing profiles to allow re-import)
- For each Excel row:
  - Find or create profile by name (default barLen=6400, kerf=2)
  - Add piece with profId, label=code, size, qty
- Updates badges on tab2 and tab3
- Auto-switches to tab2

---

## 5. Tab 2: Standard Optimizer

### 5.1 Purpose
Calculate cutting plan using **user-defined** bar lengths in profile table.

### 5.2 UI Layout (top to bottom)

```
┌─ Header (blue gradient) ──────────────────┐
│ 📐 Standard Optimizer                     │
│ คำนวณแผนตัดด้วยความยาวเส้นจาก Profile     │
└───────────────────────────────────────────┘

┌─ Project Bar ─────────────────────────────┐
│ 📁 Project name  | + New | 📂 Open | 💾 Save│
│                  | ⬇ Export | ⬆ Import   │
└───────────────────────────────────────────┘

┌─ Profile Table (card) ────────────────────┐
│ ⚠ ตัดทิ้งหัว-ท้าย 75 mm × 2 = 150 mm/เส้น  │
│ ┌─────────────────────────────────────┐   │
│ │ Name | BarLen | Stock | Kerf | ✕    │   │
│ │ ...                                 │   │
│ └─────────────────────────────────────┘   │
└───────────────────────────────────────────┘

[+ เพิ่มโปรไฟล์]
[🔒 ขนาดที่ต่างกันได้/เส้น: 1 2 3]
[📐 คำนวณ Standard]

┌─ Piece Table (card) ──────────────────────┐
│ + เพิ่มรายการ | Import Excel | Import from│
│ Profile Processor | ตัวอย่าง | ล้าง        │
│ ┌─────────────────────────────────────┐   │
│ │ Profile | Label | Size | Qty | Total│   │
│ └─────────────────────────────────────┘   │
│ Summary: X pieces, Y total mm             │
└───────────────────────────────────────────┘

[Results section - hidden until calculated]
```

### 5.3 Profile Table Columns
1. **ชื่อโปรไฟล์** (Name) - text input
2. **ความยาวเส้น (mm)** - text input, comma-separated allowed (e.g. "6400,5500,4500")
3. **จำนวนเส้น (Stock)** - number input, blank = ∞
4. **Kerf (mm)** - number input, default 2
5. **✕** - delete button

### 5.4 Piece Table Columns
1. **โปรไฟล์** - dropdown (linked to profiles[])
2. **ชื่อ/รหัสชิ้น** (Label) - text input
3. **ขนาด (mm)** - number input
4. **จำนวน** (Qty) - number input, default 1
5. **รวม (mm)** - auto-calculated (size × qty)
6. **✕** - delete button

### 5.5 Parameters
- **ขนาดที่ต่างกันได้/เส้น (Sizes per bar):** 1 / 2 / 3 — max distinct sizes in one cut bar

### 5.6 Calculation Output
- Stats: total bars / efficiency / total waste / total pieces
- Summary table by profile (Sizes × Stock × Bars × Eff)
- Per-profile bar visualization (interactive bars showing each cut)

---

## 6. Tab 3: Auto Optimizer

### 6.1 Purpose
Search for the **best combination** of bar lengths automatically. Tests many combinations from 4500–6400 mm range.

### 6.2 UI Layout
Identical to Standard tab (same profile + piece tables, **mirrored data**), but:
- Header is green
- Adds **ขนาดเส้นสูงสุด** (max sizes selector): 2 / 3 / 4 / 5 / 6 — default 4
- Calc button: "🎯 คำนวณ + Auto-Optimize" (green)
- Shows progress bar during search
- Shows both initial result (using profile bar lengths) AND optimized result

### 6.3 Data Mirroring
Same `profiles[]` and `pieces[]` arrays power both tabs. Adding/editing/deleting in either tab updates the other in real-time via:
- `_renderProfileRowInto(p, tb)` renders to specific tbody
- `_renderPieceRowInto(r, tb)` renders to specific tbody
- ID convention: `prof-{id}` for tab2, `prof_3-{id}` for tab3

---

## 7. Core Algorithms

### 7.1 buildNameGroups(validPieces)
**Purpose:** Aggregate profile rows with the same name (allows the same profile to have multiple bar lengths split across rows).

```pseudocode
INPUT: validPieces (filtered to size>0 && qty>0)
OUTPUT: { profileName: NameGroup, ... }

1. Group pieces by profId
2. Loop ALL profiles in profiles[] (not just those with pieces):
   - Get profile.name as key
   - Collect ALL barLens across rows with same name
   - Build stockMap[barLen]:
     - If any row has stock=null → barLen is infinite
     - Otherwise sum stocks across rows
3. Attach pieces to their nameGroup
4. Drop groups with no pieces
```

### 7.2 solveWithOption (Standard Optimizer Algorithm)
**Algorithm:** Best-Fit Decreasing (BFD) with size-diversity constraint and stock tracking.

```pseudocode
INPUT: pieceList, barLens, kerf, maxSizes, stockMap
OUTPUT: { bars, oversized, unfulfilled, stockUsed }

1. Sort barLens DESC
2. Detect oversized pieces (size > maxLen - 150):
   - For each, create special bar = piece.size + 150
   - Add to barLens
3. Expand pieces into atomic items (qty=4 → 4 separate items)
4. Filter oversized (still > maxLen) out
5. Sort items DESC by size
6. For each item:
   a. Try existing bins:
      - bin must have remaining ≥ size + kerf
      - bin must not introduce a new size if size-limit reached
      - pick bin with smallest leftover space (Best-Fit)
   b. If no fit → open new bin:
      - For each available barLen:
        - Skip if stock exhausted (stockUsed[L] ≥ stockMap[L])
        - Calculate density = maxPiecesThatFit / 1.0
        - Density = (maxFit × size + (maxFit-1) × kerf) / usable
      - Pick barLen with HIGHEST density (tiebreaker: smaller bar)
      - Increment stockUsed[chosen]
      - Open bin with usable = chosen - 150
   c. If all stock exhausted → add to unfulfilled[]
7. Return bars list

BIN STATE:
{
  pieces: [...],
  barLen: 5500,
  used: 5300,             // sum of piece sizes + kerfs
  remaining: 50,          // remaining usable space
  sizes: [700, 650],      // unique piece sizes (for limit check)
  labels: [...]           // unique labels (cosmetic)
}
```

### 7.3 solve (used in Auto Optimizer)
**Algorithm:** Iterative pattern generation, picks the most efficient pattern each iteration.

```pseudocode
INPUT: pieceList, barLens, kerf, stockMap
OUTPUT: { bars, oversized, unfulfilled, stockUsed }

1. Pre-process: same oversized/expand/sort as solveWithOption
2. Group items by size: bySize[size] = [items...]
3. Loop until no items remain:
   a. For each barLen L:
      - Skip if stock exhausted for L
      - Build best pattern that fits in L - 150:
        * Greedy: add largest size that fits, repeat
      - Calculate eff = used / usable
   b. Pick (pattern, L) with highest eff
   c. Determine "times" this pattern repeats based on remaining items
   d. Limit "times" by remaining stock for L
   e. Push that many bars
4. Remaining items → unfulfilled[]
```

### 7.4 optimizeBarLengths (Auto-Optimize Search)
**Algorithm:** Brute-force search through bar length combinations.

```pseudocode
INPUT: pieceList, kerf, target (0.985), maxSizes (sameLabel), maxLevel, stockMap
OUTPUT: { eff, lens, result, targetReached, levelAchieved }

STANDARD_LENGTHS = [4500, 4600, 4700, ..., 6400]  // 20 values

best = { eff: -1, lens: null, result: null }

function tryLens(candidate):
  // Validate: gap between adjacent sizes must be ≥ 300
  if candidate.length > 1:
    sorted = sort ASC
    for each adjacent pair (a,b):
      if b - a < 300: REJECT
  
  res = solveWithOption(pieceList, candidate, kerf, sameLabel, stockMap)
  eff = calcEff(res.bars)
  if eff > best.eff: update best

Level 1: try every single length (20 candidates)
Level 2: try every pair (C(20,2) = 190 candidates)
Level 3: try every triple (1140 candidates)
Level 4: try every 4-tuple (4845 candidates) — DEFAULT
Level 5: try every 5-tuple (15504 candidates)
Level 6: try every 6-tuple (54264 candidates)

After each level:
  if best.eff >= target (0.985): STOP, level achieved
  yield to UI between batches for progress

Return best
```

### 7.5 calcEff
```javascript
calcEff(bars):
  totUsable = sum(bar.barLen - 150 for bar in bars)
  totUsed = sum(bar.used for bar in bars)
  return totUsed / totUsable
```

---

## 8. Visualization

### 8.1 Bar Diagram (per cut bar)
A horizontal flex container showing:

```
┌─────────────────────────────────────────────────────────────┐
│ ▨trim▨ │ 700-W10 │ 700-W10 │ 1395-D7 │ waste │ ▨trim▨ │
└─────────────────────────────────────────────────────────────┘
   1.7%      15.6%     15.6%     31.0%     34.4%    1.7%
```

- Trim segments: diagonal-stripe pattern (`repeating-linear-gradient(45deg, #94a3b8, #cbd5e1)`)
- Piece segments: color by label (consistent hash → palette)
- Waste segment: light gray
- Widths in % based on `width / barLen × 100`
- Pieces show "size - label" if segment width > 8% of bar
- Tooltips on hover for trim/waste/piece

### 8.2 Bar Grouping
When consecutive bars have the same pattern, group as "เส้นที่ X–Y (×N เส้น)" to compress display.

### 8.3 Color Palette (piece colors)
12 vibrant colors cycled by label hash:
```
#3b82f6 #ef4444 #8b5cf6 #f59e0b #10b981
#ec4899 #06b6d4 #f97316 #84cc16 #14b8a6
#a855f7 #dc2626
```

---

## 9. Project Persistence

### 9.1 IndexedDB Schema
```
Database: aluminumOptimizer
Object Store: projects
Key: id (autoIncrement)
Fields:
  - id, name, createdAt, updatedAt
  - snap: { profiles: [...], pieces: [...] }
```

### 9.2 Operations
- **New** — clears all data, adds default "รายการตัด" profile, barLen=6400, kerf=2
- **Open** — modal lists saved projects with date, click to load
- **Save** — modal asks for name (or updates existing)
- **Export** — downloads JSON: `{ name, exportedAt, version, profiles, pieces }`
- **Import** — uploads JSON, restores state, marks unsaved

### 9.3 Clear Actions
All "clear" buttons reset to initial state (empty + default profile):
- **🗑 ล้าง** in Optimizer — clears pieces + profiles + results
- **🗑 ล้างทั้งหมด** in Processor — clears file + processor data + Optimizer data
- **➕ ใหม่** (Project bar) — full reset including Processor

---

## 10. Result Rendering

### 10.1 Output per Profile
```
┌─ Profile header (blue): name — barLens used ─ totalBars | eff% ─┐

┌─ Stats row ────────────────────────────────────────┐
│  Bars: X  │  Eff: X.X%  │  Waste: X mm  │  Avg waste/bar  │
└────────────────────────────────────────────────────┘

[Grouped bars showing cuts]
```

### 10.2 Auto Optimizer Extra
Shows TWO sections side-by-side:
1. **Before Optimize** (using profile's bar lengths)
2. **After Optimize** (using best-found combination) + summary of which bar lengths chosen

### 10.3 Export
- Excel export of cutting plan (one row per cut, grouped by profile)
- Print to PDF (special print CSS hides nav/bar, shows clean cut plan)

---

## 11. UI/UX Specifications

### 11.1 Color Theme
- Primary: `#2c5282` (navy blue) — headers
- Accent: `#2d7d46` (green) — Auto Optimizer accents
- Success: green, Warning: amber, Error: red, Muted: slate
- Background: `#f0f4f8` (very light blue-gray)
- Border: `#e2e8f0`

### 11.2 Typography
- Font: Prompt (Thai-friendly, modern sans-serif), 300/400/500/600/700 weights

### 11.3 Layout
- Max-width: ~1400px centered
- Cards with soft shadow + 8px border-radius
- Buttons: small (10–12px padding) / regular / big (calculate)

### 11.4 Tab Badge
Each tab has a small badge showing item count, dimmed when empty.

### 11.5 Responsive
Best on desktop (≥ 1024px wide). Acceptable on tablet. Phone use not optimized.

### 11.6 Language
Thai UI primarily, mixed Thai/English labels for technical terms (KERF, Optimizer).

### 11.7 Print Mode (CSS @media print)
```css
- Hide: nav, project bar, all buttons, modal, file inputs
- Show only: page2 or page3 active page
- Force background colors to render (-webkit-print-color-adjust: exact)
- Break-inside: avoid for cards
```

---

## 12. Sample Workflows

### 12.1 Quick Use (new user)
1. Open app
2. Tab 1 — drop Excel file → process → click "Send to Optimizer"
3. Tab 2 — review profiles + pieces, click "คำนวณ Standard"
4. View result, export Excel or print

### 12.2 Auto Optimize
1. Tab 2 — set up data
2. Tab 3 — click "คำนวณ + Auto-Optimize"
3. Wait for progress through levels 1–4
4. Review which bar lengths the system recommends ordering
5. Compare "Before" vs "After" optimization

### 12.3 Stock Management
1. Enter known inventory in Stock column (e.g., 6400=50, 5500=20)
2. Calculate — if stock insufficient, popup warns with details
3. Adjust pieces or add stock, recalculate

### 12.4 Oversized Pieces
1. If a piece is bigger than any bar length (e.g., 7000 mm)
2. App auto-creates a special bar length = 7000 + 150 = 7150 mm
3. Piece is cut from a custom bar (informs user they need to order this size specially)

---

## 13. Build Targets / Suggestions for Re-implementation

### 13.1 If using React/Vue
- Components: `<Nav>`, `<ProfileProcessor>`, `<StandardOptimizer>`, `<AutoOptimizer>`, `<ProfileTable>`, `<PieceTable>`, `<BarVisualization>`, `<ResultPanel>`
- State management: shared store for profiles/pieces; results stored in tab-specific state
- Keep algorithms in pure JS module (testable separately)

### 13.2 If using Next.js / SSR
- Most logic is client-side — use `'use client'`
- IndexedDB still works in browser; consider also offering server-side project save

### 13.3 If using Python/Django backend
- Move algorithms to backend (better for very large datasets)
- Use API endpoints: `/solve`, `/optimize`, `/upload-excel`
- Front-end becomes a thinner SPA

### 13.4 Testing Strategy
Unit-test the algorithms first:
- `solve()` with known inputs → expected bar counts and efficiency
- `solveWithOption()` with size-limit constraint
- `optimizeBarLengths()` with mock data — verify gap-300 rule
- `buildNameGroups()` with multi-row profiles → verify merging
- Oversized handling — verify special bar creation
- Stock exhaustion — verify unfulfilled tracking

### 13.5 Performance Notes
- Auto-Optimize Level 6 = 54k iterations — runs ~30 sec on typical data
- Use `yield` (setTimeout(0)) between batches to keep UI responsive
- For datasets > 5000 pieces, consider Web Worker for algorithms

---

## 14. Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Piece size > max barLen | Auto-create special bar (piece.size + 150) |
| Stock exhausted on all bar lengths | Add to unfulfilled, show popup |
| Same profile name with different bar lengths in multiple rows | Merge bar lengths, share stock by `name+barLen` key |
| Empty/null labels | Treat as same group ("__noLabel__") |
| Zero or negative size/qty | Filter out before calculation |
| All pieces same size, multiple barLens | Pick barLen with highest packing density |
| Auto-Optimize finds nothing useful | Fall back to best Level 1 result |
| Excel with empty rows / merged cells | Skip rows without numeric size |
| Profile name has leading "1." numbering | Strip prefix during import |

---

## 15. Glossary (Thai/English)

| Thai | English |
|------|---------|
| โปรไฟล์ | Profile |
| ความยาวเส้น | Bar length |
| รายการชิ้นงาน | Piece list (cut list) |
| ขนาด | Size |
| จำนวน | Quantity |
| รวม | Total |
| เส้น | Bar (counter for bars) |
| ชิ้น | Piece (counter for pieces) |
| ตัดทิ้งหัว-ท้าย | End trim |
| เศษ | Waste |
| ประสิทธิภาพ | Efficiency |
| ล้าง | Clear/Reset |
| คำนวณ | Calculate |
| ขนาดที่ต่างกันได้/เส้น | Distinct sizes allowed per bar |
| ขนาดเส้นสูงสุด | Max distinct bar lengths to use |

---

## 16. Future Enhancements (Not in CP4.3)

- Multi-project comparison dashboard
- Real-time cost calculation (price per kg of aluminum)
- PDF report with company branding
- Multi-user collaboration (cloud backend)
- Mobile-optimized UI
- AI suggestion for piece grouping
- Integration with ERP / inventory systems
- Batch optimization across multiple projects sharing inventory

---

**End of Design Document — CP4.3**
