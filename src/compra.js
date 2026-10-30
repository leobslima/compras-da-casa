// Regras da compra em andamento e do histórico de preços. Funções puras, testáveis no computador.

import { totalItem } from './logica.js';

export const STATUS_ITEM = {
  PENDENTE: 'pendente',
  COMPRADO: 'comprado',
  NAO_ENCONTRADO: 'nao_encontrado',
  NAO_COMPRADO: 'nao_comprado',
};

/** Converte texto digitado (aceita vírgula ou ponto) em número. Retorna null se vazio ou inválido. */
export function lerDecimal(texto) {
  const limpo = String(texto ?? '').trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Subtotal de um item: só entra no total se o item foi efetivamente comprado. */
export function subtotalItem(item) {
  if (item.status !== STATUS_ITEM.COMPRADO) return 0;
  return totalItem(item.quantidade, item.precoUnitario);
}

/** Total da compra = soma dos subtotais dos itens comprados. */
export function totalCompra(itens) {
  return Math.round(itens.reduce((soma, item) => soma + subtotalItem(item), 0) * 100) / 100;
}

/**
 * Último preço realmente pago por um produto, a partir das compras finalizadas.
 * Retorna null se o produto nunca foi comprado (nunca inventa um preço).
 */
export function ultimoPrecoPago(produtoId, compras) {
  let melhor = null;
  for (const compra of compras) {
    if (compra.status !== 'finalizada') continue;
    for (const item of compra.itens) {
      if (item.produtoId !== produtoId || item.status !== STATUS_ITEM.COMPRADO) continue;
      if (!melhor || compra.finalizadaEm > melhor.data) {
        melhor = {
          precoUnitario: item.precoUnitario,
          quantidade: item.quantidade,
          data: compra.finalizadaEm,
          estabelecimento: compra.estabelecimento || '',
        };
      }
    }
  }
  return melhor;
}

/**
 * Variação percentual = ((atual - anterior) / anterior) × 100.
 * Retorna null se o preço anterior for zero ou inexistente (evita um percentual enganoso).
 */
export function variacaoPercentual(anterior, atual) {
  if (typeof anterior !== 'number' || !(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 10000) / 100;
}

/** Verifica se a compra pode ser finalizada. Não permite finalizar com dados inválidos ou sem nada comprado. */
export function validarParaFinalizar(compra) {
  const erros = [];
  const comprados = compra.itens.filter((i) => i.status === STATUS_ITEM.COMPRADO);
  if (comprados.length === 0) erros.push('Marque pelo menos um item como comprado antes de finalizar.');
  for (const item of comprados) {
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
      erros.push(`Quantidade inválida em "${item.nomeProduto}".`);
    }
    if (typeof item.precoUnitario !== 'number' || !Number.isFinite(item.precoUnitario) || item.precoUnitario < 0) {
      erros.push(`Preço inválido em "${item.nomeProduto}".`);
    }
  }
  return { ok: erros.length === 0, erros };
}

/** Resumo mostrado antes da confirmação final. */
export function resumoCompra(compra) {
  const planejados = compra.itens.filter((i) => i.planejada != null).length;
  const comprados = compra.itens.filter((i) => i.status === STATUS_ITEM.COMPRADO).length;
  const naoComprados = compra.itens.filter(
    (i) => i.status === STATUS_ITEM.NAO_ENCONTRADO || i.status === STATUS_ITEM.NAO_COMPRADO,
  );
  return {
    planejados,
    comprados,
    naoComprados: naoComprados.map((i) => i.nomeProduto),
    total: totalCompra(compra.itens),
  };
}
