// Gráficos em SVG (rosca e linha), gerados como texto. Funções puras, testáveis no computador.

export const PALETA = ['#a8d8ea', '#f7c5d4', '#3d7e99', '#f2a7bd', '#7fbfd6', '#d9a5b8', '#5c9eb5', '#ffd6e0'];

/** Cor da fatia pela posição; repete a paleta em ciclo. */
export function corDaFatia(indice) {
  return PALETA[indice % PALETA.length];
}

const escapar = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Ângulos de cada fatia (em graus, a partir do topo, sentido horário). Grupos: { rotulo, valor }. */
export function anguloFatias(grupos) {
  const total = grupos.reduce((s, g) => s + g.valor, 0);
  if (total <= 0) return [];
  let inicio = 0;
  return grupos.map((g) => {
    const fim = inicio + (g.valor / total) * 360;
    const fatia = { rotulo: g.rotulo, valor: g.valor, inicio, fim, percentual: (g.valor / total) * 100 };
    inicio = fim;
    return fatia;
  });
}

function ponto(cx, cy, raio, grau) {
  const rad = ((grau - 90) * Math.PI) / 180;
  return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)];
}

/** Rosca com um arco por categoria, rótulo com percentual e mensagem quando não há dados. */
export function roscaSvg(grupos) {
  const fatias = anguloFatias(grupos);
  if (fatias.length === 0) return '<p class="vazio">Sem dados neste período.</p>';

  const cx = 80, cy = 80, r = 70;
  const partes = fatias.map((f, i) => {
    const cor = corDaFatia(i);
    const rotuloPct = `${escapar(f.rotulo)}: ${Math.round(f.percentual)}%`;
    if (f.fim - f.inicio >= 359.999) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${cor}"><title>${rotuloPct}</title></circle>`;
    }
    const [x1, y1] = ponto(cx, cy, r, f.inicio);
    const [x2, y2] = ponto(cx, cy, r, f.fim);
    const grande = f.fim - f.inicio > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    return `<path d="${d}" fill="${cor}"><title>${rotuloPct}</title></path>`;
  });

  const legenda = fatias
    .map(
      (f, i) => `<div style="font-size:.85rem;display:flex;gap:6px;align-items:center;margin:2px 0">
        <span style="width:12px;height:12px;border-radius:3px;background:${corDaFatia(i)};display:inline-block"></span>
        <span>${escapar(f.rotulo)} · ${f.percentual.toFixed(1).replace('.', ',')}%</span></div>`,
    )
    .join('');

  return `<div class="linha" style="align-items:center">
    <svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label="Participação das categorias">${partes.join('')}</svg>
    <div style="flex:1 1 140px">${legenda}</div></div>`;
}

/** Linha com um ponto por valor. Pontos: { x: rótulo do eixo, y: valor }. */
export function linhaSvg(pontos, titulo = 'Evolução') {
  if (pontos.length === 0) return '<p class="vazio">Ainda não há compras suficientes para mostrar a evolução.</p>';

  const largura = 300, altura = 150, margem = 16;
  const max = Math.max(...pontos.map((p) => p.y), 0);
  const passo = pontos.length > 1 ? (largura - 2 * margem) / (pontos.length - 1) : 0;
  const coords = pontos.map((p, i) => ({
    x: pontos.length === 1 ? largura / 2 : margem + i * passo,
    y: max > 0 ? altura - 28 - (p.y / max) * (altura - 28 - margem) : altura - 28,
    rotulo: p.x,
    valor: p.y,
  }));

  const trajeto = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const marcas = coords
    .map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="#3d7e99"><title>${escapar(c.rotulo)}: ${c.valor}</title></circle>`)
    .join('');
  const rotulos = coords
    .map((c) => `<text x="${c.x.toFixed(1)}" y="${altura - 6}" font-size="9" text-anchor="middle" fill="#555">${escapar(c.rotulo)}</text>`)
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="${escapar(titulo)}">
    <polyline points="${trajeto}" fill="none" stroke="#3d7e99" stroke-width="2"/>${marcas}${rotulos}</svg>`;
}
