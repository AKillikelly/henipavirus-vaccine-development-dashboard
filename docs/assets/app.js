const DATA_URL = 'data/henipavirus_development_pipeline_data.json';
const CSV_URL = 'data/henipavirus_development_pipeline_data.csv';

const state = {
  payload: null,
  records: [],
  stages: [],
  filtered: [],
  activeId: null,
  search: '',
  species: 'all',
  stage: 'all',
  evidence: 'all',
  clinicalOnly: false,
  hideGaps: false,
};

const els = {};

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stageFor(key) {
  return state.stages.find(stage => stage.key === key) || { label: key, css_class: '', order: 0 };
}

function humanDate(value) {
  if (!value) return 'Not available';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function sourceCheckFor(url) {
  return (state.payload.source_checks || []).find(check => check.url === url);
}

function registryText(status) {
  if (!status) return '';
  if (status.overall_status) {
    const phases = Array.isArray(status.phases) && status.phases.length ? ` · ${status.phases.join(', ')}` : '';
    const date = status.last_update_submit_date ? ` · updated ${status.last_update_submit_date}` : '';
    return `${status.id || status.system}: ${status.overall_status}${phases}${date}`;
  }
  if (status.note) return `${status.id || status.system}: ${status.note}`;
  if (status.error) return `${status.id || status.system}: ${status.error}`;
  return `${status.id || status.system}: monitored`;
}

function populateFilters() {
  const species = Array.from(new Set(state.records.map(r => r.species).filter(Boolean))).sort();
  els.speciesFilter.innerHTML = '<option value="all">All species</option>' + species.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  els.stageFilter.innerHTML = '<option value="all">All stages</option>' + state.stages.map(s => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.label)}</option>`).join('');
  const evidence = Array.from(new Set(state.records.map(r => r.evidence_class).filter(Boolean))).sort();
  els.evidenceFilter.innerHTML = '<option value="all">All evidence classes</option>' + evidence.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

function setStats() {
  const records = state.filtered;
  const sourceChecks = state.payload.source_checks || [];
  const registryStatuses = state.payload.registry_statuses || [];
  const flags = state.payload.review_flags || [];
  const okSources = sourceChecks.filter(s => s.ok === true).length;
  els.stats.innerHTML = `
    <div class="stat"><strong>${records.length}</strong><span>Visible rows</span></div>
    <div class="stat"><strong>${records.filter(r => r.is_clinical).length}</strong><span>Clinical rows</span></div>
    <div class="stat"><strong>${records.filter(r => r.is_gap).length}</strong><span>Gap/surveillance rows</span></div>
    <div class="stat"><strong>${records.filter(r => r.stage_key === 'licensed').length}</strong><span>Licensed One Health rows</span></div>
    <div class="stat"><strong>${okSources}/${sourceChecks.length}</strong><span>Sources passing last check</span></div>
    <div class="stat"><strong>${registryStatuses.length}</strong><span>Registry watches</span></div>
  `;
  els.recordCount.textContent = state.records.length;
  els.generatedAt.textContent = humanDate(state.payload.generated_at);
  els.updateMode.textContent = state.payload.update_mode || 'unknown';
  els.flagCount.textContent = flags.length;
}

function recordMatches(record) {
  if (state.species !== 'all' && record.species !== state.species) return false;
  if (state.stage !== 'all' && record.stage_key !== state.stage) return false;
  if (state.evidence !== 'all' && record.evidence_class !== state.evidence) return false;
  if (state.clinicalOnly && !record.is_clinical) return false;
  if (state.hideGaps && record.is_gap) return false;
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    record.candidate,
    record.species,
    record.virus,
    record.lineage_or_scope,
    record.stage,
    record.platform,
    record.sponsor_or_steward,
    record.setting,
    record.status_summary,
    record.next_milestone_or_gap,
    record.evidence_class,
    record.curation_note,
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

function applyFilters() {
  state.filtered = state.records.filter(recordMatches).sort((a, b) => {
    if (b.stage_order !== a.stage_order) return b.stage_order - a.stage_order;
    return a.candidate.localeCompare(b.candidate);
  });
  if (!state.filtered.some(r => r.id === state.activeId)) {
    state.activeId = state.filtered[0]?.id || state.records[0]?.id || null;
  }
  renderAll();
}

function renderSpecies() {
  const groups = new Map();
  state.filtered.forEach(record => {
    const key = record.species || 'Unspecified';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const html = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([species, records]) => {
      const top = [...records].sort((a, b) => b.stage_order - a.stage_order)[0];
      const stage = stageFor(top.stage_key);
      const viruses = Array.from(new Set(records.map(r => r.virus).filter(Boolean))).slice(0, 3).join('; ');
      return `
        <div class="species-card">
          <div class="name">${escapeHtml(species)}</div>
          <div class="latin">${escapeHtml(viruses || 'Virus not specified')}</div>
          <span class="stage-chip ${escapeHtml(stage.css_class || '')}">${escapeHtml(stage.label)}</span>
          <p class="fine">${records.length} visible row${records.length === 1 ? '' : 's'} · ${records.filter(r => r.is_clinical).length} clinical · ${records.filter(r => r.is_gap).length} gap/surveillance.</p>
        </div>
      `;
    }).join('');
  els.speciesGrid.innerHTML = html || '<div class="empty">No species match the current filters.</div>';
}

function renderBoard() {
  els.board.innerHTML = state.stages.map(stage => {
    const records = state.filtered.filter(record => record.stage_key === stage.key);
    const cards = records.map(record => cardHtml(record)).join('') || '<div class="empty">No visible rows</div>';
    return `
      <section class="lane" aria-label="${escapeHtml(stage.label)}">
        <div class="lane-head">
          <div>
            <div class="lane-title">${escapeHtml(stage.label)}</div>
            <div class="lane-desc">${escapeHtml(stage.description || '')}</div>
          </div>
          <div class="count-pill">${records.length}</div>
        </div>
        ${cards}
      </section>
    `;
  }).join('');
  document.querySelectorAll('[data-card-id]').forEach(card => {
    card.addEventListener('click', () => selectRecord(card.dataset.cardId));
  });
}

function cardHtml(record) {
  const stage = stageFor(record.stage_key);
  const flags = record.review_flags || [];
  const registries = record.registry_statuses || [];
  return `
    <article class="card ${record.id === state.activeId ? 'active' : ''}" data-card-id="${escapeHtml(record.id)}" tabindex="0">
      <div class="card-title">${escapeHtml(record.candidate)}</div>
      <div class="card-sub">${escapeHtml(record.virus)} · ${escapeHtml(record.platform)}</div>
      <div class="chips">
        <span class="stage-chip ${escapeHtml(stage.css_class || '')}">${escapeHtml(stage.label)}</span>
        ${record.is_clinical ? '<span class="chip clinical">Clinical</span>' : ''}
        ${record.is_gap ? '<span class="chip gap">Gap</span>' : ''}
        ${flags.length ? `<span class="chip flag">${flags.length} review flag${flags.length === 1 ? '' : 's'}</span>` : ''}
      </div>
      <div class="card-sub">${escapeHtml(record.sponsor_or_steward)}</div>
      ${registries.length ? `<div class="card-sub">${escapeHtml(registryText(registries[0]))}</div>` : ''}
    </article>
  `;
}

function selectRecord(id) {
  state.activeId = id;
  renderBoard();
  renderDetails();
  renderTable();
  const details = byId('details');
  if (details) details.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sourceLinks(record) {
  const sources = record.sources || [];
  if (!sources.length) return '<div class="empty">No sources configured.</div>';
  return sources.map(source => {
    const check = sourceCheckFor(source.url);
    let status = '';
    if (check) {
      if (check.ok === true) status = `<span class="good">HTTP ${escapeHtml(check.status_code)}</span>`;
      else if (check.ok === false) status = `<span class="bad">HTTP ${escapeHtml(check.status_code || 'error')}</span>`;
      else status = `<span class="warn">not checked</span>`;
    }
    const checkedTitle = check?.title ? `<div class="fine">Last page title: ${escapeHtml(check.title)}</div>` : '';
    return `
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(source.title || sourceDomain(source.url))}</strong>
        <div class="fine">${escapeHtml(sourceDomain(source.url))} ${status ? '· ' + status : ''}</div>
        ${checkedTitle}
      </a>
    `;
  }).join('');
}

function registryBlock(record) {
  const statuses = record.registry_statuses || [];
  if (!statuses.length) return '<div class="empty">No structured registry watch configured for this row.</div>';
  return statuses.map(status => {
    const title = status.brief_title || status.official_title || status.id || status.system;
    const url = status.url || status.api_url || '#';
    return `
      <div class="source-row">
        <strong>${escapeHtml(title)}</strong>
        <div class="fine">${escapeHtml(registryText(status))}</div>
        ${status.lead_sponsor ? `<div class="fine">Lead sponsor: ${escapeHtml(status.lead_sponsor)}</div>` : ''}
        ${status.enrollment_count ? `<div class="fine">Enrollment: ${escapeHtml(status.enrollment_count)} ${escapeHtml(status.enrollment_type || '')}</div>` : ''}
        ${url !== '#' ? `<div class="fine"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open registry</a></div>` : ''}
      </div>
    `;
  }).join('');
}

function flagsBlock(record) {
  const flags = record.review_flags || [];
  if (!flags.length) return '<div class="empty">No review flags for this row in the latest update.</div>';
  return flags.map(flag => `<div class="source-row"><strong class="warn">${escapeHtml(flag.severity || 'review')}</strong><div class="fine">${escapeHtml(flag.message)}</div></div>`).join('');
}

function renderDetails() {
  const record = state.records.find(r => r.id === state.activeId) || state.filtered[0] || state.records[0];
  if (!record) {
    els.detail.innerHTML = '<div class="empty">No rows available.</div>';
    return;
  }
  const stage = stageFor(record.stage_key);
  els.detail.innerHTML = `
    <div class="detail-box">
      <div class="eyebrow">Selected pathway</div>
      <h2>${escapeHtml(record.candidate)}</h2>
      <div class="chips">
        <span class="stage-chip ${escapeHtml(stage.css_class || '')}">${escapeHtml(stage.label)}</span>
        ${record.is_clinical ? '<span class="chip clinical">Public human clinical row</span>' : ''}
        ${record.is_gap ? '<span class="chip gap">Gap/surveillance</span>' : ''}
      </div>
      <p>${escapeHtml(record.status_summary)}</p>
      <div class="kv">
        <div>Species</div><div><em>${escapeHtml(record.species)}</em></div>
        <div>Virus / scope</div><div>${escapeHtml(record.virus)}<br>${escapeHtml(record.lineage_or_scope || '')}</div>
        <div>Platform</div><div>${escapeHtml(record.platform)}</div>
        <div>Sponsor / steward</div><div>${escapeHtml(record.sponsor_or_steward)}</div>
        <div>Setting</div><div>${escapeHtml(record.setting)}</div>
        <div>Evidence class</div><div>${escapeHtml(record.evidence_class)}</div>
        <div>Next milestone / gap</div><div>${escapeHtml(record.next_milestone_or_gap)}</div>
        <div>Curation note</div><div>${escapeHtml(record.curation_note)}</div>
      </div>
    </div>
    <div class="detail-box">
      <h3>Sources</h3>
      <div class="source-list">${sourceLinks(record)}</div>
      <h3 style="margin-top:16px">Registry watch</h3>
      <div class="source-list">${registryBlock(record)}</div>
      <h3 style="margin-top:16px">Automated review flags</h3>
      <div class="source-list">${flagsBlock(record)}</div>
    </div>
  `;
}

function renderTable() {
  const rows = state.filtered.map(record => {
    const stage = stageFor(record.stage_key);
    return `
      <tr data-row-id="${escapeHtml(record.id)}" class="${record.id === state.activeId ? 'active' : ''}">
        <td><strong>${escapeHtml(record.candidate)}</strong><div class="fine">${escapeHtml(record.id)}</div></td>
        <td><em>${escapeHtml(record.species)}</em><br><span class="fine">${escapeHtml(record.virus)}</span></td>
        <td><span class="stage-chip ${escapeHtml(stage.css_class || '')}">${escapeHtml(stage.label)}</span></td>
        <td>${escapeHtml(record.platform)}</td>
        <td>${escapeHtml(record.sponsor_or_steward)}</td>
        <td>${escapeHtml(record.evidence_class)}</td>
        <td>${escapeHtml((record.review_flags || []).length)}</td>
      </tr>
    `;
  }).join('');
  els.tableBody.innerHTML = rows || '<tr><td colspan="7" class="empty">No rows match the current filters.</td></tr>';
  document.querySelectorAll('[data-row-id]').forEach(row => row.addEventListener('click', () => selectRecord(row.dataset.rowId)));
}

function renderAudit() {
  const checks = state.payload.source_checks || [];
  const flags = state.payload.review_flags || [];
  const registry = state.payload.registry_statuses || [];
  const ok = checks.filter(check => check.ok === true).length;
  const failed = checks.filter(check => check.ok === false).length;
  const skipped = checks.filter(check => check.ok === null || check.ok === undefined).length;
  els.audit.innerHTML = `
    <div class="audit-grid">
      <div class="audit-card"><strong>${ok}</strong><span class="good">Sources OK</span></div>
      <div class="audit-card"><strong>${failed}</strong><span class="bad">Source fetch issues</span></div>
      <div class="audit-card"><strong>${skipped}</strong><span class="warn">Sources not checked</span></div>
      <div class="audit-card"><strong>${flags.length}</strong><span class="warn">Review flags</span></div>
    </div>
    <div class="table-wrap" style="margin-top:14px; max-height:360px">
      <table>
        <thead><tr><th>URL</th><th>Status</th><th>Last title</th><th>Checked</th></tr></thead>
        <tbody>
          ${checks.map(check => `
            <tr>
              <td><a href="${escapeHtml(check.url)}" target="_blank" rel="noreferrer">${escapeHtml(sourceDomain(check.url))}</a><div class="fine code">${escapeHtml(check.url)}</div></td>
              <td>${check.ok === true ? '<span class="good">OK</span>' : check.ok === false ? '<span class="bad">Issue</span>' : '<span class="warn">Skipped</span>'}<div class="fine">${escapeHtml(check.status_code || check.error || '')}</div></td>
              <td>${escapeHtml(check.title || '—')}</td>
              <td>${escapeHtml(humanDate(check.checked_at))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <h3 style="margin-top:16px">Registry watches</h3>
    <div class="source-list">
      ${registry.length ? registry.map(item => `<div class="source-row"><strong>${escapeHtml(item.id || item.system)}</strong><div class="fine">${escapeHtml(registryText(item))}</div></div>`).join('') : '<div class="empty">No registry watches configured.</div>'}
    </div>
  `;
}

function renderMethods() {
  const policy = state.payload.curation_policy || {};
  els.methods.innerHTML = `
    <div class="method-grid">
      <div class="method-card"><h3>Curated stage, automated metadata</h3><p>${escapeHtml(policy.auto_update_scope || 'Automation refreshes source and registry metadata. Curated stages require review before promotion.')}</p></div>
      <div class="method-card"><h3>Gap interpretation</h3><p>${escapeHtml(policy.gap_definition || 'Gap lanes indicate no public pathway found in configured sources.')}</p></div>
      <div class="method-card"><h3>Indication separation</h3><p>${escapeHtml(policy.human_vs_veterinary || 'Veterinary and human indications are separated.')}</p></div>
    </div>
  `;
}

function renderAll() {
  setStats();
  renderSpecies();
  renderBoard();
  renderDetails();
  renderTable();
  renderAudit();
  renderMethods();
}

function resetFilters() {
  state.search = '';
  state.species = 'all';
  state.stage = 'all';
  state.evidence = 'all';
  state.clinicalOnly = false;
  state.hideGaps = false;
  els.search.value = '';
  els.speciesFilter.value = 'all';
  els.stageFilter.value = 'all';
  els.evidenceFilter.value = 'all';
  els.clinicalOnly.checked = false;
  els.hideGaps.checked = false;
  applyFilters();
}

function bindControls() {
  els.search.addEventListener('input', e => { state.search = e.target.value; applyFilters(); });
  els.speciesFilter.addEventListener('change', e => { state.species = e.target.value; applyFilters(); });
  els.stageFilter.addEventListener('change', e => { state.stage = e.target.value; applyFilters(); });
  els.evidenceFilter.addEventListener('change', e => { state.evidence = e.target.value; applyFilters(); });
  els.clinicalOnly.addEventListener('change', e => { state.clinicalOnly = e.target.checked; applyFilters(); });
  els.hideGaps.addEventListener('change', e => { state.hideGaps = e.target.checked; applyFilters(); });
  els.reset.addEventListener('click', resetFilters);
}

async function loadData() {
  const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${DATA_URL}: HTTP ${response.status}`);
  const payload = await response.json();
  state.payload = payload;
  state.records = payload.records || [];
  state.stages = (payload.stages || []).slice().sort((a, b) => Number(a.order) - Number(b.order));
  state.activeId = state.records[0]?.id || null;
}

async function init() {
  Object.assign(els, {
    stats: byId('stats'),
    recordCount: byId('record-count'),
    generatedAt: byId('generated-at'),
    updateMode: byId('update-mode'),
    flagCount: byId('flag-count'),
    search: byId('search'),
    speciesFilter: byId('species-filter'),
    stageFilter: byId('stage-filter'),
    evidenceFilter: byId('evidence-filter'),
    clinicalOnly: byId('clinical-only'),
    hideGaps: byId('hide-gaps'),
    reset: byId('reset'),
    speciesGrid: byId('species-grid'),
    board: byId('board'),
    detail: byId('detail'),
    tableBody: byId('table-body'),
    audit: byId('audit'),
    methods: byId('methods'),
    csvLink: byId('csv-link'),
    jsonLink: byId('json-link'),
  });
  els.csvLink.href = CSV_URL;
  els.jsonLink.href = DATA_URL;
  try {
    await loadData();
    populateFilters();
    bindControls();
    applyFilters();
  } catch (error) {
    document.querySelector('main').innerHTML = `<section class="panel"><h2>Could not load dashboard data</h2><p class="bad">${escapeHtml(error.message)}</p><p>Open this site through a local web server or GitHub Pages; direct file:// loading may block JSON fetches in some browsers.</p></section>`;
    throw error;
  }
}

document.addEventListener('DOMContentLoaded', init);
