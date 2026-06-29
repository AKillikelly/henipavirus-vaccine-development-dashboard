const DATA_URL = 'data/henipavirus_development_pipeline_data.json';

const state = {
  data: null,
  selectedId: null,
  search: '',
  species: 'all',
  stage: 'all',
  evidence: 'all',
  clinicalOnly: false,
  hideGaps: false,
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(v => String(v)))].sort((a, b) => a.localeCompare(b));
}

function sourceDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function sourceCheckFor(url) {
  const checks = state.data?.source_checks || [];
  return checks.find(item => item.url === url || item.final_url === url);
}

function stageFor(record) {
  return (state.data?.stages || []).find(stage => stage.key === record.stage_key) || {};
}

function stageClass(recordOrStage) {
  if (recordOrStage?.css_class) return recordOrStage.css_class;
  const stage = recordOrStage?.stage_key ? stageFor(recordOrStage) : recordOrStage;
  return stage?.css_class || `stage-${escapeHtml(recordOrStage?.stage_key || recordOrStage?.key || 'unknown')}`;
}

function programType(record) {
  return String(record.program_type || 'Unspecified');
}

function isTherapeutic(record) {
  return programType(record).toLowerCase().includes('therapeutic');
}

function isVeterinary(record) {
  return programType(record).toLowerCase().includes('veterinary') || record.stage_key === 'licensed_veterinary';
}

function isSurveillanceOnly(record) {
  const p = programType(record).toLowerCase();
  return p.includes('surveillance') || p.includes('research tool') || record.stage_key === 'surveillance';
}

function isActiveHumanVaccine(record) {
  const p = programType(record).toLowerCase();
  return p.includes('human vaccine') && !p.includes('gap') && !p.includes('preclinical platform') && !record.is_gap;
}

function highestStage(records) {
  if (!records.length) return null;
  return records.reduce((best, record) => (Number(record.stage_order || 0) > Number(best.stage_order || 0) ? record : best), records[0]);
}

function moneyText(item) {
  if (!item || item.amount === undefined || item.amount === null || item.amount === '') {
    return item?.funder ? `${item.funder}: amount not public` : 'Amount not public';
  }
  const amount = Number(item.amount);
  const formatted = Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : escapeHtml(item.amount);
  const unit = item.unit ? ` ${item.unit}` : '';
  return `${item.funder || 'Funder'}: ${item.currency || ''} ${formatted}${unit}`.replace(/\s+/g, ' ').trim();
}

