const sourceElement = document.getElementById("source");
const openTabButton = document.getElementById("open-tab");

let sourceUrl = "";

const isFrameableUrl = (url) => typeof url === "string" && /^https?:/i.test(url);

const openGridInTab = async () => {
  const target = new URL(browser.runtime.getURL("panel/panel.html"));
  if (sourceUrl) {
    target.searchParams.set("url", sourceUrl);
  }
  await browser.tabs.create({ url: target.href });
  window.close();
};

const init = async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (isFrameableUrl(tab?.url)) {
      sourceUrl = tab.url;
      sourceElement.textContent = tab.url;
      sourceElement.title = tab.url;
    } else {
      sourceElement.textContent = "No page URL. The grid opens with an empty URL field.";
    }
  } catch (error) {
    console.error("Could not read the active tab", error);
    sourceElement.textContent = "Could not read the active tab.";
  }
};

openTabButton.addEventListener("click", openGridInTab);
init();
