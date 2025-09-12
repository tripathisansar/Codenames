// ----- Storage keys -----
const K_WORDS = "cn.words.v1";
const K_DECK = "cn.deck.v1";
const K_HISTORY = "cn.history.v1";
const K_KEY = "cn.key.v1"; // { firstTeam:'blue'|'red', key:[25 of 'blue'|'red'|'gray'|'black'] }

// ----- Elements -----
const screens = {
  home: document.getElementById("screen-home"),
  ops: document.getElementById("screen-ops"),
  spy: document.getElementById("screen-spy"),
};
const btnOps = document.getElementById("btn-ops");
const btnSpy = document.getElementById("btn-spy");
const backFromOps = document.getElementById("backFromOps");
const backFromSpy = document.getElementById("backFromSpy");

// Operative
const opsBoard = document.getElementById("ops-board");
const opsUndo = document.getElementById("ops-undo");
const opsReset = document.getElementById("ops-reset");
const opsNew = document.getElementById("ops-new");
const popup = document.getElementById("ops-popup");
const popupClear = document.getElementById("ops-clear");

// Spymaster
const spyGrid = document.getElementById("spy-grid");
const spyGen = document.getElementById("spy-gen");
const spyNote = document.getElementById("spy-note");
const firstRadios = () =>
  Array.from(document.querySelectorAll('input[name="firstTeam"]'));

// ----- Global state (in-memory) -----
let WORDS_ALL = []; // loaded from words.json
let opsHistory = []; // indices stack for Undo
let activeTile = null; // element

// ----- Utilities -----
const ls = {
  get: (k, def = null) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
};

async function loadWords() {
  if (WORDS_ALL.length) return WORDS_ALL;
  const res = await fetch("words.json", { cache: "no-cache" });
  const data = await res.json();
  WORDS_ALL = (data?.packs?.[0]?.words || []).map((w) =>
    String(w).trim().toUpperCase()
  );
  return WORDS_ALL;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ----- Deck & Board (Operative) -----
function initDeckIfNeeded() {
  let deck = ls.get(K_DECK);
  if (!deck || !Array.isArray(deck) || deck.length < 25) {
    // Build fresh deck; avoid last ~100 to reduce repeats
    const lastWords = ls.get(K_WORDS, []);
    const avoid = new Set(lastWords.slice(0, 100));
    const fresh = WORDS_ALL.filter((w) => !avoid.has(w));
    deck = shuffle([...fresh]);
    ls.set(K_DECK, deck);
  }
}

function dealBoardFromDeck() {
  let deck = ls.get(K_DECK, []);
  if (deck.length < 25) initDeckIfNeeded(), (deck = ls.get(K_DECK, []));
  const board = deck.slice(0, 25);
  const rest = deck.slice(25);
  ls.set(K_WORDS, board);
  ls.set(K_DECK, rest);
  // clear history/colors
  ls.set(K_HISTORY, []);
  opsHistory = [];
  renderOpsBoard(board);
}

function renderOpsBoard(words = null) {
  const current = words || ls.get(K_WORDS, []);
  opsBoard.innerHTML = "";
  current.forEach((w, idx) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.idx = String(idx);
    tile.innerHTML = `
      <div class="back"></div>
      <div class="word-main">${w}</div>
      <div class="word-mirror">${w}</div>
    `;
    tile.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        showPopupForTile(tile);
      },
      { passive: true }
    );
    opsBoard.appendChild(tile);
  });
  // restore any applied colors from in-memory history? We keep colors only in DOM; history is for undo.
}

function showPopupForTile(tile) {
  cleanupPopup();
  activeTile = tile;
  tile.classList.add("active");

  // Center popup on tile, clamped
  document.body.appendChild(popup);
  const tr = tile.getBoundingClientRect();
  const pr = popup.getBoundingClientRect();
  let cx = tr.left + tr.width / 2;
  let cy = tr.top + tr.height / 2;
  const margin = 10,
    halfW = pr.width / 2,
    halfH = pr.height / 2;
  cx = Math.max(
    margin + halfW,
    Math.min(window.innerWidth - margin - halfW, cx)
  );
  cy = Math.max(
    margin + halfH,
    Math.min(window.innerHeight - margin - halfH, cy)
  );
  popup.style.left = `${cx}px`;
  popup.style.top = `${cy}px`;
  popup.classList.remove("hidden");
}

function cleanupPopup() {
  if (activeTile) activeTile.classList.remove("active");
  activeTile = null;
  popup.classList.add("hidden");
}

