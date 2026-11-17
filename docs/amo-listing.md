# AMO listing draft

Use this when submitting `web-ext-artifacts/responsive_grid-1.0.0.zip` on addons.mozilla.org.

## Name

Responsive Grid

## Summary

See one page at several viewport widths in a single Firefox tab. Drag frames anywhere, fit them to the window, sync scrolling and routes, and keep the layout between sessions.

## Description

Responsive Grid puts several copies of the same page side by side in one tab. Each copy is a real iframe at an exact width, so media queries and layout breakpoints behave like they do on the device.

What you can do:

- Start from Firefox's responsive mode device widths, or add a custom width.
- Drag frames anywhere on the canvas, overlap them, and bring one to the front.
- Fit the whole canvas to the window without changing iframe widths.
- Keep scroll positions aligned across frames.
- Navigate every frame when one changes route.
- The layout, positions, and toggles are saved.

The add-on is for development and preview. It does not emulate user agents, device pixel ratio, or touch.

## Category

Developer Tools

## Tags

responsive, viewport, development, web development, layout

## Permission explanations

- `storage`: saves the frame layout and toggle settings.
- `tabs`: reads the active tab URL when you open the grid from the toolbar.
- Content script on all sites: lets scroll and route sync work on localhost, LAN addresses, and custom dev hostnames. It runs only in http and https frames, does nothing until the grid connects to the frame, and sends messages only inside the browser.

## Privacy

No analytics, no telemetry, no third party requests. The add-on only loads the URLs entered in the grid. The content script does not read or transmit page content; it reports scroll position and URL changes to the grid page and applies positions and routes sent back.

## Screenshots

- `docs/amo-screenshot.png`: 1280x800, ready for the AMO listing.
- `docs/hero.png`: README hero, 3360x1800.
- `docs/device-presets.png`: device preset list.

## Submission

Listed on AMO:

1. Create a developer account on addons.mozilla.org.
2. Submit a new add-on and upload `web-ext-artifacts/responsive_grid-1.0.0.zip`.
3. Fill the fields above, upload screenshots, and answer the data collection questions with "no collection".
4. Submit for review.

Self-distributed signed build:

```sh
npx web-ext sign \
  --api-key "$WEB_EXT_API_KEY" \
  --api-secret "$WEB_EXT_API_SECRET" \
  --channel unlisted
```

Create the API keys in the AMO developer hub. Do not paste them into chat or commit them.

## Before submitting

- MV3 is set. Confirm `web-ext lint` and a real reload still pass.
- Make the GitHub repository public.
- Confirm CI is green on the release commit.
- Replace `docs/hero.png` if the UI changes.
- Confirm the built archive does not include `docs/`, `scripts/`, or package files.
