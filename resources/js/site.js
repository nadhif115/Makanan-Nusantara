const RESTO_NAME = "Nusantara Bites";
const API_URL = "/api.php";
const POLL_INTERVAL_MS = 3500;
const CATEGORIES = ["Makanan", "Minuman", "Promo"];
const VIEWS = ["customer", "dapur", "kasir", "display", "staff", "login", "riwayat", "stok", "keuangan", "menu"];
const STAFF_VIEWS = ["staff", "dapur", "kasir", "riwayat", "stok", "keuangan", "menu"];
// Hanya untuk menyembunyikan menu; hak akses sebenarnya diperiksa server.
const ROLE_VIEWS = {
  owner: STAFF_VIEWS,
  kasir: ["staff", "kasir", "riwayat"],
  dapur: ["staff", "dapur"]
};
const POLLED_VIEWS = ["status", "dapur", "kasir", "display"];
const STATUS_LABEL = {
  menunggu_bayar: "Menunggu pembayaran",
  diterima: "Diterima",
  diproses: "Dimasak",
  siap: "Siap diambil",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan"
};
const PROGRESS_STEPS = [
  { key: "diterima", label: "Diterima" },
  { key: "diproses", label: "Dimasak" },
  { key: "siap", label: "Siap diambil" }
];

const state = {
  view: "customer",
  table: "1",
  category: "Makanan",
  menu: [],
  menuStatus: "loading", // loading | ok | error
  cart: [],
  cartOpen: false,
  cartStep: "cart",      // cart | pay | dana
  submitting: false,
  orderId: null,
  notice: "",
  adminQuery: "",
  adminResult: undefined, // undefined = belum dicari, null = tidak ditemukan
  pollHandle: null,
  alertedReady: {},
  user: null,
  csrf: null,
  next: null,
  idemKey: null,
  history: { q: "", status: "", from: "", to: "", page: 1 },
  finance: { from: "", to: "" },
  menuForm: null, // null = form tertutup; {} = produk baru; objek produk = edit
  menuItems: []
};

const root = document.getElementById("root");
const busyKeys = new Set();
let renderSeq = 0;

/* API */

async function apiRequest(action, { method = "GET", query, body } = {}) {
  const qs = query ? "&" + new URLSearchParams(query).toString() : "";
  const isUpload = body instanceof FormData;
  const headers = isUpload ? {} : { "Content-Type": "application/json" }; // browser mengisi boundary multipart
  if (state.csrf && method !== "GET") headers["X-CSRF-Token"] = state.csrf;

  const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}${qs}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : isUpload ? body : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);

  if (response.status === 401 && !["login", "me"].includes(action)) {
    state.user = null;
    state.csrf = null;
    if (STAFF_VIEWS.includes(state.view)) {
      state.next = state.view;
      state.view = "login";
      state.notice = "Sesi berakhir. Silakan masuk lagi.";
    }
  }
  if (!response.ok) throw new Error(data?.error || `Permintaan gagal (${response.status})`);
  return data;
}

async function loadMenu() {
  state.menuStatus = "loading";
  try {
    state.menu = await apiRequest("get_menu");
    state.menuStatus = "ok";
  } catch (e) {
    console.error("Gagal mengambil menu:", e);
    state.menuStatus = "error";
  }
}

const LIST_ERROR = "Daftar pesanan tidak bisa dimuat. Mencoba lagi otomatis.";

async function fetchOrderList() {
  try {
    const orders = await apiRequest("get_orders");
    if (state.notice === LIST_ERROR) state.notice = "";
    return orders;
  } catch (e) {
    console.error("Gagal mengambil daftar pesanan:", e);
    state.notice = LIST_ERROR;
    return [];
  }
}

async function fetchOrder(id) {
  if (!id) return null;
  try {
    return await apiRequest("get_order", { query: { id } });
  } catch (e) {
    console.error("Gagal mengambil pesanan:", e);
    return null;
  }
}

