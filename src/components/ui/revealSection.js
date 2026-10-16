/**
 * The reference library is a lazy chunk, so at click time its sections are not in
 * the document yet and a hash assignment would silently do nothing — leaving the
 * URL claiming a section the view never scrolled to. Poll frames until the target
 * exists, then hand the jump to the browser so `scroll-margin-top` still applies.
 *
 * If the section never arrives, nothing is written: a URL that names a section the
 * view is not showing is worse than a URL that names none.
 */
export function revealSection(hash, deadline = Date.now() + 4000) {
  const target = document.getElementById(hash);
  if (target) {
    // Re-running the same command leaves the hash unchanged, which fires no jump.
    if (window.location.hash === `#${hash}`) target.scrollIntoView();
    else window.location.hash = `#${hash}`;
    return;
  }
  if (Date.now() < deadline) requestAnimationFrame(() => revealSection(hash, deadline));
}
