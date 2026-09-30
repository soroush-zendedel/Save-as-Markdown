const previewButton = document.querySelector("#previewButton");
const saveButton = document.querySelector("#saveButton");
const status = document.querySelector("#status");
const previewSection = document.querySelector("#previewSection");
const markdownPreview = document.querySelector("#markdownPreview");
const pageTitle = document.querySelector("#pageTitle");
const selectionOption = document.querySelector("#selectionOption");
const extrasOption = document.querySelector("#extrasOption");
const strategyOption = document.querySelector("#strategyOption");
let activeTab;
let previewTitle = "Saved page";
let previewGeneration = 0;
let selectionSnapshot = "";

function safeFilename(title) {
  const normalized = title.normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Cs}<>:"/\\|?*]/gu, "-");
  const cleaned = normalized.replace(/[. ]+$/g, "").replace(/^[. ]+/g, "").trim().slice(0, 120);
  const safe = cleaned || "saved-page";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
}

function cleanMarkdownTitle(markdown, title) {
  const lines = markdown.trim().split("\n");
  const expected = title.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const heading = lines[0]?.startsWith("# ")
    ? lines[0].slice(2).replace(/\s+/g, " ").trim().toLocaleLowerCase()
    : "";
  const titleCore = expected.split(/\s+[—–-]\s+/)[0];
  if (heading && (heading === expected || (titleCore.length > 2 && heading === titleCore))) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function composeMarkdown(body, extraMarkdown = "") {
  const metadata = document.querySelector("#includeSource").checked
    ? `> Source: ${activeTab.url}\n> Saved: ${new Date().toISOString().slice(0, 10)}\n\n`
    : "";
  return `# ${previewTitle}\n\n${metadata}${body}${extraMarkdown ? `\n\n${extraMarkdown}` : ""}\n`;
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\s+/g, " ").trim().replace(/[\\`*_{}\[\]()#+.!|>~-]/g, "\\$&");
}

function formatAdditionalDetails(details, articleImageUrls, bodyText) {
  if (!details) return "";
  const lines = [];
  const body = bodyText.toLocaleLowerCase();
  const addLine = (label, value) => {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    if (clean && !body.includes(clean.toLocaleLowerCase())) lines.push(`- **${label}:** ${escapeMarkdown(clean)}`);
  };

  addLine("Author", details.author);
  addLine("Published", details.published);
  addLine("Description", details.description);
  const tags = (details.tags || []).filter((tag) => tag && !body.includes(tag.toLocaleLowerCase()));
  if (tags.length) lines.push(`- **Tags:** ${tags.map(escapeMarkdown).join(", ")}`);

  const existingImages = new Set(articleImageUrls);
  const newImages = (details.images || []).filter((image) => image.url && !existingImages.has(image.url));
  const sections = [];
  if (lines.length) sections.push(`## Additional page details\n\n${lines.join("\n")}`);
  if (newImages.length) {
    const imageMarkdown = newImages.map((image) => {
      const alt = (image.alt || "").replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
      const url = image.url.replace(/\(/g, "%28").replace(/\)/g, "%29");
      return `![${alt}](${url})`;
    });
    sections.push(`## Additional images\n\n${imageMarkdown.join("\n\n")}`);
  }
  return sections.join("\n\n");
}

function updateExtrasVisibility() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  extrasOption.hidden = mode !== "main";
  strategyOption.hidden = mode !== "main";
}

async function initialize() {
  try {
    [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id || !activeTab.url) throw new Error("No readable active tab is available.");
    pageTitle.textContent = activeTab.title || activeTab.url;

    await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["vendor/Readability.js", "extractor.js"]
    });
    const [{ result: capturedSelection }] = await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return "";
        const wrapper = document.createElement("div");
        for (let index = 0; index < selection.rangeCount; index += 1) wrapper.append(selection.getRangeAt(index).cloneContents());
        return wrapper.innerHTML;
      }
    });
    selectionSnapshot = capturedSelection || "";
    selectionOption.hidden = false;
  } catch (error) {
    previewButton.disabled = true;
    status.classList.add("error");
    status.textContent = error.message || "Firefox does not allow this extension to read the current page.";
  }
}

