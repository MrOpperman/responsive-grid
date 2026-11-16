const STORAGE_KEY = "frames";
const FIT_KEY = "fit";
const SCROLL_SYNC_KEY = "scrollSync";
const ROUTE_SYNC_KEY = "routeSync";
const SYNC_CHANNEL = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const SYNC_TOLERANCE = 0.005;
const MIN_WIDTH = 200;
const MAX_WIDTH = 5000;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 5000;
const MIN_VIEW_HEIGHT = 120;
const MARGIN = 8;
const FRAME_GAP = 10;
// 26px frame header plus the top and bottom 1px borders.
const FRAME_CHROME_HEIGHT = 28;

const DEFAULT_FRAMES = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPad (10th / 11th gen)", width: 820, height: 1180 },
  { name: "Laptop with MDPI screen", width: 1280, height: 800 },
];

const state = {
  url: "",
  frames: [],
};

let fitEnabled = false;
let scrollSyncEnabled = false;
let routeSyncEnabled = false;
let alignOnConnect = false;
let lastSync = { x: null, y: null };
let lastRoute = null;
const routeSeen = new Set();
let dragState = null;

const frameNodes = new Map();

const elements = {
  url: document.getElementById("url"),
  reload: document.getElementById("reload"),
  customWidth: document.getElementById("custom-width"),
  customAdd: document.getElementById("custom-add"),
  fit: document.getElementById("fit"),
  scaleLabel: document.getElementById("scale-label"),
  syncScroll: document.getElementById("sync-scroll"),
  routes: document.getElementById("sync-routes"),
  presetsButton: document.getElementById("presets-button"),
  presets: document.getElementById("presets"),
  presetList: document.getElementById("preset-list"),
  frames: document.getElementById("frames"),
  empty: document.getElementById("empty"),
};

const isValidWidth = (width) =>
  Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH;

const isValidHeight = (height) =>
  Number.isInteger(height) && height >= MIN_HEIGHT && height <= MAX_HEIGHT;

const PRESET_HEIGHTS = new Map();
for (const group of DEVICE_PRESETS) {
  for (const device of group.devices) {
    if (!PRESET_HEIGHTS.has(device.width)) {
      PRESET_HEIGHTS.set(device.width, device.height);
    }
  }
}

// Presets carry a device height. Custom frames store null and fill the space.
const resolveHeight = (frame, width) => {
  if (frame?.height === null) return null;
  const height = Number(frame?.height);
  if (isValidHeight(height)) return height;
  return PRESET_HEIGHTS.get(width) ?? null;
};

// Keeps the user's order and free-form positions. One frame per width, deduped.
const normalizeFrames = (frames) => {
  const byWidth = new Map();
  for (const frame of frames) {
    const width = Number(frame?.width);
    if (!isValidWidth(width) || byWidth.has(width)) continue;
    byWidth.set(width, {
      name: String(frame.name || `${width}px`),
      width,
      height: resolveHeight(frame, width),
      x: Number.isFinite(frame?.x) ? Math.max(0, Math.round(frame.x)) : null,
      y: Number.isFinite(frame?.y) ? Math.max(0, Math.round(frame.y)) : null,
    });
  }

  const placed = [...byWidth.values()];
  let right = MARGIN - FRAME_GAP;

  for (const frame of placed) {
    if (frame.x !== null && frame.y !== null) {
      right = Math.max(right, frame.x + frame.width + 2);
    }
  }

  // Frames without a position (new ones and pre-free-form storage) line up at the right edge.
  for (const frame of placed) {
    if (frame.x === null || frame.y === null) {
      right += FRAME_GAP;
      frame.x = right;
      frame.y = MARGIN;
    }
  }

  return placed;
};

const saveFrames = async () => {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: state.frames });
  } catch (error) {
    console.error("Could not save frames", error);
  }
};

const applyFrameUrl = (node) => {
  const view = node.querySelector(".frame-view");
  if (!state.url) {
    view.removeAttribute("src");
    delete view.dataset.loadedUrl;
    return;
  }
  view.src = state.url;
  view.dataset.loadedUrl = state.url;
};

