/*
 * User (Content Fragment) Block
 * Renders an AEM Content Fragment (built from the "Users" Content Fragment
 * * Model) by calling a GraphQL Persisted Query against AEM Publish at
 * runtime. Same pattern as the Product (Content Fragment) block: the page
 * stores only a reference (path); this block fetches the fragment's data
 * on render.
 *
 * Matches this persisted query:
 *
 * query ($path: String!) {
 * userByPath(_path: $path) {
 * item {
 * _path
 * name
 * age
 * description { html }
 * companyName
 * experience
 * image { ... on ImageRef { _path mimeType width height } }
 * }
 * }
 * }
 */
import { loadScript } from '../../scripts/aem.js';
// TODO: confirm this matches your AEM GraphQL configuration name.
const CONFIG_NAME = 'eds-xwalk-abhi';
// TODO: the name you gave the persisted query when you saved it in AEM.
const QUERY_NAME = 'user-by-path';
// TODO: AEM names the query field <modelId>ByPath. If your "Users" model's
// id is "users" (not "user"), change this to 'usersByPath'.
const QUERY_ROOT = 'usersByPath';
// TODO: your AEM Publish origin (Cloud Manager > Environments > Publish).
const PUBLISH_HOST = 'https://publish-p139816-e1420456.adobeaemcloud.com';
/**
 * Fetches a User Content Fragment by its DAM path using a GraphQL
 * persisted query.
 * @param {string} path The Content Fragment's path
 * @returns {Promise<object|null>} the fragment's fields, or null if
 * not found / request failed
 */
async function fetchUser(path) {
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
      console.warn('user-content-fragment: GraphQL errors for', path, json.errors);
    }
    return json?.data?.[QUERY_ROOT]?.item || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('user-content-fragment: failed to fetch content fragment', path, e);
    return null;
  }
}
/**
 * Builds the block's markup: a round photo on the left, details on the
 * right (stacked on mobile, side-by-side from 600px up - see the CSS).
 * @param {object} user The Content Fragment's fields, as returned under
 * `item` by the persisted query
 * @returns {Promise<DocumentFragment>} the rendered markup
 */
async function renderUser(user) {
  const {
    name, age, description, companyName, experience, image,
  } = user;
    // AEM's GraphQL API names asset reference fields with a leading
    // underscore.
    // eslint-disable-next-line no-underscore-dangle
  const imagePath = image?._path;
  const frag = document.createDocumentFragment();
  if (imagePath) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'user-content-fragment-image';
    const img = document.createElement('img');
    img.src = `${PUBLISH_HOST}${imagePath}`;
    img.alt = name || '';
    img.loading = 'lazy';
    if (image.width) img.width = image.width;
    if (image.height) img.height = image.height;
    imageWrapper.append(img);
    frag.append(imageWrapper);
  }
  const body = document.createElement('div');
  body.className = 'user-content-fragment-body';
  if (name) {
    const nameEl = document.createElement('h3');
    nameEl.className = 'user-content-fragment-name';
    nameEl.textContent = name;
    body.append(nameEl);
  }
  if (companyName) {
    const companyEl = document.createElement('p');
    companyEl.className = 'user-content-fragment-company';
    companyEl.textContent = companyName;
    body.append(companyEl);
  }
  if (age || experience) {
    const metaEl = document.createElement('p');
    metaEl.className = 'user-content-fragment-meta';
    const parts = [];
    if (age) parts.push(`Age: ${age}`);
    if (experience) parts.push(`Experience: ${experience}`);
    metaEl.textContent = parts.join(' | ');
    body.append(metaEl);
  }
  if (description?.html) {
    // "description" is a rich-text field: AEM returns { html, plainText,
    // markdown }. Sanitize before inserting.
    await loadScript(`${window.hlx.codeBasePath}/scripts/dompurify.min.js`);
    const descEl = document.createElement('div');
    descEl.className = 'user-content-fragment-description';
    descEl.innerHTML = window.DOMPurify.sanitize(
      description.html,
      { USE_PROFILES: { html: true } },
    );
    body.append(descEl);
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
    console.warn('user-content-fragment: no Content Fragment reference authored on this block');
    return;
  }
  const user = await fetchUser(path);
  if (!user) {
    return;
  }
  block.append(await renderUser(user));
}
