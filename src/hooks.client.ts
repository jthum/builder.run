/**
 * A route module can become stale while the dev server hot-reloads, or when a
 * deployed client still holds the previous build's route manifest. Vite emits
 * this event only for failed dynamic imports, so recover with the fresh
 * document rather than leaving SvelteKit on an opaque navigation error.
 */
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  window.location.reload();
});
