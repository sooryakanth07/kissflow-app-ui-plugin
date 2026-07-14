// ui.mjs — server-rendered UI. Modern · sleek · vibrant, with BOTH light + dark themes (toggle, persisted)
// and rich in-page modals (no system prompts). Self-contained (Google Fonts linked; served by our app).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Brand mark — four-petal clover + pencil (assets/logo.svg, inlined so pages stay self-contained).
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="logo" aria-hidden="true"><path fill="#C21E8C" d="M136 28h84a28 28 0 0 1 28 28v164a28 28 0 0 1-28 28H56a28 28 0 0 1-28-28v-84A108 108 0 0 1 136 28z"/><path fill="#1E78F0" d="M292 28h84a108 108 0 0 1 108 108v84a28 28 0 0 1-28 28H292a28 28 0 0 1-28-28V56a28 28 0 0 1 28-28z"/><path fill="#F08018" d="M56 264h164a28 28 0 0 1 28 28v164a28 28 0 0 1-28 28h-84A108 108 0 0 1 28 376v-84a28 28 0 0 1 28-28z"/><path fill="#3F8F3F" d="M292 264h164a28 28 0 0 1 28 28v84a108 108 0 0 1-108 108h-84a28 28 0 0 1-28-28V292a28 28 0 0 1 28-28z"/><g transform="rotate(45 320 320)"><g stroke="#fff" stroke-width="22" stroke-linejoin="round"><path fill="#3B3B3B" d="M320 458l-34-62h68z"/><rect fill="#4B9648" x="286" y="230" width="68" height="166"/><rect fill="#A855F7" x="286" y="158" width="68" height="60" rx="18"/></g><path fill="#3B3B3B" d="M320 458l-34-62h68z"/><rect fill="#4B9648" x="286" y="230" width="68" height="166"/><rect fill="#A855F7" x="286" y="158" width="68" height="60" rx="18"/></g></svg>`;
const FAVICON = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(LOGO)}">`;
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; } };

