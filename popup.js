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

    if (mentions.length) {
      statusEl.textContent =
        `Found ${mentions.length} unique mention${mentions.length === 1 ? '' : 's'}.`;
    } else if (result?.markerCount > 0) {
      statusEl.textContent =
        `Found ${result.markerCount} ig_mention marker${result.markerCount === 1 ? '' : 's'}, but no username nearby. Open an issue with a redacted source sample.`;
    } else {
      statusEl.textContent =
        'No ig_mention markers found. Keep the Story open and fully loaded, then scan again.';
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
  let markerCount = 0;

  const add = (username, source) => {
    if (typeof username !== 'string') return;

    const cleaned = username.trim().replace(/^@+/, '');

    if (!/^[A-Za-z0-9._]{1,30}$/.test(cleaned)) return;

    const key = cleaned.toLowerCase();
    if (!found.has(key)) found.set(key, { username: cleaned, source });
  };

  const normalise = (value) => {
    if (typeof value !== 'string') return '';

    let text = value
      .replace(/&quot;/gi, '"')
      .replace(/&#34;/gi, '"')
      .replace(/&#x22;/gi, '"');

    for (let pass = 0; pass < 3; pass += 1) {
      const previous = text;
      text = text
        .replace(/\\u0022/gi, '"')
        .replace(/\\u0027/gi, "'")
        .replace(/\\u002F/gi, '/')
        .replace(/\\u003A/gi, ':')
        .replace(/\\u002E/gi, '.')
        .replace(/\\u005F/gi, '_')
        .replace(/\\(["'\\/])/g, '$1');

      if (text === previous) break;
    }

    return text;
  };

  const scanText = (raw, source) => {
    if (!raw || typeof raw !== 'string' || !/ig_mention/i.test(raw)) return;

    const text = normalise(raw);
    const markerPattern = /ig_mention/gi;
    let marker;

    while ((marker = markerPattern.exec(text)) !== null) {
      markerCount += 1;

      const after = text.slice(marker.index, marker.index + 2200);
      const before = text.slice(Math.max(0, marker.index - 700), marker.index);

      const afterPatterns = [
        /ig_mention[\s\S]{0,1600}?"username"\s*:\s*"([A-Za-z0-9._]{1,30})"/i,
        /ig_mention[\s\S]{0,1600}?username\s*[:=]\s*"([A-Za-z0-9._]{1,30})"/i,
        /ig_mention[\s\S]{0,1600}?username\\?"?\s*[:=]\s*\\?"([A-Za-z0-9._]{1,30})/i
      ];

      let matched = false;
      for (const pattern of afterPatterns) {
        const hit = after.match(pattern);
        if (hit) {
          add(hit[1], source);
          matched = true;
          break;
        }
      }

      if (!matched) {
        const beforeMatches = [
          ...before.matchAll(/"username"\s*:\s*"([A-Za-z0-9._]{1,30})"/gi)
        ];
        const nearest = beforeMatches.at(-1);
        if (nearest) add(nearest[1], source);
      }
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
    // The DOM and inline scripts may still contain the data.
  }

  return {
    url: location.href,
    markerCount,
    mentions: [...found.values()].sort((a, b) =>
      a.username.localeCompare(b.username)
    )
  };
}