/* Helpers */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
const rupiah = (n) => "Rp" + Number(n).toLocaleString("id-ID");
const queueLabel = (n) => "#" + String(n).padStart(3, "0");
const PAYMENT_STATUS = { paid: "lunas", pending: "belum dibayar", refunded: "dikembalikan" };
const paymentLabel = (o) => `${o.method === "dana" ? "DANA" : "Tunai"}, ${PAYMENT_STATUS[o.paymentStatus] ?? o.paymentStatus}`;
const statusLabel = (status) => esc(STATUS_LABEL[status] ?? status);
const fmtTime = (ms) => new Date(ms).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
const canOpen = (view) => ROLE_VIEWS[state.user?.role]?.includes(view) ?? false;
const itemsSummary = (o) => o.items.map((it) => `${it.qty}× ${esc(it.name)}`).join(", ");
const initials = (name) => esc(String(name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase());

function minutesSince(createdAt) {
  return Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
}

// Foto unggahan owner lebih dulu; bila belum ada, coba kebiasaan lama public/images/menu/{id}.jpg.
const photoUrl = (item) => item.photo ? "/" + encodeURI(item.photo) : `/images/menu/${encodeURIComponent(item.id)}.jpg`;
const findMenuItem = (id) => state.menu.find((m) => m.id === id);
const qtyInCart = (id) => state.cart.find((c) => c.id === id)?.qty ?? 0;
const cartCount = () => state.cart.reduce((sum, c) => sum + c.qty, 0);
const cartTotal = () => state.cart.reduce((sum, c) => sum + (findMenuItem(c.id)?.price ?? 0) * c.qty, 0);

/* Cart and checkout actions */

function changeQty(id, delta) {
  const limit = findMenuItem(id)?.stock ?? Infinity;
  if (delta > 0 && qtyInCart(id) >= limit) return;
  state.idemKey = null; // isi keranjang berubah: ini pesanan yang berbeda
  const line = state.cart.find((c) => c.id === id);
  if (line) line.qty += delta;
  else if (delta > 0) state.cart.push({ id, qty: 1 });
  state.cart = state.cart.filter((c) => c.qty > 0);
  render();
}

function closeCart() {
  state.cartOpen = false;
  state.cartStep = "cart";
  state.notice = "";
  render();
}

async function submitOrder(method) {
  if (state.submitting || !state.cart.length) return;
  state.submitting = true;
  state.notice = "";
  // Kunci tetap sama selama percobaan ulang, sehingga server tidak membuat pesanan ganda.
  state.idemKey ||= crypto.randomUUID?.() ?? `k${Date.now()}${Math.random().toString(36).slice(2)}`;
  render();

  const paid = method === "dana";
  try {
    const items = state.cart.map((c) => {
      const item = findMenuItem(c.id);
      return { id: c.id, name: item.name, qty: c.qty, price: item.price };
    });
    // Server menghitung ulang total dan status; field ini dikirim hanya demi kontrak lama.
    const order = await apiRequest("create_order", {
      method: "POST",
      body: {
        table: state.table || "-",
        items,
        total: cartTotal(),
        idempotencyKey: state.idemKey,
        method,
        paymentStatus: paid ? "paid" : "pending",
        status: paid ? "diterima" : "menunggu_bayar"
      }
    });
    state.cart = [];
    state.cartOpen = false;
    state.cartStep = "cart";
    state.orderId = order.id;
    state.idemKey = null;
    state.view = "status";
    requestNotifyPermission();
    startPolling();
  } catch (e) {
    console.error(e);
    state.notice = "Pesanan gagal dibuat: " + e.message;
    if (/stok/i.test(e.message)) await loadMenu();
  } finally {
    state.submitting = false;
    render();
  }
}

function startNewOrder() {
  stopPolling();
  state.orderId = null;
  state.view = "customer";
  render();
  loadMenu().then(render); // stok bisa berubah selama pesanan berjalan
}

/* Staff actions. busyKeys mencegah klik ganda mengirim request yang sama dua kali. */

async function mutate(key, request, onSuccess) {
  if (busyKeys.has(key)) return;
  busyKeys.add(key);
  state.notice = "";
  try {
    const result = await request();
    if (onSuccess) onSuccess(result);
  } catch (e) {
    console.error(e);
    state.notice = e.message;
  } finally {
    busyKeys.delete(key);
  }
  await render();
}

const advanceOrder = (id) =>
  mutate("advance:" + id, () => apiRequest("advance_order", { method: "POST", body: { id } }));

const confirmPaid = (id) =>
  mutate("pay:" + id, () => apiRequest("set_payment", { method: "POST", body: { id, paid: true } }));

const setAdminPaid = (id, paid) =>
  mutate("pay:" + id, () => apiRequest("set_payment", { method: "POST", body: { id, paid } }), (order) => {
    state.adminResult = order;
  });

async function searchOrder() {
  const q = state.adminQuery.trim();
  state.notice = "";
  if (!q) {
    state.adminResult = undefined;
    return render();
  }
  try {
    state.adminResult = await apiRequest("admin_search", { query: { q } });
  } catch (e) {
    console.error(e);
    state.adminResult = undefined;
    state.notice = "Pencarian gagal: " + e.message;
  }
  render();
}

/* Polling and notifications */

function startPolling() {
  stopPolling();
  state.pollHandle = setInterval(() => {
    if (POLLED_VIEWS.includes(state.view)) render().catch((e) => console.error("Polling error:", e));
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  clearInterval(state.pollHandle);
  state.pollHandle = null;
}

function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    try { Notification.requestPermission().then(render); } catch (e) { /* browser lama */ }
  }
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch (e) { /* audio diblokir sampai ada interaksi pengguna */ }
}

function notifyReady(order) {
  playChime();
  try { navigator.vibrate?.([200, 80, 200, 80, 200]); } catch (e) { /* tidak didukung */ }
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(RESTO_NAME, { body: `Nomor antrean ${queueLabel(order.queue)} siap diambil.` });
    }
  } catch (e) { /* tidak didukung */ }
}

/* Customer page: JS hanya mengisi region dinamis di dalam shell Blade */

const shell = document.getElementById("customer-shell");
const regions = {
  nav: document.getElementById("nav-cart"),
  menu: document.getElementById("menu-region"),
  cart: document.getElementById("cart-region")
};
const lastShown = { count: 0, total: 0 };
let animateMenu = false;

function stepper(id, name, qty, scope, max = Infinity) {
  return `
    <div class="stepper" role="group" aria-label="Jumlah ${esc(name)}">
      <button data-act="remove" data-id="${esc(id)}" data-key="${scope}-${esc(id)}-minus" aria-label="Kurangi ${esc(name)}">−</button>
      <output class="num">${qty}</output>
      <button data-act="add" data-id="${esc(id)}" data-key="${scope}-${esc(id)}" aria-label="Tambah ${esc(name)}" ${qty >= max ? "disabled" : ""}>+</button>
    </div>`;
}

function dishCard(item) {
  const qty = qtyInCart(item.id);
  const soldOut = item.stock != null && item.stock <= 0;
  const control = soldOut
    ? `<span class="soldout">Habis</span>`
    : qty
    ? stepper(item.id, item.name, qty, "dish", item.stock ?? Infinity)
    : `<button class="btn btn-primary btn-sm" data-act="add" data-id="${esc(item.id)}" data-key="dish-${esc(item.id)}" aria-label="Tambah ${esc(item.name)}">Tambah</button>`;
  const note = item.was
    ? `<span class="saving num">Hemat ${rupiah(item.was - item.price)}</span>`
    : item.stock != null && item.stock > 0 && item.stock <= 5
    ? `<span class="saving">Sisa ${item.stock}</span>`
    : "";
  return `
    <li class="dish${soldOut ? " out" : ""}">
      <div class="photo cat-${esc(item.cat)}">
        <div class="photo-fallback"><span>${esc(item.cat)}</span></div>
        <img src="${photoUrl(item)}" alt="${esc(item.name)}" loading="lazy" data-fallback>
      </div>
      <div class="dish-top">
        <h3>${esc(item.name)}</h3>
        <div class="price num">${rupiah(item.price)}${item.was ? `<s class="was">${rupiah(item.was)}</s>` : ""}${note}</div>
      </div>
      <p class="desc">${esc(item.desc)}</p>
      <div class="dish-foot"><span></span>${control}</div>
    </li>`;
}

