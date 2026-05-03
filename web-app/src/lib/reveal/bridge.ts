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

// srcdoc iframes can't replaceState/pushState with the parent's URL.
// Reveal's hash plugin throws SecurityError every nav. Swallow that
// case silently; re-throw anything else so real bugs aren't lost.
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
// killing animations. Force them back on.
const VISIBLE_PRELUDE = `
<style id="slidesync-transition-override">
.reveal .slides section .fragment,
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
${HISTORY_MONKEY_PATCH}
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

export function injectVisibleBridge(html: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${VISIBLE_BODY}</body>`);
  }
  return html + VISIBLE_BODY;
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
