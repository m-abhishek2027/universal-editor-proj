/*
 * Product (Content Fragment) Block
 * Renders an AEM Content Fragment (built from the "Product" Content Fragment
 * Model) by calling a GraphQL Persisted Query against AEM Publish at runtime.
 *
 * This is the "industry standard" pattern for Content Fragments + Edge
 * Delivery Services: the page only stores a reference (path) to the
 * fragment; this block fetches the fragment's data on render.
 * Background: https://www.aem.live/developer/content-fragment-overlay
 *
 * IMPORTANT: this block's folder/file/model id ("product-content-fragment")
 * must match this block's DEFINITION TITLE run through toClassName() in
 * scripts/aem.js — xwalk derives the rendered block's CSS class from the
 * component definition's "title", not its "id". Renaming the title in
 * _product-content-fragment.json without renaming this folder/files to
 * match will silently break decoration again.
 *
 * Matches this persisted query (adjust here if the query changes):
 *
 * query ($path: String!) {
 *   productByPath(_path: $path) {
 *     item {
 *       _path
 *       productName
 *       description { html }
 *       price
 *       image { ... on ImageRef { _path mimeType width height } }
 *       ctaLabel
 *       ctaUrl { ... on PageRef { _path } }
 *     }
 *   }
 * }
 */

import { loadScript } from '../../scripts/aem.js';

// TODO: confirm this is your AEM GraphQL configuration name. It's the segment
// right after /conf/ for your project, e.g. /conf/eds-xwalk-abhi/settings/graphql
const CONFIG_NAME = 'eds-xwalk-abhi';

// TODO: the name you gave the persisted query when you saved it in AEM
// (GraphQL query editor > Persisted Queries > Save As).
const QUERY_NAME = 'product-by-path';

// TODO: your AEM Publish origin (Cloud Manager > Environments > Publish).
// Persisted queries must be called against Publish, not Author, once the
// fragment is published. Asset paths (the "image" field) are also resolved
// against this host below.
const PUBLISH_HOST = 'https://publish-p139816-e1420456.adobeaemcloud.com';

/**
 * Fetches a Product Content Fragment by its DAM path using a GraphQL
 * persisted query.
 * @param {string} path The Content Fragment's path,
 *   e.g. /content/dam/eds-xwalk-abhi/products/my-product
 * @returns {Promise<object|null>} the fragment's fields, or null if
 *   not found / request failed
 */
async function fetchProduct(path) {
  // AEM's matrix-parameter (;path=...) parsing does not decode %2F back to
  // "/" - a fully encodeURIComponent()'d path 404s with "no resource
  // available" even though the fragment exists. Encode each segment but
  // keep the "/" separators literal, matching how AEM expects this param.
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${PUBLISH_HOST}/graphql/execute.json/${CONFIG_NAME}/${QUERY_NAME};path=${encodedPath}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.errors) {
      // A 200 response can still carry GraphQL errors with data: null, e.g.
      // "no resource available" when the fragment isn't published yet.
      // eslint-disable-next-line no-console
      console.warn('product-content-fragment: GraphQL errors for', path, json.errors);
    }
    // "productByPath" is AEM's auto-generated query name for a model whose
    // id is "product" (modelId + "ByPath"). Rename if your model id differs.
    return json?.data?.productByPath?.item || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('product-content-fragment: failed to fetch content fragment', path, e);
    return null;
  }
}

/**
 * Builds the block's markup from the fragment's fields.
 * @param {object} product The Content Fragment's fields, as returned
 *   under `item` by the persisted query
 * @returns {Promise<DocumentFragment>} the rendered markup
 */
async function renderProduct(product) {
  const {
    productName, price, description, image, ctaLabel, ctaUrl,
  } = product;
  // AEM's GraphQL API names Content/Page/Asset reference fields with a
  // leading underscore.
  /* eslint-disable no-underscore-dangle */
  const imagePath = image?._path;
  const ctaPath = ctaUrl?._path;
  /* eslint-enable no-underscore-dangle */

  const frag = document.createDocumentFragment();

  if (imagePath) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'product-content-fragment-image';
    const img = document.createElement('img');
    img.src = `${PUBLISH_HOST}${imagePath}`;
    img.alt = productName || '';
    img.loading = 'lazy';
    if (image.width) img.width = image.width;
    if (image.height) img.height = image.height;
    imageWrapper.append(img);
    frag.append(imageWrapper);
  }

  const body = document.createElement('div');
  body.className = 'product-content-fragment-body';

  if (productName) {
    const title = document.createElement('h3');
    title.className = 'product-content-fragment-title';
    title.textContent = productName;
    body.append(title);
  }

  if (price) {
    const priceEl = document.createElement('p');
    priceEl.className = 'product-content-fragment-price';
    priceEl.textContent = 'Price: $'+price;
    body.append(priceEl);
  }

  if (description?.html) {
    // "description" is a rich-text field: AEM returns { html, plainText,
    // markdown }. Sanitize before inserting, same as editor-support.js does.
    await loadScript(`${window.hlx.codeBasePath}/scripts/dompurify.min.js`);
    const descriptionEl = document.createElement('div');
    descriptionEl.className = 'product-content-fragment-description';
    descriptionEl.innerHTML = window.DOMPurify.sanitize(
      description.html,
      { USE_PROFILES: { html: true } },
    );
    body.append(descriptionEl);
  }

  if (ctaLabel && ctaPath) {
    const cta = document.createElement('a');
    cta.className = 'button primary product-content-fragment-cta';
    // TODO: ctaPath is the raw AEM content path (e.g.
    // /content/universal-editor-proj/en/some-page). If your EDS URLs don't
    // map 1:1 to that path, transform it here before use.
    cta.href = ctaPath;
    cta.textContent = ctaLabel;
    body.append(cta);
  }

  frag.append(body);
  return frag;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  block.textContent = '';

  if (!path) {
    // eslint-disable-next-line no-console
    console.warn('product-content-fragment: no Content Fragment reference authored on this block');
    return;
  }

  const product = await fetchProduct(path);
  if (!product) {
    return;
  }

  block.append(await renderProduct(product));
}
