const CACHE_NAME = "casadin-cache-v1";

const ARQUIVOS_PARA_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ARQUIVOS_PARA_CACHE);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomesDosCaches) => {
      return Promise.all(
        nomesDosCaches
          .filter((nomeDoCache) => nomeDoCache !== CACHE_NAME)
          .map((nomeDoCache) => caches.delete(nomeDoCache))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copiaDaResposta = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copiaDaResposta);
        });

        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((respostaEmCache) => {
          if (respostaEmCache) {
            return respostaEmCache;
          }

          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }

          return new Response("Conteúdo indisponível sem conexão.", {
            status: 503,
            statusText: "Offline",
            headers: {
              "Content-Type": "text/plain; charset=UTF-8"
            }
          });
        });
      })
  );
});