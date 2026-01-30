/* UZI Compare — light compact static MVP (branch switcher)
   Data source: ./data/prices.json
*/
const state = {
  allData: null,
  branchKey: null,
  data: null,
  selectedClinicIds: [],
  filters: {
    category: "all",
    type: "all",
    q: "",
    onlyComparable: false,
    hideMissingOurs: false,
    relative: true,
    sort: "name",
  }
};

const els = {
  categorySelect: document.getElementById("categorySelect"),
  typeSelect: document.getElementById("typeSelect"),
  searchInput: document.getElementById("searchInput"),
  onlyComparable: document.getElementById("onlyComparable"),
  hideMissingOurs: document.getElementById("hideMissingOurs"),
  relativeMode: document.getElementById("relativeMode"),
  sortSelect: document.getElementById("sortSelect"),
  clinicsChips: document.getElementById("clinicsChips"),
  rowsCount: document.getElementById("rowsCount"),
  comparableCount: document.getElementById("comparableCount"),
  tableHead: document.getElementById("tableHead"),
  tableBody: document.getElementById("tableBody"),
  btnCopyLink: document.getElementById("btnCopyLink"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  toast: document.getElementById("toast"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  metaLine: document.getElementById("metaLine"),
  noteRight: document.getElementById("noteRight"),
  branchToggle: document.getElementById("branchToggle"),
};

let activePopover = null;

function fmtRub(amount){
  if (amount == null || Number.isNaN(amount)) return "—";
  const s = new Intl.NumberFormat("ru-RU").format(amount);
  return `${s} ₽`;
}
function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add("toast--show");
  setTimeout(()=>els.toast.classList.remove("toast--show"), 1400);
}
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function closePopover(){
  if (activePopover){
    activePopover.remove();
    activePopover = null;
  }
}
document.addEventListener("click", (e)=>{
  if (activePopover && !activePopover.contains(e.target) && !e.target.closest("[data-pop]")) closePopover();
});
window.addEventListener("scroll", closePopover, {passive:true});
window.addEventListener("resize", closePopover);

function makePopover(anchorEl, title, breakdown, note){
  closePopover();
  const pop = document.createElement("div");
  pop.className = "popover";
  pop.innerHTML = `
    <div class="popTitle">${escapeHtml(title)}</div>
    ${breakdown?.length ? `<ul class="popList">${breakdown.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}
    ${note ? `<div class="popNote">${escapeHtml(note)}</div>` : ""}
  `;
  document.body.appendChild(pop);

  const r = anchorEl.getBoundingClientRect();
  const popR = pop.getBoundingClientRect();
  const left = Math.min(window.innerWidth - popR.width - 12, Math.max(12, r.left));
  const top = Math.min(window.innerHeight - popR.height - 12, Math.max(12, r.bottom + 8));
  pop.style.left = left + "px";
  pop.style.top = (top + window.scrollY) + "px";
  activePopover = pop;
}

function getOurClinicId(){
  const ours = state.data.clinics.find(c=>c.kind==="ours");
  return ours ? ours.id : null;
}
function getPriceEntry(serviceId, clinicId){
  const byService = state.data.prices[serviceId] || {};
  return byService[clinicId] || null;
}
function hasPrice(serviceId, clinicId){
  const e = getPriceEntry(serviceId, clinicId);
  return e && typeof e.amount === "number";
}

function serviceMatchesFilters(s){
  const f = state.filters;
  if (f.category !== "all" && s.tags?.category !== f.category) return false;
  if (f.type !== "all" && s.tags?.type !== f.type) return false;

  if (f.q){
    const q = f.q.toLowerCase().trim();
    const hay = (s.name + " " + (s.tags?.aliases||[]).join(" ")).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function calcComparableCount(services, selectedClinicIds){
  const ourId = getOurClinicId();
  if (!ourId) return 0;
  let count = 0;
  for (const s of services){
    const ourHas = selectedClinicIds.includes(ourId) && hasPrice(s.id, ourId);
    if (!ourHas) continue;
    let competitorHas = false;
    for (const cid of selectedClinicIds){
      if (cid === ourId) continue;
      if (hasPrice(s.id, cid)) { competitorHas = true; break; }
    }
    if (competitorHas) count++;
  }
  return count;
}

function sortServices(services){
  const f = state.filters;
  const ourId = getOurClinicId();
  const selected = state.selectedClinicIds;

  const getOurPrice = (sid)=>{
    if (!ourId) return null;
    return getPriceEntry(sid, ourId)?.amount ?? null;
  };
  const getMinPrice = (sid)=>{
    let min = null;
    for (const cid of selected){
      const a = getPriceEntry(sid, cid)?.amount ?? null;
      if (a == null) continue;
      if (min == null || a < min) min = a;
    }
    return min;
  };
  const getMaxDelta = (sid)=>{
    const our = getOurPrice(sid);
    if (our == null) return null;
    let max = null;
    for (const cid of selected){
      if (cid === ourId) continue;
      const a = getPriceEntry(sid, cid)?.amount ?? null;
      if (a == null) continue;
      const d = a - our;
      if (max == null || d > max) max = d;
    }
    return max;
  };

  const copy = [...services];
  copy.sort((a,b)=>{
    if (f.sort === "name") return a.name.localeCompare(b.name, "ru");
    if (f.sort === "ourPrice"){
      const ap = getOurPrice(a.id), bp = getOurPrice(b.id);
      if (ap == null && bp == null) return a.name.localeCompare(b.name, "ru");
      if (ap == null) return 1;
      if (bp == null) return -1;
      return ap - bp;
    }
    if (f.sort === "minPrice"){
      const ap = getMinPrice(a.id), bp = getMinPrice(b.id);
      if (ap == null && bp == null) return a.name.localeCompare(b.name, "ru");
      if (ap == null) return 1;
      if (bp == null) return -1;
      return ap - bp;
    }
    if (f.sort === "maxDelta"){
      const ap = getMaxDelta(a.id), bp = getMaxDelta(b.id);
      if (ap == null && bp == null) return a.name.localeCompare(b.name, "ru");
      if (ap == null) return 1;
      if (bp == null) return -1;
      return bp - ap;
    }
    return 0;
  });
  return copy;
}

function populateSelect(el, items, value){
  el.innerHTML = "";
  for (const it of items){
    const opt = document.createElement("option");
    opt.value = it.value;
    opt.textContent = it.label;
    el.appendChild(opt);
  }
  el.value = value;
}

function renderFilters(){
  const defs = state.data.filterDefs;
  populateSelect(els.categorySelect, defs.categories, state.filters.category);
  populateSelect(els.typeSelect, defs.types, state.filters.type);
  els.searchInput.value = state.filters.q || "";
  els.onlyComparable.checked = !!state.filters.onlyComparable;
  els.hideMissingOurs.checked = !!state.filters.hideMissingOurs;
  els.relativeMode.checked = !!state.filters.relative;
  els.sortSelect.value = state.filters.sort;
}

function renderClinics(){
  const clinics = state.data.clinics;
  // default: all clinics on
  if (!state.selectedClinicIds.length) state.selectedClinicIds = clinics.map(c=>c.id);

  // if URL had clinic ids that don't exist in this branch — drop them
  const existing = new Set(clinics.map(c=>c.id));
  state.selectedClinicIds = state.selectedClinicIds.filter(x=>existing.has(x));
  if (!state.selectedClinicIds.length) state.selectedClinicIds = clinics.map(c=>c.id);

  els.clinicsChips.innerHTML = "";
  for (const c of clinics){
    const checked = state.selectedClinicIds.includes(c.id);
    const chip = document.createElement("label");
    chip.className = "chip";
    chip.innerHTML = `
      <input type="checkbox" ${checked ? "checked" : ""} data-clinic="${escapeHtml(c.id)}" />
      <span class="chip__name">${escapeHtml(c.name)}</span>
      <span class="chip__tag ${c.kind==="ours" ? "tag--ours" : "tag--comp"}">${c.kind==="ours" ? "наша" : "конкурент"}</span>
      ${c.url ? `<a class="chip__link" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">источник</a>` : ``}
    `;
    chip.querySelector("input").addEventListener("change", (e)=>{
      const id = e.target.getAttribute("data-clinic");
      if (e.target.checked){
        if (!state.selectedClinicIds.includes(id)) state.selectedClinicIds.push(id);
      } else {
        state.selectedClinicIds = state.selectedClinicIds.filter(x=>x!==id);
      }
      updateUrlFromState();
      renderTable();
    });
    els.clinicsChips.appendChild(chip);
  }
}

function pill(text){
  return `<span class="pill">${escapeHtml(text)}</span>`;
}

function renderTable(){
  const clinics = state.data.clinics.filter(c=>state.selectedClinicIds.includes(c.id));
  const servicesRaw = state.data.services.filter(serviceMatchesFilters);
  const ourId = getOurClinicId();

  const services = servicesRaw.filter(s=>{
    if (state.filters.hideMissingOurs && ourId && state.selectedClinicIds.includes(ourId)){
      if (!hasPrice(s.id, ourId)) return false;
    }
    if (state.filters.onlyComparable){
      let priced = 0;
      for (const cid of state.selectedClinicIds) if (hasPrice(s.id, cid)) priced++;
      if (priced < 2) return false;

      if (ourId && state.selectedClinicIds.includes(ourId)){
        if (!hasPrice(s.id, ourId)) return false;
        let competitorHas = false;
        for (const cid of state.selectedClinicIds){
          if (cid===ourId) continue;
          if (hasPrice(s.id, cid)) {competitorHas=true; break;}
        }
        if (!competitorHas) return false;
      }
    }
    return true;
  });

  const sorted = sortServices(services);

  // Head
  els.tableHead.innerHTML = "";
  const trH = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.className = "colService";
  th0.textContent = "Позиция";
  trH.appendChild(th0);
  for (const c of clinics){
    const th = document.createElement("th");
    th.textContent = c.name;
    trH.appendChild(th);
  }
  els.tableHead.appendChild(trH);

  // Body
  els.tableBody.innerHTML = "";
  for (const s of sorted){
    const tr = document.createElement("tr");

    const tdS = document.createElement("td");
    tdS.className = "colService";
    const pillsHtml = [
      s.tags?.category ? pill(s.tags.category) : "",
      s.tags?.type ? pill(s.tags.type) : "",
    ].filter(Boolean).join("");

    tdS.innerHTML = `
      <div class="serviceName">${escapeHtml(s.name)}</div>
      <div class="pills">${pillsHtml}</div>
    `;
    tr.appendChild(tdS);

    const ourPrice = (ourId && state.selectedClinicIds.includes(ourId)) ? (getPriceEntry(s.id, ourId)?.amount ?? null) : null;

    for (const c of clinics){
      const td = document.createElement("td");
      const entry = getPriceEntry(s.id, c.id);
      const amount = entry?.amount ?? null;

      const hasBreakdown = !!(entry?.breakdown?.length || entry?.note);
      const popBtn = hasBreakdown ? `<button class="iconBtn" data-pop="1" title="Пояснение">i</button>` : "";
      const sub = entry?.sub ? `<div class="sub">${escapeHtml(entry.sub)}</div>` : "";
      const priceHtml = `<div class="price">${fmtRub(amount)} ${popBtn}</div>${sub}`;

      let deltaHtml = "";
      if (state.filters.relative && ourPrice != null && amount != null && c.id !== ourId){
        const d = amount - ourPrice;
        const sign = d > 0 ? "+" : d < 0 ? "−" : "";
        const cls = d > 0 ? "delta delta--pos" : d < 0 ? "delta delta--neg" : "delta delta--zero";
        deltaHtml = `<div class="${cls}">${sign}${fmtRub(Math.abs(d)).replace(" ₽","")} ₽</div>`;
      }

      td.innerHTML = priceHtml + deltaHtml;

      if (hasBreakdown){
        const btn = td.querySelector("button.iconBtn");
        btn.addEventListener("click", (e)=>{
          e.stopPropagation();
          makePopover(btn, c.name, entry?.breakdown || [], entry?.note || "");
        });
      }
      tr.appendChild(td);
    }

    els.tableBody.appendChild(tr);
  }

  els.rowsCount.textContent = String(sorted.length);
  els.comparableCount.textContent = String(calcComparableCount(sorted, state.selectedClinicIds));
}

function exportCsv(){
  const clinics = state.data.clinics.filter(c=>state.selectedClinicIds.includes(c.id));
  const services = sortServices(state.data.services.filter(serviceMatchesFilters));
  const ourId = getOurClinicId();
  const rel = state.filters.relative;

  const header = ["Позиция", ...clinics.map(c=>c.name)];
  const rows = [header];

  for (const s of services){
    if (state.filters.hideMissingOurs && ourId && state.selectedClinicIds.includes(ourId)){
      if (!hasPrice(s.id, ourId)) continue;
    }
    if (state.filters.onlyComparable){
      let priced = 0;
      for (const cid of state.selectedClinicIds) if (hasPrice(s.id, cid)) priced++;
      if (priced < 2) continue;
      if (ourId && state.selectedClinicIds.includes(ourId)){
        if (!hasPrice(s.id, ourId)) continue;
        let competitorHas = false;
        for (const cid of state.selectedClinicIds){
          if (cid===ourId) continue;
          if (hasPrice(s.id, cid)) {competitorHas=true; break;}
        }
        if (!competitorHas) continue;
      }
    }

    const row = [s.name];
    const ourPrice = (ourId && state.selectedClinicIds.includes(ourId)) ? (getPriceEntry(s.id, ourId)?.amount ?? null) : null;

    for (const c of clinics){
      const a = getPriceEntry(s.id, c.id)?.amount ?? null;
      let cell = a==null ? "" : String(a);
      if (rel && ourPrice!=null && a!=null && c.id!==ourId){
        cell = `${a} (Δ ${a-ourPrice})`;
      }
      row.push(cell);
    }
    rows.push(row);
  }

  const csv = rows.map(r=>r.map(v=>{
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  }).join(";")).join("\n");

  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "uzi-compare.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("CSV скачан");
}

function readStateFromUrl(){
  const p = new URLSearchParams(location.search);
  const branch = p.get("branch");
  if (branch) state.branchKey = branch;

  const f = state.filters;
  if (p.get("category")) f.category = p.get("category");
  if (p.get("type")) f.type = p.get("type");
  if (p.get("q")) f.q = p.get("q");
  if (p.get("onlyComparable")) f.onlyComparable = p.get("onlyComparable")==="1";
  if (p.get("hideMissingOurs")) f.hideMissingOurs = p.get("hideMissingOurs")==="1";
  if (p.get("relative")) f.relative = p.get("relative")!=="0";
  if (p.get("sort")) f.sort = p.get("sort");
  const clinics = p.get("clinics");
  if (clinics) state.selectedClinicIds = clinics.split(",").filter(Boolean);
}

function updateUrlFromState(){
  const p = new URLSearchParams();
  const f = state.filters;

  if (state.branchKey) p.set("branch", state.branchKey);

  if (f.category && f.category!=="all") p.set("category", f.category);
  if (f.type && f.type!=="all") p.set("type", f.type);
  if (f.q) p.set("q", f.q);
  if (f.onlyComparable) p.set("onlyComparable","1");
  if (f.hideMissingOurs) p.set("hideMissingOurs","1");
  if (!f.relative) p.set("relative","0");
  if (f.sort && f.sort!=="name") p.set("sort", f.sort);
  if (state.selectedClinicIds?.length) p.set("clinics", state.selectedClinicIds.join(","));
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

function renderMeta(){
  const m = state.data.meta;
  els.pageTitle.textContent = m.title;
  els.pageSubtitle.textContent = m.subtitle;
  els.metaLine.textContent = `Данные: ${m.dataNote} · обновлено: ${m.updatedAt}`;
  els.noteRight.textContent = "Ссылка учитывает филиал, фильтры и выбранные клиники.";
}

function renderBranchToggle(){
  const all = state.allData;
  const branches = all?.branches || [];
  if (!els.branchToggle) return;

  // Hide if only one branch
  if (!branches.length || branches.length === 1){
    els.branchToggle.style.display = "none";
    return;
  }
  els.branchToggle.style.display = "inline-flex";
  els.branchToggle.innerHTML = "";

  for (const b of branches){
    const btn = document.createElement("button");
    btn.className = "segBtn" + (b.key === state.branchKey ? " segBtn--active" : "");
    btn.type = "button";
    btn.textContent = b.label;
    btn.addEventListener("click", ()=>{
      if (b.key === state.branchKey) return;
      setBranch(b.key, {resetClinics: true});
    });
    els.branchToggle.appendChild(btn);
  }
}

function setBranch(key, opts={resetClinics:true}){
  const all = state.allData;
  if (!all?.datasets?.[key]) return;

  closePopover();
  state.branchKey = key;
  state.data = all.datasets[key];

  // Reset clinic selection on branch change (safe default)
  if (opts.resetClinics) state.selectedClinicIds = [];

  renderBranchToggle();
  renderMeta();
  renderFilters();
  renderClinics();
  updateUrlFromState();
  renderTable();
  showToast("Филиал: " + (all.branches.find(x=>x.key===key)?.label || key));
}

function wireEvents(){
  els.categorySelect.addEventListener("change", ()=>{
    state.filters.category = els.categorySelect.value;
    updateUrlFromState(); renderTable();
  });
  els.typeSelect.addEventListener("change", ()=>{
    state.filters.type = els.typeSelect.value;
    updateUrlFromState(); renderTable();
  });
  els.searchInput.addEventListener("input", ()=>{
    state.filters.q = els.searchInput.value;
    updateUrlFromState(); renderTable();
  });
  els.onlyComparable.addEventListener("change", ()=>{
    state.filters.onlyComparable = els.onlyComparable.checked;
    updateUrlFromState(); renderTable();
  });
  els.hideMissingOurs.addEventListener("change", ()=>{
    state.filters.hideMissingOurs = els.hideMissingOurs.checked;
    updateUrlFromState(); renderTable();
  });
  els.relativeMode.addEventListener("change", ()=>{
    state.filters.relative = els.relativeMode.checked;
    updateUrlFromState(); renderTable();
  });
  els.sortSelect.addEventListener("change", ()=>{
    state.filters.sort = els.sortSelect.value;
    updateUrlFromState(); renderTable();
  });

  els.btnCopyLink.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(location.href);
      showToast("Ссылка скопирована");
    }catch{
      showToast("Не удалось скопировать");
    }
  });
  els.btnExportCsv.addEventListener("click", exportCsv);
}

async function init(){
  const res = await fetch("./data/prices.json", {cache:"no-store"});
  state.allData = await res.json();

  readStateFromUrl();

  // Determine default branch
  const branches = state.allData.branches || [];
  const firstKey = branches?.[0]?.key || Object.keys(state.allData.datasets || {})[0];
  const key = (state.branchKey && state.allData.datasets?.[state.branchKey]) ? state.branchKey : firstKey;

  // Set branch (without toast on first load)
  state.branchKey = key;
  state.data = state.allData.datasets[key];

  // Validate category/type values
  const defs = state.data.filterDefs;
  const ok = (arr, v)=>arr.some(x=>x.value===v);
  if (!ok(defs.categories, state.filters.category)) state.filters.category = "all";
  if (!ok(defs.types, state.filters.type)) state.filters.type = "all";

  renderBranchToggle();
  renderMeta();
  renderFilters();
  renderClinics();
  wireEvents();
  updateUrlFromState();
  renderTable();
}

init().catch(err=>{
  console.error(err);
  document.body.innerHTML = "<pre style='padding:16px;color:#000;'>Ошибка загрузки data/prices.json</pre>";
});
