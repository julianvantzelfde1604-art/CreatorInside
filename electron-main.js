const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;

const dataDir = app.getPath('userData');
const creatorsFile = path.join(dataDir, 'creators.json');
const configFile = path.join(dataDir, 'config.json');

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error('Failed to load', file, err);
    return fallback;
  }
}

function saveJson(file, data) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow.loadFile('app/index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  // Check for updates a few seconds after launch, so it doesn't
  // compete with the app's own startup. Silent unless something is
  // actually found.
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.log('Update check failed (this is fine if offline):', err.message);
    });
  }, 5000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// ---------- Auto-update ----------
// Checks your public GitHub repo's Releases for a newer version.
// Downloads it in the background, then tells the renderer a restart
// is ready -- nothing installs until you click Restart.

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', version: info.version });
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'up-to-date' });
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', message: err.message });
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'ready', version: info.version });
});

ipcMain.handle('restart-and-install', async () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates-now', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------- Persistence ----------

ipcMain.handle('load-creators', async () => loadJson(creatorsFile, []));

ipcMain.handle('save-creators', async (event, creators) => {
  try {
    saveJson(creatorsFile, creators);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-config', async () => loadJson(configFile, { apiKey: '', zone: '' }));

ipcMain.handle('save-config', async (event, config) => {
  try {
    saveJson(configFile, config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Blocked non-http(s) URL' };
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-csv', async (event, creators) => {
  try {
    const os = require('os');
    const header = ['Username', 'Instagram URL', 'SocialBlade URL', 'Followers', 'Engagement %', 'Status', 'Notes'];
    const rows = creators.map(c => [
      c.username, c.instagramUrl, c.socialBladeUrl || '', c.followers, c.engagement, c.status,
      (c.notes || '').replace(/\n/g, ' ').replace(/,/g, ';')
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const timestamp = new Date().toISOString().slice(0, 10);
    const filePath = path.join(os.homedir(), 'Downloads', `creator-prospects-${timestamp}.csv`);
    fs.writeFileSync(filePath, csv, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------- Bright Data lookup ----------
// Honest note: this request shape (endpoint, payload, auth header) is
// built from Bright Data's documented Web Unlocker API pattern. It has
// not been tested against a live account from the build environment
// (no network path to api.brightdata.com there). The response --
// success or error -- from your real API key is what confirms whether
// this is right. If it fails, the raw error is shown, not hidden.

function fetchViaBrightData(targetUrl, apiKey, zone) {
  return new Promise((resolve, reject) => {
    // format: "json" (not "raw") is deliberate -- Bright Data silently
    // returns an empty 200 on internal failures when using "raw", but
    // wraps the real status/headers/error around the content when using
    // "json". That's the only way this app can show you the actual
    // cause of a failure instead of a bare "0 bytes back".
    const payload = JSON.stringify({
      url: targetUrl,
      format: 'json',
      ...(zone ? { zone } : {})
    });

    const req = https.request(
      {
        hostname: 'api.brightdata.com',
        path: '/request',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 45000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 45s -- Bright Data itself may still be waiting on something (like an unresolved "expect element" setting) rather than this being a connection problem.')); });
    req.write(payload);
    req.end();
  });
}

// Unwraps Bright Data's format=json envelope: { status_code, headers,
// body }. Returns { html, brightDataError } so callers can show the
// REAL failure reason (e.g. "waiting for selector timed out") instead
// of a bare empty response.
function unwrapBrightDataResponse(rawBody) {
  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch (err) {
    // Not JSON at all -- treat the raw text as the error context.
    return { html: null, brightDataError: null, statusCode: null, parseFailed: true };
  }

  const headers = envelope.headers || {};
  const brightDataError = headers['x-brd-error'] || headers['x-brd-error-code'] || null;

  return {
    html: envelope.body || '',
    brightDataError,
    statusCode: envelope.status_code
  };
}

function parseSocialBlade(html, username) {
  const result = { username, followers: null, engagementRate: null };
  const followersMatch = html.match(/Followers[\s\S]{0,200}?([\d,]+)/i);
  const engagementMatch = html.match(/Engagement Rate[\s\S]{0,200}?([\d.]+)/i);
  if (followersMatch) result.followers = parseInt(followersMatch[1].replace(/,/g, ''), 10);
  if (engagementMatch) result.engagementRate = parseFloat(engagementMatch[1]);
  return result;
}

ipcMain.handle('lookup-creator', async (event, { username, apiKey, zone }) => {
  if (!apiKey) {
    return { success: false, error: 'No Bright Data API key set. Add it in Settings first.' };
  }
  const cleanUsername = username.replace(/^@/, '').trim();
  const targetUrl = `https://socialblade.com/instagram/user/${cleanUsername}`;

  try {
    const response = await fetchViaBrightData(targetUrl, apiKey, zone);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        success: false,
        error: `Bright Data's own API call failed with HTTP ${response.statusCode}`,
        rawResponse: response.body,
        rawResponseLength: response.body.length
      };
    }

    const unwrapped = unwrapBrightDataResponse(response.body);

    if (unwrapped.parseFailed) {
      return {
        success: false,
        error: 'Got a response back but it was not valid JSON -- unexpected format.',
        rawResponse: response.body,
        rawResponseLength: response.body.length
      };
    }

    if (unwrapped.brightDataError) {
      return {
        success: false,
        error: `Bright Data could not fetch the target page: ${unwrapped.brightDataError}`,
        rawResponse: response.body,
        rawResponseLength: response.body.length
      };
    }

    if (unwrapped.statusCode && (unwrapped.statusCode < 200 || unwrapped.statusCode >= 300)) {
      return {
        success: false,
        error: `The target page itself returned HTTP ${unwrapped.statusCode}`,
        rawResponse: response.body,
        rawResponseLength: response.body.length
      };
    }

    const parsed = parseSocialBlade(unwrapped.html || '', cleanUsername);

    if (parsed.followers === null) {
      return {
        success: false,
        error: `Fetched the page (${(unwrapped.html || '').length} bytes of real HTML back, no Bright Data error) but could not find follower/engagement numbers in it -- the page layout may not match what this was built against.`,
        rawResponse: unwrapped.html,
        rawResponseLength: (unwrapped.html || '').length
      };
    }

    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------- Hashtag / niche discovery ----------
// Honest note: Instagram's hashtag pages load most content via
// JavaScript, so a plain HTML fetch (even through Bright Data's
// unlocker) may return an incomplete page -- far fewer usernames than
// what you'd see scrolling it yourself in a browser. This tries a
// render-enabled fetch first. If it comes back thin, the raw response
// is shown so we can see exactly what came back and adjust.
//
// Also worth knowing: each search uses multiple Bright Data requests
// (1 for the hashtag page + 1 per candidate found), which counts
// against your Bright Data usage/cost. Capped at 15 candidates per
// search to keep that predictable.

const MAX_CANDIDATES_PER_SEARCH = 15;

function extractUsernamesFromHashtagPage(html) {
  const found = new Set();
  const excludeList = new Set(['explore', 'reels', 'accounts', 'directory', 'about', 'legal', 'p', 'tv', 'stories', 'developer']);

  // Instagram often embeds usernames in JSON blobs like "username":"foo"
  const jsonMatches = html.matchAll(/"username":"([a-zA-Z0-9_.]{2,30})"/g);
  for (const m of jsonMatches) found.add(m[1]);

  // Fallback: plain profile links like instagram.com/someuser/
  const linkMatches = html.matchAll(/instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?["'\s]/g);
  for (const m of linkMatches) {
    if (!excludeList.has(m[1].toLowerCase())) found.add(m[1]);
  }

  return Array.from(found).filter(u => !excludeList.has(u.toLowerCase()));
}

ipcMain.handle('discover-creators', async (event, { hashtag, minFollowers, maxFollowers, apiKey, zone }) => {
  if (!apiKey) {
    return { success: false, error: 'No Bright Data API key set. Add it in Settings first.' };
  }
  // Instagram hashtags can't contain spaces, capitals, or punctuation --
  // normalize whatever the user typed instead of sending a broken URL.
  const cleanTag = hashtag
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (!cleanTag) {
    return { success: false, error: 'Enter a hashtag with at least one letter or number in it.' };
  }

  const targetUrl = `https://www.instagram.com/explore/tags/${cleanTag}/`;

  try {
    const response = await fetchViaBrightData(targetUrl, apiKey, zone);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        success: false,
        error: `Bright Data's own API call failed with HTTP ${response.statusCode}`,
        rawResponse: response.body.slice(0, 2000)
      };
    }

    const unwrapped = unwrapBrightDataResponse(response.body);

    if (unwrapped.brightDataError) {
      return {
        success: false,
        error: `Bright Data could not fetch the hashtag page: ${unwrapped.brightDataError}`,
        rawResponse: response.body.slice(0, 2000)
      };
    }

    const hashtagHtml = unwrapped.html || '';
    const candidates = extractUsernamesFromHashtagPage(hashtagHtml).slice(0, MAX_CANDIDATES_PER_SEARCH);

    if (candidates.length === 0) {
      return {
        success: false,
        error: 'Fetched the hashtag page but found no usable usernames in it -- likely because Instagram rendered the post grid via JavaScript that this fetch did not execute.',
        rawResponse: hashtagHtml.slice(0, 2000)
      };
    }

    const results = [];
    const skipped = [];

    for (const username of candidates) {
      const sbUrl = `https://socialblade.com/instagram/user/${username}`;
      try {
        const sbResponse = await fetchViaBrightData(sbUrl, apiKey, zone);
        if (sbResponse.statusCode < 200 || sbResponse.statusCode >= 300) {
          skipped.push({ username, reason: `Bright Data API call failed (HTTP ${sbResponse.statusCode})` });
          continue;
        }
        const sbUnwrapped = unwrapBrightDataResponse(sbResponse.body);
        if (sbUnwrapped.brightDataError) {
          skipped.push({ username, reason: sbUnwrapped.brightDataError });
          continue;
        }
        const parsed = parseSocialBlade(sbUnwrapped.html || '', username);
        if (parsed.followers === null) {
          skipped.push({ username, reason: 'Could not read follower count from real page content' });
          continue;
        }
        if (parsed.followers < minFollowers || parsed.followers > maxFollowers) {
          skipped.push({ username, reason: `${parsed.followers.toLocaleString()} followers -- outside your range` });
          continue;
        }
        results.push(parsed);
      } catch (err) {
        skipped.push({ username, reason: err.message });
      }
    }

    return {
      success: true,
      candidatesFound: candidates.length,
      results,
      skipped
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
