# Mozilla Add-ons Reviewer Notes

## Functionality and testing

No account, external service, or website-specific credentials are required.

1. Open a normal article page in Firefox.
2. Use the toolbar button, choose a content scope, and select **Preview content**.
3. Change the extraction options to confirm the preview refreshes, then save the Markdown file.
4. Select text on a page before opening the toolbar popup, then choose **Selection** to verify selection-only extraction.
5. Right-click a page or selected text and use the corresponding **Save as Markdown** context-menu command.
6. Open **Site rules** to verify optional CSS selectors are stored locally and can be removed.

Firefox internal pages, PDF viewer pages, and pages that prohibit extension content access are not supported. These restrictions come from Firefox and the page itself; they do not indicate a failure on ordinary websites.

## Permissions

- `activeTab`: read the current tab after the user invokes the extension.
- `scripting`: run the bundled extractor and Markdown converter in the active tab after the user invokes an extraction action.
- `downloads`: save the user-requested Markdown file.
- `storage`: keep optional site-specific CSS selectors in local extension storage.
- `contextMenus`: provide the page and selected-text save commands.

The extension declares no host permissions and sends no page content, browsing history, or site rules to a server. Extraction and conversion happen locally. The manifest sets `data_collection_permissions.required` to `none`.

## Third-party libraries

- Mozilla Readability 0.6.x: <https://github.com/mozilla/readability>
- Turndown 7.2.x: <https://github.com/mixmark-io/turndown>
- web-ext 10.x (development/lint tooling only): <https://github.com/mozilla/web-ext>

Their runtime files and license texts are included in `vendor/`. The project lockfile pins the dependency graph. To refresh the vendored copies, run `pnpm install --frozen-lockfile` followed by `pnpm run build:vendor`.

## Source and build

First-party extension files are shipped as readable source and are not minified or obfuscated. `scripts/copy-vendor.mjs` copies the third-party library files from locked package installations into `vendor/`; it does not bundle or transform first-party code.
