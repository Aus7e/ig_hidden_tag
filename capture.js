(() => {
  if (window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__) return;

  window.__IG_HIDDEN_MENTIONS_CAPTURE_ACTIVE__ = true;
  window.__IG_HIDDEN_MENTIONS_RESPONSES__ = [];

  const MAX_RESPONSES = 30;
  const MAX_RESPONSE_LENGTH = 3_000_000;

  const remember = (text, source) => {
    if (typeof text !== 'string' || !/ig_mention/i.test(text)) return;

    window.__IG_HIDDEN_MENTIONS_RESPONSES__.push({
      source,
      text: text.slice(0, MAX_RESPONSE_LENGTH)
    });

    if (window.__IG_HIDDEN_MENTIONS_RESPONSES__.length > MAX_RESPONSES) {
      window.__IG_HIDDEN_MENTIONS_RESPONSES__.shift();
    }
  };

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
