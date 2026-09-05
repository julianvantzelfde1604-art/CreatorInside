let creators = [];
let config = { apiKey: '', zone: '', apifyToken: '' };

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
    if (btn.dataset.tab === 'message') renderMessagePicker();
  });
});

// ---------- Init ----------
async function init() {
  creators = await window.api.loadCreators();
  config = await window.api.loadConfig();
  document.getElementById('settingsApiKey').value = config.apiKey || '';
  document.getElementById('settingsZone').value = config.zone || '';
  document.getElementById('settingsApifyToken').value = config.apifyToken || '';
  renderCreators();
}
init();

// ---------- Settings ----------
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  config = {
    apiKey: document.getElementById('settingsApiKey').value.trim(),
    zone: document.getElementById('settingsZone').value.trim(),
    apifyToken: document.getElementById('settingsApifyToken').value.trim()
  };
  await window.api.saveConfig(config);
  const msg = document.getElementById('settingsSaved');
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 2000);
});

document.getElementById('verifyApifyBtn').addEventListener('click', async () => {
  const token = document.getElementById('settingsApifyToken').value.trim();
  const resultEl = document.getElementById('verifyApifyResult');
  resultEl.className = 'verify-result';
  resultEl.textContent = 'Checking...';
  resultEl.style.display = 'block';

  const result = await window.api.verifyApifyToken({ apiToken: token });

  if (result.success) {
    resultEl.className = 'verify-result ok';
    resultEl.textContent = `Valid -- connected as Apify user "${result.username}".`;
  } else {
    resultEl.className = 'verify-result fail';
    resultEl.textContent = result.error;
  }
});

document.getElementById('verifyBrightDataBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('settingsApiKey').value.trim();
  const zone = document.getElementById('settingsZone').value.trim();
  const resultEl = document.getElementById('verifyBrightDataResult');
  resultEl.className = 'verify-result';
  resultEl.textContent = 'Checking...';
  resultEl.style.display = 'block';

  const result = await window.api.verifyBrightDataCredentials({ apiKey, zone });

  if (!result.success) {
    resultEl.className = 'verify-result fail';
    resultEl.textContent = result.error;
    return;
  }

  if (!zone) {
    resultEl.className = 'verify-result ok';
    resultEl.textContent = `Key is valid. Zones on your account: ${result.zoneNames.join(', ') || '(none found)'}.`;
  } else if (result.zoneMatches) {
    resultEl.className = 'verify-result ok';
    resultEl.textContent = `Key is valid and "${zone}" is a real zone on your account.`;
  } else {
    resultEl.className = 'verify-result fail';
    resultEl.textContent = `Key is valid, but "${zone}" doesn't match any zone on your account. Your real zones: ${result.zoneNames.join(', ') || '(none found)'}.`;
  }
});

