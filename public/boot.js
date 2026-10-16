// Runs before first paint on every page (index.html, capture.html,
// auth/dropbox.html): sets the dark class and registers the service worker.
// A file rather than an inline script, so the content security policy can
// forbid inline script.
;(function () {
  try {
    var t = localStorage.getItem('ink-theme')
    var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme:dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {}
  // The desktop app ships its assets with it; a service worker would only
  // serve stale copies after an update.
  if ('serviceWorker' in navigator && !('__TAURI_INTERNALS__' in window)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(function () {
          // A newly registered worker does not control the load that
          // registered it, so this page's hashed assets never pass through
          // the fetch handler and would be missing on an offline reload.
          // Re-request them once the worker is in control: those fetches
          // ARE intercepted, so the cache-first handler stores them.
          // Already-cached assets are served from the cache, so repeat
          // loads cost no network.
          function whenControlled() {
            if (navigator.serviceWorker.controller) return Promise.resolve()
            return new Promise(function (resolve) {
              navigator.serviceWorker.addEventListener('controllerchange', function () {
                resolve()
              })
            })
          }
          return whenControlled().then(function () {
            var urls = []
            document
              .querySelectorAll(
                'script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]',
              )
              .forEach(function (el) {
                var u = el.src || el.href
                if (u && u.indexOf(location.origin + '/') === 0) urls.push(u)
              })
            return Promise.all(
              urls.map(function (u) {
                return fetch(u).catch(function () {})
              }),
            )
          })
        })
        .catch(function () {})
    })
  }
})()