function menuBody() {
  if (state.menuStatus === "loading") {
    return `<ul class="menu-grid" aria-busy="true">${'<li><div class="skeleton"></div></li>'.repeat(6)}</ul>`;
  }
  if (state.menuStatus === "error") {
    return `<div class="state-msg"><p>Menu tidak bisa dimuat. Periksa koneksi, lalu coba lagi.</p>
      <button class="btn btn-quiet" data-act="reload-menu">Muat ulang menu</button></div>`;
  }
  const items = state.menu.filter((m) => m.cat === state.category);
  if (!items.length) return `<p class="state-msg">Belum ada menu di kategori ini.</p>`;
  return `<ul class="menu-grid${animateMenu ? " swap" : ""}">${items.map(dishCard).join("")}</ul>`;
}

function menuRegionHtml() {
  const tabs = CATEGORIES.map((c) =>
    `<button class="tab" data-act="category" data-value="${c}" aria-current="${c === state.category}">${c}</button>`
  ).join("");
  return `<nav class="tabs" aria-label="Kategori menu">${tabs}</nav>${menuBody()}`;
}

function cartLines() {
  return state.cart.map((c) => {
    const item = findMenuItem(c.id);
    if (!item) return "";
    return `
      <div class="line">
        <div>${esc(item.name)}<div class="sub num">${rupiah(item.price)} × ${c.qty} = ${rupiah(item.price * c.qty)}</div></div>
        <div class="line-actions">
          ${stepper(item.id, item.name, c.qty, "cart", item.stock ?? Infinity)}
          <button class="link-btn" data-act="remove-line" data-id="${esc(item.id)}" aria-label="Hapus ${esc(item.name)} dari keranjang">Hapus</button>
        </div>
      </div>`;
  }).join("");
}

function cartBody(bump) {
  const totalRow = `<div class="total"><span>Total</span><span class="num${bump}">${rupiah(cartTotal())}</span></div>`;
  const busy = state.submitting ? "disabled" : "";

  if (state.cartStep === "pay") {
    return `
      ${totalRow}
      <p>Pilih cara pembayaran.</p>
      <button class="pay-opt" data-act="pay-cash" ${busy}>
        <b>Tunai di kasir</b><span>Tunjukkan nomor antrean dan bayar di kasir. Pesanan masuk dapur setelah dibayar.</span>
      </button>
      <button class="pay-opt" data-act="start-dana" ${busy}>
        <b>DANA</b><span>Bayar lewat kode QR.</span>
      </button>
      <button class="btn btn-quiet btn-block" style="margin-top:14px" data-act="step-cart">Kembali ke pesanan</button>`;
  }
  if (state.cartStep === "dana") {
    return `
      ${totalRow}
      <div class="qr-sim" role="img" aria-label="Kode QR simulasi">Simulasi<br>QR DANA</div>
      <p class="sim-note">Ini tampilan simulasi, bukan pembayaran sungguhan. Kode QR asli akan muncul setelah payment gateway terhubung.</p>
      <button class="btn btn-primary btn-block" data-act="confirm-dana" ${busy}>${state.submitting ? "Mengirim pesanan…" : "Kirim pesanan"}</button>
      <button class="btn btn-quiet btn-block" style="margin-top:10px" data-act="step-pay">Ganti cara bayar</button>`;
  }
  if (!state.cart.length) return `<p class="state-msg">Belum ada item. Pilih menu untuk memulai.</p>`;
  return `${cartLines()}${totalRow}<button class="btn btn-primary btn-block" data-act="step-pay">Pilih pembayaran</button>`;
}

function cartRegionHtml() {
  const titles = { cart: "Pesanan Anda", pay: "Pembayaran", dana: "Bayar dengan DANA" };
  const bump = cartTotal() !== lastShown.total ? " bump" : "";
  const bar = cartCount() && !state.cartOpen
    ? `<button class="cart-bar" data-act="open-cart">
         <span><span class="num">${cartCount()}</span> item</span>
         <strong class="num${bump}">${rupiah(cartTotal())}</strong>
         <span>Lihat pesanan</span>
       </button>`
    : "";
  return `
    ${state.cartOpen ? `<div class="scrim" data-act="close-cart"></div>` : ""}
    <aside class="cart${state.cartOpen ? " open" : ""}" aria-label="Pesanan Anda" ${state.cartOpen ? 'role="dialog" aria-modal="true"' : ""}>
      <div class="cart-head">
        <h2>${titles[state.cartStep]}</h2>
        <button class="btn btn-quiet btn-sm cart-close" data-act="close-cart" data-key="cart-close">Tutup</button>
      </div>
      ${state.notice ? `<p class="notice" role="alert">${esc(state.notice)}</p>` : ""}
      ${cartBody(bump)}
    </aside>
    ${bar}`;
}

function navCartHtml() {
  const bump = cartCount() !== lastShown.count ? " bump" : "";
  return `<button class="nav-cart" data-act="open-cart" data-key="nav-cart" aria-label="Buka keranjang, ${cartCount()} item">
    Keranjang <span class="count num${bump}">${cartCount()}</span></button>`;
}

let cartWasOpen = false;

function renderCustomer() {
  patchNode(regions.nav, navCartHtml());
  patchNode(regions.menu, menuRegionHtml());
  patchNode(regions.cart, cartRegionHtml());
  Object.assign(lastShown, { count: cartCount(), total: cartTotal() });
  animateMenu = false;
  if (state.cartOpen && !cartWasOpen) regions.cart.querySelector(".cart-close")?.focus();
  if (!state.cartOpen && cartWasOpen) document.querySelector(".nav-cart")?.focus();
  cartWasOpen = state.cartOpen;
}

function initPageEffects() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll(".reveal");
  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  reveals.forEach((el) => observer.observe(el));

  const panel = document.querySelector("[data-parallax]");
  if (!panel) return;
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking || window.scrollY > 900) return;
    ticking = true;
    requestAnimationFrame(() => {
      panel.style.transform = `translateY(${window.scrollY * 0.06}px)`;
      ticking = false;
    });
  }, { passive: true });
}

/* Views: order status */

