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
are environment-specific placeholders — confirm/update them:

- [ ] `CONFIG_NAME` — currently `eds-xwalk-abhi` (read from the CF Model's
      console URL: `/conf/eds-xwalk-abhi/settings/dam/models/product`)
- [ ] `QUERY_NAME` — currently `product-by-path`; must match the name the
      persisted query was saved under in AEM's GraphQL Query Editor.
      **Confirmed working** — tested directly against
      `author-p139816-e1420456.adobeaemcloud.com/graphql/execute.json/eds-xwalk-abhi/product-by-path`
      and it returned real data.
- [ ] `PUBLISH_HOST` — currently
      `https://publish-p139816-e1420456.adobeaemcloud.com`, guessed from the
      Author host in [fstab.yaml](../../fstab.yaml) using standard AEMaaCS naming.
      **Not yet confirmed against Publish** — the working test above was
      against Author, not Publish. Confirm the real value in Cloud Manager
      > Environments > Publish, and confirm the CF is actually published
      (activated), since Publish only serves published content.

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

Verified: image renders with explicit `width`/`height` (CLS prevention),
title/price/description/CTA render correctly, and the rich-text
`description.html` is sanitized with the project's DOMPurify
([scripts/dompurify.min.js](../../scripts/dompurify.min.js)) before insertion —
tested with an injected `<script>` payload to confirm it's stripped.

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