const createFrameNode = (frame) => {
  const wrapper = document.createElement("div");
  wrapper.className = "frame-scale";
  wrapper.dataset.width = String(frame.width);

  const node = document.createElement("section");
  node.className = "frame";
  node.dataset.width = String(frame.width);
  node.style.width = `${frame.width}px`;

  const header = document.createElement("header");
  header.className = "frame-header";

  const grip = document.createElement("span");
  grip.className = "frame-grip";
  grip.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "frame-name";
  name.textContent = frame.name;
  name.title = frame.name;

  const width = document.createElement("span");
  width.className = "frame-width";
  width.textContent = frame.height ? `${frame.width}x${frame.height}` : `${frame.width}px`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "frame-remove";
  remove.textContent = "\u00d7";
  remove.title = `Remove the ${frame.width}px frame`;
  remove.setAttribute("aria-label", remove.title);
  remove.addEventListener("click", () => {
    removeFrame(frame.width);
  });

  const view = document.createElement("iframe");
  view.className = "frame-view";
  view.dataset.deviceHeight = frame.height ? String(frame.height) : "";
  view.title = frame.height
    ? `${frame.name}, ${frame.width}x${frame.height}`
    : `${frame.name}, ${frame.width}px wide`;

  header.addEventListener("pointerdown", (event) => {
    startFrameDrag(event, frame.width);
  });
  header.addEventListener("pointermove", moveFrameDrag);
  header.addEventListener("pointerup", (event) => {
    finishFrameDrag(event.pointerId, false);
  });
  header.addEventListener("pointercancel", (event) => {
    finishFrameDrag(event.pointerId, true);
  });

  header.append(grip, name, width, remove);
  node.append(header, view);
  wrapper.append(node);
  return wrapper;
};

const startFrameDrag = (event, width) => {
  if (event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(".frame-remove")) return;

  const frame = state.frames.find((item) => item.width === width);
  const wrapper = frameNodes.get(String(width));
  if (!frame || !wrapper) return;

  event.preventDefault();
  const scale = fitEnabled ? computeFitScale() : 1;

  dragState = {
    key: String(width),
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: frame.x,
    originY: frame.y,
    scale,
  };

  // Clicking raises the frame and keeps the saved stacking order stable.
  state.frames = [...state.frames.filter((item) => item !== frame), frame];
  wrapper.style.zIndex = String(state.frames.length);
  wrapper.classList.add("is-dragging");
  elements.frames.classList.add("is-reordering");
  event.currentTarget.setPointerCapture(event.pointerId);
};

const moveFrameDrag = (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const frame = state.frames.find((item) => String(item.width) === dragState.key);
  const wrapper = frameNodes.get(dragState.key);
  if (!frame || !wrapper) return;

  const dx = (event.clientX - dragState.startX) / dragState.scale;
  const dy = (event.clientY - dragState.startY) / dragState.scale;
  frame.x = Math.max(0, Math.round(dragState.originX + dx));
  frame.y = Math.max(0, Math.round(dragState.originY + dy));
  wrapper.style.left = `${frame.x * dragState.scale}px`;
  wrapper.style.top = `${frame.y * dragState.scale}px`;
};

const finishFrameDrag = (pointerId, cancel) => {
  if (!dragState || pointerId !== dragState.pointerId) return;
  const wrapper = frameNodes.get(dragState.key);
  const frame = state.frames.find((item) => String(item.width) === dragState.key);

  if (cancel && frame) {
    frame.x = dragState.originX;
    frame.y = dragState.originY;
  }

  wrapper?.classList.remove("is-dragging");
  elements.frames.classList.remove("is-reordering");
  dragState = null;
  layoutFrames();
  if (!cancel) saveFrames();
};

const syncPresetChecks = () => {
  const widths = new Set(state.frames.map((frame) => frame.width));
  for (const input of elements.presetList.querySelectorAll("input[data-width]")) {
    input.checked = widths.has(Number(input.dataset.width));
  }
};

