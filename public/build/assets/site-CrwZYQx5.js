var e=`Nusantara Bites`,t=[`Makanan`,`Minuman`,`Promo`],n=[`customer`,`dapur`,`kasir`,`display`,`staff`,`login`,`riwayat`,`stok`,`keuangan`,`menu`],r=[`staff`,`dapur`,`kasir`,`riwayat`,`stok`,`keuangan`,`menu`],i={owner:r,kasir:[`staff`,`kasir`,`riwayat`],dapur:[`staff`,`dapur`]},a=[`status`,`dapur`,`kasir`,`display`],o={menunggu_bayar:`Menunggu pembayaran`,diterima:`Diterima`,diproses:`Dimasak`,siap:`Siap diambil`,selesai:`Selesai`,dibatalkan:`Dibatalkan`},s=[{key:`diterima`,label:`Diterima`},{key:`diproses`,label:`Dimasak`},{key:`siap`,label:`Siap diambil`}],c={view:`customer`,table:`1`,category:`Makanan`,menu:[],menuStatus:`loading`,cart:[],cartOpen:!1,cartStep:`cart`,submitting:!1,orderId:null,notice:``,adminQuery:``,adminResult:void 0,pollHandle:null,alertedReady:{},user:null,csrf:null,next:null,idemKey:null,history:{q:``,status:``,from:``,to:``,page:1},finance:{from:``,to:``},menuForm:null,menuItems:[]},l=document.getElementById(`root`),u=new Set,d=0;async function f(e,{method:t=`GET`,query:n,body:i}={}){let a=n?`&`+new URLSearchParams(n).toString():``,o=i instanceof FormData,s=o?{}:{"Content-Type":`application/json`};c.csrf&&t!==`GET`&&(s[`X-CSRF-Token`]=c.csrf);let l=await fetch(`/api.php?action=${encodeURIComponent(e)}${a}`,{method:t,headers:s,credentials:`same-origin`,body:i===void 0?void 0:o?i:JSON.stringify(i)}),u=await l.json().catch(()=>null);if(l.status===401&&![`login`,`me`].includes(e)&&(c.user=null,c.csrf=null,r.includes(c.view)&&(c.next=c.view,c.view=`login`,c.notice=`Sesi berakhir. Silakan masuk lagi.`)),!l.ok)throw Error(u?.error||`Permintaan gagal (${l.status})`);return u}async function p(){c.menuStatus=`loading`;try{c.menu=await f(`get_menu`),c.menuStatus=`ok`}catch(e){console.error(`Gagal mengambil menu:`,e),c.menuStatus=`error`}}var m=`Daftar pesanan tidak bisa dimuat. Mencoba lagi otomatis.`;async function h(){try{let e=await f(`get_orders`);return c.notice===m&&(c.notice=``),e}catch(e){return console.error(`Gagal mengambil daftar pesanan:`,e),c.notice=m,[]}}async function ee(e){if(!e)return null;try{return await f(`get_order`,{query:{id:e}})}catch(e){return console.error(`Gagal mengambil pesanan:`,e),null}}var te={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`},g=e=>String(e??``).replace(/[&<>"']/g,e=>te[e]),_=e=>`Rp`+Number(e).toLocaleString(`id-ID`),v=e=>`#`+String(e).padStart(3,`0`),ne={paid:`lunas`,pending:`belum dibayar`,refunded:`dikembalikan`},y=e=>`${e.method===`dana`?`DANA`:`Tunai`}, ${ne[e.paymentStatus]??e.paymentStatus}`,b=e=>g(o[e]??e),x=e=>new Date(e).toLocaleString(`id-ID`,{dateStyle:`short`,timeStyle:`short`}),S=e=>i[c.user?.role]?.includes(e)??!1,C=e=>e.items.map(e=>`${e.qty}× ${g(e.name)}`).join(`, `);function re(e){return Math.max(0,Math.floor((Date.now()-e)/6e4))}var ie=e=>e.photo?`/`+encodeURI(e.photo):`/images/menu/${encodeURIComponent(e.id)}.jpg`,w=e=>c.menu.find(t=>t.id===e),T=e=>c.cart.find(t=>t.id===e)?.qty??0,E=()=>c.cart.reduce((e,t)=>e+t.qty,0),D=()=>c.cart.reduce((e,t)=>e+(w(t.id)?.price??0)*t.qty,0);function O(e,t){let n=w(e)?.stock??1/0;if(t>0&&T(e)>=n)return;c.idemKey=null;let r=c.cart.find(t=>t.id===e);r?r.qty+=t:t>0&&c.cart.push({id:e,qty:1}),c.cart=c.cart.filter(e=>e.qty>0),Q()}function k(){c.cartOpen=!1,c.cartStep=`cart`,c.notice=``,Q()}async function A(e){if(c.submitting||!c.cart.length)return;c.submitting=!0,c.notice=``,c.idemKey||=crypto.randomUUID?.()??`k${Date.now()}${Math.random().toString(36).slice(2)}`,Q();let t=e===`dana`;try{let n=c.cart.map(e=>{let t=w(e.id);return{id:e.id,name:t.name,qty:e.qty,price:t.price}}),r=await f(`create_order`,{method:`POST`,body:{table:c.table||`-`,items:n,total:D(),idempotencyKey:c.idemKey,method:e,paymentStatus:t?`paid`:`pending`,status:t?`diterima`:`menunggu_bayar`}});c.cart=[],c.cartOpen=!1,c.cartStep=`cart`,c.orderId=r.id,c.idemKey=null,c.view=`status`,F(),N()}catch(e){console.error(e),c.notice=`Pesanan gagal dibuat: `+e.message,/stok/i.test(e.message)&&await p()}finally{c.submitting=!1,Q()}}function ae(){P(),c.orderId=null,c.view=`customer`,Q(),p().then(Q)}async function j(e,t,n){if(!u.has(e)){u.add(e),c.notice=``;try{let e=await t();n&&n(e)}catch(e){console.error(e),c.notice=e.message}finally{u.delete(e)}await Q()}}var oe=e=>j(`advance:`+e,()=>f(`advance_order`,{method:`POST`,body:{id:e}})),se=e=>j(`pay:`+e,()=>f(`set_payment`,{method:`POST`,body:{id:e,paid:!0}})),M=(e,t)=>j(`pay:`+e,()=>f(`set_payment`,{method:`POST`,body:{id:e,paid:t}}),e=>{c.adminResult=e});async function ce(){let e=c.adminQuery.trim();if(c.notice=``,!e)return c.adminResult=void 0,Q();try{c.adminResult=await f(`admin_search`,{query:{q:e}})}catch(e){console.error(e),c.adminResult=void 0,c.notice=`Pencarian gagal: `+e.message}Q()}function N(){P(),c.pollHandle=setInterval(()=>{a.includes(c.view)&&Q().catch(e=>console.error(`Polling error:`,e))},3500)}function P(){clearInterval(c.pollHandle),c.pollHandle=null}function F(){if(`Notification`in window&&Notification.permission==="default")try{Notification.requestPermission().then(Q)}catch{}}function le(){try{let e=new(window.AudioContext||window.webkitAudioContext);[880,1175].forEach((t,n)=>{let r=e.currentTime+n*.18,i=e.createOscillator(),a=e.createGain();i.type=`sine`,i.frequency.value=t,i.connect(a),a.connect(e.destination),a.gain.setValueAtTime(1e-4,r),a.gain.exponentialRampToValueAtTime(.2,r+.02),a.gain.exponentialRampToValueAtTime(1e-4,r+.35),i.start(r),i.stop(r+.4)})}catch{}}function ue(t){le();try{navigator.vibrate?.([200,80,200,80,200])}catch{}try{`Notification`in window&&Notification.permission===`granted`&&new Notification(e,{body:`Nomor antrean ${v(t.queue)} siap diambil.`})}catch{}}var I=document.getElementById(`customer-shell`),L={nav:document.getElementById(`nav-cart`),menu:document.getElementById(`menu-region`),cart:document.getElementById(`cart-region`)},R={count:0,total:0},z=!1;function B(e,t,n,r,i=1/0){return`
    <div class="stepper" role="group" aria-label="Jumlah ${g(t)}">
      <button data-act="remove" data-id="${g(e)}" data-key="${r}-${g(e)}-minus" aria-label="Kurangi ${g(t)}">−</button>
      <output class="num">${n}</output>
      <button data-act="add" data-id="${g(e)}" data-key="${r}-${g(e)}" aria-label="Tambah ${g(t)}" ${n>=i?`disabled`:``}>+</button>
    </div>`}function de(e){let t=T(e.id),n=e.stock!=null&&e.stock<=0,r=n?`<span class="soldout">Habis</span>`:t?B(e.id,e.name,t,`dish`,e.stock??1/0):`<button class="btn btn-primary btn-sm" data-act="add" data-id="${g(e.id)}" data-key="dish-${g(e.id)}" aria-label="Tambah ${g(e.name)}">Tambah</button>`,i=e.was?`<span class="saving num">Hemat ${_(e.was-e.price)}</span>`:e.stock!=null&&e.stock>0&&e.stock<=5?`<span class="saving">Sisa ${e.stock}</span>`:``;return`
    <li class="dish${n?` out`:``}">
      <div class="photo cat-${g(e.cat)}">
        <div class="photo-fallback"><span>${g(e.cat)}</span></div>
        <img src="${ie(e)}" alt="${g(e.name)}" loading="lazy" data-fallback>
      </div>
      <div class="dish-top">
        <h3>${g(e.name)}</h3>
        <div class="price num">${_(e.price)}${e.was?`<s class="was">${_(e.was)}</s>`:``}${i}</div>
      </div>
      <p class="desc">${g(e.desc)}</p>
      <div class="dish-foot"><span></span>${r}</div>
    </li>`}function V(){if(c.menuStatus===`loading`)return`<ul class="menu-grid" aria-busy="true">${`<li><div class="skeleton"></div></li>`.repeat(6)}</ul>`;if(c.menuStatus===`error`)return`<div class="state-msg"><p>Menu tidak bisa dimuat. Periksa koneksi, lalu coba lagi.</p>
      <button class="btn btn-quiet" data-act="reload-menu">Muat ulang menu</button></div>`;let e=c.menu.filter(e=>e.cat===c.category);return e.length?`<ul class="menu-grid${z?` swap`:``}">${e.map(de).join(``)}</ul>`:`<p class="state-msg">Belum ada menu di kategori ini.</p>`}function H(){return`<nav class="tabs" aria-label="Kategori menu">${t.map(e=>`<button class="tab" data-act="category" data-value="${e}" aria-current="${e===c.category}">${e}</button>`).join(``)}</nav>${V()}`}function fe(){return c.cart.map(e=>{let t=w(e.id);return t?`
      <div class="line">
        <div>${g(t.name)}<div class="sub num">${_(t.price)} × ${e.qty} = ${_(t.price*e.qty)}</div></div>
        <div class="line-actions">
          ${B(t.id,t.name,e.qty,`cart`,t.stock??1/0)}
          <button class="link-btn" data-act="remove-line" data-id="${g(t.id)}" aria-label="Hapus ${g(t.name)} dari keranjang">Hapus</button>
        </div>
      </div>`:``}).join(``)}function pe(e){let t=`<div class="total"><span>Total</span><span class="num${e}">${_(D())}</span></div>`,n=c.submitting?`disabled`:``;return c.cartStep===`pay`?`
      ${t}
      <p>Pilih cara pembayaran.</p>
      <button class="pay-opt" data-act="pay-cash" ${n}>
        <b>Tunai di kasir</b><span>Tunjukkan nomor antrean dan bayar di kasir. Pesanan masuk dapur setelah dibayar.</span>
      </button>
      <button class="pay-opt" data-act="start-dana" ${n}>
        <b>DANA</b><span>Bayar lewat kode QR.</span>
      </button>
      <button class="btn btn-quiet btn-block" style="margin-top:14px" data-act="step-cart">Kembali ke pesanan</button>`:c.cartStep===`dana`?`
      ${t}
      <div class="qr-sim" role="img" aria-label="Kode QR simulasi">Simulasi<br>QR DANA</div>
      <p class="sim-note">Ini tampilan simulasi, bukan pembayaran sungguhan. Kode QR asli akan muncul setelah payment gateway terhubung.</p>
      <button class="btn btn-primary btn-block" data-act="confirm-dana" ${n}>${c.submitting?`Mengirim pesanan…`:`Kirim pesanan`}</button>
      <button class="btn btn-quiet btn-block" style="margin-top:10px" data-act="step-pay">Ganti cara bayar</button>`:c.cart.length?`${fe()}${t}<button class="btn btn-primary btn-block" data-act="step-pay">Pilih pembayaran</button>`:`<p class="state-msg">Belum ada item. Pilih menu untuk memulai.</p>`}function me(){let e={cart:`Pesanan Anda`,pay:`Pembayaran`,dana:`Bayar dengan DANA`},t=D()===R.total?``:` bump`,n=E()&&!c.cartOpen?`<button class="cart-bar" data-act="open-cart">
         <span><span class="num">${E()}</span> item</span>
         <strong class="num${t}">${_(D())}</strong>
         <span>Lihat pesanan</span>
       </button>`:``;return`
    ${c.cartOpen?`<div class="scrim" data-act="close-cart"></div>`:``}
    <aside class="cart${c.cartOpen?` open`:``}" aria-label="Pesanan Anda" ${c.cartOpen?`role="dialog" aria-modal="true"`:``}>
      <div class="cart-head">
        <h2>${e[c.cartStep]}</h2>
        <button class="btn btn-quiet btn-sm cart-close" data-act="close-cart" data-key="cart-close">Tutup</button>
      </div>
      ${c.notice?`<p class="notice" role="alert">${g(c.notice)}</p>`:``}
      ${pe(t)}
    </aside>
    ${n}`}function he(){let e=E()===R.count?``:` bump`;return`<button class="nav-cart" data-act="open-cart" data-key="nav-cart" aria-label="Buka keranjang, ${E()} item">
    Keranjang <span class="count num${e}">${E()}</span></button>`}var U=!1;function ge(){Z(L.nav,he()),Z(L.menu,H()),Z(L.cart,me()),Object.assign(R,{count:E(),total:D()}),z=!1,c.cartOpen&&!U&&L.cart.querySelector(`.cart-close`)?.focus(),!c.cartOpen&&U&&document.querySelector(`.nav-cart`)?.focus(),U=c.cartOpen}function _e(){let e=matchMedia(`(prefers-reduced-motion: reduce)`).matches,t=document.querySelectorAll(`.reveal`);if(e||!(`IntersectionObserver`in window)){t.forEach(e=>e.classList.add(`is-visible`));return}let n=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(e.target.classList.add(`is-visible`),n.unobserve(e.target))})},{threshold:.15});t.forEach(e=>n.observe(e));let r=document.querySelector(`[data-parallax]`);if(!r)return;let i=!1;window.addEventListener(`scroll`,()=>{i||window.scrollY>900||(i=!0,requestAnimationFrame(()=>{r.style.transform=`translateY(${window.scrollY*.06}px)`,i=!1}))},{passive:!0})}function ve(t){switch(t.status){case`menunggu_bayar`:return`<p class="ticket-msg wait">Bayar ${_(t.total)} di kasir dan tunjukkan nomor antrean ini. Pesanan diteruskan ke dapur setelah pembayaran dikonfirmasi.</p>`;case`diterima`:return`<p class="ticket-msg">Pesanan sudah masuk ke dapur.</p>`;case`diproses`:return`<p class="ticket-msg">Pesanan sedang dimasak.</p>`;case`siap`:return`<p class="ticket-msg ready">Pesanan siap. Ambil di kasir.</p>`;default:return`<p class="ticket-msg">Pesanan selesai. Terima kasih sudah makan di ${e}.</p>`}}function ye(e){return!(`Notification`in window)||e.status===`selesai`?``:Notification.permission==="default"?`<div class="notify"><span>Aktifkan notifikasi agar tahu saat pesanan siap.</span>
      <button class="btn btn-quiet btn-sm" data-act="notify">Aktifkan</button></div>`:Notification.permission===`denied`?`<p class="notify">Notifikasi diblokir browser. Biarkan halaman ini terbuka; bunyi dan getar tetap aktif saat pesanan siap.</p>`:``}async function be(){let e=await ee(c.orderId),t=`<button class="btn btn-quiet btn-block" data-act="new-order">Pesan lagi</button>`;if(!e)return`<div class="ticket-page"><p class="empty">Pesanan tidak ditemukan.</p>${t}</div>`;e.status===`siap`&&!c.alertedReady[e.id]&&(c.alertedReady[e.id]=!0,ue(e));let n=s.findIndex(t=>t.key===e.status),r=s.map((t,r)=>{let i=``;return e.status===`selesai`||n>=0&&r<n?i=`done`:r===n&&(i=`current`),`<li class="${i}"${i===`current`?` aria-current="step"`:``}>${t.label}</li>`}).join(``),i=e.items.map(e=>`<div><span>${e.qty}× ${g(e.name)}</span><span class="num">${_(e.price*e.qty)}</span></div>`).join(``);return`
    <div class="ticket-page">
      <article class="ticket${e.status===`siap`?` is-ready`:``}">
        <p class="label">Nomor antrean</p>
        <p class="queue num">${v(e.queue)}</p>
        <p class="where">Meja ${g(e.table)} · ${y(e)}</p>
        <ol class="progress" aria-label="Status pesanan">${r}</ol>
        <div role="status" aria-live="polite">${ve(e)}</div>
        ${ye(e)}
        <div class="ticket-items">${i}
          <div class="sum"><span>Total</span><span class="num">${_(e.total)}</span></div>
        </div>
      </article>
      ${t}
    </div>`}var W=()=>c.notice?`<p class="notice" role="alert">${g(c.notice)}</p>`:``;function G(e){return`<header class="staff-head"><h1>${e}</h1><a href="?view=staff">Menu staf</a></header>`}function K(){let t=[[`menu`,`Menu dan foto`,`Tambah produk, ubah harga, dan unggah foto`],[`dapur`,`Dapur`,`Pesanan masuk, dimasak, dan siap diambil`],[`kasir`,`Kasir`,`Konfirmasi pembayaran, cari dan batalkan pesanan`],[`riwayat`,`Riwayat transaksi`,`Semua pesanan, filter, dan detail`],[`stok`,`Stok produk`,`Stok harian dan riwayat pergerakan`],[`keuangan`,`Keuangan`,`Omzet terbayar per periode`]].filter(([e])=>S(e)).map(([e,t,n])=>`<a href="?view=${e}"><b>${t}</b><span>${n}</span></a>`).join(``);return`
    <div class="staff-light">
      <header class="staff-head"><h1>Staf ${e}</h1>
        <span>${g(c.user?.username)} (${g(c.user?.role)})
          <button class="btn btn-quiet btn-sm" data-act="logout">Keluar</button></span></header>
      <nav class="hub" aria-label="Halaman staf">
        ${t}
        <a href="?view=display"><b>Layar antrean</b><span>Nomor yang siap diambil, untuk ruang tunggu</span></a>
        <a href="?view=customer"><b>Menu pelanggan</b><span>Kembali ke halaman pemesanan</span></a>
      </nav>
    </div>`}function xe(){return`
    <div class="staff-light">
      <header class="staff-head"><h1>Masuk staf</h1><a href="?view=customer">Menu pelanggan</a></header>
      <main class="cashier" style="max-width:380px">
        ${W()}
        <form class="stack" data-form="login">
          <label>Nama pengguna<input name="username" autocomplete="username" required></label>
          <label>Kata sandi<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary btn-block" style="margin-top:18px">Masuk</button>
        </form>
      </main>
    </div>`}var Se=[{key:`diterima`,label:`Masuk`,action:`Mulai masak`},{key:`diproses`,label:`Dimasak`,action:`Tandai siap`},{key:`siap`,label:`Siap diambil`,action:`Tandai selesai`}];function Ce(e,t){let n=e.paymentStatus!==`paid`,r=e.items.map(e=>`<li><b class="num">${e.qty}×</b> ${g(e.name)}</li>`).join(``);return`
    <article class="order${n?` unpaid`:``}">
      <div class="order-top">
        <span class="q num">${v(e.queue)}</span>
        <span class="meta">Meja ${g(e.table)}<br>${re(e.createdAt)} menit lalu</span>
      </div>
      <ul>${r}</ul>
      <p class="pay">${y(e)}</p>
      <button class="btn btn-block" data-act="advance" data-id="${g(e.id)}">${t}</button>
    </article>`}async function we(){let e=await h(),t=Se.map(t=>{let n=e.filter(e=>e.status===t.key);return`
      <section class="lane" aria-label="${t.label}">
        <h2><span>${t.label}</span><span class="num">${n.length}</span></h2>
        ${n.map(e=>Ce(e,t.action)).join(``)||`<p class="empty">Kosong</p>`}
      </section>`}).join(``);return`<div class="staff-dark">${G(`Dapur`)}${W()}<div class="board">${t}</div></div>`}function Te(){if(c.adminResult===void 0)return``;if(c.adminResult===null)return`<p class="empty">Pesanan tidak ditemukan. Coba nomor antrean (12 atau #012) atau ID lengkap.</p>`;let e=c.adminResult,t=e.status===`dibatalkan`,n=t?``:e.paymentStatus===`paid`?`<button class="btn btn-warn" data-act="admin-unpaid" data-id="${g(e.id)}">Tandai belum dibayar</button>`:`<button class="btn btn-primary" data-act="admin-paid" data-id="${g(e.id)}">Tandai lunas</button>`,r=t||e.status===`selesai`?``:`
    <form class="filters" data-form="cancel" data-id="${g(e.id)}">
      <label>Alasan pembatalan<input name="reason" required minlength="3" maxlength="255"></label>
      <button class="btn btn-warn">Batalkan pesanan</button>
    </form>`;return`
    <div class="result">
      <div class="txn">
        <span class="q num">${v(e.queue)}</span>
        <div class="detail"><b>Meja ${g(e.table)}</b> · ${C(e)}<br>
          ${b(e.status)} · ${y(e)}${e.cancelReason?`<br>Alasan: ${g(e.cancelReason)}`:``}</div>
        <span class="amt num">${_(e.total)}</span>
      </div>
      ${n}${r}
    </div>`}function Ee(){return`
    <form class="search" data-form="search">
      <label for="admin-q">Cari pesanan berdasarkan nomor antrean atau ID</label>
      <div>
        <input id="admin-q" data-key="admin-q" type="text" autocomplete="off" value="${g(c.adminQuery)}" placeholder="12, #012, atau ID lengkap">
        <button class="btn btn-primary" type="submit">Cari</button>
      </div>
    </form>
    ${Te()}`}async function De(){let e=await h(),t=e.filter(e=>e.paymentStatus===`pending`),n=e.filter(e=>e.paymentStatus===`paid`).slice(-6).reverse(),r=t.map(e=>`
    <div class="txn">
      <span class="q num">${v(e.queue)}</span>
      <div class="detail"><b>Meja ${g(e.table)}</b> · ${C(e)}</div>
      <span class="amt num">${_(e.total)}</span>
      <button class="btn btn-primary btn-sm" data-act="confirm-paid" data-id="${g(e.id)}">Konfirmasi lunas</button>
    </div>`).join(``),i=n.map(e=>`
    <div class="txn done">
      <span class="q num">${v(e.queue)}</span>
      <div class="detail">Meja ${g(e.table)} · ${y(e)}</div>
      <span class="amt num">${_(e.total)}</span>
    </div>`).join(``);return`
    <div class="staff-light">
      ${G(`Kasir`)}
      <div class="cashier">
        ${W()}
        ${Ee()}
        <section>
          <h2>Menunggu pembayaran (${t.length})</h2>
          ${r||`<p class="empty">Tidak ada pesanan yang menunggu pembayaran.</p>`}
        </section>
        <section>
          <h2>Lunas terakhir</h2>
          ${i||`<p class="empty">Belum ada pembayaran.</p>`}
        </section>
      </div>
    </div>`}async function Oe(){let t=(await f(`get_ready_queue`).catch(()=>[])).map(e=>`<div class="call-num num">${v(e.queue)}</div>`).join(``);return`
    <div class="staff-dark">
      <header class="staff-head"><h1>Siap diambil</h1><span>${e}</span></header>
      <div class="call" aria-live="polite">
        ${t?`<div class="call-grid">${t}</div>`:`<p class="empty">Belum ada pesanan yang siap.</p>`}
      </div>
    </div>`}function q(e,t,n){return t.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr>${e.map(e=>`<th${e.endsWith(`*`)?` class="r"`:``}>${e.replace(`*`,``)}</th>`).join(``)}</tr></thead><tbody>${t.join(``)}</tbody></table></div>`:`<p class="empty">${n}</p>`}async function ke(){let e=c.history,t={rows:[],total:0,page:1,pages:1};try{t=await f(`list_transactions`,{query:e})}catch(e){c.notice=e.message}let n=t.rows.map(e=>{let t=[e.paidBy&&`bayar: ${e.paidBy}`,e.cancelledBy&&`batal: ${e.cancelledBy}`].filter(Boolean).join(`, `),n=e.items.map(e=>`<div>${e.qty}× ${g(e.name)} @ ${_(e.price)} = ${_(e.price*e.qty)}</div>`).join(``);return`<tr>
      <td><details><summary class="num">${v(e.queue)}</summary>${n}
        <div>ID: ${g(e.id)}</div>${e.cancelReason?`<div>Alasan batal: ${g(e.cancelReason)}</div>`:``}</details></td>
      <td>${x(e.createdAt)}</td><td>${g(e.table)}</td>
      <td class="r num">${_(e.total)}</td><td>${y(e)}</td>
      <td>${b(e.status)}</td><td>${g(t||`-`)}</td></tr>`}),r=[``,...Object.keys(o)].map(t=>`<option value="${t}"${t===e.status?` selected`:``}>${t?o[t]:`Semua status`}</option>`).join(``),i=(e,t,n)=>`<button class="btn btn-quiet btn-sm" data-act="page" data-page="${t}" ${n?`disabled`:``}>${e}</button>`;return`
    <div class="staff-light">${G(`Riwayat transaksi`)}
      <div class="cashier wide">
        ${W()}
        <form class="filters" data-form="history">
          <label>Cari<input name="q" value="${g(e.q)}" placeholder="antrean, ID, atau meja"></label>
          <label>Status<select name="status">${r}</select></label>
          <label>Dari<input name="from" type="date" value="${g(e.from)}"></label>
          <label>Sampai<input name="to" type="date" value="${g(e.to)}"></label>
          <button class="btn btn-primary btn-sm">Terapkan</button>
        </form>
        ${q([`Antrean`,`Waktu`,`Meja`,`Total*`,`Pembayaran`,`Status`,`Staf`],n,`Tidak ada transaksi yang cocok.`)}
        <div class="pager">${i(`Sebelumnya`,t.page-1,t.page<=1)}
          <span>Halaman ${t.page} dari ${t.pages} · ${t.total} transaksi</span>
          ${i(`Berikutnya`,t.page+1,t.page>=t.pages)}</div>
      </div>
    </div>`}async function Ae(){await p();let e=[];try{e=await f(`stock_movements`)}catch(e){c.notice=e.message}let t=c.menu.map(e=>`<tr>
    <td>${g(e.name)}</td><td>${g(e.cat)}</td>
    <td><form class="filters" style="margin:0" data-form="stock" data-id="${g(e.id)}">
      <input name="stock" type="number" min="0" step="1" value="${e.stock??``}" placeholder="tidak dilacak" aria-label="Stok ${g(e.name)}">
      <button class="btn btn-sm btn-primary">Simpan</button></form></td></tr>`),n=e.map(e=>`<tr>
    <td>${x(e.created_at)}</td><td>${g(e.name)}</td><td class="r num">${e.delta>0?`+`:``}${e.delta}</td>
    <td class="r num">${e.stock_after??`-`}</td><td>${g(e.reason)}</td>
    <td>${g(e.username||e.order_id||`-`)}</td><td>${g(e.note||``)}</td></tr>`);return`
    <div class="staff-light">${G(`Stok produk`)}
      <div class="cashier wide">
        ${W()}
        <div class="filters"><label>Alasan perubahan
          <select id="stock-reason"><option value="buka_hari">Buka hari baru</option><option value="koreksi">Koreksi</option></select></label></div>
        <p class="empty" style="padding:0 0 12px">Kosongkan kolom stok untuk berhenti melacak stok produk. Stok yang dilacak berkurang saat pesanan dibuat dan kembali saat pesanan dibatalkan.</p>
        ${q([`Produk`,`Kategori`,`Stok`],t,`Belum ada menu.`)}
        <section><h2>Pergerakan stok terakhir</h2>
          ${q([`Waktu`,`Produk`,`Jumlah*`,`Sisa*`,`Alasan`,`Oleh`,`Catatan`],n,`Belum ada pergerakan.`)}</section>
      </div>
    </div>`}async function je(){let e=null;try{e=await f(`finance_summary`,{query:Object.fromEntries(Object.entries(c.finance).filter(([,e])=>e))})}catch(e){c.notice=e.message}if(!e)return`<div class="staff-light">${G(`Keuangan`)}<div class="cashier">${W()}</div></div>`;let t={dibayar:`Dibayar`,belum_dibayar:`Belum dibayar`,dikembalikan:`Dikembalikan`,batal_belum_bayar:`Dibatalkan, belum bayar`},n=e.breakdown.map(e=>`<tr><td>${e.method===`dana`?`DANA`:`Tunai`}</td>
    <td>${t[e.bucket]??g(e.bucket)}</td><td class="r num">${e.n}</td><td class="r num">${_(e.total)}</td></tr>`),r=e.daily.map(e=>`<tr><td>${g(e.date)}</td><td class="r num">${e.count}</td><td class="r num">${_(e.total)}</td></tr>`);return`
    <div class="staff-light">${G(`Keuangan`)}
      <div class="cashier wide">
        ${W()}
        <form class="filters" data-form="finance">
          <label>Dari<input name="from" type="date" value="${g(e.from)}"></label>
          <label>Sampai<input name="to" type="date" value="${g(e.to)}"></label>
          <button class="btn btn-primary btn-sm">Terapkan</button>
        </form>
        ${q([`Ringkasan (transaksi dibayar)`,`Nilai*`],[`<tr><td>Omzet terbayar</td><td class="r num">${_(e.paidTotal)}</td></tr>`,`<tr><td>Jumlah transaksi</td><td class="r num">${e.paidCount}</td></tr>`,`<tr><td>Rata-rata per transaksi</td><td class="r num">${_(e.average)}</td></tr>`],``)}
        <p class="empty" style="padding:8px 0">Omzet terbayar adalah total pesanan berstatus lunas yang tidak dibatalkan. Ini bukan laba: sistem belum mencatat biaya bahan atau pengeluaran, dan belum menyimpan diskon atau pajak.</p>
        <section><h2>Per metode dan status</h2>${q([`Metode`,`Status`,`Jumlah*`,`Total*`],n,`Tidak ada transaksi pada periode ini.`)}</section>
        <section><h2>Rekap harian (dibayar)</h2>${q([`Tanggal`,`Transaksi*`,`Omzet*`],r,`Tidak ada transaksi dibayar.`)}</section>
      </div>
    </div>`}var J=[`image/jpeg`,`image/png`,`image/webp`],Me=3145728;function Ne(e){return`<div class="thumb-sm"><span class="thumb-empty">Tanpa foto</span>${e.photo?`<img src="/${encodeURI(e.photo)}" alt="" loading="lazy" data-fallback>`:``}</div>`}function Pe(){let e=c.menuForm,n=!!e.id,r=t.map(t=>`<option${t===e.cat?` selected`:``}>${t}</option>`).join(``);return`
    <form class="menu-form" data-form="menu">
      <h2>${n?`Edit produk ${g(e.id)}`:`Produk baru`}</h2>
      <input type="hidden" name="id" value="${g(e.id??``)}">
      <div class="filters">
        <label>Nama<input name="name" value="${g(e.name??``)}" required maxlength="150"></label>
        <label>Kategori<select name="cat">${r}</select></label>
        <label>Harga (Rp)<input name="price" type="number" min="1" step="1" value="${g(e.price??``)}" required></label>
        <label>Harga coret (opsional)<input name="was" type="number" min="1" step="1" value="${g(e.was??``)}"></label>
      </div>
      <div class="filters">
        <label style="flex:1 1 420px">Deskripsi<input name="desc" value="${g(e.desc??``)}" maxlength="255" style="width:100%"></label>
        <label><input type="checkbox" name="is_active" value="1" ${e.is_active===!1?``:`checked`}> Tampil di menu pelanggan</label>
      </div>
      <div class="photo-compare">
        <div><p class="label">Foto saat ini</p>${e.photo?Fe(`/${encodeURI(e.photo)}`):`<div class="thumb-lg empty">Belum ada foto</div>`}
          ${e.photo?`<label class="check"><input type="checkbox" name="remove_photo" value="1"> Hapus foto ini</label>`:``}</div>
        <div><p class="label">Foto pengganti</p><div class="thumb-lg empty" id="photo-preview">Belum dipilih</div>
          <input id="photo-input" name="photo" type="file" accept="image/jpeg,image/png,image/webp">
          <p class="hint" id="photo-hint">JPG, PNG, atau WebP, maksimal 3 MB. Rasio 4:3 paling pas.</p></div>
      </div>
      <div class="filters">
        <button class="btn btn-primary">${n?`Simpan perubahan`:`Tambah produk`}</button>
        <button class="btn btn-quiet" type="button" data-act="menu-cancel">Batal</button>
      </div>
    </form>`}var Fe=e=>`<div class="thumb-lg"><span class="thumb-empty">File foto tidak ditemukan</span><img src="${e}" alt="" data-fallback></div>`;async function Ie(){try{c.menuItems=await f(`list_menu_admin`)}catch(e){c.notice=e.message}let e=c.menuItems.map(e=>`<tr>
    <td>${Ne(e)}</td>
    <td>${g(e.name)}<div class="sub">${g(e.desc)}</div></td><td>${g(e.cat)}</td>
    <td class="r num">${_(e.price)}</td><td>${e.is_active?`Tampil`:`Disembunyikan`}</td>
    <td><button class="btn btn-quiet btn-sm" data-act="menu-edit" data-id="${g(e.id)}">Edit</button></td></tr>`);return`
    <div class="staff-light">${G(`Menu dan foto`)}
      <div class="cashier wide">
        ${W()}
        ${c.menuForm?Pe():`<button class="btn btn-primary" data-act="menu-new" style="margin-top:16px">Tambah produk</button>`}
        ${q([`Foto`,`Produk`,`Kategori`,`Harga*`,`Status`,``],e,`Belum ada produk.`)}
      </div>
    </div>`}var Y=null;function Le(e){let t=document.getElementById(`photo-preview`),n=document.getElementById(`photo-hint`);Y&&URL.revokeObjectURL(Y),Y=null;let r=e.files[0];r?!J.includes(r.type)||r.size>Me?(e.value=``,t.className=`thumb-lg empty`,t.textContent=`Belum dipilih`,n.textContent=J.includes(r.type)?`Foto lebih dari 3 MB. Perkecil dulu.`:`Format tidak didukung. Pilih JPG, PNG, atau WebP.`,n.classList.add(`error`)):(n.textContent=`${r.name} (${Math.round(r.size/1024)} KB)`,n.classList.remove(`error`),Y=URL.createObjectURL(r),t.className=`thumb-lg`,t.innerHTML=`<img src="${Y}" alt="Pratinjau foto baru">`):(t.className=`thumb-lg empty`,t.textContent=`Belum dipilih`)}var X=(e,t,n)=>(c.menuForm={...c.menuForm,id:e.id||void 0,name:e.name,cat:e.cat,price:e.price,was:e.was,desc:e.desc,is_active:!!e.is_active,photo:c.menuForm.photo},j(`menu:save`,()=>f(`save_menu`,{method:`POST`,body:new FormData(n)}),()=>{c.menuForm=null})),Re={status:be,staff:K,login:xe,riwayat:ke,stok:Ae,keuangan:je,menu:Ie,dapur:we,kasir:De,display:Oe};function Z(e,t){let n=document.activeElement,r=e.contains(n)?n.dataset.key:null,i=r&&n.selectionStart!=null?[n.selectionStart,n.selectionEnd]:null;if(e.innerHTML=t,!r)return;let a=e.querySelector(`[data-key="${CSS.escape(r)}"]`);a&&(a.focus({preventScroll:!0}),i&&a.setSelectionRange(...i))}async function Q(){let e=c.view===`customer`;if(I.hidden=!e,l.hidden=e,e)return ge();let t=++d;r.includes(c.view)&&!S(c.view)&&(c.user?c.view=`staff`:(c.next=c.view,c.view=`login`));let n=c.view,i=await(Re[n]??K)();if(n!==c.view)return Q();t===d&&Z(l,i)}var ze={add:({id:e})=>O(e,1),remove:({id:e})=>O(e,-1),category:({value:e})=>{e!==c.category&&(z=!0),c.category=e,Q()},"remove-line":({id:e})=>{c.cart=c.cart.filter(t=>t.id!==e),c.idemKey=null,Q()},"toggle-nav":$,"reload-menu":async()=>{await p(),Q()},"open-cart":()=>{c.cartOpen=!0,Q()},"close-cart":k,"step-cart":()=>{c.cartStep=`cart`,c.notice=``,Q()},"step-pay":()=>{c.cartStep=`pay`,c.notice=``,Q()},"pay-cash":()=>A(`cash`),"start-dana":()=>{c.cartStep=`dana`,Q()},"confirm-dana":()=>A(`dana`),"new-order":ae,notify:F,logout:Ve,"menu-new":()=>{c.menuForm={cat:`Makanan`},Q()},"menu-edit":({id:e})=>{c.menuForm={...c.menuItems.find(t=>t.id===e)},Q()},"menu-cancel":()=>{c.menuForm=null,Q()},page:({page:e})=>{c.history.page=Number(e),Q()},advance:({id:e})=>oe(e),"confirm-paid":({id:e})=>se(e),"admin-paid":({id:e})=>M(e,!0),"admin-unpaid":({id:e})=>M(e,!1)};document.addEventListener(`click`,e=>{let t=e.target.closest(`[data-act]`);t&&!t.disabled&&ze[t.dataset.act]?.(t.dataset)}),l.addEventListener(`input`,e=>{e.target.id===`admin-q`&&(c.adminQuery=e.target.value)});async function Be({username:e,password:t}){c.notice=``;try{let n=await f(`login`,{method:`POST`,body:{username:e,password:t}});c.user=n.user,c.csrf=n.csrf,c.view=S(c.next)?c.next:`staff`,history.replaceState(null,``,`?view=${c.view}`)}catch(e){c.notice=e.message}Q()}async function Ve(){try{await f(`logout`,{method:`POST`,body:{}})}catch(e){console.error(e)}c.user=null,c.csrf=null,c.next=null,c.view=`login`,Q()}var He=(e,t)=>j(`cancel:`+e,()=>f(`cancel_order`,{method:`POST`,body:{id:e,reason:t}}),e=>{c.adminResult=e}),Ue={login:Be,search:ce,cancel:(e,{id:t})=>He(t,e.reason),history:e=>{c.history={...e,page:1},Q()},finance:e=>{c.finance=e,Q()},stock:(e,{stock:t})=>j(`stock:`+e,()=>f(`set_stock`,{method:`POST`,body:{menuId:e,stock:t===``?null:Number(t),reason:document.getElementById(`stock-reason`).value}})),menu:X};l.addEventListener(`submit`,e=>{e.preventDefault();let t=e.target;Ue[t.dataset.form]?.(Object.fromEntries(new FormData(t)),t.dataset,t)});function $(){let e=document.getElementById(`site-nav`).toggleAttribute(`data-open`);document.querySelector(`.nav-toggle`).setAttribute(`aria-expanded`,String(e))}document.getElementById(`nav-links`).addEventListener(`click`,e=>{e.target.closest(`a`)&&document.getElementById(`site-nav`).hasAttribute(`data-open`)&&$()}),document.addEventListener(`error`,e=>{e.target.matches?.(`img[data-fallback]`)&&e.target.remove()},!0),document.addEventListener(`change`,e=>{e.target.id===`photo-input`&&Le(e.target)}),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&c.cartOpen&&k()});async function We(){let e=new URLSearchParams(window.location.search),t=e.get(`view`);if(c.view=n.includes(t)?t:`customer`,c.table=e.get(`meja`)||e.get(`table`)||`1`,I.hidden=c.view!==`customer`,l.hidden=!I.hidden,r.includes(c.view)||c.view===`login`){try{let e=await f(`me`);c.user=e.user,c.csrf=e.csrf}catch{}c.view===`login`&&(c.view=c.user?`staff`:`login`)}_e(),await Q(),c.view===`customer`&&(await p(),await Q()),[`dapur`,`kasir`,`display`].includes(c.view)&&N()}We();