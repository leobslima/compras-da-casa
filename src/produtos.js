// Edição de produtos e categorias. O id nunca muda, então o histórico de compras continua ligado ao produto.

import { validarProduto, encontrarSimilares, normalizarNome } from './logica.js';

/** Valida a edição de um produto e alerta sobre nome parecido com outro produto. */
export function validarEdicaoProduto(produtos, idEditado, { nome, categoriaId }) {
  const base = validarProduto({ nome, categoriaId });
  if (!base.ok) return { ok: false, erros: base.erros, similares: [] };
  const similares = encontrarSimilares(base.nome, produtos, idEditado);
  return { ok: true, erros: [], nome: base.nome, similares };
}

/** Valida o nome de uma categoria, sem repetir outra categoria. */
export function validarCategoria(categorias, { nome }, idIgnorado = null) {
  const limpo = String(nome ?? '').replace(/\s+/g, ' ').trim();
  if (!limpo) return { ok: false, erros: ['Informe o nome da categoria.'] };
  if (limpo.length > 60) return { ok: false, erros: ['O nome da categoria deve ter no máximo 60 caracteres.'] };
  const repetida = categorias.some((c) => c.id !== idIgnorado && normalizarNome(c.nome) === normalizarNome(limpo));
  if (repetida) return { ok: false, erros: ['Já existe uma categoria com esse nome.'] };
  return { ok: true, erros: [], nome: limpo };
}
