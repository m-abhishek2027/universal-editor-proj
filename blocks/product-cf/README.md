# Product (Content Fragment) block

Renders an AEM **Content Fragment** (built from the "Product" Content
Fragment Model) inside an Edge Delivery Services page.

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

The alternative (json2html/Configuration Service overlay, making a CF
become its own EDS page automatically) was considered but not used here —
it needs extra AEM-side infrastructure (Configuration Service overlay,
Mustache templates) that this project doesn't have set up.

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
persisted query in AEM **and** `renderProduct()` in [product-cf.js](product-cf.js).

## Setup checklist (do this in AEM, then confirm here)

Three constants at the top of [product-cf.js](product-cf.js) are environment-specific
placeholders — confirm/update them:

- [ ] `CONFIG_NAME` — currently `eds-xwalk-abhi` (read from the CF Model's
      console URL: `/conf/eds-xwalk-abhi/settings/dam/models/product`)
- [ ] `QUERY_NAME` — currently `product-by-path`; must match the name the
      persisted query was saved under in AEM's GraphQL Query Editor
- [ ] `PUBLISH_HOST` — currently
      `https://publish-p139816-e1420456.adobeaemcloud.com`, guessed from the
      Author host in [fstab.yaml](../../fstab.yaml) using standard AEMaaCS naming.
      **Confirm the real value in Cloud Manager > Environments > Publish.**

Also enable GraphQL for the "Product" model (Tools > Assets > Content
Fragment Models > Product > Enable) if not already done.

## Authoring

In Universal Editor: add the **"Product (Content Fragment)"** component to
a Section, then set its **Product** field to the Content Fragment to
render. The page itself only stores that reference — see
[_product-cf.json](_product-cf.json).

## Local testing without a real page

[drafts/product-cf-test.html](../../drafts/product-cf-test.html) and
[drafts/product-cf-empty.html](../../drafts/product-cf-empty.html) are static
fixtures for testing this block without needing Universal Editor. Run:

```bash
npx -y @adobe/aem-cli up --no-open --forward-browser-logs --html-folder drafts --port 3001
```

(or use the `aem-dev` config in [.claude/launch.json](../../.claude/launch.json)), then open
`http://localhost:3001/drafts/product-cf-test.html`.

Verified so far (with a mocked GraphQL response, since the real persisted
query wasn't live yet at the time): image renders with explicit
`width`/`height` (CLS prevention), title/price/description/CTA render
correctly, and the rich-text `description.html` is sanitized with the
project's DOMPurify ([scripts/dompurify.min.js](../../scripts/dompurify.min.js)) before
insertion — tested with an injected `<script>` payload to confirm it's
stripped.

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
