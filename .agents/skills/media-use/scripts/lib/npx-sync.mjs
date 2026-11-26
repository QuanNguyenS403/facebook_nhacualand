   navigationType: state.action,
      navigator: history,
      useTransitions
    }
  );
}
HistoryRouter.displayName = "unstable_HistoryRouter";
var Link = React.forwardRef(
  function LinkWithRef({
    onClick,
    discover = "render",
    prefetch = "none",
    relative,
    reloadDocument,
    replace,
    mask,
    state,
    target,
    to,
    preventScrollReset,
    viewTransition,
    defaultShouldRevalidate,
    ...rest
  }, forwardedRef) {
    let { basename, navigator, useTransitions } = React.useContext(_chunkHHGH3NKSjs.NavigationContext);
    let isAbsolute = typeof to === "string" && _chunkHHGH3NKSjs.ABSOLUTE_URL_REGEX.test(to);
    let parsed = _chunkHHGH3NKSjs.parseToInfo.call(void 0, to, basename);
    to = parsed.to;
    let href = _chunkHHGH3NKSjs.useHref.call(void 0, to, { relative });
    let location = _chunkHHGH3NKSjs.useLocation.call(void 0, );
    let maskedHref = null;
    if (mask) {
      let resolved = _chunkHHGH3NKSjs.resolveTo.call(void 0, 
        mask,
        [],
        location.mask ? location.mask.pathname : "/",
        true
      );
      if (basename !== "/") {
        resolved.pathname = resolved.pathname === "/" ? basename : _chunkHHGH3NKSjs.joinPaths.call(void 0, [basename, resolved.pathname]);
      }
      maskedHref = navigator.createHref(resolved);
    }
  