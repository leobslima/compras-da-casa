import * as banco from './banco.js';
import { novoId } from './banco.js';
// Dados iniciais embutidos no código: o app não depende de arquivos externos nem de servidor.
import seed from '../dados/produtos-iniciais.json';
import { validarEdicaoProduto, validarCategoria } from './produtos.js';
import { driveConfigurado, conectar as conectarDrive, sincronizar } from './drive.js';
import { NOME_EU, VERSAO_APP } from './config.js';
import {
  validarProduto,
  encontrarSimilares,
  agruparPorCategoria,
  formatarData,
  formatarMoeda,
} from './logica.js';
import { aplicarCorrecao } from './correcao.js';
import { roscaSvg, linhaSvg, corDaFatia } from './graficos.js';
import {
  montarBackup,
  validarBackup,
  planejarMescla,
  csvItens,
} from './backup.js';
import {
  periodoAnterior,
  periodoRapido,
  itensFiltrados,
  resumoGastos,
  gastosPor,
  maioresVariacoes,
  ordenarGrupos,
} from './relatorios.js';
import {
  filtrarCompras,
  historicoDoProduto,
  estabelecimentosUsados,
  diaLocal,
} from './historico.js';
import {
  STATUS_ITEM,
  lerDecimal,
  subtotalItem,
  totalCompra,
  ultimoPrecoPago,
  validarParaFinalizar,
  resumoCompra,
  variacaoPercentual,
} from './compra.js';

const tela = document.getElementById('tela');
const status = document.getElementById('status');
const botoes = document.querySelectorAll('.navegacao button');

const estado = {
  categorias: [],
  produtos: [],
  listas: [],
  compras: [],
  compraAtual: null,
  revisando: false,
  filtrosHist: { dataInicial: '', dataFinal: '', estabelecimento: '', responsavel: '', produtoId: '' },
  compraAbertaId: null,
  filtrosRel: { dataInicial: '', dataFinal: '', estabelecimento: '', responsavel: '', categoriaId: '' },
  importacao: null, // { backup, validacao, planos, suspeitos } enquanto o usuário decide
  editandoProdutoId: null,
  ordenacaoRel: 'valor', // 'valor' | 'quantidade' | 'nome'
  corrigindoId: null, // compra finalizada aberta para correção
  rascunhoCorrecao: null, // cópia editável dos dados da correção em curso
  telaAtual: 'inicio',
  buscaProdutos: '',
  buscaPreparar: '',
  // Seleção em andamento da tela Preparar lista (produtoId -> quantidade planejada)
  selecao: new Map(),
};

function mostrarStatus(texto, erro = false) {
  status.textContent = texto;
  status.classList.toggle('erro', erro);
}

/** Pessoa dona deste celular ("eu" ou "viviane"): define o arquivo gravado no Drive. */
const donoDesteCelular = () => localStorage.getItem('dono') || 'eu';

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

async function carregarDados() {
  estado.categorias = await banco.categorias.listar();
  estado.produtos = await banco.produtos.listar();
  estado.listas = await banco.listas.listar();
  estado.compras = await banco.compras.listar();
}

/** Na primeira abertura, carrega as categorias e os 55 produtos iniciais. Não duplica se já existirem. */
async function garantirCadastroInicial() {
  if (estado.produtos.length > 0 || estado.categorias.length > 0) return;
  const idPorNome = new Map();
  for (const nome of seed.categorias) {
    const cat = { id: novoId('cat'), nome };
    idPorNome.set(nome, cat.id);
    await banco.categorias.salvar(cat);
  }
  for (const p of seed.produtos) {
    await banco.produtos.salvar({
      id: novoId('prod'),
      nome: p.nome,
      categoriaId: idPorNome.get(p.categoria),
      ativo: true,
      criadoEm: new Date().toISOString(),
    });
  }
  await carregarDados();
}

// ---------- Tela: Início ----------
function telaInicio() {
  const hoje = hojeIso();
  const mes = periodoRapido('mes', hoje);
  const mesAnterior = periodoAnterior(mes.dataInicial, mes.dataFinal);
  const linhasMes = itensFiltrados(estado.compras, estado.produtos, mes);
  const resumo = resumoGastos(linhasMes);
  const resumoAnt = resumoGastos(itensFiltrados(estado.compras, estado.produtos, mesAnterior));
  const variacaoTotal = variacaoPercentual(resumoAnt.total, resumo.total);
  const variacoes = maioresVariacoes(estado.compras);
  const porCategoria = gastosPor(linhasMes, (l) => l.categoriaId ?? 'sem', (l) => {
    const cat = estado.categorias.find((c) => c.id === l.categoriaId);
    return cat?.nome ?? 'Sem categoria';
  });
  const emAndamento = estado.compras.find((c) => c.status === 'em_andamento');

  const cartaoIndicador = (rotulo, valor) => `
    <div class="cartao" style="flex:1 1 140px;margin-bottom:0">
      <div style="font-size:.8rem;color:#555">${rotulo}</div>
      <div style="font-size:1.15rem;font-weight:600">${valor}</div>
    </div>`;

  tela.innerHTML = `
    ${emAndamento
      ? `<div class="aviso">Você tem uma compra em andamento. <button id="ir-compra" class="secundario" style="margin-left:6px">Continuar</button></div>`
      : ''}

    <h2>Este mês</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${cartaoIndicador('Total gasto', formatarMoeda(resumo.total))}
      ${cartaoIndicador('Compras', String(resumo.compras))}
      ${cartaoIndicador('Média por compra', formatarMoeda(resumo.mediaPorCompra))}
      ${cartaoIndicador(
        'Em relação ao mês anterior',
        variacaoTotal === null ? 'Sem base' : `${variacaoTotal > 0 ? '+' : ''}${variacaoTotal.toFixed(2).replace('.', ',')}%`,
      )}
      ${cartaoIndicador('Produtos mais caros', String(variacoes.aumentos.length))}
      ${cartaoIndicador('Produtos mais baratos', String(variacoes.reducoes.length))}
    </div>

    <div class="cartao" style="margin-top:12px">
      <h2 style="margin-top:0">Gastos por categoria no mês</h2>
      ${
        porCategoria.length === 0
          ? '<p class="vazio">Nenhuma compra finalizada neste mês ainda.</p>'
          : `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
              <div style="width:180px;max-width:50%">${roscaSvg(porCategoria.map((g) => ({ rotulo: g.rotulo, valor: g.total })))}</div>
              <ul style="list-style:none;padding:0;margin:0;flex:1 1 140px;font-size:.9rem">
                ${porCategoria
                  .map(
                    (g, i) => `<li style="margin:4px 0"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${corDaFatia(i)};margin-right:6px"></span>${escapar(g.rotulo)}: <strong>${formatarMoeda(g.total)}</strong> (${g.participacao.toFixed(1).replace('.', ',')}%)</li>`,
                  )
                  .join('')}
              </ul>
            </div>`
      }
    </div>

    <div class="cartao">
      <p>Para começar uma ida ao mercado, toque em <strong>Preparar</strong>.</p>
    </div>
  `;

  document.getElementById('ir-compra')?.addEventListener('click', () => irPara('compra'));
}

