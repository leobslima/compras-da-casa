// Sincronização com o Google Drive: um arquivo por pessoa dentro da pasta "Compras da Casa".
// Cada celular grava só o próprio arquivo e lê o do outro. ATENÇÃO: este código não foi testado
// contra o Google Drive real, porque depende do ID do cliente OAuth ainda não configurado.

import { GOOGLE_CLIENT_ID, NOME_PASTA_DRIVE, ESCOPO_DRIVE } from './config.js';
import { mesclarDados } from './sincronizacao.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
let token = null;

export function driveConfigurado() {
  return GOOGLE_CLIENT_ID.trim() !== '';
}

function carregarGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Não foi possível carregar o login do Google.'));
    document.head.appendChild(s);
  });
}

/** Pede permissão de acesso aos arquivos criados pelo app (escopo drive.file). */
export async function conectar() {
  if (!driveConfigurado()) throw new Error('Configure o ID do cliente do Google antes de conectar.');
  await carregarGis();
  return new Promise((resolve, reject) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: ESCOPO_DRIVE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        token = resp.access_token;
        resolve(true);
      },
    });
    cliente.requestAccessToken();
  });
}

async function chamar(url, opcoes = {}) {
  if (!token) throw new Error('Conecte-se ao Google Drive primeiro.');
  const resp = await fetch(url, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) },
  });
  if (!resp.ok) throw new Error(`Erro no Google Drive (${resp.status}).`);
  return resp;
}

async function acharOuCriarPasta() {
  const q = encodeURIComponent(`name='${NOME_PASTA_DRIVE}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const lista = await (await chamar(`${API}/files?q=${q}&fields=files(id)`)).json();
  if (lista.files?.length) return lista.files[0].id;
  const criada = await (await chamar(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOME_PASTA_DRIVE, mimeType: 'application/vnd.google-apps.folder' }),
  })).json();
  return criada.id;
}

async function acharArquivo(pastaId, nome) {
  const q = encodeURIComponent(`name='${nome}' and '${pastaId}' in parents and trashed=false`);
  const lista = await (await chamar(`${API}/files?q=${q}&fields=files(id)`)).json();
  return lista.files?.[0]?.id ?? null;
}

async function lerArquivo(id) {
  return (await chamar(`${API}/files/${id}?alt=media`)).json();
}

async function gravarArquivo(pastaId, nome, conteudo) {
  const existente = await acharArquivo(pastaId, nome);
  const corpo = JSON.stringify(conteudo);
  if (existente) {
    await chamar(`${UPLOAD}/files/${existente}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
    });
    return existente;
  }
  const boundary = 'compras_da_casa_' + Date.now();
  const metadados = JSON.stringify({ name: nome, parents: [pastaId] });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadados}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${corpo}\r\n--${boundary}--`;
  const criado = await (await chamar(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  })).json();
  return criado.id;
}

/**
 * Sincroniza: lê o arquivo do outro celular, mescla com os dados locais e grava o próprio arquivo.
 * Devolve os dados mesclados (para o app aplicar) e os conflitos resolvidos.
 */
export async function sincronizar(dadosLocais, donoDesteCelular, nomeOutro) {
  const pasta = await acharOuCriarPasta();
  const idOutro = await acharArquivo(pasta, `compras-${nomeOutro}.json`);
  const remoto = idOutro ? (await lerArquivo(idOutro)).dados ?? {} : {};
  const { dados, conflitos } = mesclarDados(dadosLocais, remoto);
  await gravarArquivo(pasta, `compras-${donoDesteCelular}.json`, {
    formato: 'compras-da-casa-sync',
    versao: 1,
    geradoEm: new Date().toISOString(),
    dados,
  });
  return { dados, conflitos };
}
