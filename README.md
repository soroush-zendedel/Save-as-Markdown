# Save as Markdown

A Firefox extension that extracts page content, lets you review and edit the Markdown, and saves it as a `.md` file. The interface and project documentation are in English. Page content is processed locally.

This project is licensed under the MIT License; see [LICENSE](LICENSE). Third-party components in `vendor/` retain their own licenses.

## Version 1.0.0

- **Extraction strategies:** By default, use a print-friendly semantic page structure with generic clutter cleanup. Enable **Use Reader View extraction** to use Mozilla Readability, which can produce a cleaner result but may omit images or details outside the article.
- **Markdown conversion:** Turndown preserves headings, links, images, lists, quotes, code blocks, and other common HTML structure.
- **Preview and scope:** Choose **Main article**, **Selected text**, or **Entire page**. Review and edit the Markdown before saving.
- **Context menu:** Right-click a page to save its main content, or select text and right-click to save only that selection.
- **Compact popup:** Content scopes use a compact layout to keep the main controls and preview within less scrolling.
- **Firefox-aware appearance:** Popup and site-rule settings use system colors and native control styling, following the browser's light or dark color scheme.
- **Live preview updates:** After the first preview, changing the content scope or extraction options regenerates it automatically. The popup grows to fit the preview up to the available viewport height.
- **Selection recovery:** The Selection scope stays visible, and text selected before opening the popup is snapshotted so it remains available for extraction.
- **Toolbar icon:** A compact page-and-download symbol identifies the extension in the Firefox toolbar and add-ons list.
- **Glass interface:** The popup and site-rule page use a translucent, softly blurred interface with separate light and dark palettes.
- **Optional page details:** Add tags, author, publication date, description, and relevant images found in the page's metadata and semantic article markup. This is off by default.
- **General cleanup:** Remove navigation, ads, sidebars, social blocks, repeated profile cards, and common recommendation sections using page semantics and common markup patterns. No domain-specific extraction rules are built in.
- **Optional selectors:** Save include and exclude CSS selectors for a domain when the generic extraction needs help. These are user-configured and stored locally in Firefox.

## Install temporarily in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**.
3. Select this project's `manifest.json` file.
4. Open an article, click the extension, select a content scope, and choose **Preview content**. Or right-click the page or a text selection and choose a Save as Markdown command for a direct download.
5. Review or edit the Markdown, then choose **Save Markdown file**.

Temporary add-ons are removed when Firefox closes. For regular installation, the extension needs to be packaged, signed, and published through Mozilla Add-ons.

## Per-site CSS rules

Choose **Site rules** in the popup. The current site's hostname is filled in automatically.

- **Main content selector** is optional. For example: `article .post-content` or `[itemprop="articleBody"]`.
- **Remove from the selected content** is optional. For example: `.author-card, .share-buttons, .related-posts`.
- Preview the extraction after saving a rule. If the selector does not match, the preview shows a clear error so the rule can be corrected.

An include selector takes precedence over automatic content selection. If it is blank, the default strategy chooses the best semantic page region it can identify; **Use Reader View extraction** switches to Readability. **Entire page** intentionally bypasses article extraction. The default strategy does not open Firefox's print dialog or emulate print CSS; it selects article-like structure from the page DOM, which keeps extraction local and predictable. Common clutter filters do not catch every site's custom markup, so preview remains the final check.

## Development

The extension runs from the checked-in `vendor/` files and does not need a build step to load in Firefox. Use the Mozilla extension linter before packaging or submission:

```sh
pnpm install --frozen-lockfile
pnpm run lint:firefox
```

To refresh the bundled libraries after changing their package versions:

```sh
pnpm install
pnpm run build:vendor
```

Dependencies:

- [web-ext](https://github.com/mozilla/web-ext) — Mozilla's command-line development, validation, and packaging tool.
- [Mozilla Readability](https://github.com/mozilla/readability) — Apache-2.0; license included in `vendor/LICENSE-Readability.md`.
- [Turndown](https://github.com/mixmark-io/turndown) — MIT; license included in `vendor/LICENSE-Turndown`.

## Project files

- `manifest.json` — Firefox extension metadata and permissions.
- `popup.html`, `popup.css`, `popup.js` — scope controls, editable preview, and download flow.
- `extractor.js` — generic page cleanup, semantic content selection, and optional Readability extraction.
- `options.html`, `options.css`, `options.js` — per-domain extraction rules.
- `background.js` — registers context-menu commands and creates temporary Blob URLs for Firefox's download manager.
- `vendor/` — local library files and their licenses.

## Limitations

Some sites use custom or dynamically rendered layouts that Readability cannot identify reliably. Configure a site's selectors or choose selected text, then check the preview. The **Entire page** option can include navigation and advertisements by design. Images are kept as links to their original URLs; they are not downloaded. Firefox internal pages, PDF viewers, and some protected pages cannot be read.

## Privacy

Page content and site extraction rules stay in the browser. The extension does not send page content to a server. The extension reads the active page only after a user invokes its toolbar button or context-menu command. Firefox's manifest data declaration explicitly states that no data is collected or transmitted.

## Mozilla Add-ons review notes

See [AMO_REVIEWER_NOTES.md](AMO_REVIEWER_NOTES.md) for reviewer testing steps, permission justifications, and third-party library references. The extension source is readable and is not minified or obfuscated. Build instructions for refreshing the bundled libraries are listed under Development.
