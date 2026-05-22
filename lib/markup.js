/**
 * Adapter for @saltcorn/markup.
 *
 * Re-exports tag functions and helpers so the rest of the plugin
 * imports from a single place.  Also provides a fallback for
 * environments where @saltcorn/markup is not installed (tests, etc.)
 */

let tags, markup;

try {
  tags = require("@saltcorn/markup/tags");
  markup = require("@saltcorn/markup");
} catch {
  // Fallback: provide a minimal subset using simple HTML builders
  // so tests can run without @saltcorn/markup installed.

  const voidTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
  ]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function mkTag(tnm, isVoid) {
    return function tagFn(attrsOrFirst, ...children) {
      let attribs = "";
      let body = "";
      const argIter = (arg) => {
        if (arg === undefined || arg === null || arg === false) return;
        if (typeof arg === "string") { body += arg; return; }
        if (Array.isArray(arg)) { arg.forEach(argIter); return; }
        body += String(arg);
      };
      if (attrsOrFirst && typeof attrsOrFirst === "object" && !Array.isArray(attrsOrFirst)) {
        const parts = [];
        for (const [k, v] of Object.entries(attrsOrFirst)) {
          if (v === false || v === undefined || v === null) continue;
          if (k === "class") {
            const cs = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
            if (cs) parts.push(`class="${escapeAttr(cs)}"`);
          } else if (k === "style" && typeof v === "object" && !Array.isArray(v)) {
            const s = Object.entries(v).map(([sk, sv]) => `${sk}:${sv}`).join(";");
            if (s) parts.push(`style="${escapeAttr(s)}"`);
          } else if (typeof v === "boolean") {
            parts.push(k);
          } else {
            parts.push(`${k}="${escapeAttr(String(v))}"`);
          }
        }
        attribs = parts.length ? " " + parts.join(" ") : "";
        children.forEach(argIter);
      } else {
        [attrsOrFirst, ...children].forEach(argIter);
      }
      return isVoid
        ? `<${tnm}${attribs}>`
        : `<${tnm}${attribs}>${body}</${tnm}>`;
    };
  }

  const htmlTags = [
    "a", "abbr", "address", "article", "aside", "audio", "b", "bdi",
    "bdo", "blockquote", "body", "button", "canvas", "caption", "cite",
    "code", "col", "colgroup", "data", "datalist", "dd", "del", "details",
    "dialog", "div", "dl", "dt", "em", "fieldset", "figcaption", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
    "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd",
    "label", "legend", "li", "link", "main", "map", "mark", "meta", "meter",
    "nav", "noscript", "object", "ol", "optgroup", "option", "output", "p",
    "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s",
    "samp", "script", "section", "select", "slot", "small", "source", "span",
    "strong", "style", "sub", "summary", "sup", "table", "tbody", "td",
    "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr",
    "track", "u", "ul", "video", "wbr",
  ];

  tags = {};
  for (const t of htmlTags) {
    tags[t] = mkTag(t, voidTags.has(t));
  }
  tags.text = (s) => escapeHtml(s);
  tags.text_attr = (s) => escapeAttr(s);
  tags.domReady = (js) =>
    `(function(f){if(document.readyState==="complete")f();else document.addEventListener('DOMContentLoaded',()=>setTimeout(f),false)})(function(){${js}});`;

  markup = {
    ...tags,
    badge: (col, lbl) => `${tags.span({ class: `badge bg-${col}` }, tags.text(lbl))}&nbsp;`,
    link: (href, s, attrs = {}) => tags.a({ href: tags.text_attr(href), ...attrs }, tags.text(s)),
    div: tags.div,
    a: tags.a,
    i: tags.i,
    button: tags.button,
    input: tags.input,
    span: tags.span,
  };
}

module.exports = {
  ...tags,
  // Re-export commonly used high-level helpers from the main package
  ...(markup || {}),
};
