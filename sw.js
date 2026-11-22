// Service worker do Nan Cine: deixa o app abrir rápido e funcionar com a tela já visitada
// mesmo sem internet. Estratégia "rede primeiro": sempre tenta a versão nova do site e só usa
// a cópia guardada se a rede falhar. As notas e listas (pasta dados/) e as chamadas ao TMDB
// e ao Firebase nunca passam por aqui.

const VERSAO = 'nancine-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== VERSAO) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/dados/')) return;

  evento.respondWith((async () => {
    try {
      const resposta = await fetch(request);
      if (resposta.ok) (await caches.open(VERSAO)).put(request, resposta.clone());
      return resposta;
    } catch (erro) {
      const guardada = await caches.match(request, { ignoreSearch: true });
      if (guardada) return guardada;
      if (request.mode === 'navigate') {
        const inicio = await caches.match('./', { ignoreSearch: true }) || await caches.match('index.html', { ignoreSearch: true });
        if (inicio) return inicio;
      }
      throw erro;
    }
  })());
});
