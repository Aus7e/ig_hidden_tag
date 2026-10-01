const scanButton = document.getElementById('scanButton');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const countBadge = document.getElementById('countBadge');

scanButton.addEventListener('click', scanCurrentTab);

async function scanCurrentTab() {
  setBusy(true);
  clearResults();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url?.startsWith('https://www.instagram.com/')) {
      throw new Error('Open Instagram in the active tab first.');
    }

    statusEl.textContent = 'Scanning page data…';

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanInstagramPage
    });

    const mentions = Array.isArray(result?.mentions) ? result.mentions : [];
    renderResults(mentions);

    countBadge.textContent = String(mentions.length);
    statusEl.textContent = mentions.length
      ? `Found ${mentions.length} unique mention${mentions.length === 1 ? '' : 's'}.`
      : 'No ig_mention usernames found in the currently loaded page data.';
  } catch (error) {
    statusEl.textContent = error?.message || 'Scan failed.';
    countBadge.textContent = '0';
  } finally {
    setBusy(false);
  }
}

function clearResults() {
  resultsEl.innerHTML = '';
  countBadge.textContent = '0';
}

function renderResults(mentions) {
  if (!mentions.length) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'Nothing detected. Try while the Story is open and fully loaded.';
    resultsEl.appendChild(item);
    return;
  }

  for (const mention of mentions) {
    const li = document.createElement('li');
    li.className = 'result';

    const link = document.createElement('a');
    link.href = `https://www.instagram.com/${encodeURIComponent(mention.username)}/`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `@${mention.username}`;

    const source = document.createElement('span');
    source.className = 'source';
    source.textContent = mention.source || 'page';

    li.append(link, source);
    resultsEl.appendChild(li);
  }
}

function setBusy(isBusy) {
  scanButton.disabled = isBusy;
  scanButton.textContent = isBusy ? 'Scanning…' : 'Scan current Story';
}

async function scanInstagramPage() {
  const found = new Map();

  const add = (username, source) => {
    if (typeof username !== 'string') return;

    const cleaned = username
      .trim()
      .replace(/^@+/, '')
      .replace(/\\u002E/gi, '.')
      .replace(/\\u005F/gi, '_');

    if (!/^[A-Za-z0-9._]{1,30}$/.test(cleaned)) return;

    const key = cleaned.toLowerCase();
    if (!found.has(key)) found.set(key, { username: cleaned, source });
  };

  const decodeEscapes = (value) => {
    if (typeof value !== 'string') return value;
    return value
      .replace(/\\u002F/gi, '/')
      .replace(/\\u002E/gi, '.')
      .replace(/\\u005F/gi, '_')
      .replace(/\\"/g, '"');
  };

  const scanText = (raw, source) => {
    if (!raw || typeof raw !== 'string' || !raw.includes('ig_mention')) return;

    const text = decodeEscapes(raw);

    const patterns = [
      /ig_mention[\\s\\S]{0,900}?"username"\\s*:\\s*"([A-Za-z0-9._]{1,30})"/gi,
      /"username"\\s*:\\s*"([A-Za-z0-9._]{1,30})"[\\s\\S]{0,900}?ig_mention/gi,
      /ig_mention[\\s\\S]{0,900}?"user"[\\s\\S]{0,250}?"username"\\s*:\\s*"([A-Za-z0-9._]{1,30})"/gi,
      /ig_mention[\\s\\S]{0,700}?username\\?"?\\s*[:=]\\s*\\?"([A-Za-z0-9._]{1,30})/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) add(match[1], source);
    }
  };

  scanText(document.documentElement?.innerHTML || '', 'DOM');

  for (const script of document.scripts) {
    scanText(script.textContent || '', 'script');
  }

  try {
    const response = await fetch(location.href, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (response.ok) {
      scanText(await response.text(), 'page source');
    }
  } catch (_) {
    // DOM scanning can still succeed if fetching is blocked.
  }

  return {
    url: location.href,
    mentions: [...found.values()].sort((a, b) => a.username.localeCompare(b.username))
  };
}
