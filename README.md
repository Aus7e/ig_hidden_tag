# IG Hidden Mentions

A small Chrome Manifest V3 extension that scans the Instagram page currently open in your browser and shows usernames associated with `ig_mention` data found in the page source / serialized page data.

## What it does

- Runs only when you click the extension button.
- Scans the currently active `instagram.com` tab.
- Looks for `ig_mention` blocks and nearby `username` values.
- Shows unique usernames in a popup.
- Lets you open the detected profile in a new tab.
- Processes everything locally in the browser.

## What it does not do

- It does not log in for you.
- It does not bypass private-account permissions or Story access controls.
- It does not scrape accounts in bulk.
- It does not send detected usernames to a server.
- It does not store a history of scans.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.
6. Open an Instagram Story in a normal Instagram tab.
7. Click the extension and choose **Scan current Story**.

## Permissions

The extension intentionally uses only:

- `activeTab`: temporary access to the tab you explicitly activate the extension on.
- `scripting`: lets the extension execute the local scanner in that active tab.

There is no permanent `instagram.com` host permission in this MVP.

## Technical approach

The scanner checks three local sources:

1. The live document HTML.
2. Inline `<script>` payloads.
3. A same-page fetch of the URL already open in the authenticated browser session.

It then searches for `ig_mention` and nearby `username` fields using several tolerant patterns.

Instagram can change its internal page structures at any time, so the parser may occasionally require updates.

## Privacy

See [PRIVACY.md](PRIVACY.md).

## Development status

MVP / experimental. Not affiliated with or endorsed by Instagram or Meta.

## License

MIT. See [LICENSE](LICENSE).
