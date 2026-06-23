// Reveal bridge — injected into the visible iframe via srcDoc.
// Posts nav events to the parent. The parent uses the Chrome extension
// (chrome.tabs.captureVisibleTab) to take screenshots — no html2canvas,
// no hidden capture iframe, no transition juggling.

export const BRIDGE = {
  source: {
    visible: "slidesync-visible",
  },
  type: {
    nav: "nav",
    slideIndex: "slide-index",
  },
} as const;

// srcdoc iframes live at about:srcdoc, so Reveal's hash plugin (hash: true)
// throws SecurityError when it calls replaceState/pushState — not only on every
// nav, but during Reveal's *ready* sequence. That init-time throw rejects
// Reveal's ready promise before the 'ready' event is dispatched, so the deck's
// own Reveal.on('ready', …) never runs — animations, MutationObservers, carousel
// init and body-class chrome are all silently skipped, while static slides still
// look fine. We swallow the SecurityError (re-throwing anything else) AND inject
// this patch into <head> via injectHeadPatch, so it is installed before reveal.js
// loads — ahead of that first throwing call. (Injecting only at end-of-body, as
// before, ran too late to catch it.)
const HISTORY_MONKEY_PATCH = `
<script>
(function() {
  var orig = {
    replaceState: History.prototype.replaceState,
    pushState: History.prototype.pushState,
  };
  function safe(name) {
    return function() {
      try { return orig[name].apply(this, arguments); }
      catch (e) {
        if (e && e.name === 'SecurityError') return;
        throw e;
      }
    };
  }
  History.prototype.replaceState = safe('replaceState');
  History.prototype.pushState = safe('pushState');
})();
<\/script>
`;

// Reveal+srcdoc was setting transition: none on fragments and slides,
// killing animations. Force them back on — but EXCLUDE .fragment.custom.
// `custom` is Reveal's marker for fragments the deck animates itself (e.g. an
// SVG line drawn via `transition: stroke-dashoffset 0.9s`). Pinning those to
// `transition: opacity/transform 0.4s !important` drops their real transition
// property, so the animation snaps instantly instead of playing — looks like it
// "runs too fast". Re-enable standard fragments only; leave custom ones alone.
const VISIBLE_PRELUDE = `
<style id="slidesync-transition-override">
.reveal .slides section .fragment:not(.custom),
.reveal .slides section .fragment.fade-in-then-out,
.reveal .slides section .fragment.fade-in-then-semi-out {
  transition: opacity 0.4s ease, transform 0.4s ease !important;
}
.reveal .slides > section,
.reveal .slides > section > section {
  transition: transform 0.6s ease, opacity 0.6s ease, visibility 0s linear !important;
}
.reveal .slides section .fragment.grow.visible,
.reveal .slides section .fragment.shrink.visible,
.reveal .slides section .fragment.zoom-in.visible {
  transition: transform 0.4s ease !important;
}
</style>
`;

const VISIBLE_BODY = `
${VISIBLE_PRELUDE}
<script>
(function() {
  var SOURCE = ${JSON.stringify(BRIDGE.source.visible)};
  var TYPE_NAV = ${JSON.stringify(BRIDGE.type.nav)};
  var TYPE_SLIDE_INDEX = ${JSON.stringify(BRIDGE.type.slideIndex)};

  function postNav() {
    var i = Reveal.getIndices();
    parent.postMessage({
      source: SOURCE,
      type: TYPE_NAV,
      h: i.h, v: i.v, f: typeof i.f === 'number' ? i.f : -1,
    }, '*');
  }

  // Build the canonical slide ordering: each horizontal slide and its
  // vertical children, in DOM order. Posted once Reveal is ready so the
  // parent can map (h, v) → globalIndex without depending on visit order.
  function postSlideIndex() {
    var hSlides = Reveal.getHorizontalSlides();
    var map = {};
    var n = 0;
    for (var h = 0; h < hSlides.length; h++) {
      var section = hSlides[h];
      var verticals = section.querySelectorAll(':scope > section');
      if (verticals.length === 0) {
        n++;
        map[h + '-0'] = n;
      } else {
        for (var v = 0; v < verticals.length; v++) {
          n++;
          map[h + '-' + v] = n;
        }
      }
    }
    parent.postMessage({
      source: SOURCE,
      type: TYPE_SLIDE_INDEX,
      map: map,
      total: n,
    }, '*');
  }

  function ready() {
    if (typeof Reveal === 'undefined' || !Reveal.isReady || !Reveal.isReady()) {
      setTimeout(ready, 50);
      return;
    }
    Reveal.on('slidechanged', postNav);
    Reveal.on('fragmentshown', postNav);
    Reveal.on('fragmenthidden', postNav);
    postSlideIndex();
    postNav();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ready();
  } else {
    window.addEventListener('DOMContentLoaded', ready);
  }
})();
<\/script>
`;

// Install the history monkey-patch as early as possible — right after the
// opening <head> — so it is in place before reveal.js loads and Reveal's
// ready-time replaceState can throw. Falls back to after <html>, then to a
// prepend, for decks without a <head>. The replacer is a function so the
// patch text is inserted verbatim (no $-pattern interpretation).
function injectHeadPatch(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${HISTORY_MONKEY_PATCH}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}${HISTORY_MONKEY_PATCH}`);
  }
  return HISTORY_MONKEY_PATCH + html;
}

export function injectVisibleBridge(html: string): string {
  const withPatch = injectHeadPatch(html);
  if (/<\/body>/i.test(withPatch)) {
    return withPatch.replace(/<\/body>/i, `${VISIBLE_BODY}</body>`);
  }
  return withPatch + VISIBLE_BODY;
}

export interface RevealIndices {
  h: number;
  v: number;
  f: number;
}

export type VisibleMessage = {
  source: typeof BRIDGE.source.visible;
  type: typeof BRIDGE.type.nav;
  h: number;
  v: number;
  f: number;
};