function statusMessage(order) {
  switch (order.status) {
    case "menunggu_bayar":
      return `<p class="ticket-msg wait">Bayar ${rupiah(order.total)} di kasir dan tunjukkan nomor antrean ini. Pesanan diteruskan ke dapur setelah pembayaran dikonfirmasi.</p>`;
    case "diterima":
      return `<p class="ticket-msg">Pesanan sudah masuk ke dapur.</p>`;
    case "diproses":
      return `<p class="ticket-msg">Pesanan sedang dimasak.</p>`;
    case "siap":
      return `<p class="ticket-msg ready">Pesanan siap. Ambil di kasir.</p>`;
    default:
      return `<p class="ticket-msg">Pesanan selesai. Terima kasih sudah makan di ${RESTO_NAME}.</p>`;
  }
}

function notifyPrompt(order) {
  if (!("Notification" in window) || order.status === "selesai") return "";
  if (Notification.permission === "default") {
    return `<div class="notify"><span>Aktifkan notifikasi agar tahu saat pesanan siap.</span>
      <button class="btn btn-quiet btn-sm" data-act="notify">Aktifkan</button></div>`;
  }
  if (Notification.permission === "denied") {
    return `<p class="notify">Notifikasi diblokir browser. Biarkan halaman ini terbuka; bunyi dan getar tetap aktif saat pesanan siap.</p>`;
  }
  return "";
}

async function viewStatus() {
  const order = await fetchOrder(state.orderId);
  const backButton = `<button class="btn btn-quiet btn-block" data-act="new-order">Pesan lagi</button>`;
  if (!order) {
    return `<div class="ticket-page"><p class="empty">Pesanan tidak ditemukan.</p>${backButton}</div>`;
  }
  if (order.status === "siap" && !state.alertedReady[order.id]) {
    state.alertedReady[order.id] = true;
    notifyReady(order);
  }

  const currentIdx = PROGRESS_STEPS.findIndex((s) => s.key === order.status);
  const steps = PROGRESS_STEPS.map((s, i) => {
    let cls = "";
    if (order.status === "selesai" || (currentIdx >= 0 && i < currentIdx)) cls = "done";
    else if (i === currentIdx) cls = "current";
    return `<li class="${cls}"${cls === "current" ? ' aria-current="step"' : ""}>${s.label}</li>`;
  }).join("");

  const lines = order.items.map((it) =>
    `<div><span>${it.qty}× ${esc(it.name)}</span><span class="num">${rupiah(it.price * it.qty)}</span></div>`
  ).join("");

  return `
    <div class="ticket-page">
      <article class="ticket${order.status === "siap" ? " is-ready" : ""}">
        <p class="label">Nomor antrean</p>
        <p class="queue num">${queueLabel(order.queue)}</p>
        <p class="where">Meja ${esc(order.table)} · ${paymentLabel(order)}</p>
        <ol class="progress" aria-label="Status pesanan">${steps}</ol>
        <div role="status" aria-live="polite">${statusMessage(order)}</div>
        ${notifyPrompt(order)}
        <div class="ticket-items">${lines}
          <div class="sum"><span>Total</span><span class="num">${rupiah(order.total)}</span></div>
        </div>
      </article>
      ${backButton}
    </div>`;
}

/* Views: staff */

const staffNotice = () => (state.notice ? `<p class="notice" role="alert">${esc(state.notice)}</p>` : "");

function staffHead(title) {
  return `<header class="staff-head"><h1>${title}</h1><a href="?view=staff">Menu staf</a></header>`;
}

function viewStaffHub() {
  const links = [
    ["menu", "Menu dan foto", "Tambah produk, ubah harga, dan unggah foto"],
    ["dapur", "Dapur", "Pesanan masuk, dimasak, dan siap diambil"],
    ["kasir", "Kasir", "Konfirmasi pembayaran, cari dan batalkan pesanan"],
    ["riwayat", "Riwayat transaksi", "Semua pesanan, filter, dan detail"],
    ["stok", "Stok produk", "Stok harian dan riwayat pergerakan"],
    ["keuangan", "Keuangan", "Omzet terbayar per periode"]
  ].filter(([view]) => canOpen(view))
    .map(([view, title, desc]) => `<a href="?view=${view}"><b>${title}</b><span>${desc}</span></a>`).join("");
  return `
    <div class="staff-light">
      <header class="staff-head"><h1>Staf ${RESTO_NAME}</h1>
        <span>${esc(state.user?.username)} (${esc(state.user?.role)})
          <button class="btn btn-quiet btn-sm" data-act="logout">Keluar</button></span></header>
      <nav class="hub" aria-label="Halaman staf">
        ${links}
        <a href="?view=display"><b>Layar antrean</b><span>Nomor yang siap diambil, untuk ruang tunggu</span></a>
        <a href="?view=customer"><b>Menu pelanggan</b><span>Kembali ke halaman pemesanan</span></a>
      </nav>
    </div>`;
}

function viewLogin() {
  return `
    <div class="staff-light">
      <header class="staff-head"><h1>Masuk staf</h1><a href="?view=customer">Menu pelanggan</a></header>
      <main class="cashier" style="max-width:380px">
        ${staffNotice()}
        <form class="stack" data-form="login">
          <label>Nama pengguna<input name="username" autocomplete="username" required></label>
          <label>Kata sandi<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary btn-block" style="margin-top:18px">Masuk</button>
        </form>
      </main>
    </div>`;
}

const KITCHEN_LANES = [
  { key: "diterima", label: "Masuk", action: "Mulai masak" },
  { key: "diproses", label: "Dimasak", action: "Tandai siap" },
  { key: "siap", label: "Siap diambil", action: "Tandai selesai" }
];

function kitchenOrder(order, action) {
  const unpaid = order.paymentStatus !== "paid";
  const items = order.items.map((it) => `<li><b class="num">${it.qty}×</b> ${esc(it.name)}</li>`).join("");
  return `
    <article class="order${unpaid ? " unpaid" : ""}">
      <div class="order-top">
        <span class="q num">${queueLabel(order.queue)}</span>
        <span class="meta">Meja ${esc(order.table)}<br>${minutesSince(order.createdAt)} menit lalu</span>
      </div>
      <ul>${items}</ul>
      <p class="pay">${paymentLabel(order)}</p>
      <button class="btn btn-block" data-act="advance" data-id="${esc(order.id)}">${action}</button>
    </article>`;
}

