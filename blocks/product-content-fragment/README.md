# Product (Content Fragment) block

Renders an AEM **Content Fragment** (built from the "Product" Content
Fragment Model) inside an Edge Delivery Services page.

> **Renamed from `product-cf` to `product-content-fragment`.** The first
> version used folder/id `product-cf` but definition title
> `"Product (Content Fragment)"`. In this xwalk project, the block's
> rendered CSS class comes from running the definition's **title** through
> `toClassName()` (in [scripts/aem.js](../../scripts/aem.js)) — not from the
> model/definition `id`. `toClassName("Product (Content Fragment)")` =
> `product-content-fragment`, which didn't match the `product-cf` folder,
> so the browser requested `/blocks/product-content-fragment/product-content-fragment.js`
> (404) and the block never decorated — it just sat there showing the raw
> authored `<a href>` path. Confirmed by inspecting the actual saved markup
> via `/index.plain.html`. Fixed by renaming everything (folder, files,
> model id, CSS classes) to `product-content-fragment` to match what the
> title produces. **If you ever change this block's title, re-derive the
> class name and rename the folder/files/id to match — don't just edit the
> title in place.**

## Why this exists / architecture decision

AEM Content Fragments cannot be published directly into the EDS delivery
layer — the page itself only ever holds a **reference** (a path) to the
fragment. This block fetches the fragment's data at render time via an AEM
**GraphQL Persisted Query**, called against AEM **Publish**. This is the
pattern documented as the current standard for Content Fragments + EDS:

- https://www.aem.live/developer/content-fragment-overlay (background —
  describes the newer, alternative "publish CF directly as HTML" overlay
  approach, which this project does NOT use)
- Confirmed as the current well-established approach by Adobe Experience
  League Community: a page holds a reference, a dedicated block per Content
  Fragment Model does the GraphQL fetch.

## Expected GraphQL Persisted Query

The block's `fetchProduct()` assumes this exact query shape is saved as a
persisted query in AEM:

```graphql
query ($path: String!) {
  productByPath(_path: $path) {
    item {
      _path
      productName
      description { html }
      price
      image { ... on ImageRef { _path mimeType width height } }
      ctaLabel
      ctaUrl { ... on PageRef { _path } }
    }
  }
}
```

If the "Product" Content Fragment Model's fields change, update both the
persisted query in AEM **and** `renderProduct()` in
[product-content-fragment.js](product-content-fragment.js).

## Setup checklist (do this in AEM, then confirm here)

Three constants at the top of [product-content-fragment.js](product-content-fragment.js)
are environment-specific — **all three are now confirmed working end-to-end**:

- [x] `CONFIG_NAME` — `eds-xwalk-abhi`
- [x] `QUERY_NAME` — `product-by-path`
- [x] `PUBLISH_HOST` — `https://publish-p139816-e1420456.adobeaemcloud.com`
      (the guess from Author's host name using standard AEMaaCS naming was
      correct)

If you add a second Content Fragment Model / block later, re-verify these
for that model's own config rather than assuming they're always the same.

### Bug found while verifying: path encoding in the matrix parameter

`fetchProduct()` originally called `encodeURIComponent()` on the whole
path, turning `/` into `%2F` in the `;path=` matrix parameter. AEM's Sling
matrix-parameter parsing does **not** decode `%2F` back to `/`, so every
call failed with `"no resource available"` even for a published,
correctly-referenced fragment — confirmed by comparing a literal-slash
request (worked) against an `encodeURIComponent()`'d one (failed) directly
against Publish. Fixed by encoding each path segment individually while
keeping `/` separators literal. If you build another block that calls a
persisted query with a path-like variable, watch for this same trap.

### Bug found while verifying: 200 response can still carry GraphQL errors

A 200 HTTP response can carry a GraphQL `errors` array with `data: null`
(e.g. exactly the "not published yet" case above) — this was originally
being swallowed with no warning. `fetchProduct()` now logs `json.errors`
when present.

## Authoring

In Universal Editor: add the **"Product (Content Fragment)"** component to
a Section, then set its **Product** field to the Content Fragment to
render. The page itself only stores that reference — see
[_product-content-fragment.json](_product-content-fragment.json).

## Local testing without a real page

[drafts/product-content-fragment-test.html](../../drafts/product-content-fragment-test.html)
and [drafts/product-content-fragment-empty.html](../../drafts/product-content-fragment-empty.html)
are static fixtures for testing this block without needing Universal
Editor. Run:

```bash
npx -y @adobe/aem-cli up --no-open --forward-browser-logs --html-folder drafts --port 3001
```

(or use the `aem-dev` config in [.claude/launch.json](../../.claude/launch.json)), then open
`http://localhost:3001/drafts/product-content-fragment-test.html`.

Verified with a mocked GraphQL response: image renders with explicit
`width`/`height` (CLS prevention), title/price/description/CTA render
correctly, and the rich-text `description.html` is sanitized with the
project's DOMPurify ([scripts/dompurify.min.js](../../scripts/dompurify.min.js))
before insertion — tested with an injected `<script>` payload to confirm
it's stripped.

**Also verified end-to-end against real data**: with the "Samsung Android
TV 34 INCH" Content Fragment at `/content/dam/eds-xwalk-abhi/cf/tv`
published, the block renders correctly on `localhost:3000` via the real
persisted query against Publish (title, price, sanitized description).
That fragment has no image or CTA set, so those branches weren't exercised
against real data — only against the mock above.

## Known gaps / things to revisit

- `ctaUrl._path` is used as-is for the CTA's `href`. It's the raw AEM
  content path (e.g. `/content/universal-editor-proj/en/...`) — if this
  site's EDS URLs don't map 1:1 to that path, transform it before use.
- `image._path` is resolved as `PUBLISH_HOST + _path`, assuming the DAM
  asset is directly publicly readable at that path on Publish. If assets
  are served through Dynamic Media or a different delivery domain, adjust
  the image URL construction.
- No client-side caching/memoization of the GraphQL fetch — every page
  view re-fetches. Fine for low-traffic testing; revisit if this block is
  used at scale (e.g. cache in `sessionStorage`, or move the fetch
  server-side).
- Graceful-failure behavior (empty block + `console.warn`) is intentional
  so a broken/unpublished reference never breaks the page — but it also
  means author-facing errors are silent in the UI. Consider a visible
  author-only error state if this becomes a support burden.
