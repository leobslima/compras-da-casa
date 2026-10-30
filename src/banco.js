// Banco local (IndexedDB). Os dados ficam no próprio celular e continuam salvos após fechar o navegador.
// Este arquivo só roda no navegador.

const NOME_BANCO = 'compras-da-casa';
const VERSAO = 2;

function abrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_BANCO, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('categorias')) {
        db.createObjectStore('categorias', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('produtos')) {
        const s = db.createObjectStore('produtos', { keyPath: 'id' });
        s.createIndex('categoriaId', 'categoriaId');
      }
      if (!db.objectStoreNames.contains('listas')) {
        db.createObjectStore('listas', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('compras')) {
        db.createObjectStore('compras', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let conexao = null;
async function db() {
  if (!conexao) conexao = await abrir();
  return conexao;
}

function transacao(lojas, modo, fn) {
  return db().then(
    (conn) =>
      new Promise((resolve, reject) => {
        const tx = conn.transaction(lojas, modo);
        const resultado = fn(tx);
        tx.oncomplete = () => resolve(resultado?.valor);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function pedido(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const categorias = {
  listar: async () => {
    const conn = await db();
    return pedido(conn.transaction('categorias').objectStore('categorias').getAll());
  },
  salvar: (cat) => transacao(['categorias'], 'readwrite', (tx) => {
    tx.objectStore('categorias').put(cat);
  }),
};

export const produtos = {
  listar: async () => {
    const conn = await db();
    return pedido(conn.transaction('produtos').objectStore('produtos').getAll());
  },
  salvar: (prod) => transacao(['produtos'], 'readwrite', (tx) => {
    tx.objectStore('produtos').put(prod);
  }),
};

export const listas = {
  listar: async () => {
    const conn = await db();
    return pedido(conn.transaction('listas').objectStore('listas').getAll());
  },
  salvar: (lista) => transacao(['listas'], 'readwrite', (tx) => {
    tx.objectStore('listas').put(lista);
  }),
};

export const compras = {
  listar: async () => {
    const conn = await db();
    return pedido(conn.transaction('compras').objectStore('compras').getAll());
  },
  salvar: (compra) => transacao(['compras'], 'readwrite', (tx) => {
    tx.objectStore('compras').put(compra);
  }),
};

/**
 * Grava vários registros em uma única transação (tudo ou nada).
 * Com substituir = true, apaga antes todos os dados locais: só deve ser chamado após confirmação explícita.
 */
export async function gravarLotes(lotes, { substituir = false } = {}) {
  const conn = await db();
  const lojas = ['categorias', 'produtos', 'listas', 'compras'];
  await new Promise((resolve, reject) => {
    const tx = conn.transaction(lojas, 'readwrite');
    for (const loja of lojas) {
      const store = tx.objectStore(loja);
      if (substituir) store.clear();
      for (const reg of lotes[loja] ?? []) store.put(reg);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Cria um identificador único (sem depender de servidor). */
export function novoId(prefixo) {
  return `${prefixo}_${crypto.randomUUID()}`;
}