const getAvailableViewHeight = () =>
  Math.max(MIN_VIEW_HEIGHT, elements.frames.clientHeight - MARGIN * 2 - FRAME_CHROME_HEIGHT);

const applyFrameHeights = () => {
  const availableHeight = getAvailableViewHeight();

  for (const node of frameNodes.values()) {
    const view = node.querySelector(".frame-view");
    const deviceHeight = Number(view.dataset.deviceHeight);

    // With Fit on, device frames keep their full height and the canvas scales.
    // Custom frames always fill the visible height.
    let height = availableHeight;
    if (deviceHeight > 0) {
      height = fitEnabled ? deviceHeight : Math.min(deviceHeight, availableHeight);
    }
    view.style.height = `${height}px`;
  }
};

const computeFitScale = () => {
  if (state.frames.length === 0) return 1;
  const availableWidth = elements.frames.clientWidth;
  const availableHeight = elements.frames.clientHeight;
  if (availableWidth <= 0 || availableHeight <= 0) return 1;

  let maxRight = 0;
  let maxBottom = 0;

  for (const frame of state.frames) {
    maxRight = Math.max(maxRight, frame.x + frame.width + 2);
    const view = frameNodes.get(String(frame.width))?.querySelector(".frame-view");
    const viewHeight = view ? view.offsetHeight : MIN_VIEW_HEIGHT;
    maxBottom = Math.max(maxBottom, frame.y + viewHeight + FRAME_CHROME_HEIGHT);
  }

  // Scale the whole canvas, including the gaps created by free placement.
  return Math.min(1, availableWidth / (maxRight + MARGIN), availableHeight / (maxBottom + MARGIN));
};

const updateScaleLabel = (scale) => {
  const visible = fitEnabled && state.frames.length > 0;
  elements.scaleLabel.hidden = !visible;
  if (visible) {
    elements.scaleLabel.textContent = `${Math.round(scale * 100)}%`;
  }
};

// Transform scaling shrinks the rendered size only: iframe layout width, and therefore
// every media query inside it, stays at the real device width.
const layoutFrames = () => {
  applyFrameHeights();
  const scale = fitEnabled ? computeFitScale() : 1;

  state.frames.forEach((frame, index) => {
    const wrapper = frameNodes.get(String(frame.width));
    if (!wrapper) return;
    const node = wrapper.querySelector(".frame");
    const view = wrapper.querySelector(".frame-view");
    const viewHeight = view.offsetHeight || MIN_VIEW_HEIGHT;

    wrapper.style.left = `${frame.x * scale}px`;
    wrapper.style.top = `${frame.y * scale}px`;
    wrapper.style.width = `${(frame.width + 2) * scale}px`;
    wrapper.style.height = `${(viewHeight + FRAME_CHROME_HEIGHT) * scale}px`;
    wrapper.style.zIndex = String(index + 1);
    node.style.transform = scale === 1 ? "" : `scale(${scale})`;
  });

  updateScaleLabel(scale);
};

const renderFrames = () => {
  const wanted = new Set(state.frames.map((frame) => String(frame.width)));

  for (const [key, node] of frameNodes) {
    if (!wanted.has(key)) {
      node.remove();
      frameNodes.delete(key);
      routeSeen.delete(key);
    }
  }

  for (const frame of state.frames) {
    const key = String(frame.width);
    let node = frameNodes.get(key);

    if (!node) {
      node = createFrameNode(frame);
      frameNodes.set(key, node);
      elements.frames.append(node);
    } else {
      node.querySelector(".frame-name").textContent = frame.name;
    }

    const view = node.querySelector(".frame-view");
    if (state.url && view.dataset.loadedUrl !== state.url) {
      view.src = state.url;
      view.dataset.loadedUrl = state.url;
    }
  }

  elements.empty.hidden = state.frames.length > 0;
  syncPresetChecks();
  layoutFrames();
};

const commitFrames = () => {
  renderFrames();
  saveFrames();
};

