// Correção controlada de compras já finalizadas.
// Nunca apaga o estado anterior: cada correção guarda, em "alteracoes", os campos alterados como estavam antes.

import { totalCompra, validarParaFinalizar } from './compra.js';

export const MOTIVO_MIN = 3;
const CAMPOS_EDITAVEIS = ['itens', 'estabelecimento', 'responsavel'];

/**
 * Aplica uma correção. `mudancas` traz só os campos a alterar (itens, estabelecimento, responsavel).
 * Retorna { ok, erros, compra } sem alterar o objeto original.
 */
export function aplicarCorrecao(compra, mudancas, { motivo, autor, agoraIso }) {
  const erros = [];
  const texto = String(motivo ?? '').trim();
  if (texto.length < MOTIVO_MIN) erros.push('Descreva o motivo da correção (pelo menos 3 caracteres).');
  if (compra.status !== 'finalizada') erros.push('Só é possível corrigir compras finalizadas.');

  const campos = Object.keys(mudancas ?? {}).filter((c) => CAMPOS_EDITAVEIS.includes(c));
  if (campos.length === 0) erros.push('Nenhuma alteração foi informada.');

  const novo = { ...compra };
  for (const c of campos) novo[c] = mudancas[c];

  if (campos.includes('itens')) {
    erros.push(...validarParaFinalizar({ itens: novo.itens }).erros);
  }
  if (erros.length) return { ok: false, erros, compra };

  const antes = {};
  for (const c of campos) antes[c] = compra[c];
  antes.total = compra.total ?? totalCompra(compra.itens);

  novo.total = totalCompra(novo.itens);
  novo.alteracoes = [...(compra.alteracoes ?? []), { em: agoraIso, autor, motivo: texto, campos, antes }];
  return { ok: true, erros: [], compra: novo };
}