function simpleList(items, empty = 'Not specified') {
  const list = asArray(items).filter(Boolean);
  if (!list.length) return `<span class="muted">${escapeHtml(empty)}</span>`;
  return `<ul class="compact-list">${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function stageChip(record) {
  return `<span class="stage-chip ${stageClass(record)}">${escapeHtml(record.stage)}</span>`;
}

function programChip(record) {
  const lower = programType(record).toLowerCase();
  let klass = 'program-default';
  if (lower.includes('therapeutic')) klass = 'program-therapeutic';
  else if (lower.includes('veterinary')) klass = 'program-veterinary';
  else if (lower.includes('surveillance') || lower.includes('research')) klass = 'program-surveillance';
  else if (lower.includes('gap')) klass = 'program-gap';
  else if (lower.includes('human vaccine')) klass = 'program-vaccine';
  return `<span class="chip ${klass}">${escapeHtml(programType(record))}</span>`;
}

function statusChip(record) {
  const status = String(record.trial_status || record.publication_status || '').toLowerCase();
  let label = record.trial_status || record.publication_status || 'Status not specified';
  let klass = 'status-neutral';
  if (status.includes('ongoing') || status.includes('started') || status.includes('recruit')) klass = 'status-live';
  else if (status.includes('completed') && !status.includes('published')) klass = 'status-complete';
  else if (status.includes('published')) klass = 'status-published';
  else if (status.includes('planned') || status.includes('registered')) klass = 'status-planned';
  else if (status.includes('no active') || status.includes('surveillance')) klass = 'status-surveillance';
  return `<span class="chip ${klass}">${escapeHtml(label)}</span>`;
}

function searchVector(record) {
  return [
    record.id, record.candidate, record.species, record.virus, record.lineage_or_scope,
    record.stage, record.platform, record.platform_family, record.modality,
    record.sponsor_or_steward, record.setting, record.trial_status, record.clinical_phase_detail,
    record.publication_status, record.priority_group, record.program_type, record.status_summary,
    record.next_milestone_or_gap, record.evidence_class, JSON.stringify(record.trial_locations || []),
    JSON.stringify(record.funding || []), JSON.stringify(record.trial_registry_ids || []),
  ].join(' ').toLowerCase();
}

function recordMatches(record) {
  const q = state.search.trim().toLowerCase();
  if (q && !searchVector(record).includes(q)) return false;
  if (state.species !== 'all' && record.species !== state.species) return false;
  if (state.stage !== 'all' && record.stage_key !== state.stage) return false;
  if (state.evidence !== 'all' && record.evidence_class !== state.evidence) return false;
  if (state.clinicalOnly && !record.is_clinical && !String(record.stage_key).startsWith('phase')) return false;
  if (state.hideGaps && record.is_gap) return false;
  return true;
}

function visibleRecords() {
  return (state.data?.records || []).filter(recordMatches);
}

function allRecords() {
  return state.data?.records || [];
}

function groupBy(records, keyFn) {
  return records.reduce((acc, record) => {
    const key = keyFn(record) || 'Unspecified';
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});
}

function renderStat(label, value, note = '') {
  return `<div class="stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${note ? `<div class="fine">${escapeHtml(note)}</div>` : ''}</div>`;
}

function renderHeaderMeta() {
  if (!state.data) return;
  if (els.recordCount) els.recordCount.textContent = allRecords().length;
  if (els.generatedAt) els.generatedAt.textContent = state.data.generated_at || 'unknown';
  if (els.updateMode) els.updateMode.textContent = state.data.update_mode || 'unknown';
  if (els.flagCount) els.flagCount.textContent = state.data.review_flags?.length ?? 0;
}

function renderStats() {
  const records = visibleRecords();
  const sourceCount = state.data?.source_checks?.length || 0;
  const registryCount = state.data?.registry_statuses?.length || 0;
  const publicationCount = state.data?.publication_statuses?.length || 0;
  const flags = records.reduce((sum, record) => sum + (record.review_flags?.length || 0), 0);
  els.stats.innerHTML = [
    renderStat('Visible rows', records.length, `${allRecords().length} total curated rows`),
    renderStat('Active human vaccine candidates', records.filter(isActiveHumanVaccine).length),
    renderStat('Clinical or clinical-entry rows', records.filter(r => r.is_clinical || String(r.stage_key).startsWith('phase')).length),
    renderStat('Therapeutic rows', records.filter(isTherapeutic).length),
    renderStat('Licensed veterinary products', records.filter(isVeterinary).length),
    renderStat('Source / registry / publication checks', `${sourceCount}/${registryCount}/${publicationCount}`, `${flags} visible review flags`),
  ].join('');
}