const CSS = `
:root{
  --bg:#f5f6fb; --card:#ffffff; --card2:#f1f2f9; --ink:#151827; --muted:#666d85;
  --line:#e7e9f2; --line2:#d8dbe8; --inputbg:#f5f6fc; --tok:#0e9c76;
  --v1:#7c5cff; --v2:#3b8dff; --hot:#ff4d92; --mint:#12b98a;
  --grad:linear-gradient(135deg,#7c5cff 0%,#3b8dff 100%);
  --shadow:0 1px 2px rgba(20,23,45,.05),0 14px 34px -16px rgba(20,23,45,.20);
  --glow:0 10px 30px -8px rgba(124,92,255,.4);
  --topbar:rgba(255,255,255,.72);
  --mesh:radial-gradient(55% 45% at 12% -5%,rgba(124,92,255,.12),transparent 60%),radial-gradient(50% 40% at 92% 5%,rgba(59,141,255,.10),transparent 60%),radial-gradient(55% 50% at 85% 105%,rgba(255,77,146,.08),transparent 60%);
  --radius:16px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme]){ --dk:1 }}
:root[data-theme="dark"],:root:not([data-theme]){}
@media (prefers-color-scheme:dark){:root:not([data-theme]){
  --bg:#07080d; --card:rgba(255,255,255,.045); --card2:rgba(255,255,255,.07); --ink:#eaecf6; --muted:#8990ab;
  --line:rgba(255,255,255,.10); --line2:rgba(255,255,255,.17); --inputbg:rgba(0,0,0,.32); --tok:#2ce6b0;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -18px rgba(0,0,0,.7); --glow:0 8px 32px -8px rgba(124,92,255,.55);
  --topbar:rgba(7,8,13,.6);
  --mesh:radial-gradient(55% 45% at 12% -5%,rgba(124,92,255,.20),transparent 60%),radial-gradient(50% 40% at 92% 5%,rgba(59,141,255,.16),transparent 60%),radial-gradient(55% 50% at 85% 105%,rgba(255,77,146,.12),transparent 60%);
}}
:root[data-theme="dark"]{
  --bg:#07080d; --card:rgba(255,255,255,.045); --card2:rgba(255,255,255,.07); --ink:#eaecf6; --muted:#8990ab;
  --line:rgba(255,255,255,.10); --line2:rgba(255,255,255,.17); --inputbg:rgba(0,0,0,.32); --tok:#2ce6b0;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -18px rgba(0,0,0,.7); --glow:0 8px 32px -8px rgba(124,92,255,.55);
  --topbar:rgba(7,8,13,.6);
  --mesh:radial-gradient(55% 45% at 12% -5%,rgba(124,92,255,.20),transparent 60%),radial-gradient(50% 40% at 92% 5%,rgba(59,141,255,.16),transparent 60%),radial-gradient(55% 50% at 85% 105%,rgba(255,77,146,.12),transparent 60%);
}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth}
body{font-family:"Sora",system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100vh;transition:background .3s,color .3s}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--mesh)}
a{color:inherit;text-decoration:none}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.grad-text{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:15px 30px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--topbar);backdrop-filter:blur(14px);z-index:10}
.brand{font-weight:700;font-size:20px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
.brand .dot{width:13px;height:13px;border-radius:5px;background:var(--grad);box-shadow:0 0 16px rgba(124,92,255,.6);display:inline-block}
.brand svg.logo{width:100%;height:100%;display:block}
.brand .logobox{width:26px;height:26px;flex:none;display:inline-block}
.who{display:flex;align-items:center;gap:14px;font-size:14px;color:var(--muted)}
.who a:hover{color:var(--ink)}
.tgl{width:36px;height:36px;border-radius:10px;border:1px solid var(--line2);background:var(--card2);color:var(--ink);cursor:pointer;font-size:15px;display:grid;place-items:center;transition:.18s}
.tgl:hover{border-color:var(--v1);transform:translateY(-1px)}
.wrap{max-width:980px;margin:0 auto;padding:44px 30px 90px}
.h1{font-size:clamp(28px,4vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.05}
.sub{color:var(--muted);margin-top:8px;font-size:15px}
.row{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:14px;font-weight:600;padding:11px 17px;border-radius:11px;border:1px solid var(--line2);background:var(--card2);color:var(--ink);cursor:pointer;transition:.18s}
.btn:hover{border-color:var(--v1);transform:translateY(-1px);box-shadow:0 6px 20px -10px rgba(124,92,255,.55)}
.btn-primary{background:var(--grad);border:none;color:#fff;box-shadow:var(--glow)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 40px -8px rgba(124,92,255,.7);filter:brightness(1.06)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px;margin-top:28px}
.pcard{position:relative;display:block;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow);transition:.22s;overflow:hidden}
.pcard::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.4px;background:var(--grad);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:.22s}
.pcard:hover{transform:translateY(-4px)}.pcard:hover::after{opacity:1}
.pcard h3{font-weight:700;font-size:19px;letter-spacing:-.01em}
.pcard .id{font-size:11.5px;color:var(--muted);margin-top:5px}
.pcard .meta{display:flex;justify-content:space-between;align-items:center;margin-top:18px;font-size:12.5px;color:var(--muted)}
.chip{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:999px;background:rgba(124,92,255,.14);color:var(--v1);border:1px solid rgba(124,92,255,.28)}
.chip.viewer{background:var(--card2);color:var(--muted);border-color:var(--line)}
.chip.mint{background:rgba(18,185,138,.14);color:var(--mint);border-color:rgba(18,185,138,.3)}
.section{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:26px;box-shadow:var(--shadow);margin-top:20px}
.section h2{font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px;letter-spacing:-.01em}
.section h2 .ic{font-size:15px;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.section .hint{color:var(--muted);font-size:13.5px;margin-top:4px;margin-bottom:18px}
.tabs{display:flex;gap:2px;margin-top:26px;border-bottom:1px solid var(--line)}
.tab{appearance:none;border:none;background:none;font:inherit;font-size:15px;font-weight:600;color:var(--muted);padding:12px 18px;cursor:pointer;position:relative;transition:.15s}
.tab:hover{color:var(--ink)}.tab.active{color:var(--ink)}
.tab.active::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2.5px;border-radius:2px;background:var(--grad)}
.tabpanel{animation:rise .35s cubic-bezier(.2,.8,.2,1) both}
.tokenbox{display:flex;gap:8px;align-items:center;margin-top:16px}
.tokenbox input{flex:1;font-family:"JetBrains Mono",monospace;font-size:12.5px;padding:12px 14px;border:1px solid var(--line2);border-radius:10px;background:var(--inputbg);color:var(--tok)}
.list{list-style:none;display:flex;flex-direction:column;margin-top:8px}
.list li{display:flex;align-items:center;justify-content:space-between;padding:13px 4px;border-bottom:1px solid var(--line);font-size:14px}
.list li:last-child{border-bottom:none}
.vlink{color:var(--mint);font-size:13px;padding:5px 10px;border:1px solid var(--line2);border-radius:8px;transition:.15s}
.vlink:hover{border-color:var(--mint);background:rgba(18,185,138,.08)}
.avatar{width:28px;height:28px;border-radius:8px;background:var(--grad);color:#fff;display:inline-grid;place-items:center;font-size:12px;font-weight:700;margin-right:10px}
.mrow{display:flex;align-items:center}
.field{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.field input,.field select,.modal input{font:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--line2);border-radius:10px;background:var(--inputbg);color:var(--ink);outline:none;transition:.15s}
.field input:focus,.modal input:focus{border-color:var(--v1);box-shadow:0 0 0 3px rgba(124,92,255,.18)}
.field input{flex:1;min-width:190px}.field input::placeholder,.modal input::placeholder{color:var(--muted)}
.empty{background:var(--card);border:1px dashed var(--line2);border-radius:var(--radius);padding:30px;text-align:center;color:var(--muted);font-size:14.5px;margin-top:28px}
.empty .big{font-size:30px;margin-bottom:8px}
.empty.sm{margin-top:8px;padding:20px}
.back{color:var(--muted);font-size:13px;display:inline-block;margin-bottom:16px}.back:hover{color:var(--ink)}
.hero{max-width:620px;margin:15vh auto 0;text-align:center;padding:0 24px}
.hero .ey{font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:22px}
.hero h1{font-size:clamp(38px,7vw,64px);font-weight:700;letter-spacing:-.035em;line-height:1.02}
.hero p{color:var(--muted);font-size:18px;margin:20px auto 36px;max-width:460px}
.gbtn{display:inline-flex;align-items:center;gap:11px;padding:15px 26px;border-radius:13px;background:var(--grad);color:#fff;font-weight:600;font-size:15.5px;box-shadow:var(--glow);transition:.2s}
.gbtn:hover{transform:translateY(-2px);box-shadow:0 16px 46px -8px rgba(124,92,255,.72);filter:brightness(1.06)}
.modal-bg{position:fixed;inset:0;background:rgba(12,14,24,.5);backdrop-filter:blur(5px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.modal-bg.on{display:flex;animation:fade .2s}
.modal{background:var(--card);border:1px solid var(--line2);border-radius:20px;padding:28px;width:min(440px,94vw);box-shadow:0 30px 80px -20px rgba(0,0,0,.5);animation:pop .26s cubic-bezier(.2,.9,.3,1.2)}
.modal h3{font-size:21px;font-weight:700;letter-spacing:-.02em}
.modal p{color:var(--muted);font-size:14px;margin-top:6px}
.modal input{width:100%;margin-top:18px}
.modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
@keyframes pop{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(10px);background:var(--card);border:1px solid var(--line2);color:var(--ink);padding:12px 20px;border-radius:12px;font-size:14px;opacity:0;transition:.28s;pointer-events:none;box-shadow:var(--shadow)}
.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.wrap>*,.hero>*{animation:rise .5s cubic-bezier(.2,.8,.2,1) both}
.wrap>:nth-child(2){animation-delay:.05s}.wrap>:nth-child(3){animation-delay:.1s}.wrap>:nth-child(4){animation-delay:.15s}.wrap>:nth-child(5){animation-delay:.2s}
`;