async function viewKitchen() {
  const orders = await fetchOrderList();
  const lanes = KITCHEN_LANES.map((lane) => {
    const list = orders.filter((o) => o.status === lane.key);
    return `
      <section class="lane" aria-label="${lane.label}">
        <h2><span>${lane.label}</span><span class="num">${list.length}</span></h2>
        ${list.map((o) => kitchenOrder(o, lane.action)).join("") || `<p class="empty">Kosong</p>`}
      </section>`;
  }).join("");
  return `<div class="staff-dark">${staffHead("Dapur")}${staffNotice()}<div class="board">${lanes}</div></div>`;
}

function adminResultView() {
  if (state.adminResult === undefined) return "";
  if (state.adminResult === null) {
    return `<p class="empty">Pesanan tidak ditemukan. Coba nomor antrean (12 atau #012) atau ID lengkap.</p>`;
  }
  const o = state.adminResult;
  const cancelled = o.status === "dibatalkan";
  const payButton = cancelled ? "" : o.paymentStatus === "paid"
    ? `<button class="btn btn-warn" data-act="admin-unpaid" data-id="${esc(o.id)}">Tandai belum dibayar</button>`
    : `<button class="btn btn-primary" data-act="admin-paid" data-id="${esc(o.id)}">Tandai lunas</button>`;
  const cancelForm = cancelled || o.status === "selesai" ? "" : `
    <form class="filters" data-form="cancel" data-id="${esc(o.id)}">
      <label>Alasan pembatalan<input name="reason" required minlength="3" maxlength="255"></label>
      <button class="btn btn-warn">Batalkan pesanan</button>
    </form>`;
  return `
    <div class="result">
      <div class="txn">
        <span class="q num">${queueLabel(o.queue)}</span>
        <div class="detail"><b>Meja ${esc(o.table)}</b> · ${itemsSummary(o)}<br>
          ${statusLabel(o.status)} · ${paymentLabel(o)}${o.cancelReason ? `<br>Alasan: ${esc(o.cancelReason)}` : ""}</div>
        <span class="amt num">${rupiah(o.total)}</span>
      </div>
      ${payButton}${cancelForm}
    </div>`;
}

function searchPanel() {
  return `
    <form class="search" data-form="search">
      <label for="admin-q">Cari pesanan berdasarkan nomor antrean atau ID</label>
      <div>
        <input id="admin-q" data-key="admin-q" type="text" autocomplete="off" value="${esc(state.adminQuery)}" placeholder="12, #012, atau ID lengkap">
        <button class="btn btn-primary" type="submit">Cari</button>
      </div>
    </form>
    ${adminResultView()}`;
}

async function viewCashier() {
  const orders = await fetchOrderList();
  const pending = orders.filter((o) => o.paymentStatus === "pending");
  const recentPaid = orders.filter((o) => o.paymentStatus === "paid").slice(-6).reverse();

  const pendingRows = pending.map((o) => `
    <div class="txn">
      <span class="q num">${queueLabel(o.queue)}</span>
      <div class="detail"><b>Meja ${esc(o.table)}</b> · ${itemsSummary(o)}</div>
      <span class="amt num">${rupiah(o.total)}</span>
      <button class="btn btn-primary btn-sm" data-act="confirm-paid" data-id="${esc(o.id)}">Konfirmasi lunas</button>
    </div>`).join("");

  const paidRows = recentPaid.map((o) => `
    <div class="txn done">
      <span class="q num">${queueLabel(o.queue)}</span>
      <div class="detail">Meja ${esc(o.table)} · ${paymentLabel(o)}</div>
      <span class="amt num">${rupiah(o.total)}</span>
    </div>`).join("");

  return `
    <div class="staff-light">
      ${staffHead("Kasir")}
      <div class="cashier">
        ${staffNotice()}
        ${searchPanel()}
        <section>
          <h2>Menunggu pembayaran (${pending.length})</h2>
          ${pendingRows || `<p class="empty">Tidak ada pesanan yang menunggu pembayaran.</p>`}
        </section>
        <section>
          <h2>Lunas terakhir</h2>
          ${paidRows || `<p class="empty">Belum ada pembayaran.</p>`}
        </section>
      </div>
    </div>`;
}

async function viewDisplay() {
  const ready = await apiRequest("get_ready_queue").catch(() => []);
  const numbers = ready.map((o) => `<div class="call-num num">${queueLabel(o.queue)}</div>`).join("");
  return `
    <div class="staff-dark">
      <header class="staff-head"><h1>Siap diambil</h1><span>${RESTO_NAME}</span></header>
      <div class="call" aria-live="polite">
        ${numbers ? `<div class="call-grid">${numbers}</div>` : `<p class="empty">Belum ada pesanan yang siap.</p>`}
      </div>
    </div>`;
}

/* Views: history, stock, finance */

function dataTable(head, rows, emptyText) {
  if (!rows.length) return `<p class="empty">${emptyText}</p>`;
  const cells = head.map((h) => `<th${h.endsWith("*") ? ' class="r"' : ""}>${h.replace("*", "")}</th>`).join("");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cells}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

