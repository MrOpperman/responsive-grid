(() => {
  const MARKER = "__responsiveGrid";
  const ROUTE_POLL_MS = 300;

  let channel = null;
  let active = false;
  let scrolling = false;
  let routes = false;
  let scrollScheduled = false;
  let routeTimer = null;
  let lastUrl = location.href;

  const metrics = () => {
    const doc = document.documentElement;
    return {
      maxX: Math.max(0, doc.scrollWidth - window.innerWidth),
      maxY: Math.max(0, doc.scrollHeight - window.innerHeight),
    };
  };

  const ratios = () => {
    const { maxX, maxY } = metrics();
    return {
      x: maxX > 0 ? Math.min(1, Math.max(0, window.scrollX / maxX)) : null,
      y: maxY > 0 ? Math.min(1, Math.max(0, window.scrollY / maxY)) : null,
    };
  };

  const send = (type, extra = {}) => {
    if (!active) return;
    window.parent.postMessage({ [MARKER]: true, channel, type, ...extra }, "*");
  };

  // pushState does not fire an event observable from here, so poll.
  const checkRoute = () => {
    if (!active || !routes || location.href === lastUrl) return;
    lastUrl = location.href;
    send("route", { url: lastUrl });
  };

  const updateRouteWatch = () => {
    if (active && routes) {
      if (routeTimer === null) {
        routeTimer = window.setInterval(checkRoute, ROUTE_POLL_MS);
      }
    } else if (routeTimer !== null) {
      window.clearInterval(routeTimer);
      routeTimer = null;
    }
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!active || !scrolling || scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        scrollScheduled = false;
        send("scroll", ratios());
      });
    },
    { passive: true },
  );

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data[MARKER] !== true) return;

    if (data.type === "connect") {
      active = true;
      channel = data.channel;
      scrolling = data.scroll === true;
      routes = data.routes === true;
      lastUrl = location.href;
      updateRouteWatch();
      send("state", { ...ratios(), url: location.href });
      return;
    }

    if (data.type === "disconnect") {
      active = false;
      channel = null;
      scrolling = false;
      routes = false;
      updateRouteWatch();
      return;
    }

    if (!active || data.channel !== channel) return;

    if (data.type === "route") {
      if (routes && typeof data.url === "string" && data.url !== location.href) {
        window.location.assign(data.url);
      }
      return;
    }

    if (data.type !== "scroll" || !scrolling) return;

    const { maxX, maxY } = metrics();
    const left = typeof data.x === "number" && maxX > 0 ? data.x * maxX : window.scrollX;
    const top = typeof data.y === "number" && maxY > 0 ? data.y * maxY : window.scrollY;
    window.scrollTo(left, top);
  });

  window.parent.postMessage({ [MARKER]: true, type: "ready", url: location.href }, "*");
})();