// ---------- Tela: Produtos e categorias ----------
function telaProdutos() {
  const termo = estado.buscaProdutos.trim().toLowerCase();
  const filtrados = estado.produtos.filter((p) => !termo || p.nome.toLowerCase().includes(termo));
  const grupos = estado.categorias
    .map((cat) => ({
      cat,
      itens: filtrados
        .filter((p) => p.categoriaId === cat.id)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }))
    .filter((g) => g.itens.length > 0);

  tela.innerHTML = `
    <div class="cartao">
      <label for="busca-produtos">Pesquisar produto</label>
      <input id="busca-produtos" type="search" placeholder="Digite o nome" value="${escapar(estado.buscaProdutos)}">
    </div>

    <div class="cartao">
      <h2>Adicionar produto</h2>
      <form id="form-produto">
        <label for="novo-nome">Nome</label>
        <input id="novo-nome" required maxlength="80" placeholder="Ex.: Café 500 g">
        <label for="nova-cat">Categoria</label>
        <select id="nova-cat">
          ${estado.categorias.map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`).join('')}
        </select>
        <div id="aviso-duplicado"></div>
        <div class="linha" style="margin-top:12px">
          <button type="submit" class="destaque">Adicionar produto</button>
        </div>
      </form>
    </div>

    <div class="cartao">
      <h2>Nova categoria</h2>
      <form id="form-categoria">
        <label for="nova-categoria">Nome da categoria</label>
        <input id="nova-categoria" required maxlength="60">
        <div class="linha" style="margin-top:12px">
          <button type="submit" class="secundario">Criar categoria</button>
        </div>
      </form>
    </div>

    ${grupos.length === 0 ? '<p class="vazio">Nenhum produto encontrado.</p>' : ''}
    ${grupos
      .map(
        (g) => `
      <div class="cartao">
        <div class="linha" style="justify-content:space-between"><h2 style="margin:0">${escapar(g.cat.nome)}</h2><button class="secundario" data-acao="renomear-cat" data-cat="${g.cat.id}">Renomear</button></div>
        ${g.itens
          .map(
            (p) => `
          <div class="item-produto">
            <span class="nome" style="${p.ativo ? '' : 'color:#999;text-decoration:line-through'}">${escapar(p.nome)}</span>
            <span style="display:flex;gap:6px"><button class="secundario" data-acao="editar" data-id="${p.id}">Editar</button><button class="secundario" data-acao="alternar" data-id="${p.id}">${p.ativo ? 'Desativar' : 'Reativar'}</button></span>
          </div>`,
          )
          .join('')}
      </div>`,
      )
      .join('')}
  `;

  document.getElementById('busca-produtos').addEventListener('input', (e) => {
    estado.buscaProdutos = e.target.value;
    telaProdutos();
    document.getElementById('busca-produtos').focus();
  });

  const campoNome = document.getElementById('novo-nome');
  const avisoDiv = document.getElementById('aviso-duplicado');
  let confirmouDuplicidade = false;
  campoNome.addEventListener('input', () => {
    confirmouDuplicidade = false;
    const similares = encontrarSimilares(campoNome.value, estado.produtos);
    avisoDiv.innerHTML = similares.length
      ? `<div class="aviso">Já existe um produto parecido: ${similares
          .map((s) => escapar(s.nome))
          .join(', ')}. Se for outro produto, toque em Adicionar de novo para confirmar.</div>`
      : '';
  });

  document.getElementById('form-produto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = campoNome.value;
    const categoriaId = document.getElementById('nova-cat').value;
    const { ok, erros, nome: nomeLimpo } = validarProduto({ nome, categoriaId });
    if (!ok) return mostrarStatus(erros[0], true);

    const similares = encontrarSimilares(nomeLimpo, estado.produtos);
    if (similares.length && !confirmouDuplicidade) {
      confirmouDuplicidade = true;
      return mostrarStatus('Confirme: há produtos parecidos. Toque em Adicionar de novo para salvar mesmo assim.', true);
    }

    try {
      await banco.produtos.salvar({
        id: novoId('prod'),
        nome: nomeLimpo,
        categoriaId,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      await carregarDados();
      mostrarStatus('Produto salvo neste celular');
      telaProdutos();
    } catch (err) {
      mostrarStatus('Erro ao salvar o produto. Tente novamente.', true);
      console.error(err);
    }
  });

  document.getElementById('form-categoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('nova-categoria').value.replace(/\s+/g, ' ').trim();
    if (!nome) return mostrarStatus('Informe o nome da categoria.', true);
    if (estado.categorias.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      return mostrarStatus('Já existe uma categoria com esse nome.', true);
    }
    await banco.categorias.salvar({ id: novoId('cat'), nome });
    await carregarDados();
    mostrarStatus('Categoria criada');
    telaProdutos();
  });

  tela.querySelectorAll('[data-acao="editar"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      estado.editandoProdutoId = botao.dataset.id;
      telaProdutos();
      document.getElementById('editar-produto')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  tela.querySelectorAll('[data-acao="renomear-cat"]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const cat = estado.categorias.find((c) => c.id === botao.dataset.cat);
      const novo = prompt('Novo nome da categoria:', cat?.nome ?? '');
      if (novo === null) return;
      const v = validarCategoria(estado.categorias, { nome: novo }, cat.id);
      if (!v.ok) return mostrarStatus(v.erros[0], true);
      // Mudar o nome não altera os produtos nem o histórico: eles usam o id da categoria.
      await banco.categorias.salvar({ ...cat, nome: v.nome, atualizadoEm: new Date().toISOString() });
      await carregarDados();
      mostrarStatus('Categoria renomeada');
      telaProdutos();
    });
  });

  if (estado.editandoProdutoId) {
    const p = estado.produtos.find((x) => x.id === estado.editandoProdutoId);
    if (p) {
      tela.insertAdjacentHTML('afterbegin', `
        <div class="cartao" id="editar-produto">
          <h2>Editar produto</h2>
          <p style="font-size:.85rem;color:#555">O histórico de compras deste produto é preservado.</p>
          <label for="ed-nome">Nome</label>
          <input id="ed-nome" maxlength="80" value="${escapar(p.nome)}">
          <label for="ed-cat">Categoria</label>
          <select id="ed-cat">
            ${estado.categorias.map((c) => `<option value="${c.id}" ${c.id === p.categoriaId ? 'selected' : ''}>${escapar(c.nome)}</option>`).join('')}
          </select>
          <div id="ed-aviso"></div>
          <div class="linha" style="margin-top:12px">
            <button id="ed-salvar" class="destaque">Salvar</button>
            <button id="ed-cancelar" class="secundario">Cancelar</button>
          </div>
        </div>`);
      document.getElementById('ed-cancelar').addEventListener('click', () => {
        estado.editandoProdutoId = null;
        telaProdutos();
      });
      document.getElementById('ed-salvar').addEventListener('click', async () => {
        const nome = document.getElementById('ed-nome').value;
        const categoriaId = document.getElementById('ed-cat').value;
        const v = validarEdicaoProduto(estado.produtos, p.id, { nome, categoriaId });
        if (!v.ok) return mostrarStatus(v.erros[0], true);
        if (v.similares.length && !confirm(`Já existe um produto parecido (${v.similares.map((s) => s.nome).join(', ')}). Salvar mesmo assim?`)) return;
        await banco.produtos.salvar({ ...p, nome: v.nome, categoriaId, atualizadoEm: new Date().toISOString() });
        await carregarDados();
        estado.editandoProdutoId = null;
        mostrarStatus('Produto atualizado');
        telaProdutos();
      });
    }
  }

  tela.querySelectorAll('[data-acao="alternar"]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const produto = estado.produtos.find((p) => p.id === botao.dataset.id);
      if (!produto) return;
      // Desativar não apaga o produto nem o histórico: ele só some da seleção padrão.
      await banco.produtos.salvar({ ...produto, ativo: !produto.ativo });
      await carregarDados();
      telaProdutos();
    });
  });
}

// ---------- Tela: Preparar lista ----------
function telaPreparar() {
  const termo = estado.buscaPreparar.trim().toLowerCase();
  const grupos = agruparPorCategoria(estado.categorias, estado.produtos).map((g) => ({
    ...g,
    produtos: g.produtos.filter((p) => !termo || p.nome.toLowerCase().includes(termo)),
  })).filter((g) => g.produtos.length > 0);

  tela.innerHTML = `
    <div class="cartao">
      <label for="busca-preparar">Pesquisar</label>
      <input id="busca-preparar" type="search" placeholder="Nome do produto" value="${escapar(estado.buscaPreparar)}">
      <p style="font-size:0.9rem;color:#555">Selecionados: <strong>${estado.selecao.size}</strong></p>
    </div>

    ${grupos.length === 0 ? '<p class="vazio">Nenhum produto ativo encontrado.</p>' : ''}
    ${grupos
      .map(
        (g) => `
      <div class="cartao">
        <div class="linha" style="justify-content:space-between">
          <h2 style="margin:0">${escapar(g.categoria.nome)}</h2>
          <button class="secundario" data-acao="cat-todos" data-cat="${g.categoria.id}">Marcar todos</button>
        </div>
        ${g.produtos
          .map((p) => {
            const marcado = estado.selecao.has(p.id);
            const qtd = marcado ? estado.selecao.get(p.id) : 1;
            return `
          <div class="item-produto">
            <input type="checkbox" data-acao="marcar" data-id="${p.id}" ${marcado ? 'checked' : ''} aria-label="Selecionar ${escapar(p.nome)}">
            <span class="nome">${escapar(p.nome)}</span>
            <input type="number" min="1" step="1" inputmode="numeric" data-acao="qtd" data-id="${p.id}" value="${qtd}" aria-label="Quantidade de ${escapar(p.nome)}" ${marcado ? '' : 'disabled'}>
          </div>`;
          })
          .join('')}
      </div>`,
      )
      .join('')}

    <div class="cartao">
      <button id="gerar-lista" class="destaque" style="width:100%" ${estado.selecao.size === 0 ? 'disabled' : ''}>Gerar lista de compras</button>
    </div>
  `;

  document.getElementById('busca-preparar').addEventListener('input', (e) => {
    estado.buscaPreparar = e.target.value;
    telaPreparar();
    document.getElementById('busca-preparar').focus();
  });

  tela.querySelectorAll('[data-acao="marcar"]').forEach((c) => {
    c.addEventListener('change', () => {
      if (c.checked) estado.selecao.set(c.dataset.id, 1);
      else estado.selecao.delete(c.dataset.id);
      telaPreparar();
    });
  });

  tela.querySelectorAll('[data-acao="qtd"]').forEach((campo) => {
    campo.addEventListener('change', () => {
      const valor = Number(campo.value);
      if (!Number.isInteger(valor) || valor < 1) {
        mostrarStatus('A quantidade deve ser um número inteiro de pelo menos 1.', true);
        campo.value = estado.selecao.get(campo.dataset.id) ?? 1;
        return;
      }
      estado.selecao.set(campo.dataset.id, valor);
    });
  });

  tela.querySelectorAll('[data-acao="cat-todos"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const grupo = grupos.find((g) => g.categoria.id === botao.dataset.cat);
      if (!grupo) return;
      const todosMarcados = grupo.produtos.every((p) => estado.selecao.has(p.id));
      for (const p of grupo.produtos) {
        if (todosMarcados) estado.selecao.delete(p.id);
        else if (!estado.selecao.has(p.id)) estado.selecao.set(p.id, 1);
      }
      telaPreparar();
    });
  });

  document.getElementById('gerar-lista')?.addEventListener('click', async () => {
    const itens = [...estado.selecao.entries()].map(([produtoId, quantidadePlanejada]) => ({
      produtoId,
      quantidadePlanejada,
    }));
    const lista = {
      id: novoId('lista'),
      criadaEm: new Date().toISOString(),
      status: 'planejada',
      itens,
    };
    await banco.listas.salvar(lista);
    await carregarDados();
    estado.selecao = new Map();
    mostrarStatus(`Lista criada com ${itens.length} produto(s) em ${formatarData(lista.criadaEm)}`);
    telaPreparar();
  });
}

// ---------- Tela: Compra em andamento ----------
const ROTULO_STATUS = {
  [STATUS_ITEM.PENDENTE]: 'Pendente',
  [STATUS_ITEM.COMPRADO]: 'Comprado',
  [STATUS_ITEM.NAO_ENCONTRADO]: 'Não encontrado',
  [STATUS_ITEM.NAO_COMPRADO]: 'Não comprado',
};
let finalizando = false;

function nomeResponsavel(valor) {
  return valor === 'viviane' ? 'Viviane' : NOME_EU;
}

async function salvarCompraAtual() {
  try {
    await banco.compras.salvar(estado.compraAtual);
    mostrarStatus('Salvo neste celular');
    return true;
  } catch (err) {
    mostrarStatus('Erro ao salvar a compra. Verifique o armazenamento do navegador.', true);
    console.error(err);
    return false;
  }
}

function telaCompra() {
  estado.compraAtual = estado.compras.find((c) => c.status === 'em_andamento') ?? null;
  if (!estado.compraAtual) return telaIniciarCompra();
  if (estado.revisando) return telaRevisarCompra();
  return telaEmAndamento();
}

function telaIniciarCompra() {
  const responsavelSalvo = localStorage.getItem('responsavel') || 'eu';
  // Lista já usada em uma compra (em andamento ou finalizada) não aparece mais para começar outra compra.
  const listasUsadas = new Set(
    estado.compras.filter((c) => c.listaId && ['em_andamento', 'finalizada'].includes(c.status)).map((c) => c.listaId),
  );
  const listasRecentes = estado.listas
    .filter((l) => !listasUsadas.has(l.id) && l.status !== 'concluida')
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  tela.innerHTML = `
    <div class="cartao">
      <h2>Começar compra</h2>
      <label for="lista-base">Lista preparada</label>
      <select id="lista-base">
        <option value="">Sem lista (adicionar produtos durante a compra)</option>
        ${listasRecentes
          .map((l) => `<option value="${l.id}">Lista de ${formatarData(l.criadaEm)} (${l.itens.length} produtos)</option>`)
          .join('')}
      </select>
      <label for="responsavel">Quem está comprando</label>
      <select id="responsavel">
        <option value="eu" ${responsavelSalvo === 'eu' ? 'selected' : ''}>${NOME_EU}</option>
        <option value="viviane" ${responsavelSalvo === 'viviane' ? 'selected' : ''}>Viviane</option>
      </select>
      <div class="linha" style="margin-top:12px">
        <button id="iniciar-compra" class="destaque">Iniciar compra</button>
      </div>
    </div>
  `;

  document.getElementById('iniciar-compra').addEventListener('click', async () => {
    const listaId = document.getElementById('lista-base').value;
    const responsavel = document.getElementById('responsavel').value;
    localStorage.setItem('responsavel', responsavel);
    const lista = estado.listas.find((l) => l.id === listaId);
    const itens = (lista?.itens ?? []).map((i) => {
      const produto = estado.produtos.find((p) => p.id === i.produtoId);
      return {
        produtoId: i.produtoId,
        nomeProduto: produto?.nome ?? '(produto removido)',
        planejada: i.quantidadePlanejada,
        // Já entra como comprado: você só ajusta os que não deram certo.
        status: STATUS_ITEM.COMPRADO,
        quantidade: i.quantidadePlanejada,
        precoUnitario: null,
      };
    });
    await banco.compras.salvar({
      id: novoId('compra'),
      status: 'em_andamento',
      criadaEm: new Date().toISOString(),
      listaId: listaId || null,
      responsavel,
      estabelecimento: '',
      itens,
    });
    await carregarDados();
    mostrarStatus('Compra iniciada');
    telaCompra();
  });
}

function cartaoItem(item, idx) {
  const ultimo = ultimoPrecoPago(item.produtoId, estado.compras);
  const textoUltimo = ultimo
    ? `Último preço: ${formatarMoeda(ultimo.precoUnitario)} em ${formatarData(ultimo.data)}${
        ultimo.estabelecimento ? ` · ${escapar(ultimo.estabelecimento)}` : ''
      }`
    : 'Sem compra anterior';
  const precoTexto = item.precoUnitario == null ? '' : String(item.precoUnitario).replace('.', ',');
  return `
    <div class="cartao" data-idx="${idx}">
      <div class="linha" style="justify-content:space-between">
        <strong>${escapar(item.nomeProduto)}</strong>
        <span style="font-size:.85rem">${item.planejada != null ? `Planejado: ${item.planejada}` : 'Extra'}</span>
      </div>
      <p style="font-size:.85rem;color:#555;margin:6px 0">${textoUltimo}</p>
      <div class="linha">
        <div>
          <label>Quantidade</label>
          <input type="number" min="1" step="1" inputmode="numeric" data-campo="quantidade" value="${item.quantidade ?? ''}">
        </div>
        <div>
          <label>Preço unitário (R$)</label>
          <input type="text" inputmode="decimal" data-campo="preco" value="${precoTexto}" placeholder="0,00">
        </div>
      </div>
      <div class="linha" style="margin-top:8px">
        <select data-campo="status" aria-label="Situação do item">
          ${Object.entries(ROTULO_STATUS)
            .map(([valor, rotulo]) => `<option value="${valor}" ${item.status === valor ? 'selected' : ''}>${rotulo}</option>`)
            .join('')}
        </select>
        <strong>Subtotal: ${formatarMoeda(subtotalItem(item))}</strong>
      </div>
    </div>`;
}

function telaEmAndamento() {
  const compra = estado.compraAtual;
  const total = totalCompra(compra.itens);
  const naCompra = new Set(compra.itens.map((i) => i.produtoId));
  const disponiveis = estado.produtos
    .filter((p) => p.ativo && !naCompra.has(p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  tela.innerHTML = `
    <div class="cartao">
      <div class="linha" style="justify-content:space-between">
        <strong>Compra de ${nomeResponsavel(compra.responsavel)}</strong>
        <span style="font-size:.85rem">Iniciada em ${formatarData(compra.criadaEm)}</span>
      </div>
      <label for="estabelecimento">Estabelecimento (opcional)</label>
      <input id="estabelecimento" maxlength="60" value="${escapar(compra.estabelecimento)}">
      <p style="font-size:1.1rem">Total parcial: <strong>${formatarMoeda(total)}</strong></p>
    </div>

    ${compra.itens.length === 0 ? '<p class="vazio">Nenhum item. Adicione produtos abaixo.</p>' : ''}
    ${compra.itens.map((item, idx) => cartaoItem(item, idx)).join('')}

    <div class="cartao">
      <label for="adicionar-produto">Adicionar produto que não estava na lista</label>
      <div class="linha">
        <select id="adicionar-produto">
          <option value="">Escolha um produto</option>
          ${disponiveis.map((p) => `<option value="${p.id}">${escapar(p.nome)}</option>`).join('')}
        </select>
        <button id="btn-adicionar" class="secundario">Adicionar</button>
      </div>
    </div>

    <div class="cartao">
      <button id="btn-finalizar" class="destaque" style="width:100%">Finalizar compra</button>
      <button id="btn-descartar" class="secundario" style="width:100%;margin-top:8px">Descartar esta compra</button>
    </div>
  `;

  document.getElementById('estabelecimento').addEventListener('change', async (e) => {
    compra.estabelecimento = e.target.value.trim();
    await salvarCompraAtual();
  });

  tela.querySelectorAll('[data-idx]').forEach((cartao) => {
    const idx = Number(cartao.dataset.idx);
    const item = compra.itens[idx];

    cartao.querySelector('[data-campo="quantidade"]').addEventListener('change', async (e) => {
      const valor = Number(e.target.value);
      if (!Number.isInteger(valor) || valor < 1) {
        mostrarStatus('A quantidade deve ser um número inteiro de pelo menos 1.', true);
        e.target.value = item.quantidade ?? '';
        return;
      }
      item.quantidade = valor;
      await salvarCompraAtual();
      telaEmAndamento();
    });

    cartao.querySelector('[data-campo="preco"]').addEventListener('change', async (e) => {
      const texto = e.target.value.trim();
      if (texto === '') {
        item.precoUnitario = null;
      } else {
        const valor = lerDecimal(texto);
        if (valor === null || valor < 0) {
          mostrarStatus('Informe um preço válido, por exemplo 6,50.', true);
          e.target.value = item.precoUnitario == null ? '' : String(item.precoUnitario).replace('.', ',');
          return;
        }
        item.precoUnitario = Math.round(valor * 100) / 100;
      }
      await salvarCompraAtual();
      telaEmAndamento();
    });

    cartao.querySelector('[data-campo="status"]').addEventListener('change', async (e) => {
      const novo = e.target.value;
      if (novo === STATUS_ITEM.COMPRADO && item.precoUnitario == null) {
        mostrarStatus('Informe o preço antes de marcar o item como comprado.', true);
        e.target.value = item.status;
        return;
      }
      item.status = novo;
      await salvarCompraAtual();
      telaEmAndamento();
    });
  });

  document.getElementById('btn-adicionar').addEventListener('click', async () => {
    const produtoId = document.getElementById('adicionar-produto').value;
    if (!produtoId) return mostrarStatus('Escolha um produto para adicionar.', true);
    const produto = estado.produtos.find((p) => p.id === produtoId);
    compra.itens.push({
      produtoId,
      nomeProduto: produto.nome,
      planejada: null,
      status: STATUS_ITEM.PENDENTE,
      quantidade: 1,
      precoUnitario: null,
    });
    await salvarCompraAtual();
    telaEmAndamento();
  });

  document.getElementById('btn-finalizar').addEventListener('click', () => {
    estado.revisando = true;
    telaCompra();
  });

  document.getElementById('btn-descartar').addEventListener('click', async () => {
    if (!confirm('Descartar esta compra? Os itens digitados não serão salvos no histórico.')) return;
    await banco.compras.salvar({ ...compra, status: 'descartada' });
    await carregarDados();
    mostrarStatus('Compra descartada');
    telaCompra();
  });
}

function telaRevisarCompra() {
  const compra = estado.compraAtual;
  const resumo = resumoCompra(compra);
  const validacao = validarParaFinalizar(compra);

  tela.innerHTML = `
    <div class="cartao">
      <h2>Confirmar compra</h2>
      <p>Itens planejados: <strong>${resumo.planejados}</strong></p>
      <p>Itens comprados: <strong>${resumo.comprados}</strong></p>
      <p>Não encontrados ou não comprados: <strong>${
        resumo.naoComprados.length ? escapar(resumo.naoComprados.join(', ')) : 'nenhum'
      }</strong></p>
      <p>Total: <strong>${formatarMoeda(resumo.total)}</strong></p>
      <p>Estabelecimento: ${compra.estabelecimento ? escapar(compra.estabelecimento) : 'não informado'}</p>
      <p>Data e horário: ${new Date().toLocaleString('pt-BR')}</p>
      <p>Responsável: ${nomeResponsavel(compra.responsavel)}</p>
      ${validacao.ok ? '' : `<div class="aviso">${validacao.erros.map(escapar).join('<br>')}</div>`}
    </div>
    <div class="cartao">
      <button id="btn-confirmar" class="destaque" style="width:100%" ${validacao.ok ? '' : 'disabled'}>Confirmar e salvar no histórico</button>
      <button id="btn-voltar" class="secundario" style="width:100%;margin-top:8px">Voltar e corrigir</button>
    </div>
  `;

  document.getElementById('btn-voltar').addEventListener('click', () => {
    estado.revisando = false;
    telaCompra();
  });

  document.getElementById('btn-confirmar').addEventListener('click', async (e) => {
    if (finalizando) return; // impede cliques repetidos registrarem a mesma compra duas vezes
    finalizando = true;
    e.target.disabled = true;
    try {
      const agora = new Date().toISOString();
      await banco.compras.salvar({
        ...compra,
        status: 'finalizada',
        finalizadaEm: agora,
        total: resumo.total,
      });
      const listaUsada = compra.listaId ? estado.listas.find((l) => l.id === compra.listaId) : null;
      if (listaUsada && listaUsada.status !== 'concluida') {
        await banco.listas.salvar({ ...listaUsada, status: 'concluida' });
      }
      await carregarDados();
      estado.revisando = false;
      mostrarStatus('Compra finalizada e salva no histórico');
      telaCompra();
    } catch (err) {
      mostrarStatus('Erro ao finalizar a compra. Nada foi perdido: tente novamente.', true);
      e.target.disabled = false;
      console.error(err);
    } finally {
      finalizando = false;
    }
  });
}

// ---------- Tela: Histórico ----------
function blocoAlteracoes(c) {
  const alteracoes = c.alteracoes ?? [];
  const lista = alteracoes.length
    ? alteracoes
        .map((a) => `<li>${new Date(a.em).toLocaleString('pt-BR')} por ${nomeResponsavel(a.por)}: ${escapar(a.motivo)}</li>`)
        .join('')
    : '<li>Nenhuma correção.</li>';
  return `
    <div class="aviso" style="margin-top:8px">
      <strong>Correções</strong>
      <ul style="margin:6px 0 0 18px;padding:0">${lista}</ul>
    </div>
    <button class="secundario" data-acao="corrigir" data-id="${c.id}" style="margin-top:8px">Corrigir compra</button>`;
}

function telaCorrigirCompra() {
  const original = estado.compras.find((c) => c.id === estado.corrigindoId);
  if (!original) {
    estado.corrigindoId = null;
    return telaHistorico();
  }
  if (!estado.rascunhoCorrecao) {
    estado.rascunhoCorrecao = {
      estabelecimento: original.estabelecimento || '',
      responsavel: original.responsavel,
      itens: original.itens.map((i) => ({ ...i })),
    };
  }
  const r = estado.rascunhoCorrecao;

  tela.innerHTML = `
    <div class="cartao">
      <h2>Corrigir compra de ${formatarData(diaLocal(original.finalizadaEm))}</h2>
      <p style="font-size:.9rem;color:#555">A compra original fica registrada, e a correção aparece no histórico com o motivo.</p>
      <label for="c-mercado">Estabelecimento</label>
      <input id="c-mercado" maxlength="60" value="${escapar(r.estabelecimento)}">
      <label for="c-resp">Quem comprou</label>
      <select id="c-resp">
        <option value="eu" ${r.responsavel === 'eu' ? 'selected' : ''}>${NOME_EU}</option>
        <option value="viviane" ${r.responsavel === 'viviane' ? 'selected' : ''}>Viviane</option>
      </select>
    </div>

    <div class="cartao">
      <h2>Itens</h2>
      ${r.itens
        .map(
          (i, idx) => `
        <div class="item-produto" style="flex-direction:column;align-items:stretch">
          <strong>${escapar(i.nomeProduto)}</strong>
          <div class="linha">
            <div><label>Quantidade</label><input type="number" min="1" step="1" inputmode="numeric" data-idx="${idx}" data-campo="quantidade" value="${i.quantidade ?? ''}"></div>
            <div><label>Preço unitário (R$)</label><input type="text" inputmode="decimal" data-idx="${idx}" data-campo="preco" value="${i.precoUnitario == null ? '' : String(i.precoUnitario).replace('.', ',')}"></div>
          </div>
          <select data-idx="${idx}" data-campo="status" aria-label="Situação do item">
            ${Object.entries(ROTULO_STATUS)
              .map(([valor, rotulo]) => `<option value="${valor}" ${i.status === valor ? 'selected' : ''}>${rotulo}</option>`)
              .join('')}
          </select>
        </div>`,
        )
        .join('')}
    </div>

    <div class="cartao">
      <label for="c-motivo">Motivo da correção (obrigatório)</label>
      <textarea id="c-motivo" rows="3" style="width:100%;border:1px solid var(--borda);border-radius:10px;padding:10px;font:inherit"></textarea>
      <p style="margin-top:10px">Total corrigido: <strong>${formatarMoeda(totalCompra(r.itens))}</strong></p>
      <button id="c-salvar" class="destaque" style="width:100%">Salvar correção</button>
      <button id="c-cancelar" class="secundario" style="width:100%;margin-top:8px">Cancelar</button>
    </div>
  `;

  document.getElementById('c-mercado').addEventListener('change', (e) => {
    r.estabelecimento = e.target.value.trim();
  });
  document.getElementById('c-resp').addEventListener('change', (e) => {
    r.responsavel = e.target.value;
  });

  tela.querySelectorAll('[data-idx]').forEach((campo) => {
    campo.addEventListener('change', () => {
      const item = r.itens[Number(campo.dataset.idx)];
      const tipo = campo.dataset.campo;
      if (tipo === 'quantidade') {
        const v = Number(campo.value);
        if (!Number.isInteger(v) || v < 1) {
          mostrarStatus('A quantidade deve ser um número inteiro de pelo menos 1.', true);
          campo.value = item.quantidade ?? '';
          return;
        }
        item.quantidade = v;
      } else if (tipo === 'preco') {
        const texto = campo.value.trim();
        const v = texto === '' ? null : lerDecimal(texto);
        if (texto !== '' && (v === null || v < 0)) {
          mostrarStatus('Informe um preço válido, por exemplo 6,50.', true);
          campo.value = item.precoUnitario == null ? '' : String(item.precoUnitario).replace('.', ',');
          return;
        }
        item.precoUnitario = v === null ? null : Math.round(v * 100) / 100;
      } else if (tipo === 'status') {
        if (campo.value === STATUS_ITEM.COMPRADO && item.precoUnitario == null) {
          mostrarStatus('Informe o preço antes de marcar o item como comprado.', true);
          campo.value = item.status;
          return;
        }
        item.status = campo.value;
      }
      telaCorrigirCompra();
    });
  });

  document.getElementById('c-cancelar').addEventListener('click', () => {
    estado.corrigindoId = null;
    estado.rascunhoCorrecao = null;
    telaHistorico();
  });

  document.getElementById('c-salvar').addEventListener('click', async (e) => {
    if (salvandoCorrecao) return;
    salvandoCorrecao = true;
    e.target.disabled = true;
    try {
      const motivo = document.getElementById('c-motivo').value;
      const autor = localStorage.getItem('responsavel') || 'eu';
      const resultado = aplicarCorrecao(original, {
        estabelecimento: r.estabelecimento,
        responsavel: r.responsavel,
        itens: r.itens,
      }, { motivo, autor, agoraIso: new Date().toISOString() });
      if (!resultado.ok) {
        mostrarStatus(resultado.erros[0], true);
        return;
      }
      const validacao = validarParaFinalizar(resultado.compra);
      if (!validacao.ok) {
        mostrarStatus(validacao.erros[0], true);
        return;
      }
      await banco.compras.salvar(resultado.compra);
      await carregarDados();
      estado.corrigindoId = null;
      estado.rascunhoCorrecao = null;
      mostrarStatus('Correção salva. A compra original continua registrada no histórico.');
      telaHistorico();
    } catch (err) {
      mostrarStatus('Erro ao salvar a correção. Nada foi alterado: tente novamente.', true);
      console.error(err);
    } finally {
      salvandoCorrecao = false;
      e.target.disabled = false;
    }
  });
}

let salvandoCorrecao = false;

function telaHistorico() {
  if (estado.corrigindoId) return telaCorrigirCompra();
  const f = estado.filtrosHist;
  const compras = filtrarCompras(estado.compras, f);
  const mercados = estabelecimentosUsados(estado.compras);
  const produtosOrdenados = [...estado.produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const campoSelecionado = (valor, atual) => (valor === atual ? 'selected' : '');

  let blocoProduto = '';
  if (f.produtoId) {
    const produto = estado.produtos.find((p) => p.id === f.produtoId);
    const registros = historicoDoProduto(f.produtoId, estado.compras).reverse();
    blocoProduto = `
      <div class="cartao">
        <h2>Preços de ${escapar(produto?.nome ?? '')}</h2>
        ${linhaSvg(
          historicoDoProduto(f.produtoId, estado.compras).map((r) => ({
            x: formatarData(diaLocal(r.data)).slice(0, 5),
            y: r.precoUnitario,
          })),
        )}
        ${
          registros.length === 0
            ? '<p class="vazio">Este produto ainda não foi comprado.</p>'
            : registros
                .map((r) => {
                  const variacao =
                    r.variacao == null
                      ? 'primeira compra'
                      : `${r.variacao > 0 ? 'aumento' : r.variacao < 0 ? 'redução' : 'estável'} de ${Math.abs(r.variacao).toFixed(2).replace('.', ',')}%`;
                  return `
            <div class="item-produto" style="flex-direction:column;align-items:flex-start">
              <span><strong>${formatarMoeda(r.precoUnitario)}</strong> por unidade · ${formatarData(diaLocal(r.data))}${
                    r.estabelecimento ? ` · ${escapar(r.estabelecimento)}` : ''
                  }</span>
              <span style="font-size:.85rem;color:#555">Quantidade: ${r.quantidade} · ${variacao}</span>
            </div>`;
                })
                .join('')
        }
      </div>`;
  }

  tela.innerHTML = `
    <div class="cartao">
      <h2>Filtrar compras</h2>
      <div class="linha">
        <div><label for="f-ini">De</label><input type="date" id="f-ini" value="${f.dataInicial}"></div>
        <div><label for="f-fim">Até</label><input type="date" id="f-fim" value="${f.dataFinal}"></div>
      </div>
      <label for="f-mercado">Estabelecimento</label>
      <select id="f-mercado">
        <option value="">Todos</option>
        ${mercados.map((m) => `<option value="${escapar(m)}" ${campoSelecionado(m, f.estabelecimento)}>${escapar(m)}</option>`).join('')}
      </select>
      <label for="f-resp">Quem comprou</label>
      <select id="f-resp">
        <option value="">Ambos</option>
        <option value="eu" ${campoSelecionado('eu', f.responsavel)}>${NOME_EU}</option>
        <option value="viviane" ${campoSelecionado('viviane', f.responsavel)}>Viviane</option>
      </select>
      <label for="f-produto">Produto</label>
      <select id="f-produto">
        <option value="">Todos</option>
        ${produtosOrdenados.map((p) => `<option value="${p.id}" ${campoSelecionado(p.id, f.produtoId)}>${escapar(p.nome)}</option>`).join('')}
      </select>
      <div class="linha" style="margin-top:12px">
        <button id="f-limpar" class="secundario">Limpar filtros</button>
      </div>
    </div>

    ${blocoProduto}

    <h2>${compras.length} compra(s) encontrada(s)</h2>
    ${compras.length === 0 ? '<p class="vazio">Nenhuma compra com estes filtros.</p>' : ''}
    ${compras
      .map((c) => {
        const aberta = estado.compraAbertaId === c.id;
        const hora = new Date(c.finalizadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const comprados = c.itens.filter((i) => i.status === STATUS_ITEM.COMPRADO);
        return `
      <div class="cartao">
        <div class="linha" style="justify-content:space-between">
          <strong>${formatarData(diaLocal(c.finalizadaEm))} às ${hora}</strong>
          <strong>${formatarMoeda(c.total)}</strong>
        </div>
        <p style="font-size:.9rem;color:#555;margin:6px 0">
          ${escapar(c.estabelecimento || 'Sem estabelecimento')} · ${nomeResponsavel(c.responsavel)} · ${comprados.length} item(ns)
        </p>
        <button class="secundario" data-acao="abrir-compra" data-id="${c.id}">${aberta ? 'Fechar' : 'Ver itens'}</button>
        ${aberta ? blocoAlteracoes(c) : ''}
        ${
          aberta
            ? `<div style="margin-top:10px">
                ${comprados
                  .map(
                    (i) => `
                  <div class="item-produto">
                    <span class="nome">${escapar(i.nomeProduto)}<br><small>${i.quantidade} × ${formatarMoeda(i.precoUnitario)}</small></span>
                    <strong>${formatarMoeda(subtotalItem(i))}</strong>
                  </div>`,
                  )
                  .join('')}
                ${
                  c.itens.some((i) => i.status !== STATUS_ITEM.COMPRADO)
                    ? `<p style="font-size:.85rem;color:#555">Não comprados: ${escapar(
                        c.itens
                          .filter((i) => i.status !== STATUS_ITEM.COMPRADO)
                          .map((i) => `${i.nomeProduto} (${ROTULO_STATUS[i.status]?.toLowerCase() ?? ''})`)
                          .join(', '),
                      )}</p>`
                    : ''
                }
              </div>`
            : ''
        }
      </div>`;
      })
      .join('')}
  `;

  const atualizar = (chave) => (e) => {
    estado.filtrosHist[chave] = e.target.value;
    telaHistorico();
  };
  document.getElementById('f-ini').addEventListener('change', atualizar('dataInicial'));
  document.getElementById('f-fim').addEventListener('change', atualizar('dataFinal'));
  document.getElementById('f-mercado').addEventListener('change', atualizar('estabelecimento'));
  document.getElementById('f-resp').addEventListener('change', atualizar('responsavel'));
  document.getElementById('f-produto').addEventListener('change', atualizar('produtoId'));
  document.getElementById('f-limpar').addEventListener('click', () => {
    estado.filtrosHist = { dataInicial: '', dataFinal: '', estabelecimento: '', responsavel: '', produtoId: '' };
    telaHistorico();
  });

  tela.querySelectorAll('[data-acao="abrir-compra"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      estado.compraAbertaId = estado.compraAbertaId === botao.dataset.id ? null : botao.dataset.id;
      telaHistorico();
    });
  });

  tela.querySelectorAll('[data-acao="corrigir"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      estado.corrigindoId = botao.dataset.id;
      estado.rascunhoCorrecao = null;
      telaHistorico();
    });
  });
}

// ---------- Tela: Relatórios ----------
const FILTROS_REL_VAZIOS = { dataInicial: '', dataFinal: '', estabelecimento: '', responsavel: '', categoriaId: '' };

function hojeIso() {
  return diaLocal(new Date().toISOString());
}

function barra(percentual) {
  const largura = Math.max(0, Math.min(100, percentual));
  return `<div class="barra"><div style="width:${largura}%"></div></div>`;
}

function telaRelatorios() {
  const f = estado.filtrosRel;
  const filtrosBase = { estabelecimento: f.estabelecimento, responsavel: f.responsavel, categoriaId: f.categoriaId };
  const linhas = itensFiltrados(estado.compras, estado.produtos, { ...filtrosBase, dataInicial: f.dataInicial, dataFinal: f.dataFinal });
  const resumo = resumoGastos(linhas);

  // Comparação com o período anterior de mesmo tamanho (só quando há período completo).
  const anterior = periodoAnterior(f.dataInicial, f.dataFinal);
  let comparacao = '';
  if (anterior) {
    const linhasAnt = itensFiltrados(estado.compras, estado.produtos, { ...filtrosBase, ...anterior });
    const totalAnt = resumoGastos(linhasAnt).total;
    const variacao = variacaoPercentual(totalAnt, resumo.total);
    comparacao = variacao === null
      ? '<p style="font-size:.9rem;color:#555">Sem gastos no período anterior para comparar.</p>'
      : `<p style="font-size:.9rem;color:#555">${variacao > 0 ? 'Subiu' : variacao < 0 ? 'Caiu' : 'Ficou igual'} ${Math.abs(variacao).toFixed(2).replace('.', ',')}% em relação ao período anterior (${formatarMoeda(totalAnt)}).</p>`;
  }

  const porCategoria = gastosPor(linhas, (l) => l.categoriaId ?? 'sem', (l) => {
    const cat = estado.categorias.find((c) => c.id === l.categoriaId);
    return cat?.nome ?? 'Sem categoria';
  });
  const porMercado = gastosPor(linhas, (l) => l.estabelecimento, (l) => l.estabelecimento);
  const porProduto = gastosPor(linhas, (l) => l.produtoId, (l) => l.nome).slice(0, 10);
  const variacoes = maioresVariacoes(filtrarCompras(estado.compras, { dataInicial: f.dataInicial, dataFinal: f.dataFinal, estabelecimento: f.estabelecimento, responsavel: f.responsavel }));

  const blocoGrupo = (titulo, grupos) => `
    <div class="cartao">
      <h2>${titulo}</h2>
      ${grupos.length === 0 ? '<p class="vazio">Sem dados neste filtro.</p>' : ''}
      ${grupos
        .map(
          (g) => `
        <div style="margin:8px 0">
          <div class="linha" style="justify-content:space-between;font-size:.9rem">
            <span>${escapar(g.rotulo)}</span>
            <strong>${formatarMoeda(g.total)} (${g.participacao.toFixed(1).replace('.', ',')}%)</strong>
          </div>
          ${barra(g.participacao)}
        </div>`,
        )
        .join('')}
    </div>`;

  const blocoVariacao = (titulo, lista) => `
    <div class="cartao">
      <h2>${titulo}</h2>
      ${lista.length === 0 ? '<p class="vazio">Nenhum produto com duas ou mais compras neste filtro.</p>' : ''}
      ${lista
        .slice(0, 5)
        .map((v) => {
          const nome = estado.produtos.find((p) => p.id === v.produtoId)?.nome ?? '(produto removido)';
          return `
          <div class="item-produto">
            <span class="nome">${escapar(nome)}<br><small>${formatarMoeda(v.precoAnterior)} → ${formatarMoeda(v.precoAtual)}</small></span>
            <strong>${v.variacao > 0 ? '+' : ''}${v.variacao.toFixed(2).replace('.', ',')}%</strong>
          </div>`;
        })
        .join('')}
    </div>`;

  const botoesRapidos = [
    ['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['90', '90 dias'], ['365', '365 dias'], ['mes', 'Mês atual'],
  ]
    .map(([tipo, rotulo]) => `<button class="secundario" data-rapido="${tipo}">${rotulo}</button>`)
    .join(' ');

  const mercados = estabelecimentosUsados(estado.compras);
  const categorias = [...estado.categorias].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  tela.innerHTML = `
    <div class="cartao">
      <h2>Filtros</h2>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${botoesRapidos}</div>
      <div class="linha" style="margin-top:10px">
        <div><label for="r-ini">De</label><input type="date" id="r-ini" value="${f.dataInicial}"></div>
        <div><label for="r-fim">Até</label><input type="date" id="r-fim" value="${f.dataFinal}"></div>
      </div>
      <label for="r-mercado">Estabelecimento</label>
      <select id="r-mercado">
        <option value="">Todos</option>
        ${mercados.map((m) => `<option value="${escapar(m)}" ${m === f.estabelecimento ? 'selected' : ''}>${escapar(m)}</option>`).join('')}
      </select>
      <label for="r-resp">Quem comprou</label>
      <select id="r-resp">
        <option value="">Ambos</option>
        <option value="eu" ${f.responsavel === 'eu' ? 'selected' : ''}>${NOME_EU}</option>
        <option value="viviane" ${f.responsavel === 'viviane' ? 'selected' : ''}>Viviane</option>
      </select>
      <label for="r-cat">Categoria</label>
      <select id="r-cat">
        <option value="">Todas</option>
        ${categorias.map((c) => `<option value="${c.id}" ${c.id === f.categoriaId ? 'selected' : ''}>${escapar(c.nome)}</option>`).join('')}
      </select>
      <label for="r-ordem">Ordenar listas por</label>
      <select id="r-ordem">
        <option value="valor" ${estado.ordenacaoRel === 'valor' ? 'selected' : ''}>Valor gasto</option>
        <option value="quantidade" ${estado.ordenacaoRel === 'quantidade' ? 'selected' : ''}>Quantidade de itens</option>
        <option value="nome" ${estado.ordenacaoRel === 'nome' ? 'selected' : ''}>Nome</option>
      </select>
      <div class="linha" style="margin-top:12px">
        <button id="r-limpar" class="secundario">Limpar filtros</button>
      </div>
    </div>

    <div class="cartao">
      <h2>Resumo</h2>
      <p style="font-size:1.2rem">Total gasto: <strong>${formatarMoeda(resumo.total)}</strong></p>
      <p>Compras: <strong>${resumo.compras}</strong> · Média por compra: <strong>${formatarMoeda(resumo.mediaPorCompra)}</strong></p>
      ${comparacao}
    </div>

    ${blocoGrupo('Gastos por categoria', ordenarGrupos(porCategoria, estado.ordenacaoRel))}
    ${blocoGrupo('Gastos por mercado', ordenarGrupos(porMercado, estado.ordenacaoRel))}
    ${blocoGrupo('Produtos que mais pesaram (top 10)', ordenarGrupos(porProduto, estado.ordenacaoRel))}
    ${blocoVariacao('Maiores aumentos de preço', variacoes.aumentos)}
    ${blocoVariacao('Maiores reduções de preço', variacoes.reducoes)}
  `;

  tela.querySelectorAll('[data-rapido]').forEach((botao) => {
    botao.addEventListener('click', () => {
      Object.assign(estado.filtrosRel, periodoRapido(botao.dataset.rapido, hojeIso()));
      telaRelatorios();
    });
  });

  const atualizar = (chave) => (e) => {
    estado.filtrosRel[chave] = e.target.value;
    telaRelatorios();
  };
  document.getElementById('r-ini').addEventListener('change', atualizar('dataInicial'));
  document.getElementById('r-fim').addEventListener('change', atualizar('dataFinal'));
  document.getElementById('r-mercado').addEventListener('change', atualizar('estabelecimento'));
  document.getElementById('r-resp').addEventListener('change', atualizar('responsavel'));
  document.getElementById('r-cat').addEventListener('change', atualizar('categoriaId'));
  document.getElementById('r-limpar').addEventListener('click', () => {
    estado.filtrosRel = { ...FILTROS_REL_VAZIOS };
    telaRelatorios();
  });
  document.getElementById('r-ordem').addEventListener('change', (e) => {
    estado.ordenacaoRel = e.target.value;
    telaRelatorios();
  });
}

// ---------- Tela: Configurações e backups ----------
function baixarArquivo(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dadosAtuais() {
  return {
    categorias: estado.categorias,
    produtos: estado.produtos,
    listas: estado.listas,
    compras: estado.compras,
  };
}

function telaConfig() {
  const resp = localStorage.getItem('responsavel') || 'eu';
  const imp = estado.importacao;

  let blocoImportacao = '';
  if (imp) {
    if (!imp.validacao.ok) {
      blocoImportacao = `<div class="aviso">Arquivo não pode ser importado:<br>${imp.validacao.erros.map(escapar).join('<br>')}</div>
        <button id="imp-cancelar" class="secundario" style="margin-top:8px">Cancelar</button>`;
    } else {
      const c = imp.validacao.contagem;
      const novos = imp.planos;
      blocoImportacao = `
        <p>Arquivo válido. Ele contém ${c.categorias} categoria(s), ${c.produtos} produto(s), ${c.listas} lista(s) e ${c.compras} compra(s).</p>
        <p>Pela mesclagem, serão adicionados: ${novos.categorias.length} categoria(s), ${novos.produtos.length} produto(s), ${novos.listas.length} lista(s) e ${novos.compras.length} compra(s). Nada que já existe será alterado ou apagado.</p>
        ${imp.suspeitos.length ? `<div class="aviso">Possíveis duplicidades (não serão importadas):<br>${imp.suspeitos.map(escapar).join('<br>')}</div>` : ''}
        <div class="linha" style="margin-top:12px">
          <button id="imp-mesclar" class="destaque">Mesclar (adicionar só o que é novo)</button>
          <button id="imp-cancelar" class="secundario">Cancelar</button>
        </div>
        <div class="aviso" style="margin-top:12px">
          <strong>Substituir tudo</strong> apaga os dados deste celular e coloca o conteúdo do arquivo no lugar. Para confirmar, digite SUBSTITUIR:
          <input id="imp-confirma" placeholder="SUBSTITUIR" style="margin-top:6px">
          <button id="imp-substituir" class="secundario" style="margin-top:8px;width:100%">Substituir tudo</button>
        </div>`;
    }
  }

  tela.innerHTML = `
    <div class="cartao">
      <h2>Quem usa este celular</h2>
      <p style="font-size:.8rem;color:#777">Versão do app: ${VERSAO_APP}</p>
      <label for="cfg-resp">Responsável padrão nas novas compras</label>
      <select id="cfg-resp">
        <option value="eu" ${resp === 'eu' ? 'selected' : ''}>${NOME_EU}</option>
        <option value="viviane" ${resp === 'viviane' ? 'selected' : ''}>Viviane</option>
      </select>
    </div>

    <div class="cartao">
      <h2>Este celular é de</h2>
      <p style="font-size:.9rem;color:#555">Cada celular grava um arquivo próprio no Google Drive, com o nome da pessoa.</p>
      <select id="cfg-dono">
        <option value="eu" ${donoDesteCelular() === 'eu' ? 'selected' : ''}>${NOME_EU}</option>
        <option value="viviane" ${donoDesteCelular() === 'viviane' ? 'selected' : ''}>Viviane</option>
      </select>
    </div>

    <div class="cartao">
      <h2>Sincronização com o Google Drive</h2>
      ${
        driveConfigurado()
          ? `<p style="font-size:.9rem;color:#555">Última sincronização: ${localStorage.getItem('ultimaSync') ? new Date(localStorage.getItem('ultimaSync')).toLocaleString('pt-BR') : 'nunca'}</p>
             <div class="linha"><button id="drive-conectar" class="secundario">Conectar ao Google Drive</button><button id="drive-sync" class="destaque">Sincronizar agora</button></div>`
          : `<div class="aviso">Esta versão é local: os dados ficam só neste celular. Para levar os dados ao celular da Viviane, use "Baixar backup" aqui e "Importar backup" lá.</div>`
      }
    </div>

    <div class="cartao">
      <h2>Exportar backup</h2>
      <p style="font-size:.9rem;color:#555">Gera um arquivo com todos os produtos, categorias, listas e compras. Guarde-o no Google Drive.</p>
      <button id="exp-backup" class="destaque" style="width:100%">Baixar backup (JSON)</button>
    </div>

    <div class="cartao">
      <h2>Exportar compras para planilha</h2>
      <p style="font-size:.9rem;color:#555">Gera um arquivo CSV com um item por linha, para abrir no Excel ou no Planilhas Google.</p>
      <button id="exp-csv" class="secundario" style="width:100%">Baixar compras (CSV)</button>
    </div>

    <div class="cartao">
      <h2>Importar backup</h2>
      <p style="font-size:.9rem;color:#555">Escolha um arquivo de backup. Antes de qualquer alteração, você verá o que será feito.</p>
      <input type="file" id="imp-arquivo" accept=".json,application/json">
      ${blocoImportacao}
    </div>
  `;

  document.getElementById('cfg-dono').addEventListener('change', (e) => {
    localStorage.setItem('dono', e.target.value);
    mostrarStatus('Arquivo deste celular atualizado');
  });

  document.getElementById('drive-conectar')?.addEventListener('click', async () => {
    try {
      await conectarDrive();
      mostrarStatus('Conectado ao Google Drive');
    } catch (err) {
      mostrarStatus(err.message, true);
    }
  });

  document.getElementById('drive-sync')?.addEventListener('click', async () => {
    try {
      mostrarStatus('Sincronizando...');
      const dono = donoDesteCelular();
      const outro = dono === 'eu' ? 'viviane' : 'eu';
      const { dados, conflitos } = await sincronizar(dadosAtuais(), dono, outro);
      await banco.gravarLotes(dados);
      await carregarDados();
      localStorage.setItem('ultimaSync', new Date().toISOString());
      const n = Object.values(conflitos).flat().length;
      mostrarStatus(`Sincronizado${n ? ` (${n} conflito(s): ficou a alteração mais recente)` : ''}`);
      telaConfig();
    } catch (err) {
      mostrarStatus(err.message, true);
    }
  });

  document.getElementById('cfg-resp').addEventListener('change', (e) => {
    localStorage.setItem('responsavel', e.target.value);
    mostrarStatus('Responsável padrão atualizado');
  });

  document.getElementById('exp-backup').addEventListener('click', () => {
    const agora = new Date().toISOString();
    const conteudo = JSON.stringify(montarBackup(dadosAtuais(), agora), null, 2);
    baixarArquivo(`compras-da-casa-${diaLocal(agora)}.json`, conteudo, 'application/json');
    mostrarStatus('Backup gerado. Guarde o arquivo no Google Drive.');
  });

  document.getElementById('exp-csv').addEventListener('click', () => {
    const agora = new Date().toISOString();
    baixarArquivo(`compras-da-casa-${diaLocal(agora)}.csv`, csvItens(estado.compras, estado.produtos), 'text/csv;charset=utf-8');
    mostrarStatus('Planilha de compras gerada');
  });

  document.getElementById('imp-arquivo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
      const obj = JSON.parse(await arquivo.text());
      const validacao = validarBackup(obj);
      if (!validacao.ok) {
        estado.importacao = { validacao };
      } else {
        const { planos, suspeitos } = planejarMescla(dadosAtuais(), obj);
        estado.importacao = { backup: obj, validacao, planos, suspeitos };
      }
    } catch {
      estado.importacao = { validacao: { ok: false, erros: ['Não foi possível ler o arquivo. Ele não é um JSON válido.'] } };
    }
    telaConfig();
  });

  document.getElementById('imp-cancelar')?.addEventListener('click', () => {
    estado.importacao = null;
    telaConfig();
  });

  document.getElementById('imp-mesclar')?.addEventListener('click', async () => {
    const p = estado.importacao.planos;
    try {
      await banco.gravarLotes(p);
      await carregarDados();
      estado.importacao = null;
      mostrarStatus('Mesclagem concluída. Nenhum dado existente foi alterado.');
      telaConfig();
    } catch (err) {
      mostrarStatus('Erro na mesclagem. Nada foi alterado: tente novamente.', true);
      console.error(err);
    }
  });

  document.getElementById('imp-substituir')?.addEventListener('click', async () => {
    const confirmacao = document.getElementById('imp-confirma').value.trim();
    if (confirmacao !== 'SUBSTITUIR') {
      return mostrarStatus('Digite SUBSTITUIR exatamente para confirmar.', true);
    }
    try {
      await banco.gravarLotes(estado.importacao.backup.dados, { substituir: true });
      await carregarDados();
      estado.importacao = null;
      mostrarStatus('Dados substituídos pelo backup.');
      telaConfig();
    } catch (err) {
      mostrarStatus('Erro ao substituir os dados. Os dados anteriores podem ter sido mantidos: confira antes de continuar.', true);
      console.error(err);
    }
  });
}

// ---------- Telas ainda não construídas ----------
function telaEmConstrucao(nome) {
  tela.innerHTML = `<div class="cartao"><p>${nome} ainda não está pronta. Será construída na próxima etapa.</p></div>`;
}

const telas = {
  inicio: telaInicio,
  produtos: telaProdutos,
  preparar: telaPreparar,
  compra: telaCompra,
  historico: telaHistorico,
  relatorios: telaRelatorios,
  config: telaConfig,
};

function irPara(nome) {
  estado.telaAtual = nome;
  botoes.forEach((b) => b.classList.toggle('ativa', b.dataset.tela === nome));
  telas[nome]();
  window.scrollTo(0, 0);
}

botoes.forEach((b) => b.addEventListener('click', () => irPara(b.dataset.tela)));

// Navegação por deslize: arrastar a tela para a esquerda avança; para a direita, volta.
const ORDEM_TELAS = ['inicio', 'preparar', 'compra', 'historico', 'produtos', 'relatorios', 'config'];
let toqueX = null;
let toqueY = null;
document.addEventListener('touchstart', (e) => {
  toqueX = e.touches[0].clientX;
  toqueY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  const dy = e.changedTouches[0].clientY - toqueY;
  toqueX = null;
  // Só conta como deslize se for horizontal, longo o bastante e não for rolagem vertical.
  if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const i = ORDEM_TELAS.indexOf(estado.telaAtual);
  const proxima = dx < 0 ? i + 1 : i - 1;
  if (proxima >= 0 && proxima < ORDEM_TELAS.length) irPara(ORDEM_TELAS[proxima]);
}, { passive: true });


async function iniciar() {
  try {
    await carregarDados();
    await garantirCadastroInicial();
    mostrarStatus('Salvo neste celular');
    irPara('inicio');
  } catch (err) {
    mostrarStatus('Não foi possível abrir o banco de dados deste navegador.', true);
    console.error(err);
  }
}

iniciar();

// Service worker: permite abrir o app sem internet e instalar na tela inicial.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker não registrado:', err));
}