function populateFilters() {
  const records = allRecords();
  els.speciesFilter.innerHTML = `<option value="all">All species / scopes</option>` + unique(records.map(r => r.species)).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  els.stageFilter.innerHTML = `<option value="all">All stages</option>` + (state.data.stages || []).map(stage => `<option value="${escapeHtml(stage.key)}">${escapeHtml(stage.label)}</option>`).join('');
  els.evidenceFilter.innerHTML = `<option value="all">All evidence classes</option>` + unique(records.map(r => r.evidence_class)).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function renderSpeciesSnapshots() {
  const records = visibleRecords();
  const grouped = groupBy(records, r => r.species);
  const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  els.speciesGrid.innerHTML = entries.length ? entries.map(([species, group]) => {
    const top = highestStage(group);
    const active = group.filter(r => !r.is_gap && !isSurveillanceOnly(r)).length;
    const surveillance = group.filter(isSurveillanceOnly).length;
    return `
      <article class="species-card">
        <div class="name">${escapeHtml(species)}</div>
        <div class="latin">${escapeHtml(unique(group.map(r => r.virus)).join(' / '))}</div>
        ${top ? stageChip(top) : ''}
        <div class="fine">${group.length} visible row${group.length === 1 ? '' : 's'} · ${active} active product row${active === 1 ? '' : 's'} · ${surveillance} surveillance/tool row${surveillance === 1 ? '' : 's'}</div>
      </article>`;
  }).join('') : '<div class="empty">No species match the active filters.</div>';
}

function renderCard(record) {
  const flagCount = record.review_flags?.length || 0;
  return `
    <article class="card ${record.id === state.selectedId ? 'active' : ''}" data-id="${escapeHtml(record.id)}" tabindex="0">
      <div class="card-title">${escapeHtml(record.candidate)}</div>
      <div class="card-sub">${escapeHtml(record.virus)} · ${escapeHtml(record.platform_family || record.platform)}</div>
      <div class="chips">
        ${programChip(record)}
        ${record.is_clinical ? '<span class="chip clinical">clinical</span>' : ''}
        ${record.is_gap ? '<span class="chip gap">gap/surveillance</span>' : ''}
        ${flagCount ? `<span class="chip flag">${flagCount} flag${flagCount === 1 ? '' : 's'}</span>` : ''}
      </div>
      <p class="fine">${escapeHtml(record.status_summary)}</p>
      <div class="fine"><strong>Status:</strong> ${escapeHtml(record.trial_status || record.publication_status || 'Not specified')}</div>
    </article>`;
}

function renderBoard() {
  const records = visibleRecords();
  const byStage = groupBy(records, r => r.stage_key);
  const stages = state.data.stages || [];
  els.board.style.gridTemplateColumns = `repeat(${stages.length}, minmax(255px, 1fr))`;
  els.board.style.minWidth = `${Math.max(2400, stages.length * 270)}px`;
  els.board.innerHTML = stages.map(stage => {
    const group = (byStage[stage.key] || []).sort((a, b) => a.candidate.localeCompare(b.candidate));
    return `
      <section class="lane">
        <div class="lane-head">
          <div>
            <div class="lane-title">${escapeHtml(stage.label)}</div>
            <div class="lane-desc">${escapeHtml(stage.description || '')}</div>
          </div>
          <div class="count-pill">${group.length}</div>
        </div>
        ${group.length ? group.map(renderCard).join('') : '<div class="empty">No visible rows</div>'}
      </section>`;
  }).join('');
  els.board.querySelectorAll('.card').forEach(card => {
    const select = () => { state.selectedId = card.dataset.id; renderAll(false); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    card.addEventListener('click', select);
    card.addEventListener('keydown', evt => { if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); select(); } });
  });
}

