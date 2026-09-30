const objectUrlsByDownloadId = new Map();
const PAGE_MENU_ID = "save-markdown-page";
const SELECTION_MENU_ID = "save-markdown-selection";

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: PAGE_MENU_ID,
      title: "Save page as Markdown",
      contexts: ["page", "frame", "link", "image"]
    });
    browser.contextMenus.create({
      id: SELECTION_MENU_ID,
      title: "Save selection as Markdown",
      contexts: ["selection"]
    });
  }).catch((error) => console.error("Could not create Save as Markdown context menus:", error));
});

async function saveMarkdown(markdown, filename) {
  const file = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(file);
  try {
    const downloadId = await browser.downloads.download({
      url: objectUrl,
      filename: safeDownloadFilename(filename),
      saveAs: true,
      conflictAction: "uniquify"
    });
    objectUrlsByDownloadId.set(downloadId, objectUrl);
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      objectUrlsByDownloadId.delete(downloadId);
    }, 60_000);
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (![PAGE_MENU_ID, SELECTION_MENU_ID].includes(info.menuItemId) || !tab?.id || !tab.url) return;
  try {
    const mode = info.menuItemId === SELECTION_MENU_ID ? "selection" : "main";
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/Readability.js", "vendor/turndown.js", "extractor.js"]
    });
    const [{ result: extraction }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: (mode) => {
        const response = globalThis.__saveAsMarkdownExtract?.({ mode, useReaderView: false, includeExtras: false });
        if (!response || response.error) throw new Error(response?.error || "The page extractor did not return a result.");
        const parsed = new DOMParser().parseFromString(response.html, "text/html");
        parsed.querySelectorAll("a[href], img[src]").forEach((node) => {
          const attribute = node.tagName === "IMG" ? "src" : "href";
          try { node.setAttribute(attribute, new URL(node.getAttribute(attribute), response.url).href); } catch {}
        });
        const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
        const body = converter.turndown(parsed.body.innerHTML).trim();
        if (!body) throw new Error("No readable text was found in the selected content.");
        const title = (response.title || "Saved page").trim();
        return {
          markdown: `# ${title}\n\n> Source: ${response.url}\n> Saved: ${new Date().toISOString().slice(0, 10)}\n\n${body}\n`,
          filename: `${title}.md`
        };
      },
      args: [mode]
    });
    await saveMarkdown(extraction.markdown, extraction.filename);
    await browser.action.setBadgeText({ tabId: tab.id, text: "MD" });
    await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#176f4e" });
    setTimeout(() => browser.action.setBadgeText({ tabId: tab.id, text: "" }), 1800);
  } catch (error) {
    console.error("Could not save Markdown from the context menu:", error);
    await browser.action.setBadgeText({ tabId: tab.id, text: "!" });
    await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#a53636" });
    setTimeout(() => browser.action.setBadgeText({ tabId: tab.id, text: "" }), 3500);
  }
});

function safeDownloadFilename(filename) {
  const normalized = String(filename || "saved-page.md")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}<>:"/\\|?*]/gu, "-")
    .replace(/[. ]+$/g, "")
    .replace(/^[. ]+/g, "");
  const hasMarkdownExtension = normalized.toLowerCase().endsWith(".md");
  const name = hasMarkdownExtension ? `${normalized.slice(0, -3).slice(0, 120)}.md` : normalized.slice(0, 120);
  return name && name !== "." && name !== ".." ? name : "saved-page.md";
}

browser.downloads.onChanged.addListener((delta) => {
  if (!delta.state || !["complete", "interrupted"].includes(delta.state.current)) return;
  const objectUrl = objectUrlsByDownloadId.get(delta.id);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrlsByDownloadId.delete(delta.id);
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== "download-markdown") return undefined;
  try {
    await saveMarkdown(message.markdown, message.filename);
    return { ok: true };
  } catch (error) {
    throw error;
  }
});