async function viewHistory() {
  const h = state.history;
  let data = { rows: [], total: 0, page: 1, pages: 1 };
  try {
    data = await apiRequest("list_transactions", { query: h });
  } catch (e) {
    state.notice = e.message;
  }
  const rows = data.rows.map((o) => {
    const staff = [o.paidBy && `bayar: ${o.paidBy}`, o.cancelledBy && `batal: ${o.cancelledBy}`].filter(Boolean).join(", ");
    const lines = o.items.map((it) =>
      `<div>${it.qty}× ${esc(it.name)} @ ${rupiah(it.price)} = ${rupiah(it.price * it.qty)}</div>`).join("");
    return `<tr>
      <td><details><summary class="num">${queueLabel(o.queue)}</summary>${lines}
        <div>ID: ${esc(o.id)}</div>${o.cancelReason ? `<div>Alasan batal: ${esc(o.cancelReason)}</div>` : ""}</details></td>
      <td>${fmtTime(o.createdAt)}</td><td>${esc(o.table)}</td>
      <td class="r num">${rupiah(o.total)}</td><td>${paymentLabel(o)}</td>
      <td>${statusLabel(o.status)}</td><td>${esc(staff || "-")}</td></tr>`;
  });
  const statusOptions = ["", ...Object.keys(STATUS_LABEL)].map((k) =>
    `<option value="${k}"${k === h.status ? " selected" : ""}>${k ? STATUS_LABEL[k] : "Semua status"}</option>`).join("");
  const pager = (label, page, disabled) =>
    `<button class="btn btn-quiet btn-sm" data-act="page" data-page="${page}" ${disabled ? "disabled" : ""}>${label}</button>`;
  return `
    <div class="staff-light">${staffHead("Riwayat transaksi")}
      <div class="cashier wide">
        ${staffNotice()}
        <form class="filters" data-form="history">
          <label>Cari<input name="q" value="${esc(h.q)}" placeholder="antrean, ID, atau meja"></label>
          <label>Status<select name="status">${statusOptions}</select></label>
          <label>Dari<input name="from" type="date" value="${esc(h.from)}"></label>
          <label>Sampai<input name="to" type="date" value="${esc(h.to)}"></label>
          <button class="btn btn-primary btn-sm">Terapkan</button>
        </form>
        ${dataTable(["Antrean", "Waktu", "Meja", "Total*", "Pembayaran", "Status", "Staf"], rows, "Tidak ada transaksi yang cocok.")}
        <div class="pager">${pager("Sebelumnya", data.page - 1, data.page <= 1)}
          <span>Halaman ${data.page} dari ${data.pages} · ${data.total} transaksi</span>
          ${pager("Berikutnya", data.page + 1, data.page >= data.pages)}</div>
      </div>
    </div>`;
}

async function viewStock() {
  await loadMenu();
  let moves = [];
  try {
    moves = await apiRequest("stock_movements");
  } catch (e) {
    state.notice = e.message;
  }
  const rows = state.menu.map((m) => `<tr>
    <td>${esc(m.name)}</td><td>${esc(m.cat)}</td>
    <td><form class="filters" style="margin:0" data-form="stock" data-id="${esc(m.id)}">
      <input name="stock" type="number" min="0" step="1" value="${m.stock ?? ""}" placeholder="tidak dilacak" aria-label="Stok ${esc(m.name)}">
      <button class="btn btn-sm btn-primary">Simpan</button></form></td></tr>`);
  const moveRows = moves.map((m) => `<tr>
    <td>${fmtTime(m.created_at)}</td><td>${esc(m.name)}</td><td class="r num">${m.delta > 0 ? "+" : ""}${m.delta}</td>
    <td class="r num">${m.stock_after ?? "-"}</td><td>${esc(m.reason)}</td>
    <td>${esc(m.username || m.order_id || "-")}</td><td>${esc(m.note || "")}</td></tr>`);
  return `
    <div class="staff-light">${staffHead("Stok produk")}
      <div class="cashier wide">
        ${staffNotice()}
        <div class="filters"><label>Alasan perubahan
          <select id="stock-reason"><option value="buka_hari">Buka hari baru</option><option value="koreksi">Koreksi</option></select></label></div>
        <p class="empty" style="padding:0 0 12px">Kosongkan kolom stok untuk berhenti melacak stok produk. Stok yang dilacak berkurang saat pesanan dibuat dan kembali saat pesanan dibatalkan.</p>
        ${dataTable(["Produk", "Kategori", "Stok"], rows, "Belum ada menu.")}
        <section><h2>Pergerakan stok terakhir</h2>
          ${dataTable(["Waktu", "Produk", "Jumlah*", "Sisa*", "Alasan", "Oleh", "Catatan"], moveRows, "Belum ada pergerakan.")}</section>
      </div>
    </div>`;
}

async function viewFinance() {
  let f = null;
  try {
    f = await apiRequest("finance_summary", { query: Object.fromEntries(Object.entries(state.finance).filter(([, v]) => v)) });
  } catch (e) {
    state.notice = e.message;
  }
  if (!f) return `<div class="staff-light">${staffHead("Keuangan")}<div class="cashier">${staffNotice()}</div></div>`;
  const BUCKETS = { dibayar: "Dibayar", belum_dibayar: "Belum dibayar", dikembalikan: "Dikembalikan", batal_belum_bayar: "Dibatalkan, belum bayar" };
  const breakdown = f.breakdown.map((b) => `<tr><td>${b.method === "dana" ? "DANA" : "Tunai"}</td>
    <td>${BUCKETS[b.bucket] ?? esc(b.bucket)}</td><td class="r num">${b.n}</td><td class="r num">${rupiah(b.total)}</td></tr>`);
  const daily = f.daily.map((d) => `<tr><td>${esc(d.date)}</td><td class="r num">${d.count}</td><td class="r num">${rupiah(d.total)}</td></tr>`);
  return `
    <div class="staff-light">${staffHead("Keuangan")}
      <div class="cashier wide">
        ${staffNotice()}
        <form class="filters" data-form="finance">
          <label>Dari<input name="from" type="date" value="${esc(f.from)}"></label>
          <label>Sampai<input name="to" type="date" value="${esc(f.to)}"></label>
          <button class="btn btn-primary btn-sm">Terapkan</button>
        </form>
        ${dataTable(["Ringkasan (transaksi dibayar)", "Nilai*"], [
          `<tr><td>Omzet terbayar</td><td class="r num">${rupiah(f.paidTotal)}</td></tr>`,
          `<tr><td>Jumlah transaksi</td><td class="r num">${f.paidCount}</td></tr>`,
          `<tr><td>Rata-rata per transaksi</td><td class="r num">${rupiah(f.average)}</td></tr>`
        ], "")}
        <p class="empty" style="padding:8px 0">Omzet terbayar adalah total pesanan berstatus lunas yang tidak dibatalkan. Ini bukan laba: sistem belum mencatat biaya bahan atau pengeluaran, dan belum menyimpan diskon atau pajak.</p>
        <section><h2>Per metode dan status</h2>${dataTable(["Metode", "Status", "Jumlah*", "Total*"], breakdown, "Tidak ada transaksi pada periode ini.")}</section>
        <section><h2>Rekap harian (dibayar)</h2>${dataTable(["Tanggal", "Transaksi*", "Omzet*"], daily, "Tidak ada transaksi dibayar.")}</section>
      </div>
    </div>`;
}

