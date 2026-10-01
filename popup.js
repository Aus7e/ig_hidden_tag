const scanButton = document.getElementById('scanButton');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const countBadge = document.getElementById('countBadge');

let lastStoryKey = null;
let scanInProgress = false;

scanButton.addEventListener('click', () => scanCurrentTab(true));

window.setTimeout(() => scanCurrentTab(false), 250);
window.setInterval(() => scanCurrentTab(false), 800);

async function scanCurrentTab(force) {
  if (scanInProgress) return;
  scanInProgress = true;

  if (force) setBusy(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url?.startsWith('https://www.instagram.com/')) {
      if (force || lastStoryKey !== null) {
        lastStoryKey = null;
        clearResults();
        statusEl.textContent = 'Open an Instagram Story in the active tab.';
      }
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: scanInstagramPage
    });

    const storyKey = result?.storyKey || tab.url;
    const storyChanged = storyKey !== lastStoryKey;
    const hasFreshData = Number(result?.capturedResponseCount || 0) > 0;

    if (!force && !storyChanged && !hasFreshData) return;

    lastStoryKey = storyKey;
    clearResults();

    const mentions = Array.isArray(result?.mentions) ? result.mentions : [];
    renderResults(mentions);
    countBadge.textContent = String(mentions.length);

    if (mentions.length) {
      statusEl.textContent =
        `Current Story: ${mentions.length} hidden mention${mentions.length === 1 ? '' : 's'}.`;
    } else if (!result?.captureActive) {
      statusEl.textContent =
        'Capture is not active. Reload Instagram, then reopen the Story.';
    } else if (result?.markerCount > 0) {
      statusEl.textContent =
        'Mention data was found, but its username format was not recognised.';
    } else {
      statusEl.textContent = 'Current Story: no hidden mentions detected.';
    }
  } catch (error) {
    if (force) {
      clearResults();
      statusEl.textContent = error?.message || 'Scan failed.';
    }
  } finally {
    scanInProgress = false;
    if (force) setBusy(false);
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
    item.textContent = 'No hidden mentions in this Story.';
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
    source.textContent = mention.source || 'Story';

    li.append(link, source);
    resultsEl.appendChild(li);
  }
}

function setBusy(isBusy) {
  scanButton.disabled = isBusy;
  scanButton.textContent = isBusy ? 'Scanning…' : 'Scan now';
}

function scanInstagramPage() {
  const found = new Map();
  let markerCount = 0;
  const storyKey =
    window.__IG_HIDDEN_MENTIONS_STORY_KEY__ || location.href;

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

  const allCaptured = Array.isArray(window.__IG_HIDDEN_MENTIONS_RESPONSES__)
    ? window.__IG_HIDDEN_MENTIONS_RESPONSES__
    : [];

  const captured = allCaptured.filter(
    (entry) => !entry?.storyKey || entry.storyKey === storyKey
  );

  for (const entry of captured) {
    scanText(entry?.text || '', entry?.source || 'captured source');
  }

  let mentions = [...found.values()].sort((a, b) =>
    a.username.localeCompare(b.username)
  );

  if (captured.length) {
    window.__IG_HIDDEN_MENTIONS_LAST_RESULT__ = {
      storyKey,
      markerCount,
      mentions
    };
    window.__IG_HIDDEN_MENTIONS_RESPONSES__ = [];
  } else {
    const cached = window.__IG_HIDDEN_MENTIONS_LAST_RESULT__;
    if (cached?.storyKey === storyKey) {
      markerCount = cached.markerCount || 0;
      mentions = Array.isArray(cached.mentions) ? cached.mentions : [];
    }
  }

  return {
    storyKey,
    captureActive: Boolean(window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__),
    capturedResponseCount: captured.length,
    markerCount,
    mentions
  };
}
