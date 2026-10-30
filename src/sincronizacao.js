// Mesclagem entre os dados deste celular e o arquivo do outro celular (vindo do Drive).
// Regra: une por identificador; se o mesmo registro foi alterado nos dois lados, vence a alteração mais recente.

export const COLECOES_SYNC = ['categorias', 'produtos', 'listas', 'compras'];

/**
 * Mescla duas listas de registros com id. Retorna a lista resultante e os ids que estavam em conflito.
 */
export function mesclarColecao(local, remota) {
  const mapa = new Map();
  const conflitos = [];
  for (const reg of local) mapa.set(reg.id, reg);
  for (const reg of remota) {
    const atual = mapa.get(reg.id);
    if (!atual) {
      mapa.set(reg.id, reg);
      continue;
    }
    const atualTs = atual.atualizadoEm ?? '';
    const remotoTs = reg.atualizadoEm ?? '';
    if (atualTs !== remotoTs) conflitos.push(reg.id);
    if (remotoTs > atualTs) mapa.set(reg.id, reg);
  }
  return { registros: [...mapa.values()], conflitos };
}

/** Mescla os dados completos (todas as coleções). */
export function mesclarDados(local, remoto) {
  const resultado = {};
  const conflitos = {};
  for (const colecao of COLECOES_SYNC) {
    const r = mesclarColecao(local[colecao] ?? [], remoto[colecao] ?? []);
    resultado[colecao] = r.registros;
    conflitos[colecao] = r.conflitos;
  }
  return { dados: resultado, conflitos };
}

/** Verdadeiro se houve alteração local depois do último envio ao Drive. */
export function temPendencia(dados, ultimoEnvioIso) {
  if (!ultimoEnvioIso) return COLECOES_SYNC.some((c) => (dados[c] ?? []).length > 0);
  return COLECOES_SYNC.some((c) => (dados[c] ?? []).some((r) => (r.atualizadoEm ?? '') > ultimoEnvioIso));
}
