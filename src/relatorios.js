// Cálculos dos relatórios de gastos e de preços. Funções puras, testáveis no computador.

import { STATUS_ITEM, subtotalItem, variacaoPercentual } from './compra.js';
import { diaLocal, historicoDoProduto } from './historico.js';

/** Soma de dias em uma data AAAA-MM-DD, sem depender do fuso do celular. */
function somarDias(dataIso, dias) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/**
 * Período anterior de mesmo tamanho. Ex.: 01/10 a 07/10 -> 24/09 a 30/09.
 * Retorna null se o período não estiver completo.
 */
export function periodoAnterior(dataInicial, dataFinal) {
  if (!dataInicial || !dataFinal || dataInicial > dataFinal) return null;
  const [a1, m1, d1] = dataInicial.split('-').map(Number);
  const [a2, m2, d2] = dataFinal.split('-').map(Number);
  const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000) + 1;
  return { dataInicial: somarDias(dataInicial, -dias), dataFinal: somarDias(dataInicial, -1) };
}

/** Atalhos de período: últimos N dias (incluindo hoje) ou mês atual, a partir de uma data de referência. */
export function periodoRapido(tipo, hojeIso) {
  if (tipo === 'mes') {
    const inicio = `${hojeIso.slice(0, 7)}-01`;
    return { dataInicial: inicio, dataFinal: hojeIso };
  }
  const dias = Number(tipo);
  return { dataInicial: somarDias(hojeIso, -(dias - 1)), dataFinal: hojeIso };
}

/**
 * Transforma compras finalizadas em linhas de item comprado, com os filtros combinados.
 * `produtos` serve para obter a categoria de cada item.
 */
export function itensFiltrados(compras, produtos, filtros = {}) {
  const { dataInicial, dataFinal, estabelecimento, responsavel, categoriaId, produtoId } = filtros;
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const linhas = [];
  for (const compra of compras) {
    if (compra.status !== 'finalizada') continue;
    const dia = diaLocal(compra.finalizadaEm);
    if (dataInicial && dia < dataInicial) continue;
    if (dataFinal && dia > dataFinal) continue;
    if (estabelecimento && (compra.estabelecimento || '') !== estabelecimento) continue;
    if (responsavel && compra.responsavel !== responsavel) continue;
    for (const item of compra.itens) {
      if (item.status !== STATUS_ITEM.COMPRADO) continue;
      const produto = porId.get(item.produtoId);
      if (produtoId && item.produtoId !== produtoId) continue;
      if (categoriaId && produto?.categoriaId !== categoriaId) continue;
      linhas.push({
        compraId: compra.id,
        dia,
        estabelecimento: compra.estabelecimento || 'Sem estabelecimento',
        produtoId: item.produtoId,
        nome: produto?.nome ?? item.nomeProduto,
        categoriaId: produto?.categoriaId ?? null,
        quantidade: item.quantidade,
        subtotal: subtotalItem(item),
      });
    }
  }
  return linhas;
}

/** Totais gerais: gasto, número de compras e média por compra. */
export function resumoGastos(linhas) {
  const total = Math.round(linhas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
  const compras = new Set(linhas.map((l) => l.compraId)).size;
  return {
    total,
    compras,
    mediaPorCompra: compras === 0 ? 0 : Math.round((total / compras) * 100) / 100,
  };
}

/** Agrupa linhas por uma chave, somando subtotais. Ordena do maior gasto para o menor. */
export function gastosPor(linhas, chave, rotulo) {
  const grupos = new Map();
  for (const l of linhas) {
    const k = chave(l);
    if (!grupos.has(k)) grupos.set(k, { chave: k, rotulo: rotulo(l), total: 0, quantidade: 0 });
    const g = grupos.get(k);
    g.total += l.subtotal;
    g.quantidade += l.quantidade ?? 0;
  }
  const total_geral = linhas.reduce((s, l) => s + l.subtotal, 0);
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      total: Math.round(g.total * 100) / 100,
      participacao: total_geral > 0 ? Math.round((g.total / total_geral) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Ordena grupos por 'valor' (padrão), 'quantidade' ou 'nome'. Não altera a lista original. */
export function ordenarGrupos(grupos, criterio = 'valor') {
  const copia = [...grupos];
  if (criterio === 'quantidade') return copia.sort((a, b) => b.quantidade - a.quantidade);
  if (criterio === 'nome') return copia.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  return copia.sort((a, b) => b.total - a.total);
}

/** Gastos somados por dia (AAAA-MM-DD), em ordem cronológica. Para o gráfico de evolução. */
export function gastosPorDia(linhas) {
  const dias = new Map();
  for (const l of linhas) dias.set(l.dia, (dias.get(l.dia) ?? 0) + l.subtotal);
  return [...dias.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, total]) => ({ dia, total: Math.round(total * 100) / 100 }));
}

/**
 * Maiores aumentos e reduções de preço: compara o último preço com o anterior de cada produto,
 * usando só as compras já filtradas. Produtos com menos de duas compras não entram.
 */
export function maioresVariacoes(compras) {
  const produtoIds = new Set();
  for (const c of compras) {
    if (c.status !== 'finalizada') continue;
    for (const i of c.itens) if (i.status === STATUS_ITEM.COMPRADO) produtoIds.add(i.produtoId);
  }
  const variacoes = [];
  for (const produtoId of produtoIds) {
    const hist = historicoDoProduto(produtoId, compras);
    if (hist.length < 2) continue;
    const anterior = hist[hist.length - 2];
    const atual = hist[hist.length - 1];
    const variacao = variacaoPercentual(anterior.precoUnitario, atual.precoUnitario);
    if (variacao === null) continue;
    variacoes.push({
      produtoId,
      precoAnterior: anterior.precoUnitario,
      precoAtual: atual.precoUnitario,
      diferenca: Math.round((atual.precoUnitario - anterior.precoUnitario) * 100) / 100,
      variacao,
      dataAtual: atual.data,
    });
  }
  const aumentos = variacoes.filter((v) => v.variacao > 0).sort((a, b) => b.variacao - a.variacao);
  const reducoes = variacoes.filter((v) => v.variacao < 0).sort((a, b) => a.variacao - b.variacao);
  return { aumentos, reducoes, estaveis: variacoes.filter((v) => v.variacao === 0).length };
}
