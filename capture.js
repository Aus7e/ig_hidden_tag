(() => {
  if (window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__) return;

  window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__ = true;
  window.__IG_HIDDEN_MENTIONS_RESPONSES__ = [];
  window.__IG_HIDDEN_MENTIONS_STORY_KEY__ = location.href;

  const MAX_RESPONSES = 12;
  const MAX_RESPONSE_LENGTH = 3_000_000;
  let lastLocation = location.href;

  const onStoryChange = () => {
    if (location.href === lastLocation) return;

    lastLocation = location.href;
    window.__IG_HIDDEN_MENTIONS_STORY_KEY__ = lastLocation;
    window.__IG_HIDDEN_MENTIONS_RESPONSES__ = [];
  };

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    onStoryChange();
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    onStoryChange();
    return result;
  };

  window.addEventListener('popstate', onStoryChange);
  window.setInterval(onStoryChange, 300);

  const remember = (text, source) => {
    if (typeof text !== 'string' || !text.includes('ig_mention')) return;

    const value = text.slice(0, MAX_RESPONSE_LENGTH);
    const alreadyStored = window.__IG_HIDDEN_MENTIONS_RESPONSES__.some(
      (entry) => entry.text === value
    );

    if (!alreadyStored) {
      window.__IG_HIDDEN_MENTIONS_RESPONSES__.push({
        source,
        text: value,
        storyKey: window.__IG_HIDDEN_MENTIONS_STORY_KEY__
      });
    }

    if (window.__IG_HIDDEN_MENTIONS_RESPONSES__.length > MAX_RESPONSES) {
      window.__IG_HIDDEN_MENTIONS_RESPONSES__.shift();
    }
  };

  const inspectNode = (node) => {
    if (!node) return;

    if (
      node.nodeType === Node.TEXT_NODE &&
      node.parentElement?.tagName === 'SCRIPT'
    ) {
      remember(node.parentElement.textContent || '', 'initial script');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (node.tagName === 'SCRIPT') {
      remember(node.textContent || '', 'initial script');
      return;
    }

    for (const script of node.querySelectorAll?.('script') || []) {
      remember(script.textContent || '', 'initial script');
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) inspectNode(node);
    }
  });

  observer.observe(document, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15_000);

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      for (const script of document.scripts) {
        remember(script.textContent || '', 'DOMContentLoaded script');
      }
    },
    { once: true }
  );

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      response
        .clone()
        .text()
        .then((text) => remember(text, 'network fetch'))
        .catch(() => {});
    } catch (_) {
      // Never interfere with Instagram if a response cannot be cloned.
    }

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__igHiddenMentionsUrl = String(url || '');
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener(
      'load',
      () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') {
            remember(this.responseText, 'network xhr');
          }
        } catch (_) {
          // Ignore response bodies Chrome does not expose as text.
        }
      },
      { once: true }
    );

    return originalSend.apply(this, args);
  };
})();
