(function installSaveAsMarkdownExtractor() {
  const build = "0.4.0";
  if (globalThis.__saveAsMarkdownExtractorBuild === build) return;
  globalThis.__saveAsMarkdownExtractorBuild = build;

  const ignoredMarker = /(?:^|[-_\s])(?:advert|advertisement|ads?|avatar|banner|breadcrumb|comments?|cookie|footer|header|icon|logo|menu|navigation|newsletter|promo|recommend(?:ation)?s?|related|share|sidebar|side|social|sponsor|subscribe|widget|author|profile)(?:$|[-_\s])/i;
  const ignoredMediaMarker = /(?:advert|avatar|banner|icon|logo|profile|sprite|sponsor|tracking)/i;
  const articleRootSelectors = "[itemprop~='articleBody'], article, main, [role='main']";

  function getCleanDocument() {
    const clean = new DOMParser().parseFromString(document.documentElement.outerHTML, "text/html");
    let base = clean.querySelector("base");
    if (!base) {
      base = clean.createElement("base");
      clean.head.prepend(base);
    }
    base.href = location.href;

    clean.querySelectorAll("script, style, noscript, template, svg, nav, footer, form, button, [aria-hidden='true'], [role='navigation'], [role='complementary'], [role='contentinfo'], [hidden]")
      .forEach((node) => node.remove());
    clean.querySelectorAll("*").forEach((node) => {
      if (node === clean.documentElement || node === clean.head || node === clean.body) return;
      const marker = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""} ${node.getAttribute("role") || ""}`;
      if (ignoredMarker.test(marker)) node.remove();
    });
    return clean;
  }

  function removeConfiguredNodes(root, selectors) {
    if (!selectors?.trim()) return;
    try {
      root.querySelectorAll(selectors).forEach((node) => node.remove());
    } catch (error) {
      throw new Error(`Invalid main-content selector: ${error.message}`);
    }
  }

  function textLength(node) {
    return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().length;
  }

  function scoreContentNode(node) {
    const length = textLength(node);
    const linkTextLength = [...node.querySelectorAll("a")].reduce((sum, link) => sum + textLength(link), 0);
    const linkDensity = Math.min(0.95, linkTextLength / Math.max(1, length));
    const headingCount = node.querySelectorAll("h1, h2, h3").length;
    const mediaCount = node.querySelectorAll("figure, img[alt], [itemprop='image']").length;
    return length * (1 - linkDensity) + headingCount * 80 + Math.min(mediaCount, 4) * 40;
  }

  function getSemanticArticleRoot() {
    const candidates = [...document.querySelectorAll(articleRootSelectors)].filter((node) => textLength(node) >= 80);
    candidates.sort((a, b) => scoreContentNode(b) - scoreContentNode(a));
    return candidates[0] || null;
  }

  function pickFallbackRoot(cleanDocument) {
    const candidates = [...cleanDocument.querySelectorAll(articleRootSelectors)].filter((node) => textLength(node) >= 80);
    candidates.sort((a, b) => scoreContentNode(b) - scoreContentNode(a));
    return candidates[0] || cleanDocument.body || cleanDocument.documentElement;
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function metaValues(selectors) {
    const result = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const value = node.getAttribute("content") || node.getAttribute("datetime") || node.getAttribute("value") || node.textContent;
        if (value?.trim()) result.push(value.trim());
      }
    }
    return result;
  }

  function collectStructuredArticles() {
    const records = [];
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"] || ""];
      if (types.some((type) => /article|blogposting|newsarticle|creativework|webpage/i.test(type))) records.push(value);
      Object.values(value).forEach((child) => {
        if (child && typeof child === "object") visit(child);
      });
    };

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { visit(JSON.parse(script.textContent)); } catch {}
    }
    return records;
  }

  function stringsFrom(value) {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(stringsFrom);
    if (value && typeof value === "object") {
      return [value.name, value.alternateName, value.url, value.contentUrl].filter((item) => typeof item === "string");
    }
    return [];
  }

  function urlsFrom(value) {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(urlsFrom);
    if (value && typeof value === "object") return [value.url, value.contentUrl, value.thumbnailUrl].filter((item) => typeof item === "string");
    return [];
  }

  function bestSrcsetCandidate(value) {
    if (!value) return "";
    const candidates = value.split(",").map((part) => {
      const [url, size = ""] = part.trim().split(/\s+/, 2);
      return { url, size: Number.parseFloat(size) || 1 };
    });
    return candidates.sort((a, b) => b.size - a.size)[0]?.url || "";
  }

  function imageFromNode(node) {
    const sources = [node.currentSrc, node.getAttribute("src"), node.getAttribute("data-src"), node.getAttribute("data-lazy-src"), node.getAttribute("data-original"), bestSrcsetCandidate(node.getAttribute("srcset")), bestSrcsetCandidate(node.getAttribute("data-srcset"))];
    const url = sources.map(absoluteUrl).find(Boolean);
    if (!url) return null;

    const width = Number(node.naturalWidth || node.getAttribute("width") || 0);
    const height = Number(node.naturalHeight || node.getAttribute("height") || 0);
    if (width && height && (width < 64 || height < 48)) return null;
    const context = `${node.className || ""} ${node.id || ""} ${node.parentElement?.className || ""} ${node.parentElement?.id || ""}`;
    if (ignoredMediaMarker.test(context)) return null;

    const figure = node.closest("figure");
    const alt = node.getAttribute("alt")?.trim() || figure?.querySelector("figcaption")?.textContent.trim() || "";
    return { url, alt };
  }

  function collectPageDetails(readabilityArticle, cleanArticleHtml) {
    const structured = collectStructuredArticles();
    const first = (values) => values.find((value) => value?.trim())?.trim() || "";
    const unique = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    const tags = [];

    for (const value of metaValues(['meta[name="keywords"]', 'meta[property="article:tag"]', 'meta[itemprop="keywords"]', '[itemprop="keywords"]'])) {
      tags.push(...value.split(/[,;|]/).map((tag) => tag.trim()));
    }
    for (const record of structured) tags.push(...stringsFrom(record.keywords));
    for (const node of document.querySelectorAll('a[rel~="tag"], [itemprop~="keywords"] a')) {
      if (!node.closest("nav, header, footer, aside, [role='navigation']")) tags.push(node.textContent.trim());
    }

    const semanticRoot = getSemanticArticleRoot();
    if (semanticRoot) {
      for (const node of semanticRoot.querySelectorAll("[class], [id]")) {
        const marker = `${node.className || ""} ${node.id || ""}`;
        if (!/(?:^|[-_\s])(?:tag|tags|category|categories|keywords)(?:$|[-_\s])/i.test(marker)) continue;
        for (const link of node.querySelectorAll("a")) {
          const text = link.textContent.replace(/\s+/g, " ").trim();
          if (text && text.length < 80) tags.push(text);
        }
      }
    }

    const authors = [readabilityArticle?.byline, ...metaValues(['meta[name="author"]', 'meta[property="article:author"]', 'meta[name="twitter:creator"]'])];
    for (const record of structured) authors.push(...stringsFrom(record.author));
    const published = [readabilityArticle?.publishedTime, ...metaValues(['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]', 'time[datetime]'])];
    for (const record of structured) if (record.datePublished) published.push(...stringsFrom(record.datePublished));
    const descriptions = [readabilityArticle?.excerpt, ...metaValues(['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'])];

    const images = [];
    const addImage = (url, alt = "") => {
      const normalized = absoluteUrl(url);
      if (!normalized) return;
      const existing = images.find((image) => image.url === normalized);
      if (existing) {
        if (!existing.alt && alt.trim()) existing.alt = alt.trim();
      } else images.push({ url: normalized, alt: alt.trim() });
    };
    const metadataImageAlt = first(metaValues(['meta[property="og:image:alt"]', 'meta[name="twitter:image:alt"]']));
    for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'link[rel="image_src"]', '[itemprop="image"][content]']) {
      for (const node of document.querySelectorAll(selector)) addImage(node.getAttribute("content") || node.getAttribute("href"), metadataImageAlt);
    }
    for (const record of structured) for (const image of urlsFrom(record.image)) addImage(image);
    if (semanticRoot) {
      for (const node of semanticRoot.querySelectorAll("img, [itemprop~='image'][content]")) {
        const image = node.tagName === "IMG" ? imageFromNode(node) : { url: node.getAttribute("content"), alt: "" };
        if (image) addImage(image.url, image.alt);
      }
      for (const figure of semanticRoot.querySelectorAll("figure")) {
        const background = getComputedStyle(figure).backgroundImage;
        for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) addImage(match[1], figure.querySelector("figcaption")?.textContent || "");
      }
    }
    if (cleanArticleHtml) {
      const parsed = new DOMParser().parseFromString(cleanArticleHtml, "text/html");
      for (const node of parsed.querySelectorAll("img[src]")) {
        const image = imageFromNode(node);
        if (image) addImage(image.url, image.alt);
      }
    }

    return {
      author: first(authors),
      published: first(published),
      description: first(descriptions),
      tags: unique(tags).slice(0, 30),
      images: images.slice(0, 20)
    };
  }

  function extract(message) {
    const title = document.title.trim() || "Saved page";
    const url = location.href;
    if (message.mode === "selection") {
      const selection = getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const wrapper = document.createElement("div");
        for (let index = 0; index < selection.rangeCount; index += 1) wrapper.append(selection.getRangeAt(index).cloneContents());
        return { title, url, html: wrapper.innerHTML, source: "selection" };
      }
      if (message.selectionHtml?.trim()) return { title, url, html: message.selectionHtml, source: "selection" };
      throw new Error("Select text on the page before opening the extension, then choose Selection.");
    }

    if (message.mode === "entire") return { title, url, html: document.body.innerHTML, source: "entire page" };

    const clean = getCleanDocument();
    const rule = message.rule || {};
    let root;
    if (rule.include?.trim()) {
      try { root = clean.querySelector(rule.include.trim()); }
      catch (error) { throw new Error(`Invalid main-content selector: ${error.message}`); }
      if (!root) throw new Error(`The selector “${rule.include}” did not match an element on this page.`);
      root = root.cloneNode(true);
      removeConfiguredNodes(root, rule.exclude);
      const html = root.innerHTML;
      return { title, url, html, source: "site rule", details: message.includeExtras ? collectPageDetails(null, html) : null };
    }

    if (message.useReaderView) {
      const article = new Readability(clean, { charThreshold: 60, keepClasses: false }).parse();
      if (article?.content && article.textContent?.trim()) {
        const articleDocument = new DOMParser().parseFromString(article.content, "text/html");
        removeConfiguredNodes(articleDocument.body, rule.exclude);
        const html = articleDocument.body.innerHTML;
        return { title: article.title?.trim() || title, url, html, source: "Reader View", details: message.includeExtras ? collectPageDetails(article, html) : null };
      }
    }

    root = pickFallbackRoot(clean) || clean.body || clean.documentElement;
    removeConfiguredNodes(root, rule.exclude);
    if (!root?.textContent?.trim()) throw new Error("No readable text was found on this page.");
    const html = root.innerHTML;
    return { title, url, html, source: message.useReaderView ? "page structure fallback" : "print-friendly page structure", details: message.includeExtras ? collectPageDetails(null, html) : null };
  }

  globalThis.__saveAsMarkdownExtract = (message) => {
    try { return extract(message); }
    catch (error) { return { error: error.message || "Could not extract this page." }; }
  };
})();