async function renderPreview() {
  const generation = ++previewGeneration;
  previewButton.disabled = true;
  previewSection.hidden = false;
  if (!markdownPreview.value.trim()) saveButton.disabled = true;
  status.classList.remove("error");
  status.textContent = "Finding the page content…";
  try {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const { siteRules = {} } = await browser.storage.local.get("siteRules");
    const hostname = new URL(activeTab.url).hostname.toLowerCase();
    const extractionResults = await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (request) => globalThis.__saveAsMarkdownExtract?.(request),
      args: [{ mode, rule: siteRules[hostname] || {}, useReaderView: document.querySelector("#useReaderView").checked, includeExtras: document.querySelector("#includeExtras").checked, selectionHtml: selectionSnapshot }]
    });
    if (generation !== previewGeneration) return;
    const response = extractionResults?.[0]?.result;
    if (!response) throw new Error("The page extractor did not return a result. Reload the extension and try again.");
    if (response?.error) throw new Error(response.error);

    previewTitle = response.title || activeTab.title || "Saved page";
    const html = new DOMParser().parseFromString(response.html, "text/html");
    html.querySelectorAll("a[href], img[src]").forEach((node) => {
      const attribute = node.tagName === "IMG" ? "src" : "href";
      try { node.setAttribute(attribute, new URL(node.getAttribute(attribute), response.url).href); } catch {}
    });

    const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
    const body = cleanMarkdownTitle(converter.turndown(html.body.innerHTML), previewTitle);
    if (!body) throw new Error("No readable text was found in the selected content.");

    const bodyImageUrls = [...html.querySelectorAll("img[src]")].map((node) => node.getAttribute("src"));
    const tryExtras = mode === "main" && document.querySelector("#includeExtras").checked;
    const extraMarkdown = tryExtras
      ? formatAdditionalDetails(response.details, bodyImageUrls, body)
      : "";
    markdownPreview.value = composeMarkdown(body, extraMarkdown);
    saveButton.disabled = false;
    status.textContent = `Preview ready · extracted with ${response.source}${extraMarkdown ? " plus related page details" : tryExtras ? "; no additional details were found" : ""}.`;
  } catch (error) {
    if (generation !== previewGeneration) return;
    status.classList.add("error");
    status.textContent = error.message || "Could not extract this page.";
  } finally {
    if (generation === previewGeneration) previewButton.disabled = false;
  }
}

function refreshPreviewIfOpen() {
  if (!previewSection.hidden) renderPreview();
}

previewButton.addEventListener("click", renderPreview);

document.querySelector("#includeSource").addEventListener("change", () => {
  const markdown = markdownPreview.value;
  if (!markdown) return;
  const lines = markdown.split("\n").filter((line) => !/^> (?:Source|Saved): /.test(line));
  if (document.querySelector("#includeSource").checked) {
    const headingEnd = lines.findIndex((line, index) => index > 0 && line.trim() === "");
    const insertAt = headingEnd < 0 ? lines.length : headingEnd + 1;
    lines.splice(insertAt, 0, `> Source: ${activeTab.url}`, `> Saved: ${new Date().toISOString().slice(0, 10)}`, "");
  }
  markdownPreview.value = lines.join("\n").replace(/\n{3,}/g, "\n\n");
});

document.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener("change", () => {
  updateExtrasVisibility();
  refreshPreviewIfOpen();
}));
document.querySelector("#useReaderView").addEventListener("change", refreshPreviewIfOpen);
document.querySelector("#includeExtras").addEventListener("change", refreshPreviewIfOpen);

saveButton.addEventListener("click", async () => {
  if (!markdownPreview.value.trim()) return;
  saveButton.disabled = true;
  status.classList.remove("error");
  status.textContent = "Starting the download…";
  try {
    await browser.runtime.sendMessage({
      type: "download-markdown",
      markdown: markdownPreview.value,
      filename: `${safeFilename(previewTitle)}.md`
    });
    status.textContent = "Download started.";
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message || "Could not save this page.";
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#rulesButton").addEventListener("click", async () => {
  if (!activeTab?.url) return;
  const host = new URL(activeTab.url).hostname;
  await browser.tabs.create({ url: browser.runtime.getURL(`options.html?host=${encodeURIComponent(host)}`) });
});

initialize();
updateExtrasVisibility();