// ---------- Lookup ----------
document.getElementById('lookupBtn').addEventListener('click', async () => {
  const username = document.getElementById('lookupUsername').value.trim();
  const statusEl = document.getElementById('lookupStatus');
  const resultEl = document.getElementById('lookupResult');
  const rawEl = document.getElementById('lookupRaw');
  const btn = document.getElementById('lookupBtn');

  if (!username) { alert('Enter a username first.'); return; }
  if (!config.apifyToken) {
    statusEl.textContent = 'No Apify token set -- go to Settings and add it first.';
    return;
  }

  btn.disabled = true;
  statusEl.textContent = 'Fetching via Apify...';
  resultEl.style.display = 'none';
  rawEl.style.display = 'none';

  const response = await window.api.lookupCreatorApify({
    username,
    apiToken: config.apifyToken
  });

  btn.disabled = false;
  statusEl.textContent = '';

  if (response.success) {
    const d = response.data;
    resultEl.className = 'lookup-result';
    resultEl.innerHTML = `
      <b>@${escapeHtml(d.username)}</b>${d.verified ? ' <span title="Verified">✓</span>' : ''}
      <div class="stats">
        ${d.followers !== null ? d.followers.toLocaleString() : '?'} followers ·
        ${d.engagementRate !== null ? d.engagementRate.toFixed(2) + '% engagement (real, from last ' + d.engagementPostsUsed + ' posts)' : 'engagement unknown (no recent post data)'}
      </div>
      ${d.biography ? `<div class="stats" style="font-family:var(--font-ui); font-size:12.5px; margin-top:4px;">${escapeHtml(d.biography)}</div>` : ''}
      ${d.externalUrl ? `<div class="stats" style="font-family:var(--font-ui); font-size:12px; margin-top:4px; color:var(--ink-soft);">Link in bio: ${escapeHtml(d.externalUrl)}</div>` : ''}
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
        notes: d.externalUrl ? `Bio link: ${d.externalUrl}` : '',
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

    if (response.rawResponse) {
      rawEl.textContent = response.rawResponse;
      rawEl.style.display = 'block';
    }
  }
});

// ---------- Lookup (Bright Data, fallback path -- kept for now) ----------
document.getElementById('fallbackBrightDataBtn').addEventListener('click', lookupViaBrightDataFallback);

async function lookupViaBrightDataFallback() {
  const username = document.getElementById('lookupUsername').value.trim();
  const statusEl = document.getElementById('lookupStatus');
  const resultEl = document.getElementById('lookupResult');
  const rawEl = document.getElementById('lookupRaw');

  if (!username) { alert('Enter a username first.'); return; }
  if (!config.apiKey) {
    statusEl.textContent = 'No Bright Data API key set -- go to Settings and add your Bright Data key first.';
    return;
  }

  statusEl.textContent = 'Fetching via Bright Data...';
  resultEl.style.display = 'none';
  rawEl.style.display = 'none';

  const response = await window.api.lookupCreator({
    username,
    apiKey: config.apiKey,
    zone: config.zone
  });

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

    const len = response.rawResponseLength ?? (response.rawResponse ? response.rawResponse.length : 0);
    if (len === 0) {
      rawEl.textContent = '(Bright Data returned an empty response body -- 0 bytes. This usually means the zone/product type does not support this kind of request, or the target blocked the fetch entirely.)';
    } else {
      rawEl.textContent = `[${len} bytes total, showing first 2000]\n\n` + (response.rawResponse || '').slice(0, 2000);
    }
    rawEl.style.display = 'block';
  }
}

// ---------- Discover ----------
document.getElementById('discoverBtn').addEventListener('click', async () => {
  const hashtag = document.getElementById('discoverHashtag').value.trim();
  const min = parseInt(document.getElementById('discoverMin').value, 10) || 0;
  const max = parseInt(document.getElementById('discoverMax').value, 10) || Infinity;
  const minEngagement = parseFloat(document.getElementById('discoverMinEngagement').value) || 0;
  const targetCount = parseInt(document.getElementById('discoverTargetCount').value, 10) || 15;
  const statusEl = document.getElementById('discoverStatus');
  const resultsEl = document.getElementById('discoverResults');
  const rawEl = document.getElementById('discoverRaw');
  const btn = document.getElementById('discoverBtn');

  if (!hashtag) { alert('Enter a hashtag first.'); return; }
  if (!config.apifyToken) {
    statusEl.textContent = 'No Apify token set -- go to Settings and add it first.';
    return;
  }

  btn.disabled = true;
  statusEl.textContent = `Looking for ${targetCount} matching creator(s) -- this checks candidates one by one and can take a while. Each check uses a small amount of your Apify credits.`;
  resultsEl.innerHTML = '';
  rawEl.style.display = 'none';

  const response = await window.api.discoverCreatorsApify({
    hashtag, minFollowers: min, maxFollowers: max, minEngagement, targetCount, apiToken: config.apifyToken
  });

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

  const targetMsg = response.hitTarget
    ? `Found all ${response.results.length} you asked for.`
    : `Only found ${response.results.length} of the ${response.targetCount} you asked for -- checked ${response.candidatesChecked} real candidates and ran out of ones that matched your criteria. Try a broader follower range, a lower engagement minimum, or a more active hashtag.`;
  statusEl.textContent = `${targetMsg} (${response.skipped.length} candidates didn't qualify.)`;

  resultsEl.innerHTML = response.results.map(d => `
    <div class="discover-card" data-username="${d.username}">
      <span><b>@${escapeHtml(d.username)}</b>${d.verified ? ' ✓' : ''} -- ${d.followers.toLocaleString()} followers, ${d.engagementRate !== null ? d.engagementRate.toFixed(2) + '%' : 'unknown'} engagement</span>
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

// ---------- Message Composer ----------
let selectedForMessage = new Set();

function renderMessagePicker() {
  const picker = document.getElementById('messageCreatorPicker');
  if (creators.length === 0) {
    picker.innerHTML = '<div class="picker-row">Add creators in Find Creators or Creator List first.</div>';
    document.getElementById('messagePreviews').innerHTML = '';
    return;
  }
  picker.innerHTML = creators.map(c => `
    <div class="picker-row">
      <input type="checkbox" class="pick-check" data-id="${c.id}" ${selectedForMessage.has(c.id) ? 'checked' : ''}>
      <span>@${escapeHtml(c.username)} -- ${c.followers.toLocaleString()} followers</span>
    </div>
  `).join('');

  document.querySelectorAll('.pick-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedForMessage.add(id);
      else selectedForMessage.delete(id);
      renderMessagePreviews();
    });
  });

  renderMessagePreviews();
}

document.getElementById('messageTemplate').addEventListener('input', renderMessagePreviews);

function renderMessagePreviews() {
  const container = document.getElementById('messagePreviews');
  const template = document.getElementById('messageTemplate').value;
  const selected = creators.filter(c => selectedForMessage.has(c.id));

  if (selected.length === 0) {
    container.innerHTML = '<p class="hint">Check creators on the left to preview their messages here.</p>';
    return;
  }

  container.innerHTML = selected.map(c => {
    const text = template.replace(/\{name\}/g, c.username);
    return `
      <div class="preview-card">
        <div class="preview-header">
          <b>@${escapeHtml(c.username)}</b>
          <button class="btn-secondary copy-msg-btn" data-text="${encodeURIComponent(text)}">Copy</button>
        </div>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.copy-msg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(decodeURIComponent(btn.dataset.text));
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    });
  });
}

