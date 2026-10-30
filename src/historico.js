// Consultas sobre as compras finalizadas: filtros e histórico de preço por produto. Funções puras.

import { STATUS_ITEM, subtotalItem, variacaoPercentual } from './compra.js';

/** Data local (AAAA-MM-DD) de um instante ISO, no fuso do celular. */
export function diaLocal(iso) {
  const d = new Date(iso);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Lista apenas compras finalizadas, aplicando os filtros combináveis. Mais recentes primeiro. */
export function filtrarCompras(compras, filtros = {}) {
  const { dataInicial, dataFinal, estabelecimento, responsavel, produtoId } = filtros;
  return compras
    .filter((c) => c.status === 'finalizada')
    .filter((c) => {
      const dia = diaLocal(c.finalizadaEm);
      if (dataInicial && dia < dataInicial) return false;
      if (dataFinal && dia > dataFinal) return false;
      if (estabelecimento && (c.estabelecimento || '') !== estabelecimento) return false;
      if (responsavel && c.responsavel !== responsavel) return false;
      if (produtoId && !c.itens.some((i) => i.produtoId === produtoId && i.status === STATUS_ITEM.COMPRADO)) return false;
      return true;
    })
    .sort((a, b) => b.finalizadaEm.localeCompare(a.finalizadaEm));
}

/**
 * Todas as vezes em que um produto foi comprado, da mais antiga para a mais recente,
 * com a variação em relação à compra anterior (null na primeira, ou se o anterior for zero).
 */
export function historicoDoProduto(produtoId, compras) {
  const registros = [];
  for (const compra of compras) {
    if (compra.status !== 'finalizada') continue;
    for (const item of compra.itens) {
      if (item.produtoId !== produtoId || item.status !== STATUS_ITEM.COMPRADO) continue;
      registros.push({
        compraId: compra.id,
        data: compra.finalizadaEm,
        estabelecimento: compra.estabelecimento || '',
        responsavel: compra.responsavel,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal: subtotalItem(item),
      });
    }
  }
  registros.sort((a, b) => a.data.localeCompare(b.data));
  return registros.map((r, idx) => ({
    ...r,
    variacao: idx === 0 ? null : variacaoPercentual(registros[idx - 1].precoUnitario, r.precoUnitario),
  }));
}

/** Estabelecimentos distintos registrados nas compras finalizadas, em ordem alfabética. */
export function estabelecimentosUsados(compras) {
  const nomes = new Set(
    compras.filter((c) => c.status === 'finalizada' && c.estabelecimento).map((c) => c.estabelecimento),
  );
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
