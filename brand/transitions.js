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
*/
(function () {
  function role(pathname) {
    if (/palette-preview\.html$/.test(pathname)) return 'preview';
    if (/collibra-theme-config\.html$/.test(pathname)) return 'config';
    if (/palette-(inputs|routing|graphs)\.html$/.test(pathname)) return 'sub';
    if (/dashboard-concepts\/index\.html$/.test(pathname)) return 'dashidx';
    if (/dashboard-concepts\/concept-[\w-]+\.html$/.test(pathname)) return 'concept';
    if (/landing_page\/(?:index\.html)?$/.test(pathname)) return 'landing';
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
    return null;
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
  });
})();
