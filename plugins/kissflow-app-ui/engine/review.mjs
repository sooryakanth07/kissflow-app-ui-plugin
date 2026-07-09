#!/usr/bin/env node
// review.mjs — render an App-Spec IR into a SINGLE self-contained, INTERACTIVE review page,
// presented as a step-by-step WIZARD (one concern per step, so the page never sprawls). Reviewers
// flag at the ENTITY or the individual FIELD level — ✓ ok / ✎ change / ? ask + a note — then export
// a CHANGE LIST to paste into `/author-refine`. Includes a true ER data-model diagram and per-process
// workflow diagrams (Mermaid, CDN + offline fallback). The experience layer (pages + nav) is always
// shown — the same baseline the engine guarantees at build. Zero server-side deps.
//
//   node review.mjs <ir.json> [decisions.md] [open-questions.md] > review.html
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureExperience } from "./experience.mjs";

const irPath = process.argv[2];
if (!irPath) { console.error("usage: node review.mjs <ir.json> [decisions.md] [open-questions.md]"); process.exit(1); }
const ir = JSON.parse(readFileSync(irPath, "utf8"));
let decisions = "";
try { if (process.argv[3]) decisions = readFileSync(process.argv[3], "utf8"); } catch { /* optional */ }
// open questions = the decisions the USER still has to take; explicit arg, else sibling of decisions.md
let openQsMd = "";
try {
  const oqPath = process.argv[4] || (process.argv[3] ? join(dirname(process.argv[3]), "open-questions.md") : "");
  if (oqPath) openQsMd = readFileSync(oqPath, "utf8");
} catch { /* optional */ }

// mirror the build guarantee: if the plan has no pages/nav, show the baseline the engine would add.
const expBefore = { pages: (ir.pages || []).length, nav: (ir.nav?.menus || []).length };
const exp = ensureExperience(ir);
const autoExperience = exp.added.length > 0;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slug = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, "-");
// in Kissflow a "Reference" field IS a lookup — show it as such
const typeLabel = (t) => (/^reference$/i.test(t || "") ? "Lookup" : (t || ""));

// PROTOTYPE SCREENS — if the run has captured prototype screenshots
// (<runDir>/prototype/thumbs/manifest.json + pngs), the Pages & Nav section becomes an
// InVision-style review: filmstrip (role-filtered) + big screen + click-to-pin comments +
// Copy-feedback → /author-refine. Otherwise it falls back to the wireframe page mocks.
let SCREENS = [];
try {
  const tdir = join(dirname(irPath), "prototype", "thumbs");
  const mpath = join(tdir, "manifest.json");
  if (existsSync(mpath)) {
    const man = JSON.parse(readFileSync(mpath, "utf8"));
    SCREENS = (man.screens || []).filter((s) => existsSync(join(tdir, s.file))).map((s) => ({
      name: s.name, role: s.role || "",
      img: "data:image/png;base64," + readFileSync(join(tdir, s.file)).toString("base64"),
    }));
  }
} catch { SCREENS = []; }

function screensReview(screens) {
  const roles = [...new Set(screens.map((s) => s.role).filter(Boolean))];
  const app = ir.app?.name || "App";
  return `<div class="scr" id="scrRoot"><style>
  .scr{display:grid;grid-template-columns:236px 1fr 264px;height:540px;border:1px solid var(--brd,#e6eaf2);border-radius:var(--r,16px);overflow:hidden;background:var(--card,#fff);color:var(--ink,#0f1836);font-family:var(--font,inherit);font-size:13px;box-shadow:var(--sh-sm,0 1px 2px rgba(15,24,54,.05))}
  .scr *{box-sizing:border-box}
  .scr-l{background:#fafbff;border-right:1px solid var(--brd,#e6eaf2);display:flex;flex-direction:column;min-height:0}
  .scr-flt{padding:9px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line,#eef1f7)}
  .scr-sellbl{font-size:11px;font-weight:700;color:var(--muted,#647089);text-transform:uppercase;letter-spacing:.03em}
  .scr-sel{flex:1;font:inherit;font-size:12.5px;font-weight:600;padding:6px 8px;border-radius:8px;border:1px solid var(--brd,#e6eaf2);background:#fff;color:var(--ink,#0f1836);cursor:pointer}
  .scr-prog{padding:8px 12px;border-bottom:1px solid var(--line,#eef1f7);font-size:11.5px;color:var(--muted,#647089);display:flex;align-items:center;gap:8px}
  .scr-pb{flex:1;height:5px;background:#eef1f7;border-radius:4px;overflow:hidden}.scr-pb i{display:block;height:100%;background:var(--ok,#0fa968);width:0;transition:.3s}
  .scr-strip{flex:1;overflow-y:auto;padding:10px}
  .scr-th{border:1px solid var(--brd,#e6eaf2);border-radius:11px;overflow:hidden;margin-bottom:10px;cursor:pointer;background:#fff;transition:.15s}
  .scr-th:hover{border-color:var(--primary-2,#8b6cf6)}
  .scr-th.on{border-color:var(--primary,#5a5df2);box-shadow:0 0 0 2px var(--primary-soft,#ecebfe)}
  .scr-th img{width:100%;display:block;height:90px;object-fit:cover;object-position:top;border-bottom:1px solid var(--line,#eef1f7)}
  .scr-cap{display:flex;align-items:center;gap:6px;padding:8px 10px}.scr-cap .nm{font-size:12px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink,#0f1836)}
  .scr-dot{width:8px;height:8px;border-radius:50%;background:#cbd2e0;flex:0 0 auto}.scr-dot.ok{background:var(--ok,#0fa968)}.scr-dot.warn{background:var(--chg,#f59e0b)}
  .scr-rb{font-size:10.5px;color:var(--muted,#647089);padding:0 10px 8px}
  .scr-c{position:relative;overflow:auto;background:var(--bg,#f5f7fc);display:flex;flex-direction:column}
  .scr-top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--brd,#e6eaf2);display:flex;flex-wrap:nowrap;align-items:center;gap:8px;padding:8px 14px;min-height:48px}
  .scr-top .tt{font-weight:700;color:var(--ink,#0f1836);white-space:nowrap}.scr-top .rr{color:var(--muted,#647089);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.scr-sp{flex:1;min-width:8px}
  .scr-btn{font-size:12px;line-height:1;height:30px;padding:0 12px;display:inline-flex;align-items:center;gap:5px;border-radius:8px;border:1px solid var(--brd,#e6eaf2);background:#fff;color:var(--ink,#0f1836);cursor:pointer;font-weight:600;white-space:nowrap;flex:0 0 auto}
  .scr-btn.ok{background:var(--ok,#0fa968);border-color:var(--ok,#0fa968);color:#fff}.scr-btn.warn{background:var(--chg,#f59e0b);border-color:var(--chg,#f59e0b);color:#fff}.scr-btn.gh{background:#fff}.scr-btn.on{border-color:var(--primary,#5a5df2);box-shadow:0 0 0 2px var(--primary-soft,#ecebfe)}
  .scr-stage-wrap{flex:1;display:flex;justify-content:center;padding:18px}
  .scr-stage{position:relative;max-width:860px;width:100%;align-self:flex-start;border-radius:12px;overflow:hidden;box-shadow:0 12px 36px rgba(15,24,54,.13);border:1px solid var(--brd,#e6eaf2);background:#fff}
  .scr-stage.cm{cursor:crosshair}.scr-stage img{width:100%;display:block}
  .scr-pin{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50% 50% 50% 2px;background:var(--primary,#5a5df2);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;box-shadow:0 3px 8px rgba(15,24,54,.3);cursor:pointer}
  .scr-r{background:#fafbff;border-left:1px solid var(--brd,#e6eaf2);display:flex;flex-direction:column;min-height:0}
  .scr-rh{padding:12px 14px;border-bottom:1px solid var(--line,#eef1f7);font-weight:700;display:flex;align-items:center;gap:8px;color:var(--ink,#0f1836)}
  .scr-v{font-size:10.5px;padding:2px 8px;border-radius:999px;background:#eef1f7;color:var(--muted,#647089)}.scr-v.ok{background:var(--ok-soft,#e2f7ee);color:var(--ok,#0fa968)}.scr-v.warn{background:#fef3e2;color:var(--chg,#f59e0b)}
  .scr-cs{flex:1;overflow-y:auto;padding:10px 12px}
  .scr-cm{background:#fff;border:1px solid var(--brd,#e6eaf2);border-radius:10px;padding:8px 10px;margin-bottom:8px;display:flex;gap:8px;color:var(--ink,#0f1836);align-items:flex-start}
  .scr-cm .n{width:19px;height:19px;border-radius:50%;background:var(--primary,#5a5df2);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;flex:0 0 auto}.scr-cm .x{color:var(--muted,#647089);cursor:pointer}
  .scr-empty{color:var(--muted,#647089);font-size:12.5px;padding:16px;text-align:center;line-height:1.6}
  .scr-foot{border-top:1px solid var(--brd,#e6eaf2);padding:12px}.scr-foot .scr-btn{width:100%;display:flex;justify-content:center;margin-bottom:8px}.scr-foot .cp{background:var(--primary,#5a5df2);border-color:var(--primary,#5a5df2);color:#fff}
  .scr-foot textarea{width:100%;border:1px solid var(--brd,#e6eaf2);background:#fff;color:var(--ink,#0f1836);border-radius:9px;padding:8px;font:inherit;resize:vertical;min-height:52px;display:none;margin-bottom:8px}
  </style>
  <aside class="scr-l">
    <div class="scr-prog"><span id="scrPg">0/${screens.length}</span><div class="scr-pb"><i id="scrPb"></i></div></div>
    <div class="scr-flt"><span class="scr-sellbl">Role</span><select class="scr-sel" id="scrFltSel"></select></div><div class="scr-strip" id="scrStrip"></div></aside>
  <main class="scr-c"><div class="scr-top"><span class="tt" id="scrTt"></span><span class="rr" id="scrRr"></span><span class="scr-sp"></span>
    <button class="scr-btn gh on" id="scrMode">💬 Comment</button><button class="scr-btn ok" id="scrApp">Approve</button><button class="scr-btn warn" id="scrReq">Request changes</button></div>
    <div class="scr-stage-wrap"><div class="scr-stage cm" id="scrStage"><img id="scrShot" alt=""></div></div></main>
  <aside class="scr-r"><div class="scr-rh">Comments <span class="scr-v" id="scrVd">unreviewed</span></div><div class="scr-cs" id="scrCs"></div>
    <div class="scr-foot"><textarea id="scrDraft" placeholder="Describe the change… (Enter to save)"></textarea>
    <button class="scr-btn cp" id="scrCopy">Copy feedback → /author-refine</button><button class="scr-btn gh" id="scrReset">Reset</button></div></aside>
  </div>
  <script>(function(){
  var S=${JSON.stringify(screens)},RS=${JSON.stringify(roles)},APP=${JSON.stringify(app)};
  var st=S.map(function(){return{v:null,c:[]}}),cur=0,flt="All",cm=true,pend=null,sel=null;
  var strip=document.getElementById('scrStrip'),sel=document.getElementById('scrFltSel'),stage=document.getElementById('scrStage'),shot=document.getElementById('scrShot'),draft=document.getElementById('scrDraft'),cs=document.getElementById('scrCs'),vd=document.getElementById('scrVd');
  function vis(){return S.map(function(s,i){return{s:s,i:i}}).filter(function(x){return flt==="All"||x.s.role===flt})}
  function rf(){var a=["All"].concat(RS);sel.innerHTML=a.map(function(r){return '<option'+(flt===r?' selected':'')+'>'+r+'</option>'}).join('');sel.onchange=function(){flt=sel.value;rs()}}
  function rs(){strip.innerHTML=vis().map(function(o){var s=o.s,i=o.i,v=st[i].v,cl=v==='a'?'ok':v==='r'?'warn':'',n=st[i].c.length;return '<div class="scr-th'+(i===cur?' on':'')+'" data-i="'+i+'"><img src="'+s.img+'"><div class="scr-cap"><span class="scr-dot '+cl+'"></span><span class="nm">'+s.name+'</span>'+(n?'<span style="font-size:11px;color:#8a93a6">💬'+n+'</span>':'')+'</div><div class="scr-rb">'+(s.role||'')+'</div></div>'}).join('')||'<div class="scr-empty">No screens for this role.</div>';[].forEach.call(strip.querySelectorAll('.scr-th'),function(t){t.onclick=function(){sl(+t.dataset.i)}})}
  function sl(i){cur=i;pend=null;sel=null;draft.style.display='none';rst();rs();rc()}
  function rst(){var s=S[cur];shot.src=s.img;document.getElementById('scrTt').textContent=s.name;document.getElementById('scrRr').textContent='· '+(s.role||'')+'  ('+(cur+1)+' of '+S.length+')';[].forEach.call(stage.querySelectorAll('.scr-pin'),function(p){p.remove()});st[cur].c.forEach(function(c,idx){var p=document.createElement('div');p.className='scr-pin';p.textContent=idx+1;p.style.left=c.x+'%';p.style.top=c.y+'%';p.onclick=function(e){e.stopPropagation();sel=idx;rc();rst()};stage.appendChild(p)});stage.classList.toggle('cm',cm)}
  stage.onclick=function(e){if(!cm||e.target.classList.contains('scr-pin'))return;var r=shot.getBoundingClientRect();pend={x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100};draft.style.display='block';draft.value='';draft.focus()};
  draft.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();var t=draft.value.trim();if(t&&pend){st[cur].c.push({x:pend.x,y:pend.y,t:t});pend=null;draft.style.display='none';rst();rc();rs();pg()}}};
  function sv(v){st[cur].v=v;rs();rc();pg()}
  document.getElementById('scrApp').onclick=function(){sv('a')};document.getElementById('scrReq').onclick=function(){sv('r')};
  document.getElementById('scrMode').onclick=function(e){cm=!cm;e.target.classList.toggle('on',cm);rst()};
  function rc(){var v=st[cur].v;vd.className='scr-v '+(v==='a'?'ok':v==='r'?'warn':'');vd.textContent=v==='a'?'approved':v==='r'?'changes requested':'unreviewed';var c=st[cur].c;cs.innerHTML=c.length?c.map(function(x,i){return '<div class="scr-cm"><span class="n">'+(i+1)+'</span><span style="flex:1">'+x.t.replace(/</g,'&lt;')+'</span><span class="x" data-i="'+i+'">✕</span></div>'}).join(''):'<div class="scr-empty">No comments yet.<br>Click the screen to drop a pin.</div>';[].forEach.call(cs.querySelectorAll('.x'),function(d){d.onclick=function(){st[cur].c.splice(+d.dataset.i,1);sel=null;rst();rc();rs();pg()}})}
  function pg(){var d=st.filter(function(s){return s.v}).length;document.getElementById('scrPg').textContent=d+'/'+S.length;document.getElementById('scrPb').style.width=(d/S.length*100)+'%'}
  document.getElementById('scrCopy').onclick=function(){var o='PROTOTYPE REVIEW FEEDBACK — '+APP+'\\n\\n';S.forEach(function(s,i){var x=st[i];if(!x.v&&!x.c.length)return;o+='### '+s.name+' ('+(s.role||'')+') — '+(x.v==='a'?'APPROVE':x.v==='r'?'REQUEST CHANGES':'commented')+'\\n';x.c.forEach(function(c,n){o+='  '+(n+1)+'. '+c.t+'\\n'});o+='\\n'});navigator.clipboard.writeText(o).then(function(){var b=document.getElementById('scrCopy'),t=b.textContent;b.textContent='✓ Copied — paste into /author-refine';setTimeout(function(){b.textContent=t},2200)})};
  document.getElementById('scrReset').onclick=function(){if(confirm('Clear all feedback?')){st.forEach(function(s){s.v=null;s.c=[]});sl(cur);pg()}};
  rf();rs();sl(0);pg();
  })();</script>`;
}

// minimal, dependency-free markdown → HTML (headings, lists, tables, bold/italic/code, quotes, hr, links)
function mdToHtml(md) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = String(md).split(/\r?\n/);
  const out = []; let list = null, code = false, para = [];
  const flushP = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
  const flushL = () => { if (list) { out.push("</" + list + ">"); list = null; } };
  const isRow = (s) => /^\s*\|.*\|\s*$/.test(s);
  const isSep = (s) => /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(s);
  const cells = (s) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) { flushP(); flushL(); out.push(code ? "</pre>" : '<pre class="md-code">'); code = !code; continue; }
    if (code) { out.push(esc(line)); continue; }
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) { // GFM table
      flushP(); flushL();
      const head = cells(line); i += 2; const body = [];
      while (i < lines.length && isRow(lines[i])) { body.push(cells(lines[i])); i++; }
      i--;
      out.push(`<table class="md-tbl"><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const inlineSep = line.match(/\|(?:\s*:?-{2,}:?\s*\|)+/); // whole table crammed onto ONE line
    if (inlineSep && /\|/.test(line.slice(0, inlineSep.index))) {
      flushP(); flushL();
      const clean = (seg) => seg.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = clean(line.slice(0, inlineSep.index)).filter((c) => c.length);
      const rows = line.slice(inlineSep.index + inlineSep[0].length).split(/\|\s*\|/).map((seg) => clean(seg).filter((c) => c.length)).filter((r) => r.length);
      out.push(`<table class="md-tbl"><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*$/.test(line)) { flushP(); flushL(); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushP(); flushL(); const lv = Math.min(m[1].length + 1, 6); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); continue; }
    if (/^\s*([-*+])\s+/.test(line)) { flushP(); if (list !== "ul") { flushL(); out.push("<ul>"); list = "ul"; } out.push("<li>" + inline(line.replace(/^\s*[-*+]\s+/, "")) + "</li>"); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { flushP(); if (list !== "ol") { flushL(); out.push("<ol>"); list = "ol"; } out.push("<li>" + inline(line.replace(/^\s*\d+\.\s+/, "")) + "</li>"); continue; }
    if (/^\s*>\s?/.test(line)) { flushP(); flushL(); out.push("<blockquote>" + inline(line.replace(/^\s*>\s?/, "")) + "</blockquote>"); continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushP(); flushL(); out.push("<hr>"); continue; }
    para.push(line.trim());
  }
  flushP(); flushL(); if (code) out.push("</pre>");
  return out.join("\n");
}
const forms = ir.forms || [], roles = ir.roles || [], lists = ir.lists || [], perms = ir.permissions || [], pages = ir.pages || [];
const processes = forms.filter((f) => (f.flowType || "Form") === "Process");
const dataForms = forms.filter((f) => (f.flowType || "Form") !== "Process");

// forms are referenced by id OR name throughout the IR (ir.mjs accepts both) — resolve either to the display name
const formKey = new Map(); for (const f of forms) { if (f.name) formKey.set(f.name, f.name); if (f.id) formKey.set(f.id, f.name); }
const formName = (r) => formKey.get(r);

// a reviewable item — id + kind + label drive the change-list export. .flag/.revbtn/.cmt is the
// generic contract the client understands (works for nested flags: a field inside an entity).
const item = (id, kind, label, tag, bodyHtml) => `
  <div class="item flag" id="${esc(id)}" data-kind="${esc(kind)}" data-label="${esc(label)}">
    <div class="ihead"><h4>${esc(label)}${tag ? ` <span class="tag">${esc(tag)}</span>` : ""}</h4>
      <div class="rev"><button class="revbtn ok" title="Looks right">✓ ok</button><button class="revbtn chg" title="Request a change">✎ change</button><button class="revbtn q" title="Ask a question">? ask</button></div>
    </div>
    ${bodyHtml}
    <textarea class="cmt" placeholder="What should change about ${esc(label)}?"></textarea>
  </div>`;

const fieldMeta = (f) => {
  const bits = [];
  // in Kissflow EVERY reference is a lookup: a bare ref fetches the target's display field (name);
  // a configured lookup fetches those extra columns too. Label them consistently.
  if (f.ref) {
    const cols = (f.lookup && f.lookup.length) ? f.lookup.map((l) => esc(l.name || l)).join(", ") : "name (display field)";
    bits.push(`→ <b>${esc(formName(f.ref) || f.ref)}</b> · fetches ${cols}`);
  } else if (f.referredList) {
    bits.push(`⊙ list: ${esc(f.referredList)}`);
  } else if (f.lookup && f.lookup.length) {
    bits.push(`lookup[${f.lookup.map((l) => esc(l.name || l)).join(", ")}]`);
  }
  if (f.formula) bits.push(`ƒ <code>${esc(f.formula)}</code>`);
  if (f.aggregate) bits.push(`Σ ${esc(f.aggregate.fn)}(${esc(f.aggregate.over)}${f.aggregate.field ? "." + esc(f.aggregate.field) : ""})`);
  return bits.join(" · ");
};

const fieldCard = (entity, f) => {
  const id = `fld-${slug(entity)}-${slug(f.name)}`;
  const meta = fieldMeta(f);
  return `<div class="fld flag${f.ref ? " islookup" : ""}" id="${id}" data-kind="field" data-label="${esc(entity)} · ${esc(f.name)}">
    <div class="fmain"><span class="fn">${esc(f.name)}${f.required ? ' <span class="req">*</span>' : ""}</span><span class="fty">${esc(typeLabel(f.type))}</span>${meta ? `<span class="fmeta">${meta}</span>` : ""}</div>
    <div class="rev frev"><button class="revbtn ok" title="Field is right">✓</button><button class="revbtn chg" title="Change this field">✎</button><button class="revbtn q" title="Ask about this field">?</button></div>
    <textarea class="cmt" placeholder="What should change about this field?"></textarea>
  </div>`;
};

// ── ER data-model diagram: Mermaid erDiagram primary + hand-drawn SVG graph as offline fallback ──
// Layered-then-packed ER layout: entities sorted by DEPENDENCY DEPTH (masters → referrers →
// processes), children docked right after their parent, then packed COLUMN-MAJOR into balanced
// columns — organized flow without the absurd width a strict layer-per-column would need on deep
// chains. Cards show up to 6 key fields (first = PK, refs = FK) so the diagram reads as a model.
function buildGraph() {
  const refE = [], childE = [];
  for (const f of forms) {
    for (const x of (f.fields || [])) { const t = formName(x.ref); if (t && t !== f.name) refE.push([f.name, t]); }
    const par = formName(f.childOf); if (par) childE.push([par, f.name]);
  }
  const connected = new Set();
  for (const [a, b] of [...refE, ...childE]) { connected.add(a); connected.add(b); }
  const N = connected.size;
  if (!N) return { svg: `<p class="empty">No relationships between entities to diagram.</p>`, W: 0, H: 0, N: 0, standalone: 0 };
  const parentOf = {}; for (const [p, c] of childE) parentOf[c] = p;
  const targets = {}; for (const [a, b] of refE) (targets[a] = targets[a] || new Set()).add(b);
  const memo = {};
  const rankOf = (n, stack = new Set()) => {
    if (memo[n] != null) return memo[n];
    if (stack.has(n)) return 0;
    stack.add(n);
    let r;
    const p = parentOf[n];
    if (p && connected.has(p)) r = rankOf(p, stack);
    else { const ts = [...(targets[n] || [])].filter((t) => connected.has(t) && t !== n); r = ts.length ? 1 + Math.max(...ts.map((t) => rankOf(t, stack))) : 0; }
    stack.delete(n); memo[n] = r; return r;
  };
  const names = forms.map((f) => f.name).filter((n) => connected.has(n) && !parentOf[n]);
  [...connected].forEach((n) => rankOf(n));
  // topo order: dependency depth, ties broken by first ref target (clusters related entities)
  names.sort((a, b) => memo[a] - memo[b] || String([...(targets[a] || [])][0] || "").localeCompare(String([...(targets[b] || [])][0] || "")) || a.localeCompare(b));
  const order = [];
  for (const n of names) { order.push(n); for (const [p, c] of childE) if (p === n && connected.has(c)) order.push(c); }
  for (const n of [...connected]) if (!order.includes(n)) order.push(n);
  // node cards
  const CW = 216, HH = 30, RH = 19, PAD = 26, GX = 62, GY = 24;
  const geo = {};
  for (const n of order) {
    const f = forms.find((z) => z.name === n); const fl = (f && f.fields) || [];
    const refs = fl.filter((x) => x.ref), rest = fl.filter((x) => !x.ref && x !== fl[0]);
    const pick = [...new Set([...(fl[0] ? [fl[0]] : []), ...refs, ...rest])].slice(0, 6);
    const more = fl.length - pick.length;
    geo[n] = { w: CW, h: HH + pick.length * RH + (more > 0 ? RH : 0), rows: pick, more };
  }
  // DOMAIN PANELS — group by the IR's `section` (children ride with their parent), order panels by
  // avg dependency rank (= the business lifecycle), pack each panel's cards into small columns, and
  // flow panels left→right with row wrapping. The panel layer is what keeps the map from reading flat.
  // connection degree — drives hub rails AND the layout anchor (most-connected model centers the map)
  const deg = {};
  for (const [a, b] of refE) { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; }
  const isHub = (n) => (deg[n] || 0) >= 8;
  const HUBC = ["#7c3aed", "#0e9f6e", "#d97706", "#db2777", "#0284c7", "#dc2626"];
  const hubs = [...connected].filter(isHub).sort((a, b) => deg[b] - deg[a]).slice(0, 6);
  const hubColor = {}; hubs.forEach((h, i) => (hubColor[h] = HUBC[i % HUBC.length]));
  const prime = [...connected].sort((a, b) => (deg[b] || 0) - (deg[a] || 0))[0] || null;
  // when the IR has no sections, DERIVE groups: name families first ("Fund Report - X" → "Fund
  // Report", ≥3 sharing a first word → that word), then singletons join their first ref target's
  // family — so legacy/sectionless IRs still get a structured map instead of one "Other" panel.
  const hasSections = forms.some((f) => !f.childOf && f.section);
  let derived = null;
  if (!hasSections) {
    derived = {};
    const famKey = (n) => String(n).split(" - ")[0].trim();
    const w1 = (n) => String(n).split(/\s+/)[0];
    const famC = {}, w1C = {};
    for (const n of names) { famC[famKey(n)] = (famC[famKey(n)] || 0) + 1; w1C[w1(n)] = (w1C[w1(n)] || 0) + 1; }
    for (const n of names) derived[n] = famC[famKey(n)] >= 2 ? famKey(n) : (w1C[w1(n)] >= 3 ? w1(n) : null);
    for (const n of names) if (!derived[n]) { const t = [...(targets[n] || [])].find((x) => derived[x]); derived[n] = (t && derived[t]) || famKey(n); }
  }
  const secOf = (n) => {
    const f = forms.find((z) => z.name === n); if (!f) return "Other";
    if (f.childOf) { const p = formName(f.childOf); const pf = forms.find((z) => z.name === p); return (derived ? derived[p] : (pf && pf.section)) || f.section || "Other"; }
    return (derived ? derived[n] : f.section) || "Other";
  };
  const groups = {};
  for (const n of order) (groups[secOf(n)] = groups[secOf(n)] || []).push(n);
  const primeKey = "__prime__";
  if (prime && groups[secOf(prime)] && (deg[prime] || 0) >= 6) {
    for (const k of Object.keys(groups)) { groups[k] = groups[k].filter((n) => n !== prime && parentOf[n] !== prime); if (!groups[k].length) delete groups[k]; }
    groups[primeKey] = [prime, ...order.filter((n) => parentOf[n] === prime)];
  }
  const gnames = Object.keys(groups).sort((a, b) => {
    const avg = (g) => groups[g].reduce((s, n) => s + (memo[n] || 0), 0) / groups[g].length;
    return avg(a) - avg(b);
  });
  const GP = 18, GH = 34, GXi = 26, GYi = 18, PGX = 36, PGY = 36;
  const panels = gnames.map((g) => {
    const mem = groups[g];
    // column count scales with group size, so an IR WITHOUT sections (one big group) still packs
    // into a sensible grid instead of a uselessly tall single panel
    const gcols = mem.length <= 2 ? 1 : mem.length <= 5 ? 2 : mem.length <= 9 ? 3 : Math.min(5, Math.ceil(Math.sqrt(mem.length * 1.7)));
    const tot = mem.reduce((s, n) => s + geo[n].h + GYi, 0);
    const tgt = tot / gcols;
    let c = 0, y = 0; const colH = [];
    for (const n of mem) {
      if (y > 0 && y + geo[n].h > tgt && c < gcols - 1) { colH[c] = y; c++; y = 0; }
      geo[n].gx = c; geo[n].gy = y; y += geo[n].h + GYi;
    }
    colH[c] = y;
    const usedC = c + 1;
    return { g, label: g === primeKey ? String(prime) : String(g), mem, usedC, w: GP * 2 + usedC * CW + (usedC - 1) * GXi, h: GH + GP * 2 + Math.max(...colH) - GYi };
  });
  // HUB-CENTERED RADIAL BANDS — the most-connected model sits in its own emphasized panel at the
  // CENTER; family columns are placed around it by CONNECTION STRENGTH, alternating right/left, so
  // the most fund-coupled families hug the hub and the map reads naturally outward from the middle.
  const pr = (p) => p.mem.reduce((sum, n) => sum + (memo[n] || 0), 0) / p.mem.length;
  const primePanel = panels.find((p) => p.g === primeKey) || null;
  const connScore = (p) => p.mem.reduce((s2, n) => s2 + refE.reduce((s3, [a, b]) => s3 + ((a === prime && b === n) || (b === prime && a === n) ? 1 : 0), 0), 0);
  const others = panels.filter((p) => p !== primePanel).sort((a, b) => connScore(b) - connScore(a) || pr(a) - pr(b));
  const targetH = Math.max(900, ...panels.map((p) => p.h));
  const colsAll = []; { let cur = [], h = 0;
    for (const p of others) { if (h > 0 && h + p.h > targetH) { colsAll.push(cur); cur = []; h = 0; } cur.push(p); h += p.h + PGY; }
    if (cur.length) colsAll.push(cur); }
  const rightC = [], leftC = [];
  colsAll.forEach((c2, i2) => (i2 % 2 ? leftC : rightC).push(c2));
  const seq = [...leftC.reverse(), ...(primePanel ? [[primePanel]] : []), ...rightC];
  let bx = PAD;
  for (const colP of seq) {
    const w = Math.max(...colP.map((p) => p.w)); let yy = 0;
    for (const p of colP) { p.x = bx; p.y = yy; yy += p.h + PGY; }
    colP._h = yy - PGY; bx += w + PGX;
  }
  const H0 = Math.max(...seq.map((c2) => c2._h));
  for (const colP of seq) { const off = PAD + (H0 - colP._h) / 2; for (const p of colP) p.y += off; }
  const W = bx - PGX + PAD, H = H0 + PAD * 2;
  for (const p of panels) for (const n of p.mem) { geo[n].x = p.x + GP + geo[n].gx * (CW + GXi); geo[n].y = p.y + GH + GP + geo[n].gy; }
  const panelSvg = panels.map((p) => `<g class="grp"><rect class="gp${p.g === primeKey ? " gpp" : ""}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="16"/><text class="gl${p.g === primeKey ? " glp" : ""}" x="${p.x + GP}" y="${p.y + GH / 2 + 4}">${esc(String(p.label).toUpperCase())}</text><text class="gc" x="${p.x + p.w - GP}" y="${p.y + GH / 2 + 4}">${p.mem.length}</text></g>`).join("");
  const cls = (n) => { const f = forms.find((z) => z.name === n); const t = f?.flowType || "Form"; return f?.childOf ? "child" : t === "Process" ? "proc" : t === "List" ? "list" : "form"; };
  const anchor = (g) => ({ l: { x: g.x, y: g.y + HH / 2 + 4 }, r: { x: g.x + CW, y: g.y + HH / 2 + 4 } });
  const edgeSvg = [...childE.map((e) => ({ e, k: "child" })), ...refE.map((e) => ({ e, k: "ref" }))].map(({ e, k }) => {
    const A = geo[e[0]], B = geo[e[1]]; if (!A || !B) return "";
    let d;
    if (k === "child" && A.x === B.x && B.y > A.y && B.y - (A.y + A.h) < 20) {
      d = `M${A.x + CW / 2} ${A.y + A.h} C ${A.x + CW / 2 - 16} ${A.y + A.h + 8}, ${B.x + CW / 2 - 16} ${B.y - 8}, ${B.x + CW / 2} ${B.y}`; // docked child: gentle bow
    } else {
      const aA = anchor(A), aB = anchor(B);
      let p1, p2;
      if (A.x + CW < B.x) { p1 = aA.r; p2 = aB.l; } else if (B.x + CW < A.x) { p1 = aA.l; p2 = aB.r; } else { p1 = aA.l; p2 = aB.l; }
      const bend = p1.x === aA.l.x && p2.x === aB.l.x ? -36 : Math.max(28, Math.abs(p2.x - p1.x) / 2.6) * (p2.x >= p1.x ? 1 : -1);
      d = `M${p1.x} ${p1.y} C ${p1.x + bend} ${p1.y}, ${p2.x - bend} ${p2.y}, ${p2.x} ${p2.y}`;
    }
    if (k === "ref" && (isHub(e[0]) || isHub(e[1]))) return ""; // hubs connect via RAILS below
    return `<path class="edge ${k}" data-a="${esc(slug(e[0]))}" data-b="${esc(slug(e[1]))}" d="${d}"/>`;
  }).join("");
  // HUB RAILS — since the canvas may scroll, hub connectivity is drawn ALWAYS-VISIBLE as a bus:
  // one colored trunk through the hub's header line, vertical drops in each used column gutter,
  // and a stub tapping every connected card. Lines pass behind cards; color = which hub.
  const railSvg = hubs.map((h, hi) => {
    const cHex = hubColor[h], Hg = geo[h]; if (!Hg) return "";
    const hy = Hg.y + HH / 2 + hi * 4;
    const nbs = new Set();
    for (const [a, b] of refE) { if (a === h && geo[b]) nbs.add(b); else if (b === h && geo[a]) nbs.add(a); }
    if (!nbs.size) return "";
    const lane = 14 + hi * 6;
    // one smooth cubic per connection, both control points pinned to the neighbor's gutter x —
    // curves from the same column share the gutter, so they BUNDLE organically (no straight lines)
    return [...nbs].map((n) => {
      const g = geo[n], ny = g.y + HH / 2;
      const toRight = g.x >= Hg.x + CW, toLeft = g.x + CW <= Hg.x;
      const sx = toRight ? Hg.x + CW : (toLeft ? Hg.x : Hg.x + CW / 2);
      const ex = toRight ? g.x : (toLeft ? g.x + CW : g.x + CW / 2);
      const gx = toRight ? g.x - lane : (toLeft ? g.x + CW + lane : g.x - lane);
      return `<path class="edge rail" data-a="${esc(slug(h))}" data-b="${esc(slug(n))}" style="stroke:${cHex}" d="M${sx} ${hy} C ${gx} ${hy}, ${gx} ${ny}, ${ex} ${ny}"/>`;
    }).join("");
  }).join("");
  const nodeSvg = order.map((n) => {
    const g = geo[n], s = slug(n);
    const lbl = n.length > 26 ? n.slice(0, 24) + "…" : n;
    const rows = g.rows.map((x, i) => {
      const ry = HH + i * RH;
      const nm = String(x.name || "").length > 22 ? String(x.name).slice(0, 21) + "…" : (x.name || "");
      const tag = i === 0 ? "PK" : x.ref ? "FK" : "";
      return `<line class="rl" x1="0" y1="${ry}" x2="${CW}" y2="${ry}"/><text class="rt" x="9" y="${ry + RH / 2 + 1}">${esc(nm)}</text>${tag ? `<text class="rk" x="${CW - 9}" y="${ry + RH / 2 + 1}">${tag}</text>` : ""}`;
    }).join("");
    const moreY = HH + g.rows.length * RH;
    const more = g.more > 0 ? `<line class="rl" x1="0" y1="${moreY}" x2="${CW}" y2="${moreY}"/><text class="rm" x="9" y="${moreY + RH / 2 + 1}">+ ${g.more} more field${g.more > 1 ? "s" : ""}</text>` : "";
    const hubb = isHub(n) ? `<g class="hubb"><rect x="${CW - 50}" y="-9" width="50" height="18" rx="9" style="stroke:${hubColor[n] || "#94a3b8"}"/><text x="${CW - 25}" y="0.5" style="fill:${hubColor[n] || "#475569"}">⇄ ${deg[n]}</text></g>` : "";
    const fic = (deg[n] || 0) > 0 ? `<g class="fic"><circle cx="${CW - 15}" cy="${HH / 2}" r="8.5"/><text x="${CW - 15}" y="${HH / 2 + 0.5}">⤢</text></g>` : "";
    return `<a class="node ${cls(n)}" href="#e-${esc(s)}" data-id="${esc(s)}"><g transform="translate(${g.x} ${g.y})"><rect class="bd" width="${CW}" height="${g.h}" rx="10"/><rect class="hd" width="${CW}" height="${HH}" rx="10"/><rect class="hd2" y="${HH - 10}" width="${CW}" height="10"/><text class="tt" x="${CW / 2}" y="${HH / 2 + 1}">${esc(lbl)}</text>${rows}${more}${hubb}${fic}</g></a>`;
  }).join("");
  return { svg: `<svg id="ersvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><g id="zoomable">${panelSvg}${railSvg}${edgeSvg}${nodeSvg}</g></svg>`, W, H, N, standalone: forms.length - N };
}

// a PROPER ER diagram: entities as tables with attributes (PK/FK) + crow's-foot cardinality
function buildMermaidER() {
  const eid = (n) => "e_" + String(n).replace(/[^a-zA-Z0-9]+/g, "_");
  const seen = new Set(), rels = [], connected = new Set();
  const addRel = (a, b, lbl) => { const k = a + ">" + b + ">" + lbl; if (seen.has(k)) return; seen.add(k); rels.push(`  ${eid(a)} ||--o{ ${eid(b)} : "${lbl}"`); connected.add(a); connected.add(b); };
  for (const f of forms) {
    for (const x of (f.fields || [])) { const t = formName(x.ref); if (t && t !== f.name) addRel(t, f.name, "has"); }
    const par = formName(f.childOf); if (par) addRel(par, f.name, "contains");
  }
  if (!connected.size) return null;
  const tok = (s, fb) => { const t = String(s || fb).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, ""); return t || fb; };
  const CAP = 16;
  const blocks = [...connected].map((name) => {
    const f = forms.find((z) => z.name === name); if (!f) return "";
    const fields = (f.fields || []);
    const rows = fields.slice(0, CAP).map((x, i) => `    ${tok(typeLabel(x.type), "field")} ${tok(x.name, "f" + i)}${x.ref ? " FK" : (i === 0 && x.required ? " PK" : "")}`);
    if (fields.length > CAP) rows.push(`    more plus_${fields.length - CAP}_more`);
    return `  ${eid(name)}["${esc(String(name).replace(/"/g, ""))}"] {\n${rows.join("\n") || "    field none"}\n  }`;
  }).filter(Boolean);
  return "erDiagram\n" + rels.join("\n") + "\n" + blocks.join("\n");
}