function applyColorToTile(tile, type) {
  const back = tile.querySelector(".back");
  tile.classList.remove(
    "type-blue",
    "type-red",
    "type-gray",
    "type-black",
    "colored"
  );
  if (type) {
    tile.classList.add("colored", `type-${type}`);
    opsHistory.push({ idx: Number(tile.dataset.idx), type });
    ls.set(K_HISTORY, opsHistory);
  } else {
    back.style.backgroundColor = "";
  }
}

document.addEventListener("click", (e) => {
  if (!popup.classList.contains("hidden") && !popup.contains(e.target))
    cleanupPopup();
});

// Popup clicks
popup.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || !activeTile) return;

  if (btn.classList.contains("pick")) {
    const type = btn.dataset.type;
    applyColorToTile(activeTile, type);
    cleanupPopup();
  } else if (btn.id === "ops-clear") {
    // Reset this tile (don’t push to history)
    activeTile.classList.remove(
      "type-blue",
      "type-red",
      "type-gray",
      "type-black",
      "colored"
    );
    cleanupPopup();
  }
});

// Controls
opsUndo.addEventListener("click", () => {
  const hist = ls.get(K_HISTORY, []);
  const last = hist.pop();
  if (!last) return;
  const tile = opsBoard.querySelector(`.tile[data-idx="${last.idx}"]`);
  if (tile)
    tile.classList.remove(
      "type-blue",
      "type-red",
      "type-gray",
      "type-black",
      "colored"
    );
  opsHistory = hist;
  ls.set(K_HISTORY, hist);
});
opsReset.addEventListener("click", () => {
  opsBoard
    .querySelectorAll(".tile")
    .forEach((t) =>
      t.classList.remove(
        "type-blue",
        "type-red",
        "type-gray",
        "type-black",
        "colored",
        "active"
      )
    );
  opsHistory = [];
  ls.set(K_HISTORY, []);
  cleanupPopup();
});
opsNew.addEventListener("click", () => {
  dealBoardFromDeck();
});

// ----- Spymaster (Key) -----
function desiredCounts(firstTeam) {
  // 9 for first, 8 for second, 7 bystanders, 1 assassin
  if (firstTeam === "red") {
    return { red: 9, blue: 8, gray: 7, black: 1 };
  }
  return { blue: 9, red: 8, gray: 7, black: 1 };
}

function genKey(firstTeam) {
  const counts = desiredCounts(firstTeam);
  const arr = [];
  Object.entries(counts).forEach(([k, n]) => {
    for (let i = 0; i < n; i++) arr.push(k);
  });
  shuffle(arr);
  const state = { firstTeam, key: arr };
  ls.set(K_KEY, state);
  return state;
}

function renderKey() {
  const state = ls.get(K_KEY, null);
  spyGrid.innerHTML = "";
  if (!state) {
    spyNote.textContent = "No key yet. Tap “Generate Key”.";
    return;
  }
  spyNote.textContent = `Key set. First team: ${state.firstTeam.toUpperCase()}. (Persists until you Generate a new one.)`;
  state.key.forEach((t) => {
    const k = document.createElement("div");
    k.className = `key ${t}`;
    spyGrid.appendChild(k);
  });
}

spyGen.addEventListener("click", () => {
  const firstTeam = firstRadios().find((r) => r.checked)?.value || "blue";
  genKey(firstTeam);
  renderKey();
});

firstRadios().forEach((r) => {
  r.addEventListener("change", () => {
    // Changing the toggle doesn't overwrite existing key.
    // It only affects the next "Generate Key".
  });
});

// ----- Navigation -----
function show(screen) {
  Object.values(screens).forEach((s) => s.classList.remove("visible"));
  screens[screen].classList.add("visible");
  window.scrollTo(0, 0);
}

btnOps.addEventListener("click", async () => {
  await loadWords();
  // use persisted words if exist, else deal
  const existing = ls.get(K_WORDS, null);
  if (existing && Array.isArray(existing) && existing.length === 25) {
    opsHistory = ls.get(K_HISTORY, []);
    renderOpsBoard(existing);
  } else {
    initDeckIfNeeded();
    dealBoardFromDeck();
  }
  show("ops");
});

btnSpy.addEventListener("click", async () => {
  // Keep current firstTeam toggle as-is; only Generate Key sets a new one.
  renderKey();
  show("spy");
});

backFromOps.addEventListener("click", () => {
  cleanupPopup();
  show("home");
});
backFromSpy.addEventListener("click", () => show("home"));

// Auto-close popup on resize/rotate
window.addEventListener("resize", cleanupPopup);

// Initial load: nothing else to do