// ---------- Bulk Check ----------
let bulkResultsCache = [];

window.api.onBulkCheckProgress((data) => {
  const statusEl = document.getElementById('bulkStatus');
  statusEl.textContent = `Checking ${data.current} of ${data.total}: @${data.username}...`;
});

document.getElementById('bulkCheckBtn').addEventListener('click', async () => {
  const raw = document.getElementById('bulkUsernames').value;
  const usernames = raw.split('\n').map(u => u.trim()).filter(u => u.length > 0);
  const min = parseInt(document.getElementById('bulkMin').value, 10) || 0;
  const max = parseInt(document.getElementById('bulkMax').value, 10) || Infinity;
  const minEngagement = parseFloat(document.getElementById('bulkMinEngagement').value) || 0;
  const statusEl = document.getElementById('bulkStatus');
  const resultsEl = document.getElementById('bulkResults');
  const btn = document.getElementById('bulkCheckBtn');

  if (usernames.length === 0) { alert('Paste at least one username first.'); return; }
  if (!config.apifyToken) {
    statusEl.textContent = 'No Apify token set -- go to Settings and add it first.';
    return;
  }
  if (usernames.length > 50) {
    alert('Capped at 50 per batch -- only the first 50 will be checked.');
  }

  btn.disabled = true;
  resultsEl.innerHTML = '';
  statusEl.textContent = `Starting check of ${Math.min(usernames.length, 50)} usernames...`;

  const response = await window.api.bulkCheckApify({
    usernames, minFollowers: min, maxFollowers: max, minEngagement, apiToken: config.apifyToken
  });

  btn.disabled = false;

  if (!response.success) {
    statusEl.textContent = '';
    resultsEl.innerHTML = `<div class="discover-skip"><b>Bulk check failed:</b> ${escapeHtml(response.error)}</div>`;
    return;
  }

  bulkResultsCache = response.results;
  statusEl.textContent = `Checked ${response.totalChecked}: ${response.results.length} matched your criteria, ${response.skipped.length} did not.`;

  const addAllBtn = response.results.length > 0
    ? `<button class="btn-secondary" id="addAllBulkBtn" style="margin-bottom:8px;">+ Add all ${response.results.length} to Creator List</button>`
    : '';

  resultsEl.innerHTML = addAllBtn + response.results.map(d => `
    <div class="discover-card" data-username="${d.username}">
      <span><b>@${escapeHtml(d.username)}</b>${d.verified ? ' ✓' : ''} -- ${d.followers.toLocaleString()} followers, ${d.engagementRate !== null ? d.engagementRate.toFixed(2) + '%' : 'unknown'} engagement</span>
      <button class="btn-secondary add-bulk-btn" data-username="${d.username}" data-followers="${d.followers}" data-engagement="${d.engagementRate}">+ Add</button>
    </div>
  `).join('') + response.skipped.map(s => `
    <div class="discover-skip">@${escapeHtml(s.username)} skipped -- ${escapeHtml(s.reason)}</div>
  `).join('');

  document.querySelectorAll('.add-bulk-btn').forEach(b => {
    b.addEventListener('click', () => addOneFromBulk(b.dataset.username, b.dataset.followers, b.dataset.engagement, b));
  });

  const addAll = document.getElementById('addAllBulkBtn');
  if (addAll) {
    addAll.addEventListener('click', async () => {
      let added = 0;
      for (const d of bulkResultsCache) {
        if (!creators.some(c => c.username.toLowerCase() === d.username.toLowerCase())) {
          creators.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            username: d.username,
            followers: d.followers,
            engagement: d.engagementRate,
            status: 'Not Contacted',
            instagramUrl: `https://instagram.com/${d.username}`,
            socialBladeUrl: `https://socialblade.com/instagram/user/${d.username}`
          });
          added++;
        }
      }
      await window.api.saveCreators(creators);
      renderCreators();
      alert(`Added ${added} new creator(s) (skipped any already in your list).`);
    });
  }
});

async function addOneFromBulk(username, followersStr, engagementStr, btn) {
  if (creators.some(c => c.username.toLowerCase() === username.toLowerCase())) {
    alert('Already in your list.');
    return;
  }
  creators.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username,
    followers: parseInt(followersStr, 10),
    engagement: engagementStr !== 'null' ? parseFloat(engagementStr) : null,
    status: 'Not Contacted',
    instagramUrl: `https://instagram.com/${username}`,
    socialBladeUrl: `https://socialblade.com/instagram/user/${username}`
  });
  await window.api.saveCreators(creators);
  renderCreators();
  btn.textContent = 'Added ✓';
  btn.disabled = true;
}

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
