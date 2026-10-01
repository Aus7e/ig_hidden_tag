(() => {
  if (window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__) return;

  window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__ = true;
  window.__IG_HIDDEN_MENTIONS_RESPONSES__ = [];

  const MAX_RESPONSES = 30;
  const MAX_RESPONSE_LENGTH = 3_000_000;

  const remember = (text, source) => {
    if (typeof text !== 'string' || !/ig_mention/i.test(text)) return;

    const value = text.slice(0, MAX_RESPONSE_LENGTH);
    const alreadyStored = window.__IG_HIDDEN_MENTIONS_RESPONSES__.some(
      (entry) => entry.text === value
    );

    if (!alreadyStored) {
      window.__IG_HIDDEN_MENTIONS_RESPONSES__.push({ source, text: value });
    }

    if (window.__IG_HIDDEN_MENTIONS_RESPONSES__.length > MAX_RESPONSES) {
      window.__IG_HIDDEN_MENTIONS_RESPONSES__.shift();
    }
  };

  const inspectNode = (node) => {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      remember(node.textContent || '', 'initial page source');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (node.tagName === 'SCRIPT') {
      remember(node.textContent || '', 'initial script');
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

  observer.observe(document, {
    childList: true,
    subtree: true
  });

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
