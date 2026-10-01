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

    statusEl.textContent = 'Scanning captured Story data…';

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: scanInstagramPage
    });

    const mentions = Array.isArray(result?.mentions) ? result.mentions : [];
    renderResults(mentions);
    countBadge.textContent = String(mentions.length);

    if (mentions.length) {
      statusEl.textContent =
        `Found ${mentions.length} unique mention${mentions.length === 1 ? '' : 's'}.`;
    } else if (!result?.captureActive) {
      statusEl.textContent =
        'Capture is not active. Reload Instagram, reopen the Story, then scan again.';
    } else if (result?.markerCount > 0) {
      statusEl.textContent =
        `Found ${result.markerCount} ig_mention marker${result.markerCount === 1 ? '' : 's'}, but no username nearby.`;
    } else {
      statusEl.textContent =
        'No ig_mention markers captured. Reopen or advance to the Story, wait a moment, then scan again.';
    }
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
    item.textContent = 'Nothing detected.';
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

function scanInstagramPage() {
  const found = new Map();
  let markerCount = 0;

  const cleanUsername = (value) => {
    if (typeof value !== 'string') return '';

    return value
      .replace(/\\u005f/gi, '_')
      .replace(/\\_/g, '_')
      .replace(/\\u002e/gi, '.')
      .replace(/\\\//g, '/')
      .replace(/\\(["'\\])/g, '$1')
      .trim()
      .replace(/^@+/, '');
  };

  const add = (username, source) => {
    const cleaned = cleanUsername(username);
    if (!/^[A-Za-z0-9._]{1,30}$/.test(cleaned)) return;

    const key = cleaned.toLowerCase();
    if (!found.has(key)) found.set(key, { username: cleaned, source });
  };

  const scanText = (text, source) => {
    if (typeof text !== 'string' || !text.includes('ig_mention')) return;

    const markerPattern = /ig_mention/gi;
    let marker;

    while ((marker = markerPattern.exec(text)) !== null) {
      markerCount += 1;

      const fragment = text
        .slice(marker.index, marker.index + 1400)
        .replace(/&quot;/gi, '"')
        .replace(/\\u0022/gi, '"')
        .replace(/\\(["'\\/])/g, '$1');

      const usernameMatch = fragment.match(
        /["']?username["']?\s*:\s*["']((?:\\.|[^"'\\]){1,100})["']/i
      );

      if (usernameMatch) add(usernameMatch[1], source);
    }
  };

  const captured = Array.isArray(window.__IG_HIDDEN_MENTIONS_RESPONSES__)
    ? window.__IG_HIDDEN_MENTIONS_RESPONSES__
    : [];

  for (const entry of captured) {
    scanText(entry?.text || '', entry?.source || 'captured source');
  }

  if (!captured.length) {
    for (const script of document.scripts) {
      if ((script.textContent || '').includes('ig_mention')) {
        scanText(script.textContent, 'current script');
      }
    }
  }

  return {
    captureActive: Boolean(window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__),
    capturedResponseCount: captured.length,
    markerCount,
    mentions: [...found.values()].sort((a, b) =>
      a.username.localeCompare(b.username)
    )
  };
}
