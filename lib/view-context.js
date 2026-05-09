/**
 * Helpers to build navigation URLs that respect the view context.
 *
 * When the user navigates from a DBCodeConsole view (e.g. /view/MyConsole),
 * `viewBaseUrl` is set to that URL and all links stay within the view.
 * When the user navigates from the direct /db-code routes, `viewBaseUrl`
 * is null and all links use the /db-code paths as before.
 */

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeViewBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!text.startsWith("/")) return null;
  if (text.startsWith("//")) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) return null;
  if (!/^\/(view|db-code)(\/|$)/.test(text)) return null;
  if (/[\r\n]/.test(text)) return null;
  return text;
}

/**
 * Build the list-page URL for the current context.
 * @param {string|null} viewBaseUrl
 * @param {string} kind  Optional kind filter ("function" or "procedure")
 */
function listViewHref(viewBaseUrl, kind) {
  const safeViewBaseUrl = sanitizeViewBaseUrl(viewBaseUrl);
  if (!safeViewBaseUrl) {
    return kind ? `/db-code?kind=${encodeURIComponent(kind)}` : "/db-code";
  }
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  const qs = params.toString();
  return qs ? `${safeViewBaseUrl}?${qs}` : safeViewBaseUrl;
}

/**
 * Build the detail-page URL for the current context.
 */
function detailViewHref(viewBaseUrl, oid) {
  const safeViewBaseUrl = sanitizeViewBaseUrl(viewBaseUrl);
  if (!safeViewBaseUrl) return `/db-code/routine/${oid}`;
  return `${safeViewBaseUrl}?routine_oid=${oid}`;
}

/**
 * Build a link to a direct plugin route, appending view_base_url when
 * the user is in a view context so the route can redirect back.
 */
function routeHref(routePath, viewBaseUrl) {
  const safeViewBaseUrl = sanitizeViewBaseUrl(viewBaseUrl);
  if (!safeViewBaseUrl) return routePath;
  const sep = routePath.includes("?") ? "&" : "?";
  return `${routePath}${sep}view_base_url=${encodeURIComponent(safeViewBaseUrl)}`;
}

/**
 * Hidden form input that carries view_base_url through POST requests.
 */
function viewContextInput(viewBaseUrl) {
  const safeViewBaseUrl = sanitizeViewBaseUrl(viewBaseUrl);
  if (!safeViewBaseUrl) return "";
  return `<input type="hidden" name="view_base_url" value="${escapeAttr(safeViewBaseUrl)}">`;
}

/**
 * Read view_base_url from a request (query on GET, body on POST).
 */
function getViewBaseUrl(req) {
  return sanitizeViewBaseUrl(req.query?.view_base_url || req.body?.view_base_url || null);
}

module.exports = { listViewHref, detailViewHref, routeHref, viewContextInput, getViewBaseUrl, sanitizeViewBaseUrl };
