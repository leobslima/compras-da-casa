// Service worker: guarda a "casca" do app para abrir mesmo sem internet.
// Os dados das compras ficam no IndexedDB do celular, não aqui.
const VERSAO = 'compras-da-casa-v2';
const ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/app.js',
  './src/banco.js',
  './src/logica.js',
  './src/compra.js',
  './src/historico.js',
  './src/relatorios.js',
  './src/backup.js',
  './src/correcao.js',
  './src/produtos.js',
  './src/sincronizacao.js',
  './src/graficos.js',
  './src/config.js',
  './src/drive.js',
  './dados/produtos-iniciais.json',
  './icones/icon-192.png',
  './icones/icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))),
    ),
  );
  self.clients.claim();
});

// Primeiro tenta a rede (para pegar atualizações); se falhar, usa a cópia guardada.
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    fetch(evento.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(VERSAO).then((c) => c.put(evento.request, copia));
        return resp;
      })
      .catch(() => caches.match(evento.request)),
  );
});