const addFrame = (frame) => {
  const width = Number(frame.width);
  if (!isValidWidth(width) || state.frames.some((item) => item.width === width)) {
    return;
  }
  state.frames = normalizeFrames([...state.frames, { name: frame.name, width, height: frame.height }]);
  commitFrames();
};

const removeFrame = (width) => {
  state.frames = state.frames.filter((frame) => frame.width !== width);
  commitFrames();
};

const setUrl = (url) => {
  const next = url.trim();
  if (next === state.url) return;
  state.url = next;
  for (const node of frameNodes.values()) {
    applyFrameUrl(node);
  }
  syncTabLocation();
};

const reloadAllFrames = () => {
  if (!state.url) return;
  for (const node of frameNodes.values()) {
    node.querySelector(".frame-view").src = state.url;
  }
};

const updateFitButton = () => {
  elements.fit.setAttribute("aria-pressed", String(fitEnabled));
  elements.fit.classList.toggle("is-active", fitEnabled);
};

const saveFit = async () => {
  try {
    await browser.storage.local.set({ [FIT_KEY]: fitEnabled });
  } catch (error) {
    console.error("Could not save the fit setting", error);
  }
};

const setFit = (enabled) => {
  fitEnabled = enabled;
  updateFitButton();
  layoutFrames();
  saveFit();
};

const loadFit = async () => {
  try {
    const stored = await browser.storage.local.get(FIT_KEY);
    fitEnabled = stored[FIT_KEY] === true;
  } catch (error) {
    console.error("Could not read the fit setting", error);
  }
  updateFitButton();
};

const getFrameViews = () =>
  [...frameNodes.values()]
    .map((wrapper) => wrapper.querySelector(".frame-view"))
    .filter(Boolean);

const findFrameBySource = (source) => {
  for (const [key, wrapper] of frameNodes) {
    const view = wrapper.querySelector(".frame-view");
    if (view && view.contentWindow === source) return { key, view };
  }
  return null;
};

const postToFrame = (view, message) => {
  view.contentWindow?.postMessage(
    { __responsiveGrid: true, channel: SYNC_CHANNEL, ...message },
    "*",
  );
};

const sendConnection = () => {
  const connected = scrollSyncEnabled || routeSyncEnabled;

  for (const view of getFrameViews()) {
    if (connected) {
      postToFrame(view, {
        type: "connect",
        scroll: scrollSyncEnabled,
        routes: routeSyncEnabled,
      });
    } else {
      postToFrame(view, { type: "disconnect" });
    }
  }
};

const updateSyncButton = () => {
  elements.syncScroll.setAttribute("aria-pressed", String(scrollSyncEnabled));
  elements.syncScroll.classList.toggle("is-active", scrollSyncEnabled);
};

const saveScrollSync = async () => {
  try {
    await browser.storage.local.set({ [SCROLL_SYNC_KEY]: scrollSyncEnabled });
  } catch (error) {
    console.error("Could not save the scroll sync setting", error);
  }
};

const setScrollSync = (enabled) => {
  scrollSyncEnabled = enabled;
  updateSyncButton();

  if (enabled) {
    alignOnConnect = true;
  } else {
    alignOnConnect = false;
    lastSync = { x: null, y: null };
  }

  sendConnection();
  saveScrollSync();
};

const loadScrollSync = async () => {
  try {
    const stored = await browser.storage.local.get(SCROLL_SYNC_KEY);
    scrollSyncEnabled = stored[SCROLL_SYNC_KEY] === true;
  } catch (error) {
    console.error("Could not read the scroll sync setting", error);
  }
  updateSyncButton();
};

const updateRoutesButton = () => {
  elements.routes.setAttribute("aria-pressed", String(routeSyncEnabled));
  elements.routes.classList.toggle("is-active", routeSyncEnabled);
};

const saveRouteSync = async () => {
  try {
    await browser.storage.local.set({ [ROUTE_SYNC_KEY]: routeSyncEnabled });
  } catch (error) {
    console.error("Could not save the route sync setting", error);
  }
};