const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · appbuilder</title>
${FAVICON}
<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>`;

const foot = `<div class="toast" id="toast"></div><script>
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');clearTimeout(window._tt);window._tt=setTimeout(function(){t.classList.remove('on')},2300)}
async function api(p,body,method){var r=await fetch(p,{method:method||'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});var j=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
function copy(id){var el=document.getElementById(id);el.select();navigator.clipboard.writeText(el.value);toast('Copied to clipboard')}
function curTheme(){return document.documentElement.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}
function toggleTheme(){var n=curTheme()==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem('theme',n)}catch(e){}updTgl()}
function updTgl(){var el=document.getElementById('tglic');if(el)el.textContent=curTheme()==='dark'?'\\u2600':'\\u263D'}
updTgl();
</script></body></html>`;

const topbar = (user) => `<div class="topbar"><a href="/" class="brand"><span class="logobox">${LOGO}</span>appbuilder</a>
<div class="who"><button class="tgl" id="tglic" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle theme">☽</button><span>${esc(user.email)}</span><a href="/auth/logout">Sign out</a></div></div>`;

export function landingPage() {
  return head("Sign in") + `<div class="hero">
  <div class="brand" style="justify-content:center;font-size:24px;margin-bottom:30px"><span class="logobox" style="width:40px;height:40px">${LOGO}</span>appbuilder</div>
  <div class="ey">Agentic app builder</div>
  <h1>Build Kissflow apps <span class="grad-text">with agents.</span></h1>
  <p>Spin up a project, connect it to Cowork, and let the pipeline assemble your app — prototypes, reviews and versions, all in one place.</p>
  <a class="gbtn" href="/auth/google/login"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M22.5 12.2c0-.6-.1-1.3-.2-1.9H12v3.6h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.7z" opacity=".9"/><path fill="#fff" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23z" opacity=".75"/><path fill="#fff" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4z" opacity=".6"/><path fill="#fff" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.4L6 10.2c.9-2.6 3.2-4.4 6-4.4z"/></svg>Sign in with Google</a>
  </div>` + foot;
}

export function dashboardPage(user, projects, devEnvs = []) {
  const cards = projects.map((p) => `<a class="pcard" href="/p/${esc(p.id)}">
    <h3>${esc(p.name)}</h3><div class="id mono">${esc(p.id)}</div>
    <div class="meta"><span class="chip ${p.role === "viewer" ? "viewer" : ""}">${esc(p.role)}</span><span>${fmtDate(p.created_at)}</span></div></a>`).join("");
  const body = projects.length
    ? `<div class="grid">${cards}</div>`
    : `<div class="empty"><div class="big">✦</div>No projects yet.<br>Create your first one to get a Cowork connect link.<div style="margin-top:16px"><button class="btn btn-primary" onclick="openNew()">＋ New project</button></div></div>`;
  const envRows = devEnvs.length
    ? `<ul class="list">${devEnvs.map((e) => `<li><span class="mrow"><span class="avatar">${esc((e.subdomain || "?").slice(0, 2).toUpperCase())}</span>${esc(e.name)} <span style="color:var(--muted);margin-left:8px" class="mono">${esc(e.subdomain)}</span> ${e.credState === "ok" ? `<span class="chip mint" style="margin-left:8px">key ••${esc(e.keyHint)}</span>` : e.credState === "partial" ? `<span class="chip" style="margin-left:8px;background:rgba(255,77,146,.14);color:var(--hot);border-color:rgba(255,77,146,.3)">⚠ secret missing</span>` : `<span class="chip viewer" style="margin-left:8px">no creds</span>`}</span><span style="display:flex;align-items:center;gap:8px"><span style="color:var(--muted);font-size:12.5px">${fmtDate(e.created_at)}</span><button class="btn" style="padding:6px 10px;font-size:12px" title="Edit environment" onclick="editEnv('${esc(e.id)}','${esc(e.name)}','${esc(e.subdomain)}','${esc(e.account_id || "")}','${esc(e.keyHint || "")}','${esc(e.credState || "none")}')">✎</button><button class="btn" style="padding:6px 10px;font-size:12px;color:var(--hot)" title="Delete environment" onclick="delEnv('${esc(e.id)}','${esc(e.name)}')">✕</button></span></li>`).join("")}</ul>`
    : `<div class="empty sm">No dev environments yet — add your Kissflow dev account once, reuse it for every project.</div>`;
  const envOptions = devEnvs.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.subdomain)})</option>`).join("");
  return head("Projects") + topbar(user) + `<div class="wrap">
    <div class="row"><div><h1 class="h1">Your <span class="grad-text">projects</span></h1><div class="sub">Each project is an isolated app build — its own memory, artifacts and members.</div></div>
    <button class="btn btn-primary" onclick="openNew()">＋ New project</button></div>
    ${body}
    <div class="section"><h2><span class="ic">⚙</span> Dev environments</h2>
      <div class="hint">Set up a Kissflow dev account ONCE, then pick it when creating projects. Creds live in Secret Manager.</div>
      ${envRows}
      <div style="margin-top:14px"><button class="btn" onclick="openEnv()">＋ Add dev environment</button></div></div>
    </div>
    <div class="modal-bg" id="newModal"><div class="modal"><h3>New project</h3><p>Name your app build and pick the dev environment it builds against.</p>
      <input id="npName" placeholder="e.g. Purchase Requests" onkeydown="if(event.key==='Enter')createProject();if(event.key==='Escape')closeNew()" autocomplete="off">
      <select id="npEnv" style="width:100%;margin-top:12px;font:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--line2);border-radius:10px;background:var(--inputbg);color:var(--ink)">
        ${envOptions}<option value="">— set dev environment later —</option></select>
      <div class="actions"><button class="btn" onclick="closeNew()">Cancel</button><button class="btn btn-primary" onclick="createProject()">Create project</button></div></div></div>
    <div class="modal-bg" id="envDelModal"><div class="modal"><h3 id="envDelTitle">Delete environment?</h3>
      <p>Its credentials are removed from Secret Manager. Projects still linked to it will block the delete.</p>
      <div class="actions"><button class="btn" onclick="document.getElementById('envDelModal').classList.remove('on')">Cancel</button><button class="btn" style="background:var(--hot);border:none;color:#fff" onclick="delEnvGo()">Delete</button></div></div></div>
    <div class="modal-bg" id="envModal"><div class="modal"><h3 id="envModalTitle">Add dev environment</h3><p id="envModalHint">Your Kissflow dev account — stored once, reused across projects.</p>
      <input id="deName" placeholder="name (e.g. LCNC Demo dev)" autocomplete="off">
      <input id="deSub" placeholder="subdomain (e.g. dev-mycompany)" autocomplete="off">
      <input id="deAcc" placeholder="account id" autocomplete="off">
      <input id="deKey" placeholder="access key id" autocomplete="off">
      <input id="deSec" placeholder="access key secret" type="password" autocomplete="off">
      <div class="actions"><button class="btn" onclick="closeEnv()">Cancel</button><button class="btn btn-primary" id="envSaveBtn" onclick="saveEnv()">Save environment</button></div></div></div>
    <script>
    function openNew(){document.getElementById('newModal').classList.add('on');setTimeout(function(){document.getElementById('npName').focus()},50)}
    function closeNew(){document.getElementById('newModal').classList.remove('on')}
    var editingEnv=null;
    function setEnvField(id,v){document.getElementById(id).value=v||''}
    function openEnv(){editingEnv=null;document.getElementById('envModalTitle').textContent='Add dev environment';document.getElementById('envModalHint').textContent='Your Kissflow dev account — stored once, reused across projects.';['deName','deSub','deAcc','deKey','deSec'].forEach(function(i){setEnvField(i,'')});document.getElementById('deKey').placeholder='access key id';document.getElementById('deSec').placeholder='access key secret';document.getElementById('envModal').classList.add('on');setTimeout(function(){document.getElementById('deName').focus()},50)}
    function editEnv(id,name,sub,acc,hint,state){editingEnv=id;document.getElementById('envModalTitle').textContent='Edit '+name;
      document.getElementById('envModalHint').textContent=state==='ok'
        ? 'Credentials are stored securely and never displayed (current key ends in ••'+hint+'). Paste a new key pair to rotate, or leave both blank to keep them.'
        : state==='partial'
        ? '⚠ The stored credentials are INCOMPLETE (key ••'+hint+' has no secret) — paste the full key pair to fix this environment.'
        : 'No credentials stored for this environment yet — paste an access key pair to set them.';
      setEnvField('deName',name);setEnvField('deSub',sub);setEnvField('deAcc',acc);setEnvField('deKey','');setEnvField('deSec','');
      document.getElementById('deKey').placeholder=hint?'access key id · current ••'+hint+' (blank = keep)':'access key id';
      document.getElementById('deSec').placeholder=hint?'access key secret (blank = keep current)':'access key secret';
      document.getElementById('envModal').classList.add('on');setTimeout(function(){document.getElementById('deName').focus()},50)}
    function closeEnv(){document.getElementById('envModal').classList.remove('on')}
    document.getElementById('newModal').addEventListener('click',function(e){if(e.target===this)closeNew()});
    document.getElementById('envModal').addEventListener('click',function(e){if(e.target===this)closeEnv()});
    async function createProject(){var name=document.getElementById('npName').value.trim();if(!name){toast('Enter a name');return}
      var env=document.getElementById('npEnv').value;
      try{var r=await api('/projects',env?{name:name,devEnvId:env}:{name:name});location.href='/p/'+r.project.id}catch(e){toast(e.message)}}
    async function saveEnv(){var v=function(id){return document.getElementById(id).value.trim()};
      if(editingEnv){
        if((v('deKey')||v('deSec'))&&!(v('deKey')&&v('deSec'))){toast('Rotate with the full key pair — id AND secret');return}
        try{var r=await api('/dev-envs/'+editingEnv,{name:v('deName'),subdomain:v('deSub'),accountId:v('deAcc'),apiKey:v('deKey'),apiSecret:v('deSec')},'PUT');
          toast(r.rotated?'Environment updated · credentials rotated':'Environment updated');setTimeout(function(){location.reload()},600)}catch(e){toast(e.message)}
        return}
      if(!v('deSub')||!v('deKey')||!v('deSec')){toast('Subdomain, access key id and secret are all required');return}
      try{await api('/dev-envs',{name:v('deName'),subdomain:v('deSub'),accountId:v('deAcc'),apiKey:v('deKey'),apiSecret:v('deSec')});toast('Dev environment saved');setTimeout(function(){location.reload()},600)}catch(e){toast(e.message)}}
    var pendingEnv=null;
    function delEnv(id,name){pendingEnv=id;document.getElementById('envDelTitle').textContent='Delete "'+name+'"?';document.getElementById('envDelModal').classList.add('on')}
    async function delEnvGo(){
      document.getElementById('envDelModal').classList.remove('on');
      try{await api('/dev-envs/'+pendingEnv,null,'DELETE');toast('Environment deleted');setTimeout(function(){location.reload()},600)}catch(e){toast(e.message)}}
    </script>` + foot;
}

// connectApprovePage — the browser half of the device flow. The plugin parked request `code`;
// the signed-in user picks (or creates) a project, supplies dev creds if missing, and approves.
// code=null renders the expired/invalid state.
export function connectApprovePage(user, code, projects, redirectUri, devEnvs = []) {
  if (!code) return head("Link expired") + topbar(user) + `<div class="wrap"><div class="empty"><div class="big">⏱</div>
    This connect link is invalid, expired, or already used.<br>Re-run <span class="mono">/author-setup</span> in your Cowork/CLI session to get a fresh one.</div></div>` + foot;
  const cards = projects.map((p) => { const hasDev = Boolean(p.dev_env_ref || p.dev_env_id); return `<button class="pcard" style="text-align:left;cursor:pointer;font:inherit;width:100%" onclick="pick('${esc(p.id)}',${hasDev ? "true" : "false"})">
    <h3>${esc(p.name)}</h3><div class="id mono">${esc(p.id)}</div>
    <div class="meta"><span class="chip ${p.role === "viewer" ? "viewer" : ""}">${esc(p.role)}</span>
    <span class="chip ${hasDev ? "mint" : "viewer"}">${hasDev ? "dev env ✓" : "dev env not set"}</span></div></button>`; }).join("");
  const envChoices = devEnvs.map((e) => `<button class="btn" style="width:100%;justify-content:flex-start;margin-top:8px" onclick="useEnv('${esc(e.id)}')">⚙ ${esc(e.name)} <span class="mono" style="color:var(--muted)">${esc(e.subdomain)}</span></button>`).join("");
  return head("Connect Cowork") + topbar(user) + `<div class="wrap">
    <h1 class="h1">Connect your <span class="grad-text">Cowork session</span></h1>
    <div class="sub">A plugin session is waiting. Pick the project it should build against — it receives that project's dev credentials and scope, and you'll be sent straight back.</div>
    ${projects.length ? `<div class="grid">${cards}</div>` : ""}
    <div class="section"><h2><span class="ic">＋</span> …or start a new project</h2>
      <div class="field"><input id="npName" placeholder="e.g. Purchase Requests" onkeydown="if(event.key==='Enter')pickNew()"><button class="btn btn-primary" onclick="pickNew()">Create & connect</button></div></div>

    <div class="modal-bg" id="devModal"><div class="modal"><h3>Dev environment</h3><p>This project has no dev environment yet. ${devEnvs.length ? "Pick one of yours — or add a new one below." : "Add your Kissflow dev account once; it becomes reusable for every project."}</p>
      ${envChoices}
      ${devEnvs.length ? `<p style="margin-top:14px">…or add a new one:</p>` : ""}
      <input id="deName" placeholder="environment name (optional)" autocomplete="off">
      <input id="deSub" placeholder="subdomain (e.g. dev-mycompany)" autocomplete="off">
      <input id="deAcc" placeholder="account id" autocomplete="off">
      <input id="deKey" placeholder="access key id" autocomplete="off">
      <input id="deSec" placeholder="access key secret" type="password" autocomplete="off">
      <div class="actions"><button class="btn" onclick="document.getElementById('devModal').classList.remove('on')">Cancel</button><button class="btn btn-primary" onclick="saveDevEnv()">Save & connect</button></div></div></div>

    <div class="modal-bg" id="doneModal"><div class="modal" style="text-align:center"><h3>✓ Session connected</h3><p id="doneMsg">Your Cowork session is attached — credentials, memory and artifacts are scoped and ready.</p>
      <div class="actions" style="justify-content:center"><a class="btn btn-primary" id="doneGo" href="/">Continue to project →</a></div></div></div>
    <script>
    var CODE=${JSON.stringify(code)}, REDIRECT=${JSON.stringify(redirectUri || null)}, pendingProject=null;
    async function approve(body){
      var r=await fetch('/connect/'+CODE+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      var j=await r.json().catch(function(){return{}});
      if(r.ok){
        if(j.projectId)document.getElementById('doneGo').href='/p/'+j.projectId;
        document.getElementById('doneModal').classList.add('on');
        if(j.redirect){document.getElementById('doneMsg').textContent='Connected — sending you back to the plugin…';location.href=j.redirect}
      }else if(j.needsDevEnv){ // project exists (maybe just created) but has no dev creds yet
        pendingProject=j.projectId;document.getElementById('devModal').classList.add('on');document.getElementById('deSub').focus()
      }else toast(j.error||('HTTP '+r.status))
    }
    function pick(id,hasDev){pendingProject=id;if(!hasDev){document.getElementById('devModal').classList.add('on');(document.getElementById('deName')||document.getElementById('deSub')).focus()}else approve({projectId:id})}
    async function pickNew(){var name=document.getElementById('npName').value.trim();if(!name){toast('Enter a name');return}
      approve({name:name})}
    function useEnv(envId){ // one-click: link an existing reusable env + approve in a single call
      if(!pendingProject){toast('Pick a project first');return}
      document.getElementById('devModal').classList.remove('on');
      approve({projectId:pendingProject,devEnvId:envId})
    }
    async function saveDevEnv(){
      if(!pendingProject){ // new-project path: create came back 409 with projectId — approve() stored it
        toast('Pick a project first');return}
      var v=function(id){return document.getElementById(id).value.trim()};
      if(!v('deSub')||!v('deKey')||!v('deSec')){toast('Subdomain, access key id and secret are all required');return}
      try{ await api('/projects/'+pendingProject+'/dev-env',{name:v('deName'),subdomain:v('deSub'),accountId:v('deAcc'),apiKey:v('deKey'),apiSecret:v('deSec')});
        document.getElementById('devModal').classList.remove('on'); approve({projectId:pendingProject});
      }catch(e){toast(e.message)}
    }
    </script>` + foot;
}

export function projectPage(user, project, members, versions, devEnvs = [], linkedEnv = null) {
  const isOwner = members.find((m) => m.sub === user.sub)?.role === "owner";
  const initials = (e) => (e || "?").slice(0, 2).toUpperCase();
  const memRows = members.map((m) => `<li><span class="mrow"><span class="avatar">${esc(initials(m.email || m.sub))}</span>${esc(m.email || m.sub)}</span><span class="chip ${m.role === "viewer" ? "viewer" : ""}">${esc(m.role)}</span></li>`).join("");
  const artLink = (v, name, label) => v.artifacts?.[name] ? `<a class="vlink mono" href="/projects/${esc(project.id)}/versions/${v.seq}/${name}" target="_blank" rel="noopener">${label} ↗</a>` : "";
  const verRows = versions.length ? `<ul class="list">${versions.map((v) => `<li><span>${esc(v.label || "v" + v.seq)} <span style="color:var(--muted)">· ${esc(v.author || "")}</span></span>
    <span style="display:flex;align-items:center;gap:14px">${artLink(v, "review", "review")}${artLink(v, "prototype", "prototype")}<span style="color:var(--muted);font-size:12.5px">${fmtDate(v.created_at)}</span></span></li>`).join("")}</ul>`
    : `<div class="empty sm">No versions yet — they appear here as builds are generated and snapshotted from Cowork.</div>`;
  return head(project.name) + topbar(user) + `<div class="wrap">
    <a class="back" href="/">← all projects</a>
    <div class="row"><div><h1 class="h1">${esc(project.name)}</h1><div class="sub mono">${esc(project.id)} · org ${esc(project.mem_org)}</div></div>
      <span class="chip ${(project.dev_env_id || project.dev_env_ref) ? "mint" : "viewer"}">${linkedEnv ? "env: " + esc(linkedEnv.name) : (project.dev_env_ref ? "dev env ✓" : "dev env not set")}</span></div>

    <div class="tabs">
      <button class="tab active" data-tab="versions" onclick="showTab('versions')">Versions</button>
      <button class="tab" data-tab="settings" onclick="showTab('settings')">Settings</button>
    </div>

    <div class="tabpanel" id="panel-versions">
      <div class="section"><h2><span class="ic">▤</span> Versions</h2><div class="hint">Every build generated from Cowork, snapshotted here with its prototype and review.</div>${verRows}</div>
    </div>

    <div class="tabpanel" id="panel-settings" hidden>
      <div class="section"><h2><span class="ic">◆</span> Connect from Cowork${project.last_connect_at ? ` <span class="chip mint" style="margin-left:8px">✓ connected</span>` : ""}</h2>
        <div class="hint">${project.last_connect_at
          ? `A Cowork session is attached — last connected by <b>${esc(project.last_connect_by || "unknown")}</b> on ${fmtDate(project.last_connect_at)}. Generate a fresh link to attach another session.`
          : "Generate a one-time link. Open it in a Cowork session to attach the plugin to this project — creds, memory org and artifact storage scope automatically."}</div>
        <button class="btn ${project.last_connect_at ? "" : "btn-primary"}" onclick="mkConnect()">Generate connect URL</button>
        <div class="tokenbox" id="cbox" style="display:none"><input id="curl" readonly><button class="btn" onclick="copy('curl')">Copy</button></div></div>

      <div class="section"><h2><span class="ic">⚙</span> Dev environment</h2><div class="hint">${linkedEnv ? `Linked to <b>${esc(linkedEnv.name)}</b> (<span class="mono">${esc(linkedEnv.subdomain)}</span>).` : project.dev_env_ref ? "Configured (legacy per-project creds)." : "Not set — pick one of your reusable environments."}</div>
        ${isOwner ? (devEnvs.length ? `<div class="field"><select id="envSel" style="font:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--line2);border-radius:10px;background:var(--inputbg);color:var(--ink)">${devEnvs.map((e) => `<option value="${esc(e.id)}" ${project.dev_env_id === e.id ? "selected" : ""}>${esc(e.name)} (${esc(e.subdomain)})</option>`).join("")}</select><button class="btn" onclick="linkEnv()">Link</button></div><div class="hint" style="margin-top:10px">Manage environments on the <a href="/" style="text-decoration:underline">dashboard</a>.</div>` : `<div class="empty sm">No dev environments yet — add one on the <a href="/" style="text-decoration:underline">dashboard</a>.</div>`) : `<div class="empty sm">Owner only.</div>`}</div>

      <div class="section"><h2><span class="ic">◇</span> Members</h2><ul class="list">${memRows}</ul>
        ${isOwner ? `<div class="field"><input id="memEmail" type="email" placeholder="teammate@company.com" onkeydown="if(event.key==='Enter')invite()"><select id="memRole"><option value="builder">builder</option><option value="viewer">viewer</option></select><button class="btn" onclick="invite()">Invite</button></div>` : ""}</div>

      ${isOwner ? `<div class="section" style="border-color:rgba(255,77,146,.35)"><h2><span class="ic" style="color:var(--hot)">⌫</span> Danger zone</h2>
        <div class="hint">Deleting removes the project, its members and its version list from appbuilder. The built Kissflow app, GCS artifacts, reusable dev environments and hive memories are NOT touched.</div>
        <button class="btn" style="border-color:rgba(255,77,146,.5);color:var(--hot)" onclick="openDel()">Delete project…</button></div>` : ""}
    </div>
    ${isOwner ? `<div class="modal-bg" id="delModal"><div class="modal"><h3>Delete ${esc(project.name)}?</h3>
      <p>This is permanent for appbuilder (versions list, members, connect links). Type the project name to confirm.</p>
      <input id="delName" placeholder="${esc(project.name)}" autocomplete="off" onkeydown="if(event.key==='Escape')closeDel()">
      <div class="actions"><button class="btn" onclick="closeDel()">Cancel</button><button class="btn" style="background:var(--hot);border:none;color:#fff" onclick="delProject()">Delete project</button></div></div></div>` : ""}
    </div>
    <script>
    function showTab(name){document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name)});document.getElementById('panel-versions').hidden=name!=='versions';document.getElementById('panel-settings').hidden=name!=='settings';history.replaceState(null,'',name==='settings'?'#settings':location.pathname)}
    if(location.hash==='#settings')showTab('settings');
    async function mkConnect(){try{var r=await api('/projects/${esc(project.id)}/connect-url');document.getElementById('cbox').style.display='flex';document.getElementById('curl').value=r.url;toast('Link valid 10 min · single use')}catch(e){toast(e.message)}}
    async function linkEnv(){try{await api('/projects/${esc(project.id)}/dev-env',{devEnvId:document.getElementById('envSel').value});toast('Dev environment linked');setTimeout(function(){location.reload()},600)}catch(e){toast(e.message)}}
    async function invite(){var email=document.getElementById('memEmail').value.trim(),role=document.getElementById('memRole').value;if(!email){toast('Enter an email');return}try{await api('/projects/${esc(project.id)}/members',{email:email,role:role});toast('Invited '+email);setTimeout(function(){location.reload()},600)}catch(e){toast(e.message)}}
    function openDel(){var el=document.getElementById('delModal');if(el){el.classList.add('on');setTimeout(function(){document.getElementById('delName').focus()},50)}}
    function closeDel(){var el=document.getElementById('delModal');if(el)el.classList.remove('on')}
    async function delProject(){
      if(document.getElementById('delName').value.trim()!==${JSON.stringify(project.name)}){toast('Name does not match');return}
      try{await api('/projects/${esc(project.id)}',null,'DELETE');location.href='/'}catch(e){toast(e.message)}
    }
    </script>` + foot;
}
