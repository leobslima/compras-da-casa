// Backup, validação, mesclagem e exportação CSV. Funções puras, testáveis no computador.

import { normalizarNome } from './logica.js';
import { diaLocal } from './historico.js';
import { NOME_EU } from './config.js';

export const FORMATO = 'compras-da-casa';
export const VERSAO_BACKUP = 1;
const COLECOES = ['categorias', 'produtos', 'listas', 'compras'];

/** Monta o arquivo de backup com todos os dados. */
export function montarBackup({ categorias, produtos, listas, compras }, agoraIso) {
  const dados = { categorias, produtos, listas, compras };
  const contagem = Object.fromEntries(COLECOES.map((c) => [c, dados[c].length]));
  return { formato: FORMATO, versao: VERSAO_BACKUP, geradoEm: agoraIso, contagem, dados };
}

/** Valida a estrutura do backup antes de qualquer importação. */
export function validarBackup(obj) {
  const erros = [];
  if (!obj || typeof obj !== 'object') return { ok: false, erros: ['O arquivo não é um backup válido.'] };
  if (obj.formato !== FORMATO) erros.push('O arquivo não é de backup do Compras da Casa.');
  if (obj.versao !== VERSAO_BACKUP) erros.push(`Versão de backup não suportada: ${obj.versao}.`);
  if (!obj.dados || typeof obj.dados !== 'object') erros.push('Falta a seção de dados.');
  if (erros.length) return { ok: false, erros };

  for (const colecao of COLECOES) {
    if (!Array.isArray(obj.dados[colecao])) {
      erros.push(`A seção "${colecao}" não é uma lista.`);
      continue;
    }
    const ids = new Set();
    for (const reg of obj.dados[colecao]) {
      if (!reg || typeof reg.id !== 'string' || !reg.id) {
        erros.push(`Há um registro sem identificador em "${colecao}".`);
        break;
      }
      if (ids.has(reg.id)) erros.push(`Identificador repetido em "${colecao}": ${reg.id}.`);
      ids.add(reg.id);
    }
  }
  if (erros.length) return { ok: false, erros };

  for (const p of obj.dados.produtos) {
    if (!p.nome || !p.categoriaId) erros.push(`Produto sem nome ou categoria: ${p.id}.`);
  }
  for (const c of obj.dados.compras) {
    if (!Array.isArray(c.itens)) {
      erros.push(`Compra sem lista de itens: ${c.id}.`);
      continue;
    }
    for (const i of c.itens) {
      if (i.status === 'comprado') {
        if (!Number.isInteger(i.quantidade) || i.quantidade < 1) erros.push(`Quantidade inválida na compra ${c.id}.`);
        if (typeof i.precoUnitario !== 'number' || i.precoUnitario < 0) erros.push(`Preço inválido na compra ${c.id}.`);
      }
    }
  }
  return { ok: erros.length === 0, erros, contagem: Object.fromEntries(COLECOES.map((c) => [c, obj.dados[c].length])) };
}

/**
 * Planeja a mesclagem: adiciona só o que ainda não existe. Nunca altera nem apaga dados atuais.
 * Produtos com nome igual a um existente (com ids diferentes) são sinalizados, não importados.
 */
export function planejarMescla(atual, backup) {
  const planos = { categorias: [], produtos: [], listas: [], compras: [] };
  const suspeitos = [];

  const idsAtuais = Object.fromEntries(COLECOES.map((c) => [c, new Set(atual[c].map((r) => r.id))]));
  const nomesProdutos = new Set(atual.produtos.map((p) => normalizarNome(p.nome)));
  const nomesCategorias = new Set(atual.categorias.map((c) => normalizarNome(c.nome)));

  for (const cat of backup.dados.categorias) {
    if (idsAtuais.categorias.has(cat.id)) continue;
    if (nomesCategorias.has(normalizarNome(cat.nome))) {
      suspeitos.push(`Categoria "${cat.nome}" já existe com outro identificador.`);
      continue;
    }
    planos.categorias.push(cat);
  }
  for (const p of backup.dados.produtos) {
    if (idsAtuais.produtos.has(p.id)) continue;
    if (nomesProdutos.has(normalizarNome(p.nome))) {
      suspeitos.push(`Produto "${p.nome}" já existe com outro identificador.`);
      continue;
    }
    planos.produtos.push(p);
  }
  for (const l of backup.dados.listas) if (!idsAtuais.listas.has(l.id)) planos.listas.push(l);
  for (const c of backup.dados.compras) if (!idsAtuais.compras.has(c.id)) planos.compras.push(c);

  return { planos, suspeitos };
}

/** Relatório de compras em CSV (separador ';' e vírgula decimal, como o Excel no Brasil). */
export function csvItens(compras, produtos) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const numero = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '');
  const linhas = [['Data', 'Estabelecimento', 'Responsável', 'Produto', 'Quantidade', 'Preço unitário', 'Subtotal']];
  for (const c of compras) {
    if (c.status !== 'finalizada') continue;
    for (const i of c.itens) {
      if (i.status !== 'comprado') continue;
      linhas.push([
        diaLocal(c.finalizadaEm).split('-').reverse().join('/'),
        c.estabelecimento || '',
        c.responsavel === 'viviane' ? 'Viviane' : NOME_EU,
        porId.get(i.produtoId)?.nome ?? i.nomeProduto,
        String(i.quantidade),
        numero(i.precoUnitario),
        numero(Math.round(i.quantidade * i.precoUnitario * 100) / 100),
      ]);
    }
  }
  const escapaCampo = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + linhas.map((l) => l.map(escapaCampo).join(';')).join('\r\n');
}