const setRouteSync = (enabled) => {
  routeSyncEnabled = enabled;
  lastRoute = null;
  routeSeen.clear();
  updateRoutesButton();
  sendConnection();
  saveRouteSync();
};

const loadRouteSync = async () => {
  try {
    const stored = await browser.storage.local.get(ROUTE_SYNC_KEY);
    routeSyncEnabled = stored[ROUTE_SYNC_KEY] === true;
  } catch (error) {
    console.error("Could not read the route sync setting", error);
  }
  updateRoutesButton();
};

// First report from a frame adopts the current route or catches that frame up.
// Later reports are real route changes and pull the other frames along.
const handleRouteReport = (key, view, url) => {
  if (!routeSeen.has(key)) {
    routeSeen.add(key);
    if (lastRoute === null) {
      lastRoute = url;
    } else if (url !== lastRoute) {
      postToFrame(view, { type: "route", url: lastRoute });
    }
    return;
  }

  if (url === lastRoute) return;
  lastRoute = url;

  for (const [targetKey, wrapper] of frameNodes) {
    if (targetKey === key) continue;
    const targetView = wrapper.querySelector(".frame-view");
    if (targetView) postToFrame(targetView, { type: "route", url });
  }
};

// Echo guard: every frame that receives a synced scroll reports its own new ratio.
// Comparing against the last broadcast keeps that from bouncing back around.
const matchesLastSync = (x, y) => {
  const xKnown = x !== null && lastSync.x !== null;
  const yKnown = y !== null && lastSync.y !== null;
  if (!xKnown && !yKnown) return false;

  return (
    (!xKnown || Math.abs(x - lastSync.x) <= SYNC_TOLERANCE) &&
    (!yKnown || Math.abs(y - lastSync.y) <= SYNC_TOLERANCE)
  );
};

const handleFrameMessage = (event) => {
  const data = event.data;
  if (!data || data.__responsiveGrid !== true) return;

  const frame = findFrameBySource(event.source);
  if (!frame) return;

  if (data.type === "ready") {
    if (scrollSyncEnabled || routeSyncEnabled) {
      postToFrame(frame.view, {
        type: "connect",
        scroll: scrollSyncEnabled,
        routes: routeSyncEnabled,
      });
    }
    return;
  }

  if (data.channel !== SYNC_CHANNEL) return;
  if (!scrollSyncEnabled && !routeSyncEnabled) return;

  if (
    routeSyncEnabled &&
    (data.type === "state" || data.type === "route") &&
    typeof data.url === "string"
  ) {
    handleRouteReport(frame.key, frame.view, data.url);
  }

  if (!scrollSyncEnabled) return;

  if (data.type === "state") {
    if (!alignOnConnect) return;
    alignOnConnect = false;
  } else if (data.type !== "scroll") {
    return;
  }

  const x = typeof data.x === "number" ? data.x : null;
  const y = typeof data.y === "number" ? data.y : null;
  if (x === null && y === null) return;
  if (matchesLastSync(x, y)) return;

  lastSync = {
    x: x === null ? lastSync.x : x,
    y: y === null ? lastSync.y : y,
  };

  const message = { type: "scroll" };
  if (x !== null) message.x = x;
  if (y !== null) message.y = y;

  for (const view of getFrameViews()) {
    if (view === frame.view) continue;
    postToFrame(view, message);
  }
};

const setPresetsOpen = (open) => {
  elements.presets.hidden = !open;
  elements.presetsButton.setAttribute("aria-expanded", String(open));
};

const buildPresetList = () => {
  for (const group of DEVICE_PRESETS) {
    const section = document.createElement("section");
    section.className = "preset-group";

    const heading = document.createElement("h2");
    heading.textContent = group.label;

    section.append(heading);

    for (const device of group.devices) {
      const label = document.createElement("label");
      label.className = "preset";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.width = String(device.width);
      input.dataset.name = device.name;

      const name = document.createElement("span");
      name.className = "preset-name";
      name.textContent = device.name;

      const width = document.createElement("span");
      width.className = "preset-width";
      width.textContent = `${device.width}px`;

      label.append(input, name, width);
      section.append(label);
    }

    elements.presetList.append(section);
  }
};

