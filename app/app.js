let creators = [];
let config = { apiKey: '', zone: '' };

// ---------- Auto-update ----------
window.api.onUpdateStatus((data) => {
  const banner = document.getElementById('updateBanner');

  if (data.status === 'downloading') {
    banner.className = 'update-banner downloading';
    banner.innerHTML = `<span>Downloading update to v${data.version}...</span>`;
    banner.style.display = 'flex';
  } else if (data.status === 'ready') {
    banner.className = 'update-banner ready';
    banner.innerHTML = `<span>Update to v${data.version} is ready.</span><button id="restartBtn">Restart to install</button>`;
    banner.style.display = 'flex';
    document.getElementById('restartBtn').addEventListener('click', () => {
      window.api.restartAndInstall();
    });
  } else if (data.status === 'error') {
    banner.className = 'update-banner error';
    banner.innerHTML = `<span>Update check failed: ${escapeHtml(data.message)}</span>`;
    banner.style.display = 'flex';
    setTimeout(() => { banner.style.display = 'none'; }, 6000);
  } else if (data.status === 'up-to-date') {
    banner.style.display = 'none';
  }
});

// ---------- Navigation ----------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------- Init ----------
async function init() {
  creators = await window.api.loadCreators();
  config = await window.api.loadConfig();
  document.getElementById('settingsApiKey').value = config.apiKey || '';
  document.getElementById('settingsZone').value = config.zone || '';
  renderCreators();
}
init();

// ---------- Settings ----------
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  config = {
    apiKey: document.getElementById('settingsApiKey').value.trim(),
    zone: document.getElementById('settingsZone').value.trim()
  };
  await window.api.saveConfig(config);
  const msg = document.getElementById('settingsSaved');
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 2000);
});

// ---------- Lookup ----------
document.getElementById('lookupBtn').addEventListener('click', async () => {
  const username = document.getElementById('lookupUsername').value.trim();
  const statusEl = document.getElementById('lookupStatus');
  const resultEl = document.getElementById('lookupResult');
  const rawEl = document.getElementById('lookupRaw');
  const btn = document.getElementById('lookupBtn');

  if (!username) { alert('Enter a username first.'); return; }
  if (!config.apiKey) {
    statusEl.textContent = 'No API key set -- go to Settings and add your Bright Data key first.';
    return;
  }

  btn.disabled = true;
  statusEl.textContent = 'Fetching via Bright Data...';
  resultEl.style.display = 'none';
  rawEl.style.display = 'none';

  const response = await window.api.lookupCreator({
    username,
    apiKey: config.apiKey,
    zone: config.zone
  });

  btn.disabled = false;
  statusEl.textContent = '';

  if (response.success) {
    const d = response.data;
    resultEl.className = 'lookup-result';
    resultEl.innerHTML = `
      <b>@${escapeHtml(d.username)}</b>
      <div class="stats">
        ${d.followers.toLocaleString()} followers ·
        ${d.engagementRate !== null ? d.engagementRate.toFixed(2) + '%' : 'unknown'} engagement
      </div>
      <button class="btn-secondary" id="addFromLookupBtn" style="margin-top:10px;">+ Add to Creators list</button>
    `;
    resultEl.style.display = 'block';

    document.getElementById('addFromLookupBtn').addEventListener('click', async () => {
      if (creators.some(c => c.username.toLowerCase() === d.username.toLowerCase())) {
        alert('Already in your list.');
        return;
      }
      creators.push({
        id: Date.now().toString(36),
        username: d.username,
        followers: d.followers,
        engagement: d.engagementRate,
        status: 'Not Contacted',
        instagramUrl: `https://instagram.com/${d.username}`,
        socialBladeUrl: `https://socialblade.com/instagram/user/${d.username}`
      });
      await window.api.saveCreators(creators);
      renderCreators();
      alert('Added @' + d.username + ' to your Creators list.');
    });
  } else {
    resultEl.className = 'lookup-result error';
    resultEl.innerHTML = `<b>Lookup failed</b><div class="stats">${escapeHtml(response.error)}</div>`;
    resultEl.style.display = 'block';

    // Always show diagnostics on failure -- even an empty response is
    // useful information, so this no longer hides based on truthiness.
    const len = response.rawResponseLength ?? (response.rawResponse ? response.rawResponse.length : 0);
    if (len === 0) {
      rawEl.textContent = '(Bright Data returned an empty response body -- 0 bytes. This usually means the zone/product type does not support this kind of request, or the target blocked the fetch entirely.)';
    } else {
      rawEl.textContent = `[${len} bytes total, showing first 2000]\n\n` + (response.rawResponse || '').slice(0, 2000);
    }
    rawEl.style.display = 'block';
  }
});

