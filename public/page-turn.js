/* Which way the page turns.
 *
 * Pages here turn with the browser's own cross-document view transition, declared in
 * base.css. Left to itself every turn is the same turn, so walking back along the nav
 * looked exactly like walking forward along it. The nav reads left to right, so a move
 * rightwards has the new page slide in across the old one from the right, and a move
 * leftwards is the mirror.
 *
 * All the browser is told is one attribute on <html>: data-nav is fwd, back or same, and
 * the stylesheet keys its animations off it. It has to be set before the first frame,
 * which is why this is inlined in <head> rather than imported as a module: the
 * transition's pseudo-elements take their animation when the new page first renders, and
 * an attribute set after that restarts the motion part way through.
 *
 * Where the reader came from is navigation.activation, which the browser fills in before
 * any script in the new document runs, and document.referrer in a browser without the
 * Navigation API. Neither exists on a hard load or a typed address, and neither of those
 * turns at all.
 *
 * Production serves these pages without the .html, so both spellings have to rank the
 * same or every link through Cloudflare's redirect would read as a jump to nowhere.
 */
(function () {
  var ORDER = ['index', 'talents', 'raid', 'dps'];

  /* Where a path sits along the nav, or null for somewhere with no place in it. */
  function rank(path) {
    var last = path.replace(/\/+$/, '').split('/').pop() || 'index';
    var name = last.replace(/\.html$/, '');
    if (name === '') name = 'index';
    var at = ORDER.indexOf(name);
    return at < 0 ? null : at;
  }

  function direction(from, to) {
    if (from === to) return 'same';
    var a = rank(from);
    var b = rank(to);
    if (a === null || b === null || a === b) return 'same';
    return b > a ? 'fwd' : 'back';
  }

  var from = null;
  try {
    var act = window.navigation && window.navigation.activation;
    if (act && act.from && act.from.url) from = new URL(act.from.url).pathname;
  } catch (e) {}
  if (from === null) {
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin) from = ref.pathname;
    } catch (e) {}
  }
  if (from === null) return;

  /* Somebody who asked for less motion gets none of the sideways ones either. With no
     attribute set the directional rules never match. */
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}

  document.documentElement.setAttribute('data-nav', direction(from, location.pathname));
})();