const addCustomWidth = () => {
  const width = Number.parseInt(elements.customWidth.value, 10);
  if (!isValidWidth(width)) {
    elements.customWidth.focus();
    return;
  }
  addFrame({ name: "Custom", width, height: null });
  elements.customWidth.value = "";
};

const isDevtoolsPanel = () => {
  try {
    return Boolean(browser.devtools?.panels);
  } catch (error) {
    return false;
  }
};

const getInspectedUrl = async () => {
  try {
    const [href] = await browser.devtools.inspectedWindow.eval("location.href");
    return typeof href === "string" ? href : "";
  } catch (error) {
    return "";
  }
};

const getInitialUrl = async () => {
  const fromQuery = new URLSearchParams(window.location.search).get("url");
  return fromQuery || getInspectedUrl();
};

// In tab mode, keep the URL in the address bar so a refresh restores it.
const syncTabLocation = () => {
  if (isDevtoolsPanel()) return;
  const next = new URL(window.location.href);
  if (state.url) {
    next.searchParams.set("url", state.url);
  } else {
    next.searchParams.delete("url");
  }
  window.history.replaceState(null, "", next);
};

const applyTheme = (theme) => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "dark" || theme === "light" ? theme : prefersDark ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
};

const watchTheme = () => {
  try {
    const themeName = browser.devtools.panels.themeName;
    if (themeName && typeof themeName.then === "function") {
      themeName.then(applyTheme).catch(() => applyTheme());
    } else {
      applyTheme(themeName);
    }
    browser.devtools.panels.onThemeChanged.addListener(applyTheme);
  } catch (error) {
    applyTheme();
  }
};

const loadFrames = async () => {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const frames = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : DEFAULT_FRAMES;
    state.frames = normalizeFrames(frames);
  } catch (error) {
    console.error("Could not read saved frames", error);
    state.frames = normalizeFrames(DEFAULT_FRAMES);
  }
};

const bindEvents = () => {
  elements.url.addEventListener("change", () => {
    setUrl(elements.url.value);
  });

  elements.url.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    setUrl(elements.url.value);
    reloadAllFrames();
  });

  elements.reload.addEventListener("click", reloadAllFrames);

  elements.fit.addEventListener("click", () => {
    setFit(!fitEnabled);
  });

  elements.syncScroll.addEventListener("click", () => {
    setScrollSync(!scrollSyncEnabled);
  });

  elements.routes.addEventListener("click", () => {
    setRouteSync(!routeSyncEnabled);
  });

  window.addEventListener("message", handleFrameMessage);

  elements.customAdd.addEventListener("click", addCustomWidth);

  elements.customWidth.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    addCustomWidth();
  });

  elements.presetsButton.addEventListener("click", () => {
    setPresetsOpen(elements.presets.hidden);
    if (!elements.presets.hidden) {
      elements.presets.querySelector("input")?.focus();
    }
  });

  elements.presetList.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const width = Number(input.dataset.width);
    if (input.checked) {
      addFrame({ name: input.dataset.name, width });
    } else {
      removeFrame(width);
    }
  });

  document.addEventListener("click", (event) => {
    if (elements.presets.hidden) return;
    if (!elements.presets.contains(event.target) && event.target !== elements.presetsButton) {
      setPresetsOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (dragState) {
      finishFrameDrag(dragState.pointerId, true);
      return;
    }

    if (!elements.presets.hidden) {
      setPresetsOpen(false);
      elements.presetsButton.focus();
    }
  });
};

const init = async () => {
  watchTheme();
  buildPresetList();
  bindEvents();
  state.url = await getInitialUrl();
  elements.url.value = state.url;
  syncTabLocation();
  await loadFrames();
  await loadFit();
  await loadScrollSync();
  await loadRouteSync();
  renderFrames();
  if (scrollSyncEnabled || routeSyncEnabled) sendConnection();
  const resizeObserver = new ResizeObserver(layoutFrames);
  resizeObserver.observe(elements.frames);
};

init();