/* Views: product management (owner) */

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

function thumbSmall(item) {
  const src = item.photo ? `<img src="/${encodeURI(item.photo)}" alt="" loading="lazy" data-fallback>` : "";
  return `<div class="thumb-sm"><span class="thumb-empty">Tanpa foto</span>${src}</div>`;
}

function menuForm() {
  const m = state.menuForm;
  const isEdit = Boolean(m.id);
  const options = CATEGORIES.map((c) => `<option${c === m.cat ? " selected" : ""}>${c}</option>`).join("");
  return `
    <form class="menu-form" data-form="menu">
      <h2>${isEdit ? `Edit produk ${esc(m.id)}` : "Produk baru"}</h2>
      <input type="hidden" name="id" value="${esc(m.id ?? "")}">
      <div class="filters">
        <label>Nama<input name="name" value="${esc(m.name ?? "")}" required maxlength="150"></label>
        <label>Kategori<select name="cat">${options}</select></label>
        <label>Harga (Rp)<input name="price" type="number" min="1" step="1" value="${esc(m.price ?? "")}" required></label>
        <label>Harga coret (opsional)<input name="was" type="number" min="1" step="1" value="${esc(m.was ?? "")}"></label>
      </div>
      <div class="filters">
        <label style="flex:1 1 420px">Deskripsi<input name="desc" value="${esc(m.desc ?? "")}" maxlength="255" style="width:100%"></label>
        <label><input type="checkbox" name="is_active" value="1" ${m.is_active === false ? "" : "checked"}> Tampil di menu pelanggan</label>
      </div>
      <div class="photo-compare">
        <div><p class="label">Foto saat ini</p>${m.photo ? thumbLarge(`/${encodeURI(m.photo)}`) : `<div class="thumb-lg empty">Belum ada foto</div>`}
          ${m.photo ? `<label class="check"><input type="checkbox" name="remove_photo" value="1"> Hapus foto ini</label>` : ""}</div>
        <div><p class="label">Foto pengganti</p><div class="thumb-lg empty" id="photo-preview">Belum dipilih</div>
          <input id="photo-input" name="photo" type="file" accept="image/jpeg,image/png,image/webp">
          <p class="hint" id="photo-hint">JPG, PNG, atau WebP, maksimal 3 MB. Rasio 4:3 paling pas.</p></div>
      </div>
      <div class="filters">
        <button class="btn btn-primary">${isEdit ? "Simpan perubahan" : "Tambah produk"}</button>
        <button class="btn btn-quiet" type="button" data-act="menu-cancel">Batal</button>
      </div>
    </form>`;
}

const thumbLarge = (src) => `<div class="thumb-lg"><span class="thumb-empty">File foto tidak ditemukan</span><img src="${src}" alt="" data-fallback></div>`;

async function viewMenuAdmin() {
  try {
    state.menuItems = await apiRequest("list_menu_admin");
  } catch (e) {
    state.notice = e.message;
  }
  const rows = state.menuItems.map((m) => `<tr>
    <td>${thumbSmall(m)}</td>
    <td>${esc(m.name)}<div class="sub">${esc(m.desc)}</div></td><td>${esc(m.cat)}</td>
    <td class="r num">${rupiah(m.price)}</td><td>${m.is_active ? "Tampil" : "Disembunyikan"}</td>
    <td><button class="btn btn-quiet btn-sm" data-act="menu-edit" data-id="${esc(m.id)}">Edit</button></td></tr>`);
  return `
    <div class="staff-light">${staffHead("Menu dan foto")}
      <div class="cashier wide">
        ${staffNotice()}
        ${state.menuForm ? menuForm() : `<button class="btn btn-primary" data-act="menu-new" style="margin-top:16px">Tambah produk</button>`}
        ${dataTable(["Foto", "Produk", "Kategori", "Harga*", "Status", ""], rows, "Belum ada produk.")}
      </div>
    </div>`;
}

// Preview foto baru di browser sebelum disimpan. Pemeriksaan server tetap yang menentukan.
let previewUrl = null;

function previewPhoto(input) {
  const box = document.getElementById("photo-preview");
  const hint = document.getElementById("photo-hint");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  const file = input.files[0];
  if (!file) {
    box.className = "thumb-lg empty";
    box.textContent = "Belum dipilih";
    return;
  }
  if (!PHOTO_TYPES.includes(file.type) || file.size > PHOTO_MAX_BYTES) {
    input.value = "";
    box.className = "thumb-lg empty";
    box.textContent = "Belum dipilih";
    hint.textContent = !PHOTO_TYPES.includes(file.type)
      ? "Format tidak didukung. Pilih JPG, PNG, atau WebP."
      : "Foto lebih dari 3 MB. Perkecil dulu.";
    hint.classList.add("error");
    return;
  }
  hint.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  hint.classList.remove("error");
  previewUrl = URL.createObjectURL(file);
  box.className = "thumb-lg";
  box.innerHTML = `<img src="${previewUrl}" alt="Pratinjau foto baru">`;
}

const saveMenu = (data, dataset, form) => {
  // Simpan isian teks agar tidak hilang bila server menolak (file harus dipilih ulang).
  state.menuForm = { ...state.menuForm, id: data.id || undefined, name: data.name, cat: data.cat, price: data.price,
    was: data.was, desc: data.desc, is_active: Boolean(data.is_active), photo: state.menuForm.photo };
  return mutate("menu:save", () => apiRequest("save_menu", { method: "POST", body: new FormData(form) }), () => {
    state.menuForm = null;
  });
};

/* Render */

const VIEW_RENDERERS = {
  status: viewStatus,
  staff: viewStaffHub,
  login: viewLogin,
  riwayat: viewHistory,
  stok: viewStock,
  keuangan: viewFinance,
  menu: viewMenuAdmin,
  dapur: viewKitchen,
  kasir: viewCashier,
  display: viewDisplay
};