// a workflow → a Mermaid flowchart (steps as nodes, decisions as diamonds with branch labels)
function buildMermaidFlow(p) {
  const steps = (p.workflow?.steps) || [];
  if (!steps.length) return null;
  const clean = (s) => esc(String(s ?? "")).replace(/[|"{}]/g, "");
  const label = (s, i) => { const nm = clean(s.name || s.label || ("Step " + (i + 1))); const ac = s.actor ? " · " + clean(s.actor) : ""; return nm + ac; };
  const lines = ["flowchart LR"];
  steps.forEach((s, i) => { const dec = (s.decision || []); lines.push(dec.length ? `  n${i}{"${label(s, i)}"}` : `  n${i}["${label(s, i)}"]`); });
  steps.forEach((s, i) => {
    if (i >= steps.length - 1) return;
    const dec = (s.decision || []);
    lines.push(`  n${i} -->${dec.length ? "|" + clean(dec[0]) + "|" : ""} n${i + 1}`);
    if (dec.length > 1) lines.push(`  n${i} -.->|${clean(dec[1])}| n0`);
  });
  return lines.join("\n");
}

const graph = buildGraph();
// the packed layered layout above is the PRIMARY ER view — mermaid's dagre ER sprawls on deep
// dependency chains (npd-plm feedback 2026-07-03). buildMermaidER kept for reference/reuse.
const merER = null;

// ── sections ──────────────────────────────────────────────────────────────────
const sData = forms.map((f) => {
  const kids = forms.filter((c) => formName(c.childOf) === f.name);
  const fields = (f.fields || []).map((x) => fieldCard(f.name, x)).join("");
  const kidsHtml = kids.length ? `<div class="kids">child tables: ${kids.map((k) => `<a class="tag" href="#e-${slug(k.name)}">${esc(k.name)}</a>`).join(" ")}</div>` : "";
  const refs = (f.fields || []).filter((x) => x.ref).map((x) => `${esc(f.name)} → ${esc(formName(x.ref) || x.ref)}`);
  const relHtml = refs.length ? `<div class="rel">relationships: ${refs.map((r) => `<code>${r}</code>`).join(", ")}</div>` : "";
  const body = `<div class="flds">${fields || '<span class="empty">no fields</span>'}</div>${kidsHtml}${relHtml}`;
  return item(`e-${slug(f.name)}`, "entity", f.name, f.flowType || "Form", body);
}).join("");

// Business Logic = DERIVED values only (formulas + aggregates). Lookups are references — they belong
// in Data & Fields, so we don't show any here (showing only the configured ones was a confusing half-set).
const sLogicItems = forms.map((f) => {
  const logic = (f.fields || []).filter((x) => x.formula || x.aggregate);
  if (!logic.length) return "";
  return item(`l-${slug(f.name)}`, "logic", `${f.name} — business logic`, null, `<div class="flds">${logic.map((x) => fieldCard(f.name + " (logic)", x)).join("")}</div>`);
}).filter(Boolean).join("");

// completeness critic: numeric fields whose NAMES read as derived but carry no formula/aggregate
const COMPUTE_WORDS = /(total|remaining|balance|net|gross|sum|count|percent|progress|drawdown|repay|days|duration|due|outstanding|accrued|profit|return|nav\b|valuation|difference|variance|average|ratio)/i;
const rootFlowType = (f) => { const root = f.childOf ? forms.find((x) => x.name === formName(f.childOf)) : f; return (root && root.flowType) || "Form"; };
const suspects = [];
for (const f of forms) for (const x of (f.fields || [])) {
  const numeric = /currency|number|percent|decimal/i.test(x.type || "");
  if (numeric && COMPUTE_WORDS.test(x.name) && !x.formula && !x.aggregate) suspects.push({ form: f.name, field: x.name, type: x.type, proc: rootFlowType(f) === "Process" });
}
const missBlock = suspects.length ? `<div class="missblock"><h3>⚠ Possibly missing expressions <span class="misscount">${suspects.length}</span></h3>
  <p class="lead">These numeric fields read like <b>derived</b> values but have no formula or aggregate — they may have been captured as manual inputs by mistake. Flag any that should be computed. On a <b>Form</b>, add a formula or aggregate directly; on a <b>Process</b>, an <b>aggregate</b> works (it survives publish) but a field formula does not — compute those in the workflow.</p>
  <div class="flds">${suspects.map((s) => { const id = `mx-${slug(s.form)}-${slug(s.field)}`; return `<div class="fld flag miss" id="${id}" data-kind="missing-expr" data-label="${esc(s.form)} · ${esc(s.field)} (looks computed)"><div class="fmain"><span class="fn">${esc(s.form)}.${esc(s.field)}</span><span class="fty">${esc(s.type)}</span><span class="fmeta">${s.proc ? "process — use an aggregate, or compute in the workflow" : "form — add a formula or aggregate"}</span></div><div class="rev frev"><button class="revbtn ok" title="fine as an input">✓</button><button class="revbtn chg" title="should be computed">✎</button><button class="revbtn q" title="ask">?</button></div><textarea class="cmt" placeholder="What should this compute? e.g. = Financing − Financing Drawdown"></textarea></div>`; }).join("")}</div></div>` : "";

const sLogic = `${sLogicItems || '<p class="empty">No formulas / aggregates / lookups proposed.</p>'}${missBlock}`;

const dLegend = `<div class="legend"><span class="lg proc">Process</span><span class="lg form">Form</span><span class="lg child">Child table</span><span class="lg list">List</span><span class="lgline"><i class="solid"></i> one-to-many</span><span class="lgline"><i class="dash"></i> contains</span></div>`;
const dHint = `<span class="hint">${merER ? "wheel scrolls · pinch / ctrl+wheel / buttons zoom · drag to pan" : "colored curves = a busy hub\u2019s links (hover to intensify) · ⤢ on any card opens it with just its connections · click a card to jump"}</span>`;
const erCC = `<div class="ercc"><button id="zin" title="Zoom in">+</button><button id="zout" title="Zoom out">–</button><button id="zfit" title="Fit to screen">⤢</button><span class="ercc-sep"></span><button id="erdl" title="Download SVG">⤓</button><button id="erprint" title="Print">⎙</button></div>`;
const dNote = graph.standalone > 0 ? `<p class="dnote">${graph.N} related entities shown · ${graph.standalone} standalone entities not drawn (see the Data &amp; Fields step).</p>` : "";
const sDiagram = graph.N === 0 ? graph.svg
  : `<div class="dbar"><h2 class="dtitle">Data Model</h2>${dLegend}${dHint}</div><div class="diagpane">${erCC}<div class="diagram" id="erwrap">${merER ? `<div class="mermaid" id="ermer">${merER}</div>` : ""}<div id="erfb"${merER ? ` style="display:none"` : ""}>${graph.svg}</div></div></div>${dNote}`;

const sFlow = processes.map((p) => {
  const mf = buildMermaidFlow(p);
  const stepsList = ((p.workflow?.steps) || []).map((s) => `<li><b>${esc(s.name || s.label)}</b> — <span class="actor">${esc(s.actor || "—")}</span>${s.decision ? ` <span class="dec">[${(s.decision || []).map(esc).join(" / ")}]</span>` : ""}</li>`).join("");
  const body = mf ? `<div class="flow"><div class="mermaid wf">${mf}</div></div><details class="steptext"><summary>steps as a list</summary><ol class="steps">${stepsList}</ol></details>`
    : `<p class="empty">No steps defined.</p>`;
  return item(`w-${slug(p.name)}`, "workflow", `${p.name}`, "Process", body);
}).join("") || `<p class="empty">No processes (no workflows) proposed.</p>`;

const sRoles = (() => {
  const models = [...new Set(perms.map((p) => p.model))];
  if (!models.length) return `<p class="empty">No permissions proposed.</p>`;
  const N = models.length;
  const header = `<div class="permhead" style="--cols:${N}"><div class="ph0">Role</div>${models.map((m) => `<div class="ph"><span>${esc(m)}</span></div>`).join("")}</div>`;
  const rows = roles.map((r) => {
    const rn = r.name || r;
    const cells = models.map((m) => {
      const pm = perms.find((p) => p.role === rn && p.model === m);
      const lvl = !pm ? "n" : /edit|manage|initi/i.test(pm.level || "") ? "e" : "v";
      const sym = lvl === "e" ? "E" : lvl === "v" ? "V" : "";
      const tip = pm ? `${rn} · ${m} · ${pm.level}${pm.scope ? " (" + pm.scope + ")" : ""}` : `${rn} · ${m} · no access`;
      return `<div class="pcell ${lvl}" title="${esc(tip)}">${sym}</div>`;
    }).join("");
    return `<div class="permrow flag" id="r-${slug(rn)}" data-kind="role" data-label="${esc(rn)} permissions" style="--cols:${N}">
      <div class="rc0"><span class="rcname" title="${esc(rn)}">${esc(rn)}</span><span class="rev rrev"><button class="revbtn ok" title="ok">✓</button><button class="revbtn chg" title="change">✎</button><button class="revbtn q" title="ask">?</button></span></div>
      ${cells}
      <textarea class="cmt" placeholder="What should change about ${esc(rn)}'s permissions?"></textarea>
    </div>`;
  }).join("");
  return `<p class="lead"><span class="pk e">E</span> create / edit · <span class="pk v">V</span> view · empty = no access. Header row &amp; role column stay put as you scroll; flag any role's row.</p><div class="permwrap"><div class="permgrid">${header}${rows}</div></div>`;
})();

const widgetTile = (c) => {
  const v = String(c.view || c.type || "list").toLowerCase();
  const kind = /kpi|metric|count|number|stat/.test(v) ? "kpi" : /chart|graph|pie|bar|line|report|trend/.test(v) ? "chart"
    : /form|entry|new|create/.test(v) ? "form" : /kanban|board/.test(v) ? "kanban" : "table";
  const span = { kpi: 3, chart: 6, table: 12, form: 6, kanban: 12 }[kind] || 4;
  const inner = {
    kpi: `<div class="ph-num"></div>`,
    chart: `<div class="ph-bars"><i></i><i></i><i></i><i></i><i></i></div>`,
    table: `<div class="ph-row h"></div><div class="ph-row"></div><div class="ph-row"></div><div class="ph-row"></div>`,
    form: `<div class="ph-line"></div><div class="ph-line"></div><div class="ph-line short"></div>`,
    kanban: `<div class="ph-kb"><span></span><span></span><span></span></div>`,
  }[kind];
  return `<div class="tile ${kind}" style="grid-column:span ${span}"><div class="tcap"><b>${esc(c.label || kind)}</b><span class="tsrc">${esc(kind)}${c.source_flow ? " · " + esc(c.source_flow) : ""}</span></div>${inner}</div>`;
};
const pageMock = (pg) => {
  const tiles = (pg.cards || []).map(widgetTile).join("") || `<div class="tile empty" style="grid-column:span 12">no widgets on this page</div>`;
  return `<div class="screen"><div class="sbar"><span class="dots"><i></i><i></i><i></i></span><span class="stitle">${esc(pg.name)}</span>${pg._auto ? `<span class="autotag">auto baseline</span>` : ""}${pg.role ? `<span class="srole">${esc(pg.role)}</span>` : ""}</div><div class="scanvas">${tiles}</div></div>`;
};
// render the navigation as a real app nav panel (menus → submenus, with who-sees-what chips)
const navMock = () => {
  const menus = (ir.nav?.menus || []);
  if (!menus.length) return '<p class="empty">no navigation</p>';
  return `<div class="navmock"><div class="navbrand">${esc(ir.app?.name || "App")}</div><div class="navgroups">${menus.map((m) => `
    <div class="navgroup"><div class="navhead">${esc(m.name)}</div>${(m.submenus || []).map((s) => `
      <div class="navitem"><span class="navdot"></span><span class="navlabel">${esc(s.name)}</span>${(s.visibleTo || []).length ? `<span class="navroles">${(s.visibleTo || []).map((r) => `<i>${esc(r)}</i>`).join("")}</span>` : ""}</div>`).join("")}</div>`).join("")}</div></div>`;
};
const pageItems = pages.map((pg) => item(`p-${slug(pg.name)}`, "page", pg.name, pg.role ? esc(pg.role) : null, `${pg.description ? `<p class="desc">${esc(pg.description)}</p>` : ""}${pageMock(pg)}`)).join("") || `<p class="empty">No pages.</p>`;
const navItem = `<h3 id="nav-h">Navigation</h3>${item("nav-all", "nav", "Navigation", null, `<p class="desc">The left-nav each role sees (chips = who it's visible to).</p>${navMock()}`)}`;
// side-nav to jump to any page (+ the Navigation block)
const pageNav = `<nav class="dnav">${pages.map((pg) => `<a class="dnav-link" href="#p-${slug(pg.name)}" data-target="p-${slug(pg.name)}">${esc(pg.name)}<span class="dnav-ty">${esc(pg.role || "page")}</span></a>`).join("")}<a class="dnav-link" href="#nav-h" data-target="nav-all">Navigation<span class="dnav-ty">menus</span></a></nav>`;
const wirePages = `<div class="datawrap">${pageNav}<div class="datalist">${pageItems}</div></div>`;
const sPages = SCREENS.length
  ? `<h3 id="screens-h">Screens — review the real prototype</h3>
     <p class="desc">The actual generated screens. Filter by role, click the canvas to drop a comment pin, mark each Approve / Request changes, then <b>Copy feedback → <code>/author-refine</code></b>.</p>
     ${screensReview(SCREENS)}
     <details style="margin-top:18px"><summary style="cursor:pointer;color:var(--muted,#6b7280)">Wireframe layout &amp; page structure</summary>${wirePages}</details>
     ${navItem}`
  : `${wirePages}${navItem}`;

// ── Decisions step: (1) open questions the USER must decide, as answerable cards; (2) the design
// decision log parsed into scannable cards (one-line why, detail folded); raw log kept behind a toggle.
function parseOpenQuestions(md) {
  const out = []; let group = "", cur = null;
  const push = () => { if (cur) { out.push(cur); cur = null; } };
  for (const line of String(md).split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)/); if (h) { push(); group = h[1].replace(/\(.*?\)/g, "").trim(); continue; }
    if (/^#\s/.test(line)) { push(); continue; }
    const q = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (q) { push(); cur = { n: +q[1], group, text: q[2].trim() }; continue; }
    if (cur) { if (/^\s*$/.test(line)) push(); else cur.text += " " + line.trim(); }
  }
  push();
  for (const o of out) {
    // the proposed default lives in a "(Default: …)" / "(Assumed …)" parenthetical, or "Critic default = …"
    const m = o.text.match(/\((?:Default|Assumed)[^)]*\)/i) || o.text.match(/Critic default[^.]*\./i);
    o.def = m ? m[0].replace(/^\(|\)$/g, "").replace(/^Default:?\s*/i, "").trim() : null;
    if (m) o.text = (o.text.slice(0, m.index) + o.text.slice(m.index + m[0].length)).replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  }
  return out;
}
function parseDecisionLog(md) {
  const stages = []; let stage = null, dec = null;
  for (const line of String(md).split(/\r?\n/)) {
    let m;
    // "## 2026-07-02 — Stage 2 …" is a STAGE banner; "## D7 — Declines are terminal" is a DECISION
    // (agent-authored logs use ## for individual decisions — parse by shape, not heading level)
    if ((m = line.match(/^##\s+(.*)/)) && /^\d{4}-\d{2}-\d{2}/.test(m[1])) { stage = { title: m[1].trim(), intro: [], decisions: [] }; stages.push(stage); dec = null; continue; }
    if ((m = line.match(/^##+\s+(.*)/))) { if (!stage) { stage = { title: "", intro: [], decisions: [] }; stages.push(stage); } dec = { title: m[1].trim(), body: [] }; stage.decisions.push(dec); continue; }
    if ((m = line.match(/^#\s+(.*)/)) && stages.length) { stage = { title: m[1].trim(), intro: [], decisions: [] }; stages.push(stage); dec = null; continue; }
    if (/^#\s/.test(line)) continue;
    if (dec) dec.body.push(line); else if (stage) stage.intro.push(line);
  }
  return stages;
}
const openQs = openQsMd ? parseOpenQuestions(openQsMd) : [];
const qCard = (o) => {
  const id = `q-${o.n}`;
  const short = o.text.split(/[?.]/)[0].slice(0, 70);
  return `<div class="qcard flag${o.def ? "" : " needs"}" id="${id}" data-kind="decision" data-label="Q${o.n} ${esc(short)}">
    <div class="qhead"><span class="qnum">Q${o.n}</span><span class="qgroup">${esc(o.group)}</span>${o.def ? "" : `<span class="qbadge">needs your answer</span>`}</div>
    <p class="qtext">${esc(o.text)}</p>
    ${o.def ? `<div class="qdefault"><b>Proposed default:</b> ${esc(o.def)}</div>` : ""}
    <div class="rev qrev">${o.def ? `<button class="revbtn ok" title="Go with the proposed default">✓ Accept default</button>` : ""}<button class="revbtn chg" title="Give your own answer">✎ ${o.def ? "Decide differently" : "Answer"}</button><button class="revbtn q" title="Discuss before deciding">? Discuss</button></div>
    <textarea class="cmt" placeholder="Your decision for Q${o.n}…"></textarea>
  </div>`;
};
const qSection = openQs.length ? (() => {
  const sorted = [...openQs].sort((a, b) => (a.def ? 1 : 0) - (b.def ? 1 : 0) || a.n - b.n);
  return `<div class="qsec"><div class="qsechead"><h3>Decisions needed from you <span class="qcount">${openQs.length}</span></h3><span id="qprog" class="qprog"></span></div>
  <p class="lead">These are the open questions the plan could not answer from the BRD. Each was built with the <b>proposed default</b> shown — accepting it changes nothing; answering differently becomes a change request. Everything you set here lands in <b>Copy change-list</b> for <code>/author-refine</code>.</p>
  <div class="qgrid">${sorted.map(qCard).join("")}</div></div>`;
})() : "";
const decStages = decisions ? parseDecisionLog(decisions) : [];
// make the log READABLE for a review team: friendly stage names (not agent codenames), whole-sentence
// whys, and internal codes (Q19, br-*, R7…) rendered as chips — Q-chips jump to the question card.
const AGENT_LABEL = {
  "kf-ba": "Requirements analysis", "kf-architect": "Application architecture", "kf-data-architect": "Data model",
  "kf-workflow-designer": "Workflows", "kf-security-designer": "Roles & permissions", "kf-experience-designer": "Pages & navigation",
  "kf-integration-analyst": "Automations", "kf-coherence-critic": "Whole-app coherence check", "kf-verifier": "Verification",
};
const stageLabel = (t) => {
  const agent = (t.match(/kf-[a-z-]+/) || [])[0];
  const date = (t.match(/^\d{4}-\d{2}-\d{2}/) || [])[0] || "";
  const mid = t.replace(/^\d{4}-\d{2}-\d{2}\s*—\s*/, "").replace(/\s*\([^)]*\)\s*$/, "");
  return { name: (agent && AGENT_LABEL[agent]) || mid, meta: [mid !== ((agent && AGENT_LABEL[agent]) || "") ? mid : "", date].filter(Boolean).join(" · ") };
};
// internal shorthand → chips; Qnn links to its card on the "Your decisions" sub-tab
const CODE_RE = /\b(Q\d{1,2}|br-[a-z0-9-]+|j-[a-z0-9-]+|(?:R|B|NEW-|SEC-|EXP-|INT-C|s)\d{1,2}(?:-[A-Za-z0-9-]+)?)\b/g;
const chipify = (html) => html.replace(CODE_RE, (m) => {
  const q = m.match(/^Q(\d{1,2})$/);
  if (q) return `<a class="refchip qlink" href="#q-${q[1]}" data-q="${q[1]}">${m}</a>`;
  return `<span class="refchip">${m}</span>`;
});
const IMPOSSIBILITY_RE = /\[impossibility\]|not (?:expressible|buildable|supported|natively)|no (?:engine |platform )?primitive|cannot be (?:expressed|built|enforced)|has no mechanism|NOT wirable|unenforceable|(?:known )?live no-op|no (?:conditions? on the live|arithmetic in|time[- ]?(?:based )?trigger)|sequence-only|no targeted send-back/i;
const decCard = (d, si, i) => {
  const id = `dec-${si}-${i}`;
  const body = d.body.join("\n");
  const impossibility = IMPOSSIBILITY_RE.test(body) || IMPOSSIBILITY_RE.test(d.title);
  const whyM = body.match(/\*\*Why:?\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|$)/);
  // full FIRST SENTENCE (never cut mid-clause); add a second one if the first is very short
  let why = "";
  if (whyM) {
    const sentences = whyM[1].trim().replace(/\s+/g, " ").split(/(?<=\.)\s+(?=[A-Z(])/);
    why = sentences[0] + (sentences[0].length < 90 && sentences[1] ? " " + sentences[1] : "");
  }
  const status = (body.match(/\*\*Status:?\*\*\s*([^\n]*)/) || [])[1] || "proposed";
  const superseded = /supersede/i.test(d.title);
  const title = d.title.split(/\s+\(SUPERSEDES/i)[0];
  return `<div class="deccard flag" id="${id}" data-kind="design-decision" data-label="${esc(title.slice(0, 90))}">
    <div class="dechd"><h4>${chipify(esc(title))}</h4>${impossibility ? `<span class="decimp" title="This decision relies on a belief that the platform cannot do something. Such beliefs silently degrade designs and have been wrong before (DEF-4, R7, §1b) — challenge it.">⚠ relies on an impossibility claim</span>` : ""}${superseded ? `<span class="decsup">replaces an earlier decision</span>` : ""}<span class="decstatus">${esc(status.replace(/\.$/, ""))}</span>
      <div class="rev"><button class="revbtn ok" title="Agree">✓</button><button class="revbtn chg" title="Disagree — request a change">✎</button><button class="revbtn q" title="Ask about this">?</button></div></div>
    ${why ? `<p class="decwhy">${chipify(esc(why))}</p>` : ""}
    <details class="decfull"><summary>Full rationale &amp; alternatives considered</summary><div class="mddoc">${chipify(mdToHtml(body))}</div></details>
    <textarea class="cmt" placeholder="What should change about this decision?"></textarea>
  </div>`;
};
const decLogHtml = decStages.map((s, si) => {
  const introTxt = s.intro.join("\n").trim();
  const { name, meta } = stageLabel(s.title);
  return `<div class="decstage"><h3 class="decstageh">${esc(name)}${meta ? ` <span class="stagemeta">${esc(meta)}</span>` : ""}</h3>
    ${s.decisions.length ? s.decisions.map((d, i) => decCard(d, si, i)).join("") : (introTxt ? `<details class="decfull solo"><summary>Stage notes</summary><div class="mddoc">${chipify(mdToHtml(introTxt))}</div></details>` : "")}</div>`;
}).join("");
const impossibilityCount = decStages.reduce((n, st) => n + st.decisions.filter((d) => IMPOSSIBILITY_RE.test(d.body.join("\n")) || IMPOSSIBILITY_RE.test(d.title)).length, 0);
const impCallout = impossibilityCount ? `<div class="impcall"><b>⚠ ${impossibilityCount} decision${impossibilityCount > 1 ? "s" : ""} rely on impossibility claims</b> — beliefs that the platform cannot do something. Three such beliefs have been proven false before (child tables, cross-flow aggregates, formula stripping), each silently degrading designs. The flagged cards below deserve a platform owner's challenge; pending claims live in <code>CONFIRM-QUEUE.md</code>.</div>` : "";
const decLegend = `${impCallout}<div class="declegend"><b>How to read the codes:</b> <span class="refchip">Q19</span> an open question — click it to jump to the question card · <span class="refchip">br-…</span> a business rule from your BRD · <span class="refchip">j-…</span> a user journey · <span class="refchip">R7</span>/<span class="refchip">SEC-1</span>/<span class="refchip">EXP-2</span>/<span class="refchip">INT-C1</span> tracked build risks and their resolutions · “waiver” = a known platform limitation accepted for now.</div>`;
// one Decisions wizard step, two sub-tabs
const subUser = qSection || `<p class="empty">No open questions — nothing needs your decision.</p>`;
const subLog = decisions
  ? `<div class="dechead"><h3>Design decisions already made <span class="qcount">${decStages.reduce((n, s) => n + s.decisions.length, 0)}</span></h3><button id="dectoggle" class="mini2">View raw log</button></div>
  <p class="lead">For reference — what the design chose and <b>why</b>. The one-liner is the gist; expand a card for the full rationale and the alternatives that were rejected. Nothing here needs an answer, but you can flag any decision you disagree with.</p>
  ${decLegend}<div id="decrendered">${decLogHtml}</div><pre class="decisions" id="decraw" style="display:none">${esc(decisions)}</pre>`
  : `<p class="empty">No decision log found (pass decisions.md as arg 2).</p>`;
const sDecisions = `<div class="subtabs"><button class="subtab on" data-sub="user">Your decisions <span class="qcount">${openQs.length}</span></button><button class="subtab" data-sub="log">Decision log <span class="qcount">${decStages.reduce((n, s) => n + s.decisions.length, 0)}</span></button></div>
<div class="subpane" id="sub-user">${subUser}</div><div class="subpane" id="sub-log" style="display:none">${subLog}</div>`;

const expBanner = autoExperience
  ? `<div class="warn info"><b>ℹ Experience layer auto-generated.</b> This plan arrived with ${expBefore.pages ? "" : "no pages"}${!expBefore.pages && !expBefore.nav ? " and " : ""}${expBefore.nav ? "" : "no nav"}, so a <b>baseline</b> (a landing page per role + navigation) is shown below and will be built by default. Design richer pages via <code>kf-experience-designer</code> or <code>/author-refine "design pages, nav and a landing per role"</code>.</div>`
  : "";

// The BRD is the front page (Overview folded in). Two views: BRIEF (exec summary + user stories) and
// DETAILED — an extensive, customer-facing document formatted for review + sign-off.
const sBRD = (() => {
  const name = esc(ir.app?.name || "Application");
  const d = ir.domain || {};
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const matches = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0); };
  const isProc = (m) => processes.some((p) => p.name === m);
  const clip = (a, n) => a.slice(0, n).map(esc).join(", ") + (a.length > n ? ` and ${a.length - n} more` : "");
  const acc = (rn) => { const ps = perms.filter((p) => p.role === rn); return { ed: [...new Set(ps.filter((p) => /edit|manage|initi/i.test(p.level || "")).map((p) => p.model))], vw: [...new Set(ps.filter((p) => !/edit|manage|initi/i.test(p.level || "")).map((p) => p.model))] }; };
  const approvalsFor = (rn) => { const out = []; processes.forEach((p) => (p.workflow?.steps || []).forEach((s, i) => { if (i > 0 && s.actor && matches(s.actor, rn)) out.push({ proc: p.name, step: s.name || s.label, dec: s.decision }); })); return out; };
  const topEntities = forms.filter((f) => !f.childOf).map((f) => f.name);
  const purpose = d.summary || d.purpose || `${name} lets the team run its work end to end — setting up the core records, moving requests through the right approvals, and giving every role a place to see what needs their attention.`;
  const goals = (d.journeys && d.journeys.length) ? d.journeys.map((j) => esc(j.outcome || j.name || j.title || j))
    : processes.slice(0, 6).map((p) => `${esc(p.name)} requests are captured, approved, and completed with a clear audit trail`);

  // ── stats: colorful KPI tiles (validated categorical hues; numbers stay in ink, labels carry identity) ──
  const BRDC = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
  const roleColor = (i) => BRDC[i % BRDC.length];
  const statTiles = [
    ["⬡", "flows", forms.length], ["⟳", "processes", processes.length], ["▤", "data forms", dataForms.length],
    ["☰", "lists", lists.length], ["◉", "roles", roles.length], ["✦", "permissions", perms.length], ["▦", "pages", pages.length],
  ];
  const stats = `<div class="stats2">${statTiles.map(([ic, lb, n], i) => `<div class="stt" style="--sc:${BRDC[i % BRDC.length]}"><span class="stticon">${ic}</span><div class="sttx"><b>${n}</b><span class="stl">${lb}</span></div></div>`).join("")}</div>`;

  // ── BRIEF view — user stories ──
  const roleAvatar = (rn, i) => `<i class="ravat" style="--rc:${roleColor(i)}">${esc(String(rn).trim().slice(0, 1).toUpperCase())}</i>`;
  const storyBlocks = roles.map((r, ri) => {
    const rn = r.name || r; const a = acc(rn); if (!a.ed.length && !a.vw.length) return "";
    const initProcs = a.ed.filter(isProc); const approvals = approvalsFor(rn);
    const st = [];
    initProcs.slice(0, 6).forEach((p) => st.push(`raise a <b>${esc(p)}</b> and track it to completion, so my requests are captured and progressed`));
    approvals.slice(0, 8).forEach((a) => st.push(`${a.dec && a.dec.length ? a.dec.map((x) => esc(x).toLowerCase()).join(" or ") : "review"} a <b>${esc(a.proc)}</b> at the <i>${esc(a.step)}</i> stage, so work moves forward with the right oversight`));
    if (a.ed.some((m) => !isProc(m))) st.push(`maintain ${clip(a.ed.filter((m) => !isProc(m)), 6)}, so the underlying records stay accurate`);
    if (a.vw.length) st.push(`see ${clip(a.vw, 6)} read-only, so I stay informed without changing them`);
    st.push(`open a dashboard of my ${initProcs[0] ? esc(initProcs[0]) : "work"} and pending items, so I know what needs my attention`);
    return `<div class="story" style="--rc:${roleColor(ri)}"><div class="story-role">${roleAvatar(rn, ri)}<span>As <b>${esc(rn)}</b>, I want to…</span></div><ul>${[...new Set(st)].map((s) => `<li>${s}</li>`).join("")}</ul></div>`;
  }).filter(Boolean).join("");
  const masthead = (kind, sub) => `<div class="brdmast"><div class="brdeye">Business Requirements · ${kind}</div><h3>${name}</h3>
    <div class="brdmeta"><span class="mchip warn">Draft — awaiting sign-off</span><span class="mchip">Version 1.0</span><span class="mchip">Prepared by kf-author · Design Review</span></div>
    <p class="brd-sub">${sub}</p></div>`;
  const briefBody = `${masthead("Brief", `Executive summary + requirements as user stories. Switch to <b>Detailed</b> for the full, sign-off-ready document.`)}
    ${expBanner}${stats}
    <h4>Purpose</h4><p class="lede">${esc(purpose)}</p>
    <h4>Who uses it</h4><div class="whochips">${roles.map((r, i) => `<span class="rolechip" style="--rc:${roleColor(i)}">${roleAvatar(r.name || r, i)}${esc(r.name || r)}</span>`).join("")}</div>
    <h4>User stories</h4>${storyBlocks || "<p>No roles/permissions yet.</p>"}
    <h4>Success looks like</h4><ul class="goals">${goals.map((g) => `<li>${g}</li>`).join("")}</ul>`;

  // ── DETAILED view — full BRD for sign-off ──
  const stakeholderRows = roles.map((r) => { const a = acc(r.name || r); const resp = []; if (a.ed.length) resp.push(`manages ${clip(a.ed, 6)}`); if (a.vw.length) resp.push(`views ${clip(a.vw, 6)}`); return `<tr><td><b>${esc(r.name || r)}</b></td><td>${resp.join("; ") || "—"}</td></tr>`; }).join("");
  const storyDetailed = roles.map((r, ri) => {
    const rn = r.name || r; const a = acc(rn); if (!a.ed.length && !a.vw.length) return "";
    const initProcs = a.ed.filter(isProc); const approvals = approvalsFor(rn); const S = [];
    initProcs.slice(0, 6).forEach((p) => S.push({ t: `raise and submit a <b>${esc(p)}</b>`, ac: [`Given ${esc(rn)} is signed in, when they complete and submit a ${esc(p)}, then it enters the ${esc(p)} approval workflow`, `the new ${esc(p)} appears on ${esc(rn)}'s dashboard and can be tracked to completion`] }));
    approvals.slice(0, 8).forEach((x) => S.push({ t: `${x.dec && x.dec.length ? x.dec.map((y) => esc(y).toLowerCase()).join(" or ") : "review"} a <b>${esc(x.proc)}</b> at <i>${esc(x.step)}</i>`, ac: [`Given a ${esc(x.proc)} is awaiting the ${esc(x.step)} step, when ${esc(rn)} ${x.dec && x.dec.length ? "selects " + x.dec.map(esc).join(" / ") : "acts"}, then it advances or returns to the initiator`, `the initiator is notified of the outcome`] }));
    if (a.ed.some((m) => !isProc(m))) S.push({ t: `maintain ${clip(a.ed.filter((m) => !isProc(m)), 6)}`, ac: [`Given ${esc(rn)} has edit access, when they add or update a record, then it is saved and available to other authorized roles`] });
    if (a.vw.length) S.push({ t: `view ${clip(a.vw, 6)} without editing`, ac: [`Given ${esc(rn)} has view-only access, when they open the record, then all fields are read-only`] });
    S.push({ t: `see a personal dashboard`, ac: [`Given ${esc(rn)} signs in, then their landing page shows their pending items and key metrics`] });
    return `<div class="story" style="--rc:${roleColor(ri)}"><div class="story-role">${roleAvatar(rn, ri)}<span>${esc(rn)}</span></div><ol class="us">${S.map((s) => `<li>As ${esc(rn)}, I want to ${s.t}.<ul class="ac">${s.ac.map((c) => `<li>${c}</li>`).join("")}</ul></li>`).join("")}</ol></div>`;
  }).filter(Boolean).join("");
  const frRows = forms.map((f, i) => { const fn = (f.fields || []).map((x) => x.name); const kids = forms.filter((c) => formName(c.childOf) === f.name).map((c) => c.name); const refs = [...new Set((f.fields || []).filter((x) => x.ref).map((x) => formName(x.ref) || x.ref))]; return `<tr><td>FR-${i + 1}</td><td><b>${esc(f.name)}</b></td><td>${esc(f.flowType || "Form")}</td><td>captures ${clip(fn, 10)}${kids.length ? `; line items: ${clip(kids, 4)}` : ""}${refs.length ? `; links to ${clip(refs, 5)}` : ""}</td></tr>`; }).join("");
  const ruleItems = []; forms.forEach((f) => (f.fields || []).forEach((x) => { if (x.formula) ruleItems.push(`<b>${esc(f.name)}.${esc(x.name)}</b> = <code>${esc(x.formula)}</code>`); else if (x.aggregate) ruleItems.push(`<b>${esc(f.name)}.${esc(x.name)}</b> totals ${esc(x.aggregate.over)}${x.aggregate.field ? "." + esc(x.aggregate.field) : ""}`); else if (x.lookup && x.lookup.length) ruleItems.push(`Selecting a <b>${esc(formName(x.ref) || x.ref || x.name)}</b> on ${esc(f.name)} auto-fills ${x.lookup.map((l) => esc(l.name || l)).join(", ")}`); }));
  const wfRows = processes.map((p, i) => { const steps = (p.workflow?.steps || []).map((s) => `${esc(s.name || s.label)}${s.actor ? ` <i>(${esc(s.actor)})</i>` : ""}`); const decs = (p.workflow?.steps || []).filter((s) => s.decision && s.decision.length).map((s) => `${esc(s.name || s.label)} → ${s.decision.map(esc).join(" / ")}`); return `<tr><td>WF-${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${steps.join(" → ") || "single step"}${decs.length ? `<br><span class="muted2">decisions: ${decs.join("; ")}</span>` : ""}</td></tr>`; }).join("");
  const accessRows = roles.map((r) => { const a = acc(r.name || r); return `<tr><td><b>${esc(r.name || r)}</b></td><td>${a.ed.length ? clip(a.ed, 12) : "—"}</td><td>${a.vw.length ? clip(a.vw, 12) : "—"}</td></tr>`; }).join("");
  const reportRows = pages.map((pg) => `<tr><td><b>${esc(pg.name)}</b></td><td>${esc(pg.role || "—")}</td><td>${(pg.cards || []).map((c) => esc(c.label || c.view)).join(", ") || "—"}</td></tr>`).join("");
  const oq = suspects.slice(0, 20).map((s) => `<li>Confirm whether <b>${esc(s.form)}.${esc(s.field)}</b> is a calculated value (and its formula) or a manual input.</li>`).join("")
    + `<li>Confirm integrations with external / legacy systems (in or out of scope).</li><li>Confirm the data-migration approach for existing records.</li><li>Confirm notification recipients &amp; channels (email / in-app) per workflow step.</li>`;
  const detailedBody = `${masthead("Full document", `Prepared for customer review and sign-off. Section references map to the design in the other tabs.`)}
    <table class="brd-tbl doc-ctl"><tbody><tr><td>Application</td><td><b>${name}</b></td></tr><tr><td>Document</td><td>Business Requirements Document (BRD)</td></tr><tr><td>Version</td><td>Draft 1.0</td></tr></tbody></table>
    <h4>1. Introduction &amp; Purpose</h4><p>${esc(purpose)} This document specifies the business requirements to be reviewed and approved before the application is built.</p>
    <h4>2. Scope</h4><p><b>In scope</b></p><ul><li><b>Processes (${processes.length}):</b> ${clip(processes.map((p) => p.name), 24)}</li><li><b>Data entities (${topEntities.length}):</b> ${clip(topEntities, 24)}</li>${lists.length ? `<li><b>Master lists (${lists.length}):</b> ${clip(lists.map((l) => l.name || l), 16)}</li>` : ""}<li>Role-based dashboards &amp; navigation for ${roles.length} roles</li></ul>
    <p><b>Out of scope</b> <span class="muted2">(confirm at sign-off)</span></p><ul><li>Integrations with external / third-party systems unless separately specified</li><li>Migration of historical / legacy data</li><li>Custom mobile apps beyond the Kissflow application</li><li>Advanced BI / analytics beyond the in-app dashboards</li></ul>
    <h4>3. Stakeholders &amp; Roles</h4><table class="brd-tbl"><thead><tr><th>Role</th><th>Responsibilities</th></tr></thead><tbody>${stakeholderRows}</tbody></table>
    <h4>4. User Stories &amp; Acceptance Criteria</h4>${storyDetailed || "<p>—</p>"}
    <h4>5. Functional Requirements</h4><table class="brd-tbl"><thead><tr><th>Ref</th><th>Entity</th><th>Type</th><th>The system shall capture / do</th></tr></thead><tbody>${frRows}</tbody></table>
    <h4>6. Business Rules &amp; Calculations</h4>${ruleItems.length ? `<ul>${ruleItems.map((r) => `<li>${r}</li>`).join("")}</ul>` : "<p>No calculated fields defined yet.</p>"}<p class="muted2">Mandatory fields are enforced as marked (*) in the Data &amp; Fields tab.</p>
    <h4>7. Workflows &amp; Approvals</h4><table class="brd-tbl"><thead><tr><th>Ref</th><th>Process</th><th>Stages (actor) &amp; decisions</th></tr></thead><tbody>${wfRows || `<tr><td colspan="3">No processes.</td></tr>`}</tbody></table>
    <h4>8. Access Control</h4><table class="brd-tbl"><thead><tr><th>Role</th><th>Create / Edit</th><th>View</th></tr></thead><tbody>${accessRows}</tbody></table>
    <h4>9. Reporting &amp; Dashboards</h4><table class="brd-tbl"><thead><tr><th>Page</th><th>Role</th><th>Content</th></tr></thead><tbody>${reportRows || `<tr><td colspan="3">No pages.</td></tr>`}</tbody></table>
    <h4>10. Data Model Overview</h4><p>${topEntities.length} top-level entities and ${forms.filter((f) => f.childOf).length} child tables, linked by ${forms.reduce((n, f) => n + (f.fields || []).filter((x) => x.ref).length, 0)} lookups. Full detail in the <b>Data Model</b> and <b>Data &amp; Fields</b> tabs.</p>
    <h4>11. Assumptions, Constraints &amp; Non-Functional</h4><ul><li>Built on Kissflow low-code; <b>published processes are immutable</b> — workflows must be final before build.</li><li>Access is role-based; users see only what their role permits.</li><li>Standard Kissflow security, audit trail and availability apply.</li>${autoExperience ? "<li>Per-role dashboards &amp; navigation start from an auto-generated baseline and will be refined.</li>" : ""}</ul>
    <h4>12. Open Questions</h4><ul>${oq}</ul>`;

  return `<div class="brdbar"><div class="brdtabs"><button class="brdtab on" data-brd="brief">Brief</button><button class="brdtab" data-brd="detailed">Detailed — for sign-off</button></div><div class="brdtools"><button id="brddl" title="Download">⤓ Download</button><button id="brdprint" title="Print">⎙ Print</button></div></div>
    <div class="brd brdview" id="brd-brief">${briefBody}</div>
    <div class="brd brdview" id="brd-detailed" style="display:none">${detailedBody}</div>`;
})();

// Flow-stitch automations — when one flow completes, the next artifact is auto created/updated.
const sAutomations = (() => {
  const autos = ir.automations || [];
  const ext = ir.external_flagged || autos.filter((a) => (a.channel || "internal") === "external");
  const internal = autos.filter((a) => (a.channel || "internal") !== "external");
  if (!autos.length && !ext.length) return `<p class="muted2">No flow-stitch automations defined yet. Run <b>kf-integration-analyst</b> to uncover where approving one flow should auto-create or update another — e.g. <i>approve request → create payment</i>, <i>valuation approved → update NAV</i>.</p>`;
  // render each stitch as a Kissflow-integration-style canvas: trigger node → connector → action node
  const flowDisp = (s) => { const f = forms.find((x) => x.id === s || slug(x.name).toLowerCase() === String(s).toLowerCase()); return f ? f.name : s; };
  const EVENT_LABEL = { completed: "Item completed", created: "Item created", submitted: "Item submitted", advances: "Item advances a step", updated: "Item advances a step" };
  const ACTION_META = {
    update: { icon: "✎", label: "Update an item" }, create: { icon: "＋", label: "Create an item" },
    notify: { icon: "✉", label: "Send an email" }, email: { icon: "✉", label: "Send an email" },
  };
  const firstSentence = (s) => String(s || "").split(/(?<=\.)\s+/)[0];
  const canvas = (a) => {
    const ev = EVENT_LABEL[(a.source?.event || "completed").toLowerCase()] || a.source?.event || "Item completed";
    const am = ACTION_META[(a.action?.type || "").toLowerCase()] || { icon: "⚙", label: a.action?.type || "action" };
    const email = a.action?.email;
    const map = a.action?.field_map || {};
    const mapRows = Object.entries(map).map(([t, s]) => `<div class="amap"><span class="amt">${esc(t)}</span><span class="ama">←</span><span class="ams">${esc(s)}</span></div>`).join("");
    const actionBody = email
      ? `<div class="ansub">to <b>${esc(firstSentence(email.to).slice(0, 90))}</b></div>
         ${email.subject_template ? `<div class="amap"><span class="amt">Subject</span><span class="ama"></span><span class="ams">${esc(email.subject_template)}</span></div>` : ""}
         ${(email.body_fields || []).length ? `<div class="anfields">${email.body_fields.map((f) => `<span class="refchip">${esc(String(f).split(" (")[0])}</span>`).join("")}</div>` : ""}`
      : `<div class="ansub">in <b>${esc(flowDisp(a.action?.target_flow))}</b>${a.action?.key_field ? ` · match by <code>${esc(a.action.key_field)}</code>` : ""}</div>${mapRows ? `<div class="amaps">${mapRows}</div>` : ""}`;
    const detailBits = [["Why", a.rationale], ["Conditions", a.condition_posture], ["Re-run safety", a.idempotency]].filter(([, v]) => v);
    const limits = (a.limits || []).length ? `<p><b>Known limits</b></p><ul>${a.limits.map((l) => `<li>${chipify(esc(l))}</li>`).join("")}</ul>` : "";
    return `<div class="autocard flag" id="${esc(a.id || slug(a.name))}" data-kind="automation" data-label="${esc(a.name)}">
      <div class="autohd"><h4>${esc(a.name)}</h4><span class="decstatus">internal · built</span>
        <div class="rev"><button class="revbtn ok" title="Looks right">✓</button><button class="revbtn chg" title="Request a change">✎</button><button class="revbtn q" title="Ask">?</button></div></div>
      <div class="autorail">
        <div class="autonode trig"><span class="anicon">⚡</span><div class="anbody"><div class="ankind">When this happens</div><div class="antitle">${esc(ev)}</div><div class="ansub">in <b>${esc(flowDisp(a.source?.flow))}</b></div></div></div>
        <div class="autolink"><i></i></div>
        <div class="autonode act"><span class="anicon">${am.icon}</span><div class="anbody"><div class="ankind">Do this</div><div class="antitle">${esc(am.label)}</div>${actionBody}</div></div>
      </div>
      ${a.rationale ? `<p class="decwhy">${chipify(esc(firstSentence(a.rationale)))}</p>` : ""}
      ${detailBits.length || limits ? `<details class="decfull"><summary>Full rationale, conditions &amp; limits</summary>${detailBits.map(([k, v]) => `<p><b>${k}</b>: ${chipify(esc(v))}</p>`).join("")}${limits}</details>` : ""}
      <textarea class="cmt" placeholder="What should change about this automation?"></textarea>
    </div>`;
  };
  const extRow = (e) => `<tr><td>${esc(e.trigger || e.source?.flow || "")}</td><td>${esc(e.action || "")}</td><td class="muted2">${esc(e.note || "")}</td></tr>`;
  return `<p class="muted2">When one flow completes or is approved, the next artifact is created or updated automatically — shown below the way they'll appear as Kissflow integrations: a trigger, wired to an action. <b>Internal</b> stitches are built into the app; <b>external</b> ones are flagged for the integration layer (email/SMS/ERP) and not built.</p>
  <div class="autogrid">${internal.map(canvas).join("") || `<p class="empty">none</p>`}</div>
  ${ext.length ? `<h3 style="margin-top:20px">External &mdash; flagged, not built (${ext.length})</h3><table class="brd-tbl"><thead><tr><th>Trigger</th><th>Action</th><th>Note</th></tr></thead><tbody>${ext.map(extRow).join("")}</tbody></table>` : ""}`;
})();

const secs = [
  ["brd", "BRD", sBRD],
  ["diagram", "Data Model", sDiagram],
  ["data", "Data & Fields", `<div class="datawrap"><nav class="dnav">${forms.map((f) => `<a class="dnav-link" href="#e-${slug(f.name)}" data-target="e-${slug(f.name)}">${esc(f.name)}<span class="dnav-ty">${esc((f.flowType || "Form") === "Process" ? "Proc" : (f.flowType || "Form"))}</span></a>`).join("")}</nav><div class="datalist">${sData}</div></div>`],
  ["logic", "Business Logic", sLogic],
  ["workflow", "Workflows", sFlow],
  ["roles", "Roles & Permissions", sRoles],
  ["pages", "Pages & Nav", sPages],
  ["automations", "Automations", sAutomations],
  ["decisions", "Decisions", sDecisions],
];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design Review — ${esc(ir.app?.name || "App")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f5f7fc;--card:#ffffff;--card2:#ffffff;--brd:#e6eaf2;--line:#eef1f7;--kf-color-gray-100:#f3f4f6;
  --ink:#0f1836;--ink-soft:#334155;--muted:#647089;
  --primary:#5a5df2;--primary-2:#8b6cf6;--primary-soft:#ecebfe;--primary-ink:#4b3fd6;
  --grad:linear-gradient(120deg,#5a5df2,#8b6cf6);
  --ok:#0fa968;--ok-soft:#e2f7ee;--chg:#f59e0b;--q:#7c3aed;
  --violet:#7c3aed;--emerald:#0fa968;--amber:#f59e0b;--rose:#f43f5e;--cyan:#06b6d4;
  --r:16px;--top:104px;--bot:60px;--glass:none;
  --font:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --serif:"Plus Jakarta Sans",-apple-system,system-ui,sans-serif;
  --sh-sm:0 1px 2px rgba(15,24,54,.05),0 1px 1px rgba(15,24,54,.03);
  --sh:0 4px 10px -4px rgba(15,24,54,.10),0 12px 28px -14px rgba(15,24,54,.16)}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:calc(var(--top) + 18px)}html,body{overflow-x:clip}
body{margin:0;font:15px/1.6 var(--font);color:var(--ink);background:var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:
  radial-gradient(55vw 42vw at 100% -5%,rgba(139,108,246,.16),transparent 60%),
  radial-gradient(48vw 40vw at -5% 8%,rgba(90,93,242,.10),transparent 55%),
  radial-gradient(50vw 45vw at 60% 108%,rgba(124,58,237,.09),transparent 60%)}
/* wizard chrome */
header.top{position:sticky;top:0;z-index:40;background:#0a1230;box-shadow:0 1px 0 rgba(15,24,54,.06)}
.topin{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 30px 11px}
.brand{font-weight:800;font-size:19px;letter-spacing:-.03em;white-space:nowrap;color:#fff}.brand span{color:rgba(255,255,255,.5);font-weight:600;font-size:13px;margin-left:10px}
.stepper{display:flex;gap:6px;padding:9px 30px 11px;background:color-mix(in srgb,var(--kf-color-gray-100),#d8dfff);border-top:1px solid rgba(255,255,255,.06)}
.pill{flex:1 1 auto;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;background:transparent;border-radius:11px;padding:8px 12px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap;transition:all .2s cubic-bezier(.22,1,.36,1)}
.pill:hover{color:var(--ink);background:#fff}
.pill .pnum{width:20px;height:20px;border-radius:50%;background:#fff;border:1px solid var(--brd);color:var(--muted);display:grid;place-items:center;font-size:11px;font-weight:800;transition:all .2s}
.pill.on{color:#fff;background:var(--grad);border-color:transparent;box-shadow:0 6px 16px -6px rgba(90,93,242,.55)}.pill.on .pnum{background:rgba(255,255,255,.28);border-color:transparent;color:#fff}
.pill.done{color:var(--ink-soft)}.pill.done .pnum{background:var(--ok-soft);border-color:transparent;color:var(--ok)}
.pill.done .pnum{background:var(--ok);color:#fff}
.pill .pflag{display:none;background:var(--chg);color:#fff;border-radius:999px;padding:0 6px;font-size:11px}
.pill.hasflag .pflag{display:inline}
#filter{border:1px solid var(--brd);border-radius:10px;padding:7px 11px;font:inherit;background:var(--card2);width:190px;flex:none}
main{max-width:1560px;margin:0 auto;padding:30px 28px 64px}
.step{display:none}.step.active{display:block;animation:fade .28s cubic-bezier(.22,1,.36,1)}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.step>h2{font-weight:800;font-size:clamp(24px,3vw,31px);letter-spacing:-.03em;margin:0 0 22px;color:var(--ink)}
/* Data Model step breaks out to full width; compact one-line header maximises canvas */
#s-diagram{width:96vw;margin-left:calc(50% - 48vw)}
#nav-all{width:96vw;margin-left:calc(50% - 48vw)}
#s-diagram>h2{display:none}
.dbar{display:flex;align-items:baseline;gap:14px 18px;flex-wrap:wrap;padding:0 8px;margin-bottom:10px}
.dbar .dtitle{font-weight:800;font-size:clamp(21px,2.4vw,27px);letter-spacing:-.03em;margin:0}
.dbar .legend{margin:0}.dbar .hint{margin:0;color:var(--muted);font-size:12px}
#s-diagram .dnote{padding-left:8px}
/* items + flags */
.item{background:var(--card2);border:1px solid var(--brd);border-left:3px solid var(--line);border-radius:var(--r);padding:16px 20px;margin-bottom:12px;box-shadow:var(--sh-sm);transition:border-color .18s,box-shadow .18s,transform .18s;scroll-margin-top:calc(var(--top) + 12px)}
.item:hover{box-shadow:var(--sh);border-left-color:var(--primary);transform:translateY(-2px)}
.item.hidden{display:none}
.flag[data-state=ok]{border-left-color:var(--ok)}.flag[data-state=chg]{border-left-color:var(--chg)}.flag[data-state=q]{border-left-color:var(--q)}
.ihead{display:flex;align-items:center;justify-content:space-between;gap:12px}.ihead h4{margin:0;font-size:15.5px;font-weight:700;letter-spacing:-.01em}
.tag{font-size:11px;font-weight:700;background:var(--primary-soft);color:var(--primary);padding:2px 8px;border-radius:999px;margin-left:6px;text-decoration:none}
.rev{display:flex;flex-shrink:0}
.rev button{border:1px solid var(--brd);background:var(--card2);border-radius:8px;padding:4px 9px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;margin-left:5px}
.rev .ok.on{background:var(--ok);color:#fff;border-color:var(--ok)}.rev .chg.on{background:var(--chg);color:#fff;border-color:var(--chg)}.rev .q.on{background:var(--q);color:#fff;border-color:var(--q)}
.cmt{display:none;width:100%;margin-top:10px;border:1px solid var(--line);border-radius:10px;padding:9px 11px;font:inherit;resize:vertical;min-height:52px}
.flag[data-state=chg] > .cmt,.flag[data-state=q] > .cmt{display:block}
/* Data & Fields — entity left-nav */
.datawrap{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px;align-items:start}
.dnav{position:sticky;top:calc(var(--top) + 12px);max-height:calc(100vh - var(--top) - 96px);overflow:auto;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--brd);border-radius:14px;padding:8px;box-shadow:0 12px 34px -24px rgba(30,41,59,.5)}
.item.flag,.qcard,.deccard,.autocard,#nav-h{scroll-margin-top:170px}/* anchors land BELOW the sticky header+pills */
.dnav-link{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none}
.dnav-link:hover{background:rgba(255,255,255,.65)}
.dnav-link.on{background:var(--grad);color:#fff;box-shadow:0 6px 14px -8px rgba(38,54,95,.7)}
.dnav-ty{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase}.dnav-link.on .dnav-ty{color:rgba(255,255,255,.85)}
@media(max-width:820px){.datawrap{grid-template-columns:1fr}.dnav{position:static;max-height:none;display:flex;flex-wrap:wrap;gap:4px}.dnav-link{border:1px solid var(--brd)}}
.flds{margin-top:10px;border-top:1px solid #f1f5f9}
.fld{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:6px 8px;border-bottom:1px solid #f1f5f9;border-left:3px solid transparent;border-radius:6px}
.fld.islookup{background:rgba(38,54,95,.055)}
.fld:hover{background:#f8fafc}.fld[data-state=ok]{border-left-color:var(--ok)}.fld[data-state=chg]{border-left-color:var(--chg);background:#fffbeb}.fld[data-state=q]{border-left-color:var(--q);background:#faf5ff}
.fmain{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;min-width:0}
.fn{font-weight:600}.fty{color:var(--primary);font-weight:600;font-size:12.5px}.fmeta{color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
.frev{opacity:.35;transition:opacity .12s}.fld:hover .frev,.fld[data-state] .frev{opacity:1}.frev button{padding:2px 7px;margin-left:4px}.fld .cmt{grid-column:1/-1}
.missblock{margin-top:20px;background:rgba(255,251,235,.55);border:1px solid #fcd34d;border-radius:var(--r);padding:14px 18px}
.missblock h3{margin:0 0 6px;font-size:15px;color:#92400e}
.misscount{background:var(--chg);color:#fff;border-radius:999px;padding:1px 9px;font-size:12px;margin-left:6px;font-weight:800}
.missblock .flds{border-top:1px solid #fde68a}.fld.miss:hover{background:rgba(255,255,255,.6)}
.req{color:#ef4444}code{background:#f1f5f9;padding:1px 5px;border-radius:5px;font-size:12px;overflow-wrap:anywhere;word-break:break-word}
.kids,.rel{margin-top:8px;color:var(--muted);font-size:12.5px}
.steps{margin:6px 0 0;padding-left:18px}.steps li{margin:3px 0}.actor{color:var(--primary);font-weight:600}.dec{color:var(--muted);font-size:12px}
.steptext{margin-top:8px;color:var(--muted);font-size:12.5px}.steptext summary{cursor:pointer}
.flow{overflow:auto;background:var(--card2);border:1px solid var(--brd);border-radius:12px;padding:10px}
.stats{display:flex;gap:20px;flex-wrap:wrap;background:var(--card);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--brd);border-radius:var(--r);padding:16px 20px;margin-bottom:12px;box-shadow:0 12px 34px -24px rgba(30,41,59,.5)}.stats b{font-size:22px;display:block}
.lead{color:var(--muted)}
/* permissions matrix — frozen header row + frozen role column, aligned cells */
.permwrap{max-height:calc(100vh - 220px);overflow:auto;border:1px solid var(--brd);border-radius:14px;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);box-shadow:0 12px 34px -24px rgba(30,41,59,.5)}
.permgrid{width:max-content;min-width:100%}
.permhead,.permrow{display:grid;grid-template-columns:230px repeat(var(--cols),42px)}
.permhead{position:sticky;top:0;z-index:3}
.permhead .ph{display:flex;align-items:flex-end;justify-content:center;border-left:1px solid var(--line);background:var(--card2);padding:8px 0}
.permhead .ph span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;color:var(--muted);font-weight:600;white-space:nowrap}
.ph0,.rc0{position:sticky;left:0;background:var(--card2)}
.permhead .ph0{z-index:4;display:flex;align-items:flex-end;font-weight:800;padding:10px;border-right:1px solid var(--line)}
.permrow{border-top:1px solid var(--line)}
.permrow .rc0{z-index:2;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:5px;justify-content:center;padding:8px 10px}
.permrow:hover{background:rgba(38,54,95,.04)}
.permrow[data-state=chg]{background:#fffbeb}.permrow[data-state=q]{background:#faf5ff}.permrow[data-state=ok]{background:#f0fdf4}
.permrow[data-state] .rc0,.permrow:hover .rc0{background:inherit}
.rcname{font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
.rrev{display:flex;gap:4px}.rrev button{padding:2px 7px;margin:0}
.pcell{display:grid;place-items:center;height:46px;border-left:1px solid var(--line);font-size:11px;font-weight:800}
.pcell.e{background:var(--primary-soft);color:var(--primary)}.pcell.v{background:#eef1f6;color:#64748b}.pcell.n::after{content:"·";color:#cbd5e1}
.permrow .cmt{grid-column:1/-1;position:sticky;left:10px;width:min(560px,88vw);margin:2px 0 10px 10px}
.pk{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;font-size:11px;font-weight:800;vertical-align:-4px}.pk.e{background:var(--primary-soft);color:var(--primary)}.pk.v{background:#eef1f6;color:#64748b}
.desc{color:var(--muted);margin:2px 0 0}
.empty{color:var(--muted);font-style:italic}.decisions{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--card2);border:1px solid var(--brd);border-radius:var(--r);padding:16px;font-size:13px}
/* decisions step: open-question cards */
.qsec{margin-bottom:28px}.qsechead{display:flex;align-items:baseline;gap:12px}.qsechead h3{margin:0 0 6px}
.qcount{display:inline-block;min-width:22px;text-align:center;background:var(--card2);border:1px solid var(--brd);border-radius:11px;padding:1px 7px;font-size:12px;color:var(--muted);font-weight:600}
.qprog{margin-left:auto;font-size:13px;color:var(--muted);font-weight:600}
.qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-top:10px}
.qcard{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.qcard.needs{border-left:3px solid #d97706}
.qhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.qnum{font-weight:700;font-size:13px;background:var(--card2);border:1px solid var(--brd);border-radius:6px;padding:1px 7px}
.qgroup{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.qbadge{font-size:11px;font-weight:700;color:#d97706;border:1px solid #d97706;border-radius:6px;padding:1px 7px;margin-left:auto}
.qtext{margin:0;font-size:13.5px;line-height:1.45}
.qdefault{font-size:12.5px;background:var(--card2);border:1px dashed var(--brd);border-radius:8px;padding:7px 10px;line-height:1.4}
.qrev{display:flex;gap:6px;flex-wrap:wrap}.qrev .revbtn{font-size:12px}
.qcard[data-state="ok"]{border-color:#16a34a;box-shadow:0 0 0 1px #16a34a33}
.qcard[data-state="chg"],.qcard[data-state="q"]{border-color:#d97706;box-shadow:0 0 0 1px #d9770633}
/* decisions step: design-decision log cards */
.decstage{margin:18px 0}.decstageh{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--brd);padding-bottom:5px}
.deccard{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:11px 14px;margin:9px 0}
.dechd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dechd h4{margin:0;font-size:14px;flex:1 1 60%}
.decstatus{font-size:11px;color:var(--muted);border:1px solid var(--brd);border-radius:6px;padding:1px 7px;white-space:nowrap}
.decsup{font-size:11px;color:#d97706;border:1px solid #d97706;border-radius:6px;padding:1px 7px;white-space:nowrap}
.decwhy{margin:7px 0 0;font-size:13px;color:var(--muted);line-height:1.45}
.decfull{margin-top:8px}.decfull summary{cursor:pointer;font-size:12.5px;color:var(--muted);user-select:none}.decfull[open] summary{margin-bottom:6px}
.decfull .mddoc{font-size:13px;border-left:2px solid var(--brd);padding-left:12px}
.dechead{display:flex;align-items:baseline;gap:12px}.dechead h3{margin:0}.dechead .mini2{margin-left:auto}
/* decisions sub-tabs + readability helpers */
.subtabs{display:flex;gap:6px;border-bottom:1px solid var(--brd);margin-bottom:16px}
.subtab{appearance:none;background:none;border:none;border-bottom:2px solid transparent;padding:8px 14px;font:inherit;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer}
.subtab.on{color:var(--fg,inherit);border-bottom-color:#2563eb}
.subtab:hover{color:inherit}
.stagemeta{font-size:11px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);margin-left:8px}
.refchip{display:inline-block;font-family:ui-monospace,monospace;font-size:11px;background:var(--card2);border:1px solid var(--brd);border-radius:5px;padding:0 5px;line-height:1.6;white-space:nowrap}
a.refchip.qlink{color:#2563eb;text-decoration:none;border-color:#2563eb66;cursor:pointer}
.declegend{font-size:12.5px;color:var(--muted);background:var(--card2);border:1px solid var(--brd);border-radius:var(--r);padding:9px 12px;margin-bottom:14px;line-height:1.9}
.decimp{font-size:11px;font-weight:800;color:#b45309;border:1px solid #f59e0b88;background:#fef3c7;border-radius:6px;padding:2px 8px;white-space:nowrap;cursor:help}
.impcall{font-size:13px;color:#7a5410;background:#fef7e6;border:1.5px solid #f0c86e;border-radius:var(--r);padding:12px 16px;margin-bottom:12px;line-height:1.6}
.qcard.pulse{box-shadow:0 0 0 3px #2563eb66;transition:box-shadow .3s}
/* automations: Kissflow-integration-style trigger→action canvas */
.autogrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px;margin-top:12px}
.autocard{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:14px 16px}
.autohd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.autohd h4{margin:0;font-size:14px;flex:1 1 55%}
.autorail{display:flex;flex-direction:column;align-items:stretch;max-width:460px;margin:0 auto}
.autonode{display:flex;gap:11px;align-items:flex-start;border:1px solid var(--brd);border-radius:10px;padding:11px 13px;background:var(--card2)}
.autonode.trig{border-left:3px solid #16a34a}.autonode.act{border-left:3px solid #2563eb}
.anicon{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;background:var(--card);border:1px solid var(--brd)}
.autonode.trig .anicon{color:#16a34a;border-color:#16a34a66}.autonode.act .anicon{color:#2563eb;border-color:#2563eb66}
.anbody{min-width:0;flex:1}
.ankind{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.antitle{font-size:14px;font-weight:700;margin:1px 0 2px}
.ansub{font-size:12.5px;color:var(--muted)}
.autolink{align-self:center;height:26px;width:2px;background:var(--brd);position:relative;margin:2px 0}
.autolink i{position:absolute;left:50%;bottom:-1px;transform:translateX(-50%);border:5px solid transparent;border-top:7px solid var(--brd);border-bottom:0}
.amaps{margin-top:8px;border-top:1px dashed var(--brd);padding-top:7px}
.amap{display:flex;gap:7px;align-items:baseline;font-size:12.5px;padding:2px 0}
.amt{font-weight:600}.ama{color:var(--muted)}.ams{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.anfields{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;border-top:1px dashed var(--brd);padding-top:8px}
.dechead{display:flex;justify-content:flex-end;margin-bottom:8px}.mini2{border:1px solid var(--brd);background:var(--card2);border-radius:9px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--ink)}.mini2:hover{background:#fff}
.mddoc{max-width:880px;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--brd);border-radius:16px;padding:24px 32px;box-shadow:0 12px 34px -24px rgba(30,41,59,.5);line-height:1.62}
.mddoc h2{font-size:20px;margin:18px 0 8px}.mddoc h3{font-size:16px;margin:16px 0 6px}.mddoc h4{font-size:14px;margin:14px 0 4px;color:#1e293b}.mddoc h2:first-child,.mddoc h3:first-child{margin-top:0}
.mddoc p{margin:8px 0}.mddoc ul,.mddoc ol{margin:8px 0;padding-left:22px}.mddoc li{margin:4px 0}
.mddoc blockquote{margin:8px 0;padding:6px 14px;border-left:3px solid var(--primary);background:rgba(255,255,255,.5);border-radius:8px;color:#475569}
.mddoc hr{border:0;border-top:1px solid var(--line);margin:14px 0}.mddoc code{background:#f1f5f9;padding:1px 5px;border-radius:5px;font-size:12.5px}
.md-code{background:#0f172a;color:#e2e8f0;border-radius:10px;padding:12px 14px;overflow:auto;font-size:12.5px;margin:8px 0}
.mddoc .md-tbl{width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px;display:block;overflow-x:auto}
.mddoc .md-tbl th,.mddoc .md-tbl td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
.mddoc .md-tbl th{background:rgba(38,54,95,.08);font-weight:700;color:#1e293b;white-space:nowrap}
.mddoc .md-tbl tr:nth-child(even) td{background:rgba(255,255,255,.4)}
.warn{background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:var(--r);padding:12px 16px;margin-bottom:12px;font-size:13px}.warn.info{background:#eff6ff;border-color:#c3ccdf;color:#1e40af}.warn code{background:var(--brd)}
/* header tools */
.topright{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
/* BRD document */
.brdbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.brdtabs{display:inline-flex;background:var(--card);border:1px solid var(--brd);border-radius:12px;padding:3px}
.brdtab{border:0;background:transparent;border-radius:9px;padding:7px 16px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer}
.brdtab.on{background:var(--grad);color:#fff}
.brdtools{display:flex;gap:6px}.brdtools button{border:1px solid var(--brd);background:rgba(255,255,255,.85);border-radius:9px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;color:var(--ink)}.brdtools button:hover{background:#eef4ff}
.brd{background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--brd);border-radius:16px;padding:26px 34px;box-shadow:0 12px 34px -24px rgba(30,41,59,.5);line-height:1.62}
.brd h3{font-weight:800;font-size:clamp(23px,2.6vw,29px);letter-spacing:-.03em;margin:0 0 4px;color:var(--ink)}
.brd-sub{color:var(--muted);font-size:12.5px;margin:4px 0 16px}
.brd h4{margin:20px 0 6px;font-size:15px;color:#1e293b;border-bottom:1px solid var(--line);padding-bottom:4px}
.brd p{margin:6px 0}.brd ul{margin:6px 0;padding-left:20px}.brd li{margin:4px 0}
.brd .us{margin:4px 0 10px;padding-left:20px}.brd .us>li{margin:6px 0;font-weight:600}
.brd .ac{margin:4px 0 8px;padding-left:18px;list-style:none}.brd .ac li{font-weight:400;color:#475569;font-size:12.5px;position:relative;padding-left:14px}.brd .ac li::before{content:"✓";position:absolute;left:0;color:var(--ok)}
.brd .muted2{color:var(--muted);font-size:12px}
.brd .doc-ctl td:first-child{width:150px;color:var(--muted);font-weight:600}
.brd .signoff td{height:34px}.brd .signoff td:nth-child(3),.brd .signoff td:nth-child(4){border-bottom:1px solid var(--ink)}
.brd-tbl{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.brd-tbl th,.brd-tbl td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.brd-tbl th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.03em}
.brd .who{columns:2;margin:6px 0}.brd .who li{margin:3px 0}@media(max-width:640px){.brd .who{columns:1}}
.brd .story{margin:10px 0 14px;padding:12px 16px;background:rgba(255,255,255,.55);border:1px solid var(--line);border-left:3px solid var(--primary);border-radius:12px}
.brd .story-role{font-weight:700;color:#1e293b;margin-bottom:2px}
.brd .story ul{margin:6px 0 2px}.brd .story li{margin:5px 0}
/* ── BRD beautification: masthead, colorful KPI tiles, role colors ── */
.brd{position:relative;overflow:hidden;padding-top:30px}
.brd::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:var(--grad)}
.brdmast{margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.brdeye{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:4px}
.brdmeta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 8px}
.mchip{font-size:11.5px;font-weight:700;border:1px solid var(--brd);border-radius:999px;padding:3px 11px;color:var(--ink-soft);background:var(--card)}
.mchip.warn{color:#b45309;border-color:#f59e0b66;background:#fef3c7}
.brd .brdmast .brd-sub{margin:2px 0 0}
.brd .lede{font-size:15px;color:var(--ink-soft);line-height:1.7}
.brd h4{position:relative;padding-left:14px;font-size:15.5px;letter-spacing:-.01em;border-bottom:1px solid var(--line)}
.brd h4::before{content:"";position:absolute;left:0;top:3px;bottom:7px;width:4px;border-radius:2px;background:var(--grad)}
.stats2{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:9px;margin:4px 0 16px}
.stt{display:flex;gap:9px;align-items:center;background:color-mix(in srgb,var(--sc) 6%,#fff);border:1px solid color-mix(in srgb,var(--sc) 24%,#fff);border-radius:13px;padding:10px 11px;min-width:0}
.stticon{flex:0 0 auto;width:28px;height:28px;border-radius:9px;background:color-mix(in srgb,var(--sc) 14%,#fff);color:var(--sc);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700}
.sttx{min-width:0}
.stt b{font-size:19px;display:block;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.stt .stl{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.02em;line-height:1.15;display:block}
.whochips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.rolechip{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:4px 13px 4px 5px;font-weight:700;font-size:12.5px;color:var(--ink-soft);background:color-mix(in srgb,var(--rc) 7%,#fff);border:1px solid color-mix(in srgb,var(--rc) 32%,#fff)}
.ravat{font-style:normal;flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:var(--rc,#2a78d6);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800}
.brd .story{border-left:4px solid var(--rc,var(--primary));background:color-mix(in srgb,var(--rc,#5a5df2) 3%,#fff)}
.brd .story-role{display:flex;align-items:center;gap:9px;margin-bottom:6px}
.brd .goals li{margin:6px 0;list-style:none;position:relative;padding-left:22px}
.brd .goals{padding-left:2px}
.brd .goals li::before{content:"✓";position:absolute;left:0;top:0;width:16px;height:16px;border-radius:50%;background:var(--ok-soft);color:var(--ok);font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center}
.brd-tbl thead th{background:var(--primary-soft);color:var(--primary-ink);border-bottom:0;padding:7px 10px}
.brd-tbl thead tr th:first-child{border-radius:8px 0 0 8px}.brd-tbl thead tr th:last-child{border-radius:0 8px 8px 0}
.brd-tbl tbody tr:nth-child(even) td{background:rgba(90,93,242,.025)}
.mermaid{min-height:40px}.mermaid svg{display:block;max-width:none}.mermaid.wf svg{margin:0 auto}.dnote{color:var(--muted);font-size:12px;margin-top:8px}
/* modern skin for Mermaid (flowchart + ER) */
.mermaid .node rect,.mermaid .node circle,.mermaid .node polygon,.mermaid .node path{rx:13;filter:drop-shadow(0 6px 14px rgba(30,41,59,.14));stroke-width:1.4px}
.mermaid .node .label,.mermaid .nodeLabel{font-weight:600;color:#0f1a2e}
.mermaid .edgePath .path,.mermaid .flowchart-link{stroke:#9fb0cc;stroke-width:1.6px}
.mermaid .edgeLabel{background:rgba(255,255,255,.75);border-radius:6px;padding:1px 5px!important;font-size:11px;color:#57678a}
.mermaid .er.entityBox{fill:#ffffff;stroke:#c9d6ef;filter:drop-shadow(0 8px 18px rgba(30,41,59,.12))}
.mermaid .er.entityLabel{font-weight:700;fill:#0f1a2e}
.mermaid .er.relationshipLine{stroke:#94a3b8;stroke-width:1.4px}
.legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted);margin-bottom:8px}
.legend .lg{padding:2px 9px;border-radius:999px;font-weight:700;border:1px solid}
.legend .lg.proc{background:var(--primary-soft);border-color:#c7d2fe;color:#4338ca}.legend .lg.form{background:#eff6ff;border-color:#c3ccdf;color:var(--primary)}.legend .lg.child{background:#fff7ed;border-color:#fed7aa;color:#c2410c}.legend .lg.list{background:#f1f5f9;border-color:#cbd5e1;color:#475569}
.lgline{display:inline-flex;align-items:center;gap:5px}.lgline i{width:20px;height:0;border-top:2px solid #94a3b8}.lgline i.dash{border-top-style:dashed}
.dctl{display:flex;gap:6px;align-items:center;margin-bottom:8px}.dctl .hint{color:var(--muted);font-size:12px}
.diagpane{position:relative}
.ercc{position:absolute;top:14px;right:14px;z-index:5;display:flex;gap:6px;align-items:center;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--brd);border-radius:12px;padding:6px;box-shadow:0 12px 30px -16px rgba(30,41,59,.55)}
.ercc button{width:32px;height:32px;border:1px solid var(--brd);background:rgba(255,255,255,.85);border-radius:9px;font-size:15px;font-weight:700;cursor:pointer;color:var(--ink);display:grid;place-items:center;line-height:1}
.ercc button:hover{background:#eef4ff}.ercc-sep{width:1px;height:20px;background:var(--line)}
.diagram{background:var(--card2);border:1px solid var(--brd);border-radius:var(--r);overflow:auto;height:calc(100vh - 240px);min-height:360px;display:flex;padding:6px;cursor:grab;box-shadow:var(--sh)}.diagram svg{display:block;margin:auto}.diagram>div{margin:auto}
.node{cursor:pointer}.node.dim{opacity:.18}
.node rect.bd{fill:#fff;stroke:#3b82f6;stroke-width:1.4;filter:drop-shadow(0 3px 8px rgba(30,41,59,.10));transition:opacity .12s}
.node rect.hd,.node rect.hd2{fill:#eff6ff}
.node.proc rect.bd{stroke:#6366f1}.node.proc rect.hd,.node.proc rect.hd2{fill:var(--primary-soft)}
.node.child rect.bd{stroke:#fb923c}.node.child rect.hd,.node.child rect.hd2{fill:#fff7ed}
.node.list rect.bd{stroke:#94a3b8}.node.list rect.hd,.node.list rect.hd2{fill:#f1f5f9}
.node:hover rect.bd{stroke-width:2.4}
.node text{dominant-baseline:middle}
.node text.tt{fill:#0f172a;font:700 12.5px -apple-system,system-ui,sans-serif;text-anchor:middle}
.node text.rt{fill:#334155;font:500 10.5px -apple-system,system-ui,sans-serif;text-anchor:start}
.node text.rk{fill:#6479a8;font:800 8.5px -apple-system,system-ui,sans-serif;text-anchor:end;letter-spacing:.5px}
.node text.rm{fill:#94a3b8;font:italic 500 10px -apple-system,system-ui,sans-serif;text-anchor:start}
.node line.rl{stroke:#e8ecf4;stroke-width:1}
.gp{fill:#f4f6fb;stroke:#e2e7f3;stroke-width:1.5}
.gp.gpp{fill:#f6f2ff;stroke:#8b6cf6;stroke-width:2}
.gl.glp{fill:#6d28d9}
.gl{fill:#7e88a6;font:800 11.5px -apple-system,system-ui,sans-serif;letter-spacing:1.6px;text-anchor:start}
.gc{fill:#b3bad0;font:700 11px -apple-system,system-ui,sans-serif;text-anchor:end}
.edge{fill:none;stroke:#b3c0d8;stroke-width:1.5}.edge.child{stroke-dasharray:5 4}
.edge.rail{stroke-width:2;opacity:.45;stroke-linecap:round}
.edge.rail.trunk{stroke-width:2.5}
.edge.hot{stroke:var(--primary);stroke-width:2.4}
.edge.rail.hot{opacity:1;stroke-width:3}
.hubb{cursor:pointer}
.hubb rect{fill:#fff;stroke:#6479c8;stroke-width:1.2;filter:drop-shadow(0 2px 4px rgba(30,41,59,.15))}
.hubb text{fill:#3c4c96;font:800 9.5px -apple-system,system-ui,sans-serif;text-anchor:middle;dominant-baseline:middle}
.hubb:hover rect{fill:#eef1ff}
.fic{cursor:pointer}
.fic circle{fill:#fff;stroke:#c3cbe0;stroke-width:1.2}
.fic text{fill:#5b6b95;font:700 10px -apple-system,system-ui,sans-serif;text-anchor:middle;dominant-baseline:middle}
.fic:hover circle{stroke:var(--primary)}.fic:hover text{fill:var(--primary)}
.erfocus{position:absolute;inset:0;background:var(--card2);z-index:6;display:flex;flex-direction:column;border-radius:var(--r)}
.erfhead{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:13.5px;flex:none}
.erfhead .cnt{color:var(--muted)}
.erfhead button{margin-left:auto}
.erfbody{overflow:auto;flex:1;padding:12px}
.erfocus svg{display:block;width:100%;height:auto}
.screen{border:1px solid var(--brd);border-radius:14px;overflow:hidden;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);margin-top:8px;box-shadow:0 12px 34px -24px rgba(30,41,59,.5)}
.sbar{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.5);border-bottom:1px solid var(--brd);padding:8px 12px}
.dots{display:flex;gap:4px}.dots i{width:9px;height:9px;border-radius:50%;background:#e2e8f0}
.stitle{font-weight:700;font-size:13px}.srole{margin-left:auto;font-size:11px;font-weight:700;background:var(--primary-soft);color:var(--primary);padding:2px 8px;border-radius:999px}.autotag{font-size:10px;font-weight:700;background:#ecfeff;color:#0e7490;border:1px solid #a5f3fc;padding:1px 7px;border-radius:999px}
.scanvas{display:grid;grid-template-columns:repeat(12,1fr);gap:10px;padding:14px;background:#fbfdff}
.tile{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;min-height:74px;display:flex;flex-direction:column;gap:8px}.tile.kpi{background:var(--primary-soft);border-color:var(--brd)}
.tcap{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px}.tsrc{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.ph-num{height:26px;width:60%;border-radius:6px;background:linear-gradient(90deg,#c3ccdf,#9aa7c4)}
.ph-bars{display:flex;align-items:flex-end;gap:6px;height:54px}.ph-bars i{flex:1;background:#c3ccdf;border-radius:3px 3px 0 0}.ph-bars i:nth-child(1){height:40%}.ph-bars i:nth-child(2){height:75%}.ph-bars i:nth-child(3){height:55%}.ph-bars i:nth-child(4){height:92%}.ph-bars i:nth-child(5){height:66%}
.ph-row{height:12px;border-radius:4px;background:#f1f5f9}.ph-row.h{background:#e2e8f0}.ph-line{height:10px;border-radius:4px;background:#f1f5f9}.ph-line.short{width:55%}
.ph-kb{display:flex;gap:8px}.ph-kb span{flex:1;height:54px;border-radius:8px;background:#f1f5f9;border:1px dashed #e2e8f0}.tile.empty{align-items:center;justify-content:center;color:var(--muted);font-style:italic}
/* visual navigation panel (app left-nav mock) */
.navmock{width:100%;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--brd);border-radius:14px;padding:14px 16px;margin-top:8px;box-shadow:0 12px 34px -24px rgba(30,41,59,.5)}
.navbrand{font-weight:800;font-size:15px;padding:6px 6px 12px;border-bottom:1px solid var(--line);margin-bottom:8px}
.navgroups{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:6px 26px}
.navgroup{margin-top:2px;break-inside:avoid}
.navhead{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:9px 8px 3px;font-weight:700}
.navitem{display:flex;align-items:flex-start;gap:9px;padding:7px 8px;border-radius:10px;font-size:13px;font-weight:600;cursor:default}
.navitem:hover{background:rgba(255,255,255,.6)}
.navdot{width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.55;flex:none;margin-top:6px}
.navlabel{flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere}
.navroles{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:55%}
.navroles i{font-style:normal;font-size:10px;background:var(--primary-soft);color:var(--primary);border-radius:999px;padding:1px 7px}
/* footer wizard bar */
footer.wizbar{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--card2);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border-top:1px solid var(--brd);box-shadow:0 -6px 26px -20px rgba(30,41,59,.55)}
.barin{display:flex;align-items:center;gap:14px;padding:12px 28px}
.wizbar .nav{border:1px solid var(--brd);background:var(--card2);border-radius:10px;padding:9px 18px;font-weight:600;font-size:13px;cursor:pointer;color:var(--ink);min-width:104px}
.wizbar .nav:hover:not(:disabled){background:#fff}.wizbar .nav:disabled{opacity:.35;cursor:default}
.mid{flex:1;display:flex;align-items:center;gap:14px;justify-content:center;flex-wrap:wrap}
.fsum{color:var(--muted);font-size:13px;font-weight:500}.fsum b{color:var(--ink);font-weight:700}
.cta{border:0;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;background:var(--grad);box-shadow:0 6px 16px -6px rgba(90,93,242,.5);transition:transform .14s,box-shadow .14s}
.cta:hover{transform:translateY(-1px);box-shadow:0 10px 22px -6px rgba(90,93,242,.6)}.cta:active{transform:none}
.ghostbtn{border:0;background:transparent;color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;padding:8px 6px}.ghostbtn:hover{color:var(--ink)}
</style></head><body>
<header class="top"><div class="topin">
  <div class="brand">Design Review<span>${esc(ir.app?.name || "App")}</span></div>
  <div class="topright">
    <span class="fsum">⚑ <b id="n">0</b> flagged · <b id="nok">0</b> ok</span>
    <button id="copy" class="cta">Copy change-list</button>
    <button id="clear" class="ghostbtn">Clear</button>
    <input id="filter" placeholder="Filter this step…" autocomplete="off">
  </div>
</div><nav class="stepper" id="stepper">${secs.map(([id, t], i) => `<button class="pill" data-i="${i}"><span class="pnum">${i + 1}</span>${esc(t)}<span class="pflag" data-for="${i}">0</span></button>`).join("")}</nav></header>
<main id="main">${secs.map(([id, t, body], i) => `<section class="step" id="s-${id}" data-i="${i}"><h2>${esc(t)}</h2>${body}</section>`).join("")}</main>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
var EW=${graph.W || 0},EH=${graph.H || 0},NS=${secs.length};
var KEY="review-${slug(ir.app?.name || "app")}";
var st=JSON.parse(localStorage.getItem(KEY)||"{}");
function save(){localStorage.setItem(KEY,JSON.stringify(st))}
function ownBtns(f){return [].slice.call(f.querySelectorAll(".revbtn")).filter(function(b){return b.closest(".flag")===f})}
function ownCmt(f){return [].slice.call(f.querySelectorAll(".cmt")).filter(function(t){return t.closest(".flag")===f})[0]}
function stateOf(b){return b.classList.contains("ok")?"ok":b.classList.contains("chg")?"chg":"q"}
function stepOf(f){var s=f.closest(".step");return s?+s.dataset.i:0}
function refresh(){var chg=0,ok=0,per={};
  [].forEach.call(document.querySelectorAll(".flag"),function(f){var s=st[f.id];f.dataset.state=(s&&s.state)||"";
    var c=ownCmt(f);if(c)c.value=(s&&s.note)||"";ownBtns(f).forEach(function(b){b.classList.remove("on")});
    if(s&&s.state){ownBtns(f).forEach(function(b){if(b.classList.contains(s.state))b.classList.add("on")});
      if(s.state==="ok")ok++;else{chg++;var k=stepOf(f);per[k]=(per[k]||0)+1}}});
  document.getElementById("n").textContent=chg;document.getElementById("nok").textContent=ok;
  var qc=document.querySelectorAll(".qcard");if(qc.length){var qd=0;[].forEach.call(qc,function(f){if(st[f.id]&&st[f.id].state)qd++});var qp=document.getElementById("qprog");if(qp)qp.textContent=qd+" of "+qc.length+" decided"}
  [].forEach.call(document.querySelectorAll(".pill"),function(p){var k=+p.dataset.i,c=per[k]||0;p.classList.toggle("hasflag",c>0);p.querySelector(".pflag").textContent=c})}
[].forEach.call(document.querySelectorAll(".revbtn"),function(b){b.onclick=function(){var f=b.closest(".flag");var s=stateOf(b);
  st[f.id]={state:s,note:(st[f.id]&&st[f.id].note)||""};if(s==="ok")delete st[f.id].note;save();refresh();
  if(s!=="ok"){var c=ownCmt(f);if(c)c.focus()}}});
[].forEach.call(document.querySelectorAll(".cmt"),function(t){t.oninput=function(e){var f=e.target.closest(".flag");if(st[f.id]){st[f.id].note=e.target.value;save()}}});
document.getElementById("clear").onclick=function(){if(!confirm("Clear all flags?"))return;for(var k in st)delete st[k];save();refresh()};
document.getElementById("copy").onclick=function(){var lines=["# Change requests for /author-refine",""];
  [].forEach.call(document.querySelectorAll(".flag"),function(f){var s=st[f.id];if(!s||!s.state)return;var dec=f.dataset.kind==="decision";
    if(s.state==="ok"){if(dec)lines.push("[DECIDED — accept default] "+f.dataset.label+" (#"+f.id+")");return}
    var pre=s.state==="chg"?(dec?"[DECIDED] ":"[CHANGE] "):"[QUESTION] ";
    lines.push(pre+f.dataset.label+" (#"+f.id+"): "+(s.note||"(no note)"))});
  navigator.clipboard.writeText(lines.join("\\n")).then(function(){var b=document.getElementById("copy");b.textContent="Copied ✓";setTimeout(function(){b.textContent="Copy change-list"},1500)})};
// ── wizard navigation ──
var cur=0,names=[${secs.map(([, t]) => `"${esc(t).replace(/"/g, '\\"')}"`).join(",")}];
function renderMermaidIn(sec){if(!window.mermaid){fbAll(sec);fitER();return}
  var nodes=[].slice.call(sec.querySelectorAll(".mermaid")).filter(function(m){return !m.dataset.done});
  if(!nodes.length){if(+sec.dataset.i===DIAGSTEP)requestAnimationFrame(fitER);return}
  try{mermaid.run({nodes:nodes}).then(function(){nodes.forEach(function(m){m.dataset.done=1;});sizeER();requestAnimationFrame(fitER)}).catch(function(){nodes.forEach(function(m){m.dataset.done=1});fbAll(sec);fitER()})}
  catch(e){fbAll(sec);fitER()}}
function fbAll(sec){var m=sec.querySelector("#ermer");if(m){m.style.display="none";var f=sec.querySelector("#erfb");if(f)f.style.display=""}}
function showStep(i){i=Math.max(0,Math.min(NS-1,i));cur=i;
  [].forEach.call(document.querySelectorAll(".step"),function(s){s.classList.toggle("active",+s.dataset.i===i)});
  [].forEach.call(document.querySelectorAll(".pill"),function(p){var k=+p.dataset.i;p.classList.toggle("on",k===i);p.classList.toggle("done",k<i)});
  var _c=document.getElementById("cur");if(_c)_c.textContent=i+1;var _cn=document.getElementById("curname");if(_cn)_cn.textContent=names[i];
  var sec=document.querySelector('.step[data-i="'+i+'"]');renderMermaidIn(sec);
  document.getElementById("filter").value="";[].forEach.call(sec.querySelectorAll(".item"),function(it){it.classList.remove("hidden")});
  window.scrollTo({top:0,behavior:"smooth"})}
[].forEach.call(document.querySelectorAll(".pill"),function(p){p.onclick=function(){showStep(+p.dataset.i)}});
addEventListener("keydown",function(e){var t=e.target.tagName;if(t==="TEXTAREA"||t==="INPUT")return;if(e.key==="ArrowRight")showStep(cur+1);if(e.key==="ArrowLeft")showStep(cur-1)});
// filter within the active step
var q=document.getElementById("filter");q.oninput=function(){var v=q.value.toLowerCase(),sec=document.querySelector('.step[data-i="'+cur+'"]');
  [].forEach.call(sec.querySelectorAll(".item"),function(it){var hit=!v||(it.dataset.label||"").toLowerCase().indexOf(v)>=0||it.textContent.toLowerCase().indexOf(v)>=0;it.classList.toggle("hidden",!hit)})};
// jump between flags (across steps)
function flagged(){return [].slice.call(document.querySelectorAll(".flag")).filter(function(f){return st[f.id]&&st[f.id].state&&st[f.id].state!=="ok"})}
var fi=-1;function jump(d){var a=flagged();if(!a.length)return;fi=(fi+d+a.length)%a.length;var f=a[fi];showStep(stepOf(f));setTimeout(function(){f.scrollIntoView({behavior:"smooth",block:"center"})},60)}
var _nf=document.getElementById("nf");if(_nf)_nf.onclick=function(){jump(1)};var _pv=document.getElementById("prev");if(_pv)_pv.onclick=function(){jump(-1)};
// ER diagram zoom + hover-trace
var z=1,zbase=1,merBase=null;
function zsvg(){var m=document.getElementById("ermer");if(m&&m.style.display!=="none"){return m.querySelector("svg")}return document.getElementById("ersvg")}
function natSize(s){return s&&s.id==="ersvg"?{w:EW,h:EH}:merBase}
function applyScale(){var s=zsvg();var n=natSize(s);if(!s||!n||!n.w)return;s.style.maxWidth="none";s.setAttribute("width",Math.round(n.w*zbase*z));s.setAttribute("height",Math.round(n.h*zbase*z))}
function sizeER(){var s=document.querySelector("#ermer svg");if(!s||merBase)return;var bb;try{bb=s.getBBox()}catch(e){return}merBase={w:Math.ceil(bb.width)+24,h:Math.ceil(bb.height)+24}}
function fitER(){var wrap=document.getElementById("erwrap")||document.querySelector("#s-diagram .diagram");var s=zsvg();var n=natSize(s);if(!wrap||!s||!n||!n.w)return;var cw=wrap.clientWidth-24,ch=wrap.clientHeight-24;if(cw<60||ch<60)return;
  var fit=cw/n.w;/* fit the WIDTH on load (no horizontal scroll); taller diagrams scroll vertically */
  zbase=Math.min(fit,1.4);z=1;applyScale();
  wrap.scrollLeft=0;wrap.scrollTop=0;/* start at the top, horizontally centered */}
function setZoom(v){z=Math.min(8,Math.max(.15,v));applyScale()}
if(document.getElementById("zin"))document.getElementById("zin").onclick=function(){setZoom(z*1.25)};
if(document.getElementById("zout"))document.getElementById("zout").onclick=function(){setZoom(z/1.25)};
if(document.getElementById("zfit"))document.getElementById("zfit").onclick=function(){fitER()};
var DIAGSTEP=${secs.findIndex((s) => s[0] === "diagram")};
addEventListener("resize",function(){if(cur===DIAGSTEP)fitER()});
// mouse-wheel / trackpad-pinch zoom (toward the cursor) + drag-to-pan on the diagram
(function(){var wrap=document.getElementById("erwrap");if(!wrap)return;
  // plain mouse wheel SCROLLS (native); trackpad-pinch or ctrl/cmd+wheel ZOOMS toward the cursor
  wrap.addEventListener("wheel",function(e){if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();var s=zsvg(),n=natSize(s);if(!s||!n||!n.w)return;
    var r=wrap.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
    var oldW=n.w*zbase*z,oldH=n.h*zbase*z,relX=(wrap.scrollLeft+cx)/oldW,relY=(wrap.scrollTop+cy)/oldH;
    setZoom(z*(e.deltaY<0?1.12:1/1.12));
    var nw=n.w*zbase*z,nh=n.h*zbase*z;wrap.scrollLeft=relX*nw-cx;wrap.scrollTop=relY*nh-cy;},{passive:false});
  var pan=null;
  wrap.addEventListener("mousedown",function(e){if(e.target.closest("a.node"))return;pan={x:e.clientX,y:e.clientY,l:wrap.scrollLeft,t:wrap.scrollTop};wrap.style.cursor="grabbing"});
  addEventListener("mousemove",function(e){if(!pan)return;wrap.scrollLeft=pan.l-(e.clientX-pan.x);wrap.scrollTop=pan.t-(e.clientY-pan.y)});
  addEventListener("mouseup",function(){pan=null;wrap.style.cursor=""});
  // download / print the ER diagram
  function erSVG(){var s=zsvg();if(!s)return null;var c=s.cloneNode(true);c.setAttribute("xmlns","http://www.w3.org/2000/svg");c.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");return c}
  var DL=document.getElementById("erdl");if(DL)DL.onclick=function(){var c=erSVG();if(!c)return;var data='<?xml version="1.0" encoding="UTF-8"?>\\n'+new XMLSerializer().serializeToString(c);var blob=new Blob([data],{type:"image/svg+xml;charset=utf-8"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=KEY.replace("review-","")+"-er.svg";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)};
  var PR=document.getElementById("erprint");if(PR)PR.onclick=function(){var c=erSVG();if(!c)return;c.removeAttribute("width");c.removeAttribute("height");c.setAttribute("style","width:100%;height:auto");var nm=document.title.replace(/^Design Review — /,"");var w=window.open("","_blank");if(!w){alert("Allow pop-ups to print the diagram.");return}w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>ER — '+nm+'</title><style>@page{size:landscape;margin:12mm}body{margin:0;font-family:-apple-system,Inter,system-ui,sans-serif}h1{font-size:15px;margin:0 0 8px}</style></head><body><h1>Data Model — '+nm+'</h1>'+new XMLSerializer().serializeToString(c)+'</body></html>');w.document.close();w.focus();setTimeout(function(){w.print()},350)};
})();
// side-nav scroll-spy (Data & Fields + Pages) — highlight the section in view, in the active step.
// A CLICK sets the highlight immediately and holds off the spy briefly, so the clicked entity stays
// selected even when the page can't scroll far enough to bring it under the threshold.
var spyHold=0;
[].forEach.call(document.querySelectorAll(".dnav-link"),function(a){a.addEventListener("click",function(){
  spyHold=Date.now()+900;
  var nav=a.closest(".dnav");if(nav)[].forEach.call(nav.querySelectorAll(".dnav-link"),function(o){o.classList.toggle("on",o===a)})})});
addEventListener("scroll",function(){if(Date.now()<spyHold)return;
  var sec=document.querySelector('.step[data-i="'+cur+'"]');if(!sec)return;
  var links=[].slice.call(sec.querySelectorAll(".dnav-link"));if(!links.length)return;var curId="";
  links.forEach(function(a){var t=document.getElementById(a.dataset.target);if(t&&t.getBoundingClientRect().top<180)curId=a.dataset.target});
  if(window.scrollY+innerHeight>=document.documentElement.scrollHeight-4)curId=links[links.length-1].dataset.target;
  links.forEach(function(a){a.classList.toggle("on",a.dataset.target===curId)})});
[].forEach.call(document.querySelectorAll(".node"),function(nd){var id=nd.dataset.id;
  nd.addEventListener("mouseenter",function(){var live={};live[id]=1;
    [].forEach.call(document.querySelectorAll(".edge"),function(ed){var on=ed.dataset.a===id||ed.dataset.b===id;ed.classList.toggle("hot",on);if(on){live[ed.dataset.a]=1;live[ed.dataset.b]=1}});
    [].forEach.call(document.querySelectorAll(".node"),function(o){o.classList.toggle("dim",!live[o.dataset.id])})});
  nd.addEventListener("mouseleave",function(){[].forEach.call(document.querySelectorAll(".edge"),function(e){e.classList.remove("hot")});[].forEach.call(document.querySelectorAll(".node"),function(o){o.classList.remove("dim")})})});
// FOCUS MODE — a busy hub's neighbors rarely fit one viewport, so its ⇄ badge opens an overlay with
// JUST that entity + everything connected, re-packed to fit (width-fitted, vertical scroll).
function focusNode(id){
  var pane=document.querySelector(".diagpane");var src=document.querySelector('.node[data-id="'+id+'"]');if(!pane||!src)return;
  var nb={};[].forEach.call(document.querySelectorAll(".edge"),function(ed){if(ed.dataset.a===id)nb[ed.dataset.b]=1;else if(ed.dataset.b===id)nb[ed.dataset.a]=1});
  var mk=function(nid){var n=document.querySelector('.node[data-id="'+nid+'"]');if(!n)return null;var el=n.cloneNode(true);el.classList.remove("dim");var bd=el.querySelector("rect.bd");return{el:el,g:el.querySelector("g"),h:+bd.getAttribute("height"),w:+bd.getAttribute("width")}};
  var hub=mk(id),cl=Object.keys(nb).map(mk).filter(Boolean);if(!hub)return;
  var GAPX=30,GAPY=18,PADF=30,CW2=hub.w;
  var tot=cl.reduce(function(s,c){return s+c.h+GAPY},0);
  var cols=Math.max(1,Math.min(5,Math.ceil(Math.sqrt(cl.length/1.4))));
  var tgt=tot/cols,c=0,y=0,colH=[];
  cl.forEach(function(x){if(y>0&&y+x.h>tgt&&c<cols-1){colH[c]=y;c++;y=0}x.ci=c;x.cy=y;y+=x.h+GAPY});colH[c]=y;
  var maxH=Math.max.apply(null,colH),x0=PADF+CW2+96;
  var W=x0+(c+1)*(CW2+GAPX)-GAPX+PADF,Ht=Math.max(maxH,hub.h)+PADF*2,hy=(Ht-hub.h)/2;
  hub.g.setAttribute("transform","translate("+PADF+" "+hy+")");
  var ser=new XMLSerializer(),parts=[];
  cl.forEach(function(x){x.x=x0+x.ci*(CW2+GAPX);x.y=PADF+x.cy;x.g.setAttribute("transform","translate("+x.x+" "+x.y+")");
    parts.push('<path class="edge hot" d="M'+(PADF+CW2)+' '+(hy+hub.h/2)+' C '+(PADF+CW2+56)+' '+(hy+hub.h/2)+', '+(x.x-56)+' '+(x.y+22)+', '+x.x+' '+(x.y+22)+'"/>')});
  var name=(src.querySelector("text.tt")||{}).textContent||id;
  var ov=document.createElement("div");ov.className="erfocus";
  ov.innerHTML='<div class="erfhead"><b>'+name+'</b><span class="cnt">'+cl.length+' connected entities</span><button class="mini2" id="erfclose">\u2715 back to full map</button></div><div class="erfbody"><svg viewBox="0 0 '+W+' '+Ht+'" xmlns="http://www.w3.org/2000/svg">'+parts.join("")+ser.serializeToString(hub.el)+cl.map(function(x){return ser.serializeToString(x.el)}).join("")+'</svg></div>';
  pane.appendChild(ov);
  document.getElementById("erfclose").onclick=function(){ov.remove()};
}
[].forEach.call(document.querySelectorAll(".hubb,.fic"),function(b){b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();focusNode(b.closest(".node").dataset.id)})});
if(window.mermaid){mermaid.initialize({startOnLoad:false,securityLevel:"loose",theme:"base",
  fontFamily:"-apple-system,Inter,system-ui,sans-serif",
  er:{diagramPadding:12,entityPadding:10,minEntityWidth:90,minEntityHeight:40,layoutDirection:"TB",useMaxWidth:false},
  flowchart:{curve:"basis",htmlLabels:true,padding:14,nodeSpacing:40,rankSpacing:60},
  themeVariables:{fontFamily:"-apple-system,Inter,system-ui,sans-serif",fontSize:"13px",
    primaryColor:"#e9f0ff",primaryTextColor:"#0f1a2e",primaryBorderColor:"#6f9bff",
    secondaryColor:"#f3eefe",tertiaryColor:"#eafaf3",lineColor:"#9fb0d0",
    nodeBorder:"#6f9bff",clusterBkg:"#ffffff",clusterBorder:"#dbe4f5",
    attributeBackgroundColorOdd:"#ffffff",attributeBackgroundColorEven:"#f2f6ff"}})}
var h=location.hash.replace("#s-","");var start=0;[${secs.map(([id], i) => `["${id}",${i}]`).join(",")}].forEach(function(p){if(p[0]===h)start=p[1]});
// download / print the generated BRD
(function(){var brief=document.getElementById("brd-brief");if(!brief)return;
  function visible(){var de=document.getElementById("brd-detailed");return (de&&de.style.display!=="none")?de:brief}
  function brdHTML(){var clone=visible().cloneNode(true);
    return '<!doctype html><html><head><meta charset="utf-8"><title>BRD — '+document.title.replace(/^Design Review — /,"")+'</title><style>body{font-family:-apple-system,Inter,system-ui,sans-serif;max-width:880px;margin:28px auto;padding:0 22px;line-height:1.62;color:#111827}h3{font-size:20px}h4{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;vertical-align:top}th{background:#eff4ff;color:#334155;font-size:11px;text-transform:uppercase}code{background:#f1f5f9;padding:1px 5px;border-radius:4px}ul{padding-left:20px}.ac{list-style:none;padding-left:16px}.ac li::before{content:"✓ ";color:#0fae6e}.story{margin:8px 0;padding:10px 14px;border-left:3px solid #3b6ef6;background:#f8fafc}@page{margin:16mm}</style></head><body>'+clone.innerHTML+'</body></html>'}
  var D=document.getElementById("brddl");if(D)D.onclick=function(){var blob=new Blob([brdHTML()],{type:"text/html;charset=utf-8"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=KEY.replace("review-","")+"-brd-"+(visible().id==="brd-detailed"?"detailed":"brief")+".html";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)};
  var P=document.getElementById("brdprint");if(P)P.onclick=function(){var w=window.open("","_blank");if(!w){alert("Allow pop-ups to print.");return}w.document.write(brdHTML());w.document.close();w.focus();setTimeout(function(){w.print()},350)};
  [].forEach.call(document.querySelectorAll(".brdtab"),function(b){b.onclick=function(){var t=b.dataset.brd;[].forEach.call(document.querySelectorAll(".brdtab"),function(x){x.classList.toggle("on",x===b)});brief.style.display=t==="brief"?"":"none";document.getElementById("brd-detailed").style.display=t==="detailed"?"":"none"}});})();
var _dt=document.getElementById("dectoggle");if(_dt)_dt.onclick=function(){var r=document.getElementById("decrendered"),w=document.getElementById("decraw"),raw=r.style.display!=="none";r.style.display=raw?"none":"";w.style.display=raw?"":"none";_dt.textContent=raw?"View rendered":"View raw"};
// decisions sub-tabs: Your decisions ⇄ Decision log; Q-chips jump to the question card
function showSub(k){[].forEach.call(document.querySelectorAll(".subtab"),function(b){b.classList.toggle("on",b.dataset.sub===k)});
  var u=document.getElementById("sub-user"),l=document.getElementById("sub-log");if(u)u.style.display=k==="user"?"":"none";if(l)l.style.display=k==="log"?"":"none"}
[].forEach.call(document.querySelectorAll(".subtab"),function(b){b.onclick=function(){showSub(b.dataset.sub)}});
[].forEach.call(document.querySelectorAll("a.qlink"),function(a){a.onclick=function(e){e.preventDefault();showSub("user");
  var c=document.getElementById("q-"+a.dataset.q);if(c){c.scrollIntoView({behavior:"smooth",block:"center"});c.classList.add("pulse");setTimeout(function(){c.classList.remove("pulse")},1600)}}});
refresh();showStep(start);
</script></body></html>`;
process.stdout.write(html);
