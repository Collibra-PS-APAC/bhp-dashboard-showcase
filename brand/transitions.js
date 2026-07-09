/* Directional cross-document view transitions for the BHP preview pages.
   Tags each same-origin navigation with a direction "type" that transitions.css
   animates. Pure progressive enhancement: if the browser lacks the pageswap /
   pagereveal events the listeners simply never fire and navigation is normal.

   Routes:
     gateway          -> landing / palette-preview : slide-down
     landing / preview -> gateway                  : slide-up
     palette-preview  -> collibra-theme-config : slide-left
     collibra-config  -> palette-preview       : slide-right
     palette-preview  -> a component subpage   : slide-down
     a component subpage -> palette-preview     : slide-up
     palette-preview  -> dashboards index      : slide-down
     dashboards index -> palette-preview       : slide-up
     dashboards index -> a dashboard concept   : slide-down
     a dashboard concept -> dashboards index   : slide-up
     landing          -> data privacy          : pixelate (orange pixel wave)
*/
(function () {
  function role(pathname) {
    if (/palette-preview\.html$/.test(pathname)) return 'preview';
    if (/collibra-theme-config\.html$/.test(pathname)) return 'config';
    if (/palette-(inputs|routing|graphs)\.html$/.test(pathname)) return 'sub';
    if (/dashboard-concepts\/index\.html$/.test(pathname)) return 'dashidx';
    if (/dashboard-concepts\/concept-[\w-]+\.html$/.test(pathname)) return 'concept';
    if (/landing_page\/(?:index\.html)?$/.test(pathname)) return 'landing';
    if (/data_privacy\/(?:index\.html)?$/.test(pathname)) return 'privacy';
    // Gateway: the bundle-root index. Match the root itself or a root-level
    // index.html, but not the index.html inside any known subfolder.
    if (pathname === '/' ||
        (/(?:^|\/)index\.html$/.test(pathname) &&
         !/(?:landing_page|data_privacy|dlm|data_utilities|design-explorations)\//.test(pathname))) {
      return 'gateway';
    }
    return null;
  }

  function direction(fromPath, toPath) {
    var a = role(fromPath);
    var b = role(toPath);
    if (a === 'gateway' && (b === 'landing' || b === 'preview')) return 'slide-down';
    if ((a === 'landing' || a === 'preview') && b === 'gateway') return 'slide-up';
    if (a === 'preview' && b === 'config') return 'slide-left';
    if (a === 'config' && b === 'preview') return 'slide-right';
    if (a === 'preview' && b === 'sub') return 'slide-down';
    if (a === 'sub' && b === 'preview') return 'slide-up';
    if (a === 'preview' && b === 'dashidx') return 'slide-down';
    if (a === 'dashidx' && b === 'preview') return 'slide-up';
    if (a === 'dashidx' && b === 'concept') return 'slide-down';
    if (a === 'concept' && b === 'dashidx') return 'slide-up';
    if (a === 'landing' && b === 'privacy') return 'pixelate';
    return null;
  }

  /* Pixelated wave (landing -> data privacy) -------------------------------
     Port of Osmo Supply's "Pixelated Wave" page transition, adapted from its
     Barba.js + GSAP original to this file's cross-document view transitions.
     transitions.css reveals the incoming page with a stepped clip-path; the
     code below builds the pixel grid and flashes it along the reveal edge
     with the Web Animations API, so no library is needed. The overlay markup
     ([data-transition-wrap]) lives in the destination page. */

  var pixelHorizontalAmount = 12;
  var transitionDuration = 1;
  var pixelFadeDuration = 0.2;
  var pixelOverlap = 0.3;

  // Helper: size the pixel grid to the viewport (columns in landscape,
  // rows in portrait), cloning or pruning nodes to fit.
  function pixelGrid(isPortrait) {
    var panel = document.querySelector('[data-transition-panel]');
    if (!panel) return;

    var rect = panel.getBoundingClientRect();
    panel.style.flexDirection = isPortrait ? 'column' : 'row';

    var lineSizePx = (isPortrait ? rect.height : rect.width) / pixelHorizontalAmount;
    var crossAmount = Math.ceil((isPortrait ? rect.width : rect.height) / lineSizePx);

    var lines = panel.querySelectorAll('[data-transition-col]');
    var lineTemplate = lines[0];
    var pixelTemplate = lineTemplate.querySelector('[data-transition-pixel]');

    if (lines.length !== pixelHorizontalAmount) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < pixelHorizontalAmount; i++) {
        frag.appendChild(lineTemplate.cloneNode(false));
      }
      panel.replaceChildren(frag);
      lines = panel.querySelectorAll('[data-transition-col]');
    }

    lines.forEach(function (line) {
      line.style.flexDirection = isPortrait ? 'row' : 'column';
      line.style.flex = '1 1 auto';
      line.style.justifyContent = 'center';

      var diff = crossAmount - line.childElementCount;
      if (diff > 0) {
        var pxFrag = document.createDocumentFragment();
        for (var j = 0; j < diff; j++) {
          pxFrag.appendChild(pixelTemplate.cloneNode(true));
        }
        line.appendChild(pxFrag);
      } else if (diff < 0) {
        for (var k = diff; k < 0; k++) {
          line.lastElementChild.remove();
        }
      }
    });
  }

  // Flash each column's pixels in, then out, timed to the stepped clip-path
  // reveal in transitions.css (same maths as the original resource).
  function runPixelWave() {
    var wrap = document.querySelector('[data-transition-wrap]');
    if (!wrap) return;

    var isPortrait = window.innerHeight > window.innerWidth;
    pixelGrid(isPortrait);

    var panel = wrap.querySelector('[data-transition-panel]');
    var lines = panel.querySelectorAll('[data-transition-col]');
    var overlap = Math.max(0, Math.min(1, pixelOverlap));
    var clipStart = Math.min(pixelFadeDuration, transitionDuration * 0.5);
    var clipDuration = Math.max(0.001, transitionDuration - 2 * clipStart);
    var stepDur = clipDuration / Math.max(1, pixelHorizontalAmount);

    panel.style.opacity = '1';
    var animations = [];

    lines.forEach(function (line, i) {
      var pixels = line.querySelectorAll('[data-transition-pixel]');
      if (!pixels.length) return;

      var revealTime = clipStart + i * stepDur;
      var fillStart = Math.max(0, revealTime - pixelFadeDuration);
      var fadeStart = Math.min(transitionDuration, revealTime + stepDur);
      var perPixelMin = pixelFadeDuration / pixels.length;
      var perPixelDur = perPixelMin * (1 - overlap) + pixelFadeDuration * overlap;
      var spread = Math.max(0, pixelFadeDuration - perPixelDur);
      var dur = Math.max(1, perPixelDur * 1000);

      pixels.forEach(function (px) {
        animations.push(px.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: (fillStart + Math.random() * spread) * 1000,
          duration: dur, easing: 'linear', fill: 'forwards'
        }));
        animations.push(px.animate([{ opacity: 1 }, { opacity: 0 }], {
          delay: (fadeStart + Math.random() * spread) * 1000,
          duration: dur, easing: 'linear', fill: 'forwards'
        }));
      });
    });

    // Once the tail pixels have faded, drop the fills and hide the panel.
    setTimeout(function () {
      animations.forEach(function (a) { a.cancel(); });
      panel.style.opacity = '0';
    }, (transitionDuration + pixelFadeDuration) * 1000 + 100);
  }

  // Outgoing page: tag the transition before the old snapshot is taken.
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    var type = direction(location.pathname, new URL(e.activation.entry.url).pathname);
    if (type) e.viewTransition.types.add(type);
  });

  // Incoming page: the animation runs here, so this tag drives the CSS.
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var activation = window.navigation && navigation.activation;
    if (!activation || !activation.from) return;
    var type = direction(new URL(activation.from.url).pathname, location.pathname);
    if (type) e.viewTransition.types.add(type);
    if (type === 'pixelate' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runPixelWave();
    }
  });
})();