// ---------- Discover ----------
document.getElementById('discoverBtn').addEventListener('click', async () => {
  const hashtag = document.getElementById('discoverHashtag').value.trim();
  const min = parseInt(document.getElementById('discoverMin').value, 10) || 0;
  const max = parseInt(document.getElementById('discoverMax').value, 10) || Infinity;
  const statusEl = document.getElementById('discoverStatus');
  const resultsEl = document.getElementById('discoverResults');
  const rawEl = document.getElementById('discoverRaw');
  const btn = document.getElementById('discoverBtn');

  if (!hashtag) { alert('Enter a hashtag first.'); return; }
  if (!config.apiKey) {
    statusEl.textContent = 'No API key set -- go to Settings and add your Bright Data key first.';
    return;
  }

  btn.disabled = true;
  statusEl.textContent = 'Fetching hashtag page, then checking each candidate on SocialBlade (this can take a minute)...';
  resultsEl.innerHTML = '';
  rawEl.style.display = 'none';

  const response = await window.api.discoverCreators({ hashtag, minFollowers: min, maxFollowers: max, apiKey: config.apiKey, zone: config.zone });

  btn.disabled = false;

  if (!response.success) {
    statusEl.textContent = '';
    resultsEl.innerHTML = `<div class="discover-skip"><b>Discovery failed:</b> ${escapeHtml(response.error)}</div>`;
    if (response.rawResponse) {
      rawEl.textContent = response.rawResponse;
      rawEl.style.display = 'block';
    }
    return;
  }

  statusEl.textContent = `Found ${response.candidatesFound} candidate(s) on the hashtag page, checked each on SocialBlade: ${response.results.length} matched your follower range, ${response.skipped.length} did not.`;

  resultsEl.innerHTML = response.results.map(d => `
    <div class="discover-card" data-username="${d.username}">
      <span><b>@${escapeHtml(d.username)}</b> -- ${d.followers.toLocaleString()} followers, ${d.engagementRate !== null ? d.engagementRate.toFixed(2) + '%' : 'unknown'} engagement</span>
      <button class="btn-secondary add-discover-btn" data-username="${d.username}" data-followers="${d.followers}" data-engagement="${d.engagementRate}">+ Add</button>
    </div>
  `).join('') + response.skipped.map(s => `
    <div class="discover-skip">@${escapeHtml(s.username)} skipped -- ${escapeHtml(s.reason)}</div>
  `).join('');

  document.querySelectorAll('.add-discover-btn').forEach(b => {
    b.addEventListener('click', async () => {
      const username = b.dataset.username;
      if (creators.some(c => c.username.toLowerCase() === username.toLowerCase())) {
        alert('Already in your list.');
        return;
      }
      creators.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        username,
        followers: parseInt(b.dataset.followers, 10),
        engagement: b.dataset.engagement !== 'null' ? parseFloat(b.dataset.engagement) : null,
        status: 'Not Contacted',
        instagramUrl: `https://instagram.com/${username}`,
        socialBladeUrl: `https://socialblade.com/instagram/user/${username}`
      });
      await window.api.saveCreators(creators);
      renderCreators();
      b.textContent = 'Added ✓';
      b.disabled = true;
    });
  });
});

// ---------- Creators tab ----------
['filterMin', 'filterMax'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderCreators);
});

function getFiltered() {
  const min = parseInt(document.getElementById('filterMin').value, 10) || 0;
  const max = parseInt(document.getElementById('filterMax').value, 10) || Infinity;
  return creators.filter(c => c.followers >= min && c.followers <= max);
}

function renderCreators() {
  const filtered = getFiltered();
  const tbody = document.getElementById('creatorsBody');
  const emptyState = document.getElementById('emptyState');

  if (creators.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td><strong>@${escapeHtml(c.username)}</strong></td>
        <td>${c.followers.toLocaleString()}</td>
        <td>${c.engagement !== null && c.engagement !== undefined ? c.engagement.toFixed(2) + '%' : '—'}</td>
        <td>
          <select class="status-select" data-id="${c.id}">
            ${['Not Contacted', 'Messaged', 'Replied', 'Declined'].map(s =>
              `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </td>
        <td>
          <a class="link-btn" data-url="${c.instagramUrl}">IG</a>
          <a class="link-btn" data-url="${c.socialBladeUrl}">SB</a>
        </td>
        <td><button class="delete-btn" data-id="${c.id}">Remove</button></td>
      </tr>
    `).join('');
  }

  const statsRow = document.getElementById('statsRow');
  statsRow.innerHTML = `
    <div class="stat-chip"><b>${creators.length}</b>Total</div>
    <div class="stat-chip"><b>${filtered.length}</b>In range</div>
  `;

  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const c = creators.find(c => c.id === e.target.dataset.id);
      if (c) c.status = e.target.value;
      await window.api.saveCreators(creators);
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      creators = creators.filter(c => c.id !== e.target.dataset.id);
      await window.api.saveCreators(creators);
      renderCreators();
    });
  });
  document.querySelectorAll('.link-btn').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternal(e.target.dataset.url); });
  });
}

document.getElementById('exportBtn').addEventListener('click', async () => {
  if (creators.length === 0) { alert('No creators yet.'); return; }
  const result = await window.api.exportCsv(getFiltered());
  alert(result.success ? 'Exported to: ' + result.path : 'Export failed: ' + result.error);
});

document.getElementById('copyDocsBtn').addEventListener('click', () => {
  const filtered = getFiltered();
  if (filtered.length === 0) { alert('No creators match your filters.'); return; }
  const table = `| Creator Profile | Social Blade |\n|---|---|\n` +
    filtered.map(c => `| [${c.username}](${c.instagramUrl}) | [SocialBlade](${c.socialBladeUrl}) |`).join('\n');
  navigator.clipboard.writeText(table);
  alert('Copied ' + filtered.length + ' creators.');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