function renderSourceList(record) {
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
        <div class="fine">${escapeHtml(source.source_type || sourceDomain(source.url))}${status ? ' · ' + status : ''}</div>
        ${checkedTitle}
      </a>`;
  }).join('');
}

function renderRegistryStatuses(record) {
  const statuses = record.registry_statuses || [];
  if (!statuses.length) return '<div class="empty">No structured registry watch for this row.</div>';
  return statuses.map(status => {
    const title = status.brief_title || status.official_title || status.id || status.system;
    const meta = [status.overall_status, asArray(status.phases).join(', '), status.start_date ? `Start ${status.start_date}` : '', status.primary_completion_date ? `Primary completion ${status.primary_completion_date}` : '', status.completion_date ? `Completion ${status.completion_date}` : ''].filter(Boolean).join(' · ');
    const locs = asArray(status.locations).filter(Boolean).slice(0, 3).map(loc => [loc.facility, loc.city, loc.state, loc.country].filter(Boolean).join(', '));
    return `<div class="source-row"><strong>${escapeHtml(title)}</strong><div class="fine">${escapeHtml(meta || status.note || status.error || 'monitored')}</div>${locs.length ? simpleList(locs) : ''}</div>`;
  }).join('');
}

function renderPublicationWatches(record) {
  const statuses = record.publication_watch_statuses || [];
  if (!statuses.length) return '<div class="empty">No publication watch for this row.</div>';
  return statuses.map(status => {
    const count = status.result_count === null || status.result_count === undefined ? (status.error || status.note || 'not checked') : `${status.result_count} Europe PMC hit${status.result_count === 1 ? '' : 's'}`;
    const top = asArray(status.top_results).slice(0, 3).map(item => `${item.title || 'Untitled'}${item.year ? ` (${item.year})` : ''}`);
    return `<div class="source-row"><strong>${escapeHtml(status.id || status.query)}</strong><div class="fine">${escapeHtml(count)}</div>${top.length ? simpleList(top) : ''}</div>`;
  }).join('');
}

function renderLocations(record) {
  const locations = asArray(record.trial_locations);
  if (!locations.length) return '<div class="empty">No trial/site locations curated.</div>';
  return `<div class="location-list">${locations.map(loc => `
    <div class="location-item">
      <strong>${escapeHtml([loc.country, loc.city].filter(Boolean).join(' · ') || 'Location')}</strong>
      <div>${escapeHtml(loc.site || '')}</div>
      <div class="fine">${escapeHtml(loc.role || '')}</div>
      <div class="fine">Population: ${escapeHtml(loc.population || 'not specified')}</div>
    </div>`).join('')}</div>`;
}

function renderFunding(record) {
  const funding = asArray(record.funding);
  if (!funding.length) return '<div class="empty">No public funding amount curated for this row.</div>';
  return `<div class="funding-list">${funding.map(item => `
    <div class="funding-item">
      <strong>${escapeHtml(moneyText(item))}</strong>
      <div class="fine">${escapeHtml(item.grant_or_award || '')}</div>
      <div class="fine">${escapeHtml(item.note || '')}</div>
    </div>`).join('')}</div>`;
}

function renderDetail() {
  const records = visibleRecords();
  let record = records.find(r => r.id === state.selectedId) || records[0] || allRecords()[0];
  if (!record) {
    els.detail.innerHTML = '<div class="empty">No rows available.</div>';
    return;
  }
  state.selectedId = record.id;
  const flags = record.review_flags || [];
  const keyDates = [
    record.trial_start_date ? `Trial start: ${record.trial_start_date}` : '',
    record.primary_completion_date ? `Primary completion: ${record.primary_completion_date}` : '',
    record.completion_date ? `Completion: ${record.completion_date}` : '',
    record.results_publication_date ? `Results publication: ${record.results_publication_date}` : '',
  ].filter(Boolean);
  els.detail.innerHTML = `
    <div class="detail-box">
      <h3>${escapeHtml(record.candidate)}</h3>
      <div class="chips">${stageChip(record)}${programChip(record)}${statusChip(record)}</div>
      <p>${escapeHtml(record.status_summary)}</p>
      <div class="kv">
        <div>Program type</div><div>${escapeHtml(record.program_type || 'Not specified')}</div>
        <div>Priority group</div><div>${escapeHtml(record.priority_group || 'Not specified')}</div>
        <div>Species / virus</div><div>${escapeHtml(record.species)} · ${escapeHtml(record.virus)}</div>
        <div>Platform family</div><div>${escapeHtml(record.platform_family || record.platform)}</div>
        <div>Platform detail</div><div>${escapeHtml(record.platform)}</div>
        <div>Sponsor / steward</div><div>${escapeHtml(record.sponsor_or_steward)}</div>
        <div>Setting</div><div>${escapeHtml(record.setting)}</div>
        <div>Trial status</div><div>${escapeHtml(record.trial_status || 'Not specified')}</div>
        <div>Publication status</div><div>${escapeHtml(record.publication_status || 'Not specified')}</div>
        <div>Key dates</div><div>${keyDates.length ? escapeHtml(keyDates.join(' · ')) : '<span class="muted">Not specified</span>'}</div>
        <div>Registry IDs</div><div>${asArray(record.trial_registry_ids).length ? escapeHtml(asArray(record.trial_registry_ids).join(', ')) : '<span class="muted">None curated</span>'}</div>
        <div>Evidence</div><div>${escapeHtml(record.evidence_class)}</div>
        <div>Next milestone / gap</div><div>${escapeHtml(record.next_milestone_or_gap)}</div>
        <div>Reserve / stockpile</div><div>${escapeHtml(record.reserve_or_stockpile_status || 'Not specified')}</div>
        <div>Curation note</div><div>${escapeHtml(record.curation_note)}</div>
      </div>
      ${flags.length ? `<h3 class="section-subhead">Review flags</h3><ul class="compact-list">${flags.map(flag => `<li>${escapeHtml(flag.message)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="detail-box">
      <h3>Sites and populations</h3>
      ${renderLocations(record)}
      <h3 class="section-subhead">Funding and sponsorship</h3>
      ${renderFunding(record)}
      <h3 class="section-subhead">Registry status</h3>
      <div class="source-list">${renderRegistryStatuses(record)}</div>
      <h3 class="section-subhead">Publication watch</h3>
      <div class="source-list">${renderPublicationWatches(record)}</div>
      <h3 class="section-subhead">Sources</h3>
      <div class="source-list">${renderSourceList(record)}</div>
    </div>`;
}

function renderTable() {
  const records = visibleRecords().sort((a, b) => Number(b.stage_order || 0) - Number(a.stage_order || 0) || a.candidate.localeCompare(b.candidate));
  els.tableBody.innerHTML = records.length ? records.map(record => `
    <tr data-id="${escapeHtml(record.id)}">
      <td><strong>${escapeHtml(record.candidate)}</strong><div class="fine">${escapeHtml(programType(record))}</div></td>
      <td>${escapeHtml(record.species)}<div class="fine">${escapeHtml(record.virus)}</div></td>
      <td>${stageChip(record)}<div class="fine">${escapeHtml(record.trial_status || '')}</div></td>
      <td>${escapeHtml(record.platform_family || record.platform)}<div class="fine">${escapeHtml(record.platform)}</div></td>
      <td>${escapeHtml(record.sponsor_or_steward)}</td>
      <td>${escapeHtml(record.publication_status || record.evidence_class)}<div class="fine">${escapeHtml(record.evidence_class)}</div></td>
      <td>${record.review_flags?.length || 0}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty">No rows match the active filters.</td></tr>';
  els.tableBody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => { state.selectedId = row.dataset.id; renderAll(false); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });
}

function renderPlatformTracker() {
  if (!els.platformTracker) return;
  const records = visibleRecords().filter(r => !r.is_gap && !isSurveillanceOnly(r));
  const grouped = groupBy(records, r => r.platform_family || r.platform || 'Unspecified');
  const cards = Object.entries(grouped).map(([platform, group]) => {
    const top = highestStage(group);
    const clinical = group.filter(r => r.is_clinical || String(r.stage_key).startsWith('phase')).length;
    const active = group.filter(r => !r.is_gap && !isSurveillanceOnly(r)).length;
    const examples = group.slice().sort((a, b) => Number(b.stage_order || 0) - Number(a.stage_order || 0)).slice(0, 4).map(r => `${r.candidate} — ${r.stage}`);
    return { platform, group, top, clinical, active, examples };
  }).sort((a, b) => Number(b.top?.stage_order || 0) - Number(a.top?.stage_order || 0) || a.platform.localeCompare(b.platform));
  els.platformTracker.innerHTML = cards.length ? `<div class="tracker-grid">${cards.map(item => `
    <article class="tracker-card">
      <h3>${escapeHtml(item.platform)}</h3>
      ${item.top ? stageChip(item.top) : ''}
      <div class="fine">${item.group.length} row${item.group.length === 1 ? '' : 's'} · ${item.clinical} clinical/clinical-entry · ${item.active} active product</div>
      ${simpleList(item.examples)}
    </article>`).join('')}</div>` : '<div class="empty">No platform rows match the active filters.</div>';
}

function renderClinicalTracker() {
  if (!els.clinicalTracker) return;
  const records = visibleRecords().filter(r => !r.is_gap && !isVeterinary(r) && (r.is_clinical || String(r.stage_key).startsWith('phase') || ['ind_enabling'].includes(r.stage_key))).sort((a, b) => Number(b.stage_order || 0) - Number(a.stage_order || 0));
  els.clinicalTracker.innerHTML = records.length ? `
    <div class="table-wrap compact-table"><table>
      <thead><tr><th>Candidate</th><th>Program</th><th>Phase/status</th><th>Publication</th><th>Sites / populations</th><th>Funding</th></tr></thead>
      <tbody>${records.map(record => {
        const locations = asArray(record.trial_locations).map(loc => [loc.country, loc.city, loc.role].filter(Boolean).join(' · ')).slice(0, 3).join(' | ');
        const funding = asArray(record.funding).map(moneyText).join(' | ');
        return `<tr data-id="${escapeHtml(record.id)}"><td><strong>${escapeHtml(record.candidate)}</strong><div class="fine">${escapeHtml(record.trial_registry_ids?.join(', ') || '')}</div></td><td>${escapeHtml(record.program_type)}<div class="fine">${escapeHtml(record.platform_family || '')}</div></td><td>${stageChip(record)}<div class="fine">${escapeHtml(record.trial_status || '')}</div></td><td>${escapeHtml(record.publication_status || 'Not specified')}</td><td>${escapeHtml(locations || 'Not specified')}</td><td>${escapeHtml(funding || 'Not public')}</td></tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="empty">No clinical or clinical-entry rows match the active filters.</div>';
  els.clinicalTracker.querySelectorAll('tr[data-id]').forEach(row => row.addEventListener('click', () => { state.selectedId = row.dataset.id; renderAll(false); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

function renderGeography() {
  if (!els.geographyGrid) return;
  const rows = [];
  for (const record of visibleRecords()) {
    if (record.is_gap && !isSurveillanceOnly(record)) continue;
    for (const loc of asArray(record.trial_locations)) {
      const role = String(loc.role || '');
      const isDevelopmentSite = /phase|trial|clinical|preclinical|surveillance|veterinary|manufacturing|reserve/i.test(role);
      if (!isDevelopmentSite) continue;
      rows.push({ record, loc });
    }
  }
  const grouped = rows.reduce((acc, row) => {
    const country = row.loc.country || 'Unspecified';
    if (!acc[country]) acc[country] = [];
    acc[country].push(row);
    return acc;
  }, {});
  const cards = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([country, group]) => `
    <article class="tracker-card geo-card">
      <h3>${escapeHtml(country)}</h3>
      <div class="fine">${group.length} site/context entr${group.length === 1 ? 'y' : 'ies'}</div>
      <ul class="compact-list">${group.map(({ record, loc }) => `<li><strong>${escapeHtml(record.candidate)}</strong>: ${escapeHtml([loc.city, loc.site, loc.role].filter(Boolean).join(' · '))}<div class="fine">${escapeHtml(loc.population || '')}</div></li>`).join('')}</ul>
    </article>`);
  els.geographyGrid.innerHTML = cards.length ? `<div class="tracker-grid geo-grid">${cards.join('')}</div>` : '<div class="empty">No curated site/location entries match the active filters.</div>';
}

function renderVeterinary() {
  if (!els.veterinaryGrid) return;
  const records = visibleRecords().filter(isVeterinary);
  els.veterinaryGrid.innerHTML = records.length ? `<div class="tracker-grid">${records.map(record => `
    <article class="tracker-card veterinary-card" data-id="${escapeHtml(record.id)}">
      <h3>${escapeHtml(record.candidate)}</h3>
      ${stageChip(record)}
      <p>${escapeHtml(record.status_summary)}</p>
      <div class="fine">${escapeHtml(record.setting)}</div>
    </article>`).join('')}</div>` : '<div class="empty">No veterinary countermeasure rows match the active filters.</div>';
  els.veterinaryGrid.querySelectorAll('[data-id]').forEach(card => card.addEventListener('click', () => { state.selectedId = card.dataset.id; renderAll(false); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

function renderTherapeutics() {
  if (!els.therapeuticsGrid) return;
  const records = visibleRecords().filter(isTherapeutic).sort((a, b) => Number(b.stage_order || 0) - Number(a.stage_order || 0));
  els.therapeuticsGrid.innerHTML = records.length ? `<div class="tracker-grid">${records.map(record => `
    <article class="tracker-card therapeutic-card" data-id="${escapeHtml(record.id)}">
      <h3>${escapeHtml(record.candidate)}</h3>
      <div class="chips">${stageChip(record)}${statusChip(record)}</div>
      <p>${escapeHtml(record.status_summary)}</p>
      <div class="fine">${escapeHtml(record.platform_family || record.platform)}</div>
      <div class="fine">${escapeHtml(record.next_milestone_or_gap || '')}</div>
    </article>`).join('')}</div>` : '<div class="empty">No therapeutic rows match the active filters.</div>';
  els.therapeuticsGrid.querySelectorAll('[data-id]').forEach(card => card.addEventListener('click', () => { state.selectedId = card.dataset.id; renderAll(false); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

function renderSourcesDirectory() {
  if (!els.sourcesDirectory) return;
  const sections = state.data?.data_source_sections || [];
  els.sourcesDirectory.innerHTML = sections.length ? `<div class="source-groups">${sections.map(section => `
    <article class="source-group">
      <h3>${escapeHtml(section.label)}</h3>
      <p class="fine">${escapeHtml(section.description || '')}</p>
      <div class="source-list">${asArray(section.sources).map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(source.title || sourceDomain(source.url))}</strong><div class="fine">${escapeHtml(source.source_type || sourceDomain(source.url))}</div></a>`).join('')}</div>
    </article>`).join('')}</div>` : '<div class="empty">No data-source sections configured.</div>';
}

function renderStageDefinitions() {
  if (!els.stageDefinitions) return;
  const stages = state.data?.stages || [];
  const legend = state.data?.stage_status_legend || [];
  els.stageDefinitions.innerHTML = `
    <div class="method-grid">
      ${stages.map(stage => `<article class="method-card"><h3>${escapeHtml(stage.label)}</h3><span class="stage-chip ${escapeHtml(stage.css_class || '')}">${escapeHtml(stage.key)}</span><p class="fine">${escapeHtml(stage.description || '')}</p></article>`).join('')}
    </div>
    <h3 class="section-subhead">Visual status legend</h3>
    <div class="tracker-grid small-grid">${legend.map(item => `<article class="tracker-card"><h3>${escapeHtml(item.status)}</h3><div class="fine">${escapeHtml(item.visual || '')}</div><p>${escapeHtml(item.description || '')}</p></article>`).join('')}</div>`;
}

function renderAudit() {
  const checks = state.data?.source_checks || [];
  const registry = state.data?.registry_statuses || [];
  const publications = state.data?.publication_statuses || [];
  const ok = checks.filter(c => c.ok === true).length;
  const bad = checks.filter(c => c.ok === false).length;
  const skipped = checks.filter(c => c.ok === null).length;
  const flags = state.data?.review_flags || [];
  els.audit.innerHTML = `
    <div class="audit-grid">
      <div class="audit-card"><strong>${checks.length}</strong><span>source URLs configured</span><div class="fine">${ok} OK · ${bad} failed · ${skipped} skipped</div></div>
      <div class="audit-card"><strong>${registry.length}</strong><span>registry watches</span><div class="fine">ClinicalTrials.gov uses the v2 API; ISRCTN/EU CTIS pages are source-monitored.</div></div>
      <div class="audit-card"><strong>${publications.length}</strong><span>publication watches</span><div class="fine">Europe PMC search checks for new candidate-specific records.</div></div>
      <div class="audit-card"><strong>${flags.length}</strong><span>review flags</span><div class="fine">Flags request human review; they do not auto-promote rows.</div></div>
    </div>
    ${flags.length ? `<h3 class="section-subhead">Current review flags</h3><ul class="compact-list">${flags.map(flag => `<li><strong>${escapeHtml(flag.record_id)}</strong>: ${escapeHtml(flag.message)}</li>`).join('')}</ul>` : ''}`;
}

function renderMethods() {
  const summary = state.data?.dashboard_summary || {};
  const policy = state.data?.curation_policy || {};
  els.methods.innerHTML = `
    <div class="method-grid">
      ${Object.entries(summary).map(([key, value]) => `<article class="method-card"><h3>${escapeHtml(key.replaceAll('_', ' '))}</h3><p>${escapeHtml(value)}</p></article>`).join('')}
      ${Object.entries(policy).map(([key, value]) => `<article class="method-card"><h3>${escapeHtml(key.replaceAll('_', ' '))}</h3><p>${escapeHtml(value)}</p></article>`).join('')}
    </div>`;
}

function renderAll(ensureSelection = true) {
  const records = visibleRecords();
  if (ensureSelection && (!state.selectedId || !records.find(r => r.id === state.selectedId))) {
    state.selectedId = records[0]?.id || allRecords()[0]?.id || null;
  }
  renderHeaderMeta();
  renderStats();
  renderSpeciesSnapshots();
  renderPlatformTracker();
  renderClinicalTracker();
  renderGeography();
  renderBoard();
  renderDetail();
  renderTable();
  renderVeterinary();
  renderTherapeutics();
  renderSourcesDirectory();
  renderStageDefinitions();
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
  renderAll();
}

function wireEvents() {
  els.search.addEventListener('input', evt => { state.search = evt.target.value; renderAll(); });
  els.speciesFilter.addEventListener('change', evt => { state.species = evt.target.value; renderAll(); });
  els.stageFilter.addEventListener('change', evt => { state.stage = evt.target.value; renderAll(); });
  els.evidenceFilter.addEventListener('change', evt => { state.evidence = evt.target.value; renderAll(); });
  els.clinicalOnly.addEventListener('change', evt => { state.clinicalOnly = evt.target.checked; renderAll(); });
  els.hideGaps.addEventListener('change', evt => { state.hideGaps = evt.target.checked; renderAll(); });
  els.reset.addEventListener('click', resetFilters);
}

async function init() {
  Object.assign(els, {
    recordCount: $('record-count'), generatedAt: $('generated-at'), updateMode: $('update-mode'), flagCount: $('flag-count'),
    stats: $('stats'), search: $('search'), speciesFilter: $('species-filter'), stageFilter: $('stage-filter'), evidenceFilter: $('evidence-filter'),
    clinicalOnly: $('clinical-only'), hideGaps: $('hide-gaps'), reset: $('reset'), speciesGrid: $('species-grid'), board: $('board'), detail: $('detail'), tableBody: $('table-body'),
    audit: $('audit'), methods: $('methods'), platformTracker: $('platform-tracker'), clinicalTracker: $('clinical-tracker'), geographyGrid: $('geography-grid'),
    veterinaryGrid: $('veterinary-grid'), therapeuticsGrid: $('therapeutics-grid'), sourcesDirectory: $('sources-directory'), stageDefinitions: $('stage-definitions'),
  });
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    document.title = state.data.dashboard_title || document.title;
    populateFilters();
    wireEvents();
    renderAll();
  } catch (err) {
    const message = `<div class="empty">Could not load dashboard data: ${escapeHtml(err.message)}</div>`;
    if (els.stats) els.stats.innerHTML = message;
    console.error(err);
  }
}

init();
