// Regras de negócio puras (sem acesso ao navegador), para poderem ser testadas no computador.

export const NOME_MAX = 80;

/** Remove espaços extras e padroniza o nome para comparação de duplicidade. */
export function normalizarNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Valida o cadastro de um produto. Retorna { ok, erros }. */
export function validarProduto(dados) {
  const erros = [];
  const nome = String(dados?.nome ?? '').replace(/\s+/g, ' ').trim();
  if (!nome) erros.push('Informe o nome do produto.');
  if (nome.length > NOME_MAX) erros.push(`O nome deve ter no máximo ${NOME_MAX} caracteres.`);
  if (!dados?.categoriaId) erros.push('Escolha uma categoria.');
  return { ok: erros.length === 0, erros, nome };
}

/**
 * Procura produtos com nome igual ou muito parecido (para alertar sobre duplicidade).
 * Considera igual quando, após normalização, os nomes são iguais ou um contém o outro.
 * Ignora o próprio produto ao editar (idIgnorado).
 */
export function encontrarSimilares(nomeNovo, produtos, idIgnorado = null) {
  const alvo = normalizarNome(nomeNovo);
  if (!alvo) return [];
  return produtos.filter((p) => {
    if (p.id === idIgnorado) return false;
    const existente = normalizarNome(p.nome);
    return existente === alvo || existente.includes(alvo) || alvo.includes(existente);
  });
}

/** Total de um item = quantidade de itens × preço unitário. Arredonda para centavos. */
export function totalItem(quantidade, precoUnitario) {
  return Math.round(quantidade * precoUnitario * 100) / 100;
}

/** Valida quantidade (inteiro ≥ 1) e preço unitário (número ≥ 0). */
export function validarItem({ quantidade, precoUnitario }) {
  const erros = [];
  if (!Number.isInteger(quantidade) || quantidade < 1) erros.push('A quantidade deve ser um número inteiro de pelo menos 1.');
  if (typeof precoUnitario !== 'number' || !Number.isFinite(precoUnitario) || precoUnitario < 0) {
    erros.push('O preço unitário deve ser um valor igual ou maior que zero.');
  }
  return { ok: erros.length === 0, erros };
}

/** Formata valor monetário no padrão R$ 0,00. */
export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor ?? 0);
}

/** Formata data ISO para DD/MM/AAAA. */
export function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Agrupa produtos ativos por categoria, na ordem das categorias. */
export function agruparPorCategoria(categorias, produtos) {
  return categorias
    .map((cat) => ({
      categoria: cat,
      produtos: produtos
        .filter((p) => p.categoriaId === cat.id && p.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }))
    .filter((grupo) => grupo.produtos.length > 0);
}
