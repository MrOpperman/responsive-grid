# Responsive Grid

A Firefox add-on for responsive work: one page, several viewport widths, side by side.

Every frame is a real iframe at an exact device width, so CSS media queries fire at the same breakpoints as the device. Frames live in a DevTools panel or in a normal tab, can be dragged around freely, and can sync scroll and route changes.

Unofficial project, not affiliated with Mozilla.

## Features

- DevTools panel and toolbar tab view, sharing one saved layout
- Widths and heights from Firefox's own responsive mode device list, plus custom widths
- Free-form canvas: drag frames anywhere, overlap them, grab one to raise it
- Fit toggle scales the canvas to the window without changing iframe widths
- Scroll sync by proportion, so pages with different heights stay aligned
- Route sync: a link click or client-side route change in one frame updates the others
- Layout, sizes, positions, and toggles persist in extension storage

## Install from source

Requires Firefox 142 or newer.

1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and pick `manifest.json`.
4. Open DevTools and select **Responsive Grid**, or click the toolbar icon and choose **Open grid in tab**.

Temporary add-ons disappear when Firefox restarts. For a persistent install, run `npm run build` and sign the archive through [addons.mozilla.org](https://addons.mozilla.org/developers/).

## Usage

- **Devices** opens the preset list. Widths and heights come from Firefox's responsive mode device list, one entry per distinct width.
- **Width + Add** adds a custom width between 200 and 5000 px. Custom frames fill the available height; preset frames use their device height, capped to the space available.
- **Reload** reloads every frame.
- The URL field starts with the inspected tab (panel) or active tab (tab view). Edit it, for example to change the port, then press Enter to load every frame from that URL.
- **Fit** scales the whole canvas down so every frame fits the panel or window, never above 100%. Scaling is a CSS transform, so iframe layout widths stay real and media queries keep firing at the true breakpoints. The percentage next to the button shows the current scale.
- **Sync** keeps scroll positions aligned across frames. It syncs proportions, not raw pixels, so frames with different page heights stay on the same relative spot.
- **Routes** keeps frames on the same URL. A link click or client-side route change in one frame navigates the others to that URL.
- Drag a frame header to place it anywhere on the canvas. Escape during a drag cancels the move.
- The `x` on a frame header removes it. The header shows the size, for example `375x667`.
- In tab view the URL also stays in the address bar, so a refresh restores it.

## Device presets

`panel/devices.js` is generated, do not edit it by hand. It comes from Firefox's `devtools-devices` RemoteSettings dump (`services/settings/dumps/main/devtools-devices.json` in mozilla-central), reduced to one entry per viewport width per device class. Featured devices win conflicts, touch-only laptop variants lose, and then the shorter name wins.

Refresh the list with:

```sh
npm run devices
```

## Development

```sh
npm install
npm start          # Firefox with the add-on loaded
npm run check      # syntax check every script
npm run lint       # web-ext lint
npm run build      # package into web-ext-artifacts/
```

Layout of the source:

- `manifest.json`: add-on manifest
- `devtools.js`: registers the DevTools panel
- `panel/`: the grid page used by both the panel and the tab view, plus the generated device list
- `popup/`: toolbar popup
- `content/frame-sync.js`: content script for scroll and route sync
- `scripts/generate-devices.mjs`: regenerates `panel/devices.js`

## Permissions and privacy

- `storage`: saves the layout and toggle settings.
- `tabs`: reads the active tab URL when you open the tab view from the toolbar.
- Content script on `<all_urls>`: needed so scroll and route sync work on any dev host, including localhost, LAN addresses, and custom hostnames. It runs in http and https frames, does nothing until the grid page connects to the frame, and sends messages only inside the browser.

No analytics, no telemetry, no requests to third party servers. The add-on only loads the URLs you put in the grid.

## Limitations

- The page must allow framing. `X-Frame-Options` and CSP `frame-ancestors` block it, and there is no client-side workaround. Dev servers usually do not send those headers.
- Widths are real, but there is no user agent, DPR, or touch emulation. Media queries and layout widths work; UA sniffing and DPR-based image selection do not.
- Plain `http` on a LAN IP (not `localhost` or `127.0.0.1`) can be blocked as mixed content inside a `moz-extension` page. Use localhost or https.
- Each frame is its own page load, so N frames means N requests against your dev server.
- Frame height is the device height for presets, capped to the visible area when Fit is off; custom frames fill the visible height. With Fit on, presets keep their full device height and the canvas scales.
- Navigation inside one frame stays in that frame unless route sync is on.
- Route targets load by URL, so in-memory SPA state is not carried over. Client-side route changes are polled every 300ms.
- Tab view is an extension page, not a hosted site, so it cannot be opened outside Firefox or shared as a link.

## Contributing

Issues and pull requests are welcome. Keep `npm run check` and `npm run lint` green. For larger changes, open an issue first so the approach can be agreed on.

## License

[MIT](LICENSE)