// Polling dan klik me-render ulang satu region; fokus dikembalikan agar input dan tombol tidak terlepas.
function patchNode(node, html) {
  const active = document.activeElement;
  const key = node.contains(active) ? active.dataset.key : null;
  const selection = key && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  node.innerHTML = html;
  if (!key) return;
  const target = node.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (selection) target.setSelectionRange(...selection);
}

async function render() {
  const customer = state.view === "customer";
  shell.hidden = !customer;
  root.hidden = customer;
  if (customer) return renderCustomer();

  const seq = ++renderSeq;
  if (STAFF_VIEWS.includes(state.view) && !canOpen(state.view)) {
    if (state.user) {
      state.view = "staff";
    } else {
      state.next = state.view;
      state.view = "login";
    }
  }
  const view = state.view;
  const html = await (VIEW_RENDERERS[view] ?? viewStaffHub)();
  if (view !== state.view) return render(); // sesi berakhir selama pengambilan data
  // Abaikan hasil render lama yang selesai setelah render yang lebih baru.
  if (seq === renderSeq) patchNode(root, html);
}

/* Events */

const CLICK_ACTIONS = {
  add: ({ id }) => changeQty(id, 1),
  remove: ({ id }) => changeQty(id, -1),
  category: ({ value }) => {
    if (value !== state.category) animateMenu = true;
    state.category = value;
    render();
  },
  "remove-line": ({ id }) => { state.cart = state.cart.filter((c) => c.id !== id); state.idemKey = null; render(); },
  "toggle-nav": toggleNav,
  "reload-menu": async () => { await loadMenu(); render(); },
  "open-cart": () => { state.cartOpen = true; render(); },
  "close-cart": closeCart,
  "step-cart": () => { state.cartStep = "cart"; state.notice = ""; render(); },
  "step-pay": () => { state.cartStep = "pay"; state.notice = ""; render(); },
  "pay-cash": () => submitOrder("cash"),
  "start-dana": () => { state.cartStep = "dana"; render(); },
  "confirm-dana": () => submitOrder("dana"),
  "new-order": startNewOrder,
  notify: requestNotifyPermission,
  logout: logout,
  "menu-new": () => { state.menuForm = { cat: "Makanan" }; render(); },
  "menu-edit": ({ id }) => { state.menuForm = { ...state.menuItems.find((m) => m.id === id) }; render(); },
  "menu-cancel": () => { state.menuForm = null; render(); },
  page: ({ page }) => { state.history.page = Number(page); render(); },
  advance: ({ id }) => advanceOrder(id),
  "confirm-paid": ({ id }) => confirmPaid(id),
  "admin-paid": ({ id }) => setAdminPaid(id, true),
  "admin-unpaid": ({ id }) => setAdminPaid(id, false)
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el && !el.disabled) CLICK_ACTIONS[el.dataset.act]?.(el.dataset);
});

root.addEventListener("input", (e) => {
  if (e.target.id === "admin-q") state.adminQuery = e.target.value;
});

async function login({ username, password }) {
  state.notice = "";
  try {
    const result = await apiRequest("login", { method: "POST", body: { username, password } });
    state.user = result.user;
    state.csrf = result.csrf;
    state.view = canOpen(state.next) ? state.next : "staff";
    history.replaceState(null, "", `?view=${state.view}`);
  } catch (e) {
    state.notice = e.message;
  }
  render();
}

async function logout() {
  try { await apiRequest("logout", { method: "POST", body: {} }); } catch (e) { console.error(e); }
  state.user = null;
  state.csrf = null;
  state.next = null;
  state.view = "login";
  render();
}

const cancelOrder = (id, reason) =>
  mutate("cancel:" + id, () => apiRequest("cancel_order", { method: "POST", body: { id, reason } }), (order) => {
    state.adminResult = order;
  });

const saveStock = (menuId, { stock }) =>
  mutate("stock:" + menuId, () => apiRequest("set_stock", {
    method: "POST",
    body: {
      menuId,
      stock: stock === "" ? null : Number(stock),
      reason: document.getElementById("stock-reason").value
    }
  }));

const FORM_HANDLERS = {
  login,
  search: searchOrder,
  cancel: (data, { id }) => cancelOrder(id, data.reason),
  history: (data) => { state.history = { ...data, page: 1 }; render(); },
  finance: (data) => { state.finance = data; render(); },
  stock: saveStock,
  menu: saveMenu
};

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  FORM_HANDLERS[form.dataset.form]?.(Object.fromEntries(new FormData(form)), form.dataset, form);
});

function toggleNav() {
  const nav = document.getElementById("site-nav");
  const open = nav.toggleAttribute("data-open");
  document.querySelector(".nav-toggle").setAttribute("aria-expanded", String(open));
}

document.getElementById("nav-links").addEventListener("click", (e) => {
  if (e.target.closest("a") && document.getElementById("site-nav").hasAttribute("data-open")) toggleNav();
});

// Gambar yang gagal dimuat dibuang agar fallback di belakangnya yang tampil. Event error tidak bubble.
document.addEventListener("error", (e) => {
  if (e.target.matches?.("img[data-fallback]")) e.target.remove();
}, true);

document.addEventListener("change", (e) => {
  if (e.target.id === "photo-input") previewPhoto(e.target);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.cartOpen) closeCart();
});

/* Init */

async function init() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  state.view = VIEWS.includes(view) ? view : "customer";
  state.table = params.get("meja") || params.get("table") || "1";
  shell.hidden = state.view !== "customer";
  root.hidden = !shell.hidden;

  if (STAFF_VIEWS.includes(state.view) || state.view === "login") {
    try {
      const session = await apiRequest("me");
      state.user = session.user;
      state.csrf = session.csrf;
    } catch (e) { /* belum masuk: render() mengarahkan ke login */ }
    if (state.view === "login") state.view = state.user ? "staff" : "login";
  }

  initPageEffects();
  await render();
  if (state.view === "customer") {
    await loadMenu();
    await render();
  }
  if (["dapur", "kasir", "display"].includes(state.view)) startPolling();
}

init();
