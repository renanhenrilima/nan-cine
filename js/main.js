// Maestro do Nan Cine: a sala de cinema, o ingresso (filtros), a roleta na tela,
// a revelação, "Meus filmes" e a sala ao vivo com os amigos.

import { CONFIG } from './config.js';
import { store } from './storage.js';
import * as api from './api.js';
import * as nuvem from './nuvem.js';
import { meus } from './dados.js';
import { sala } from './sala.js';
import { GENEROS, FILMES_DEMO } from './demo-data.js';
import { Roleta } from './wheel.js';
import { som } from './audio.js';
import { criarRevelacao } from './reveal.js';
import { htmlAvaliacao, ligarAvaliacoes, resumoDasNotas } from './avaliacao.js';
import { editarFoto } from './foto.js';
import {
  esc, esperar, avisar, numero, nota1, sortearUm, movimentoReduzido, vibrar,
} from './util.js';

const $ = (seletor) => document.querySelector(seletor);

/* ---------- Opções dos filtros ---------- */

const EPOCAS = [
  ['qualquer', 'Qualquer época'], ['cartaz', 'Em cartaz'], ['ano', 'Último ano'],
  ['2020', 'Anos 2020'], ['2010', 'Anos 2010'], ['2000', 'Anos 2000'],
  ['1990', 'Anos 90'], ['1980', 'Anos 80'], ['classicos', 'Até 1979'], ['custom', 'Escolher anos'],
];
const VOTOS = [
  ['0', 'Sem mínimo'], ['1000', '1 mil ou mais'], ['10000', '10 mil ou mais'],
  ['50000', '50 mil ou mais'], ['100000', '100 mil ou mais'],
];
const DURACOES = [
  ['qualquer', 'Qualquer duração'], ['curto', 'Até 1h30'], ['medio', 'De 1h30 a 2h'], ['longo', 'Mais de 2h'],
];
const ACHADOS = [
  ['qualquer', 'Tanto faz'], ['usuarios', 'Melhor avaliação dos usuários'],
  ['criticos', 'Melhor avaliação dos críticos'],
  ['joias', 'Joias escondidas'], ['premiados', 'Vencedores de prêmios'],
];
const DICAS_ACHADO = {
  usuarios: 'Filmes com nota alta no IMDb (7,5 ou mais) e muitas avaliações.',
  criticos: 'Filmes com média de 75 ou mais entre o Metacritic e o Rotten Tomatoes. A base de notas dos críticos cresce todo dia, então filmes menos conhecidos ainda podem faltar.',
  joias: 'Filmes bem avaliados (7 ou mais) que poucas pessoas viram.',
  premiados: 'Filmes que ganharam o prêmio escolhido. Os prêmios de música, como o Grammy, não entram: eles premiam discos, não filmes.',
};
const PORTUGUES = [
  ['qualquer', 'Tanto faz'], ['legendado', 'Legendado'], ['dublado', 'Dublado'],
];
const DICAS_PORTUGUES = {
  legendado: 'Sorteia só filmes disponíveis em serviços no Brasil, que trazem legenda em português.',
  dublado: 'Nem sempre é possível confirmar se o filme já tem dublagem em português: usamos os lançamentos nos cinemas do Brasil como pista. Para ver mais resultados, recomendamos usar “Tanto faz”.',
};
const COMBINAR = [['qualquer', 'pelo menos um deles'], ['todos', 'todos eles']];
const CLASSIFICACOES = [
  ['', 'Qualquer'], ['L', 'Livre'], ['10', '10 anos'], ['12', '12 anos'],
  ['14', '14 anos'], ['16', '16 anos'], ['18', '18 anos'],
];

const PADRAO = {
  generos: {}, combinar: 'qualquer',
  epoca: 'qualquer', anoDe: '', anoAte: '',
  notaMin: 0, votosMin: 1000, portugues: 'qualquer', duracao: 'qualquer', achado: 'qualquer',
  premios: [], provedores: [], classificacao: '',
};

// Opções de versões antigas do app, já renomeadas ou retiradas.
const PORTUGUES_ANTIGO = { disponivel: 'legendado', trailer: 'dublado', original: 'qualquer' };
const ACHADO_ANTIGO = { populares: 'qualquer', aclamados: 'usuarios' };

function normalizarFiltros(f) {
  const n = { ...PADRAO, ...(f || {}) };
  n.portugues = PORTUGUES_ANTIGO[n.portugues] || n.portugues;
  n.achado = ACHADO_ANTIGO[n.achado] || n.achado;
  delete n.idioma; // o filtro de idioma original foi retirado: o idioma é sempre o português do Brasil
  n.premios = [...(n.premios || [])];
  n.generos = { ...(n.generos || {}) };
  n.provedores = [...(n.provedores || [])];
  n.votosMin = Number(n.votosMin ?? PADRAO.votosMin) || 0;
  n.notaMin = Number(n.notaMin) || 0;
  return n;
}

let filtros = normalizarFiltros(store.get('filtros', {}));

/* ---------- Elementos ---------- */

const elCinema = $('#cinema');
const elRoleta = $('#roleta');
const btnGirar = $('#btn-girar');
const btnCubo = $('#btn-cubo');
const btnPronto = $('#btn-pronto');
const btnSituacao = $('#btn-situacao');
const elContagem = $('#contagem');
const elEspera = $('#sala-espera');
const dlgIngresso = $('#dlg-ingresso');
const dlgHistorico = $('#dlg-historico');
const dlgSala = $('#dlg-sala');
const dlgConta = $('#dlg-conta');

const roleta = new Roleta({
  canvas: $('#roda'),
  giro: $('#giro'),
  ponteiro: $('#ponteiro'),
  fatias: CONFIG.FATIAS,
  aoTique: (ritmo) => {
    som.tique(ritmo);
    if (ritmo < 0.3) vibrar(6);
  },
});

// Filmes tirados ao acaso do catálogo filtrado para a próxima rodada.
// Ficam escondidos: a roleta só mostra "????" e o sorteado aparece na revelação.
let amostra = [];
let estadoAtual = 'carregando';
let ocupado = false;
let contextoAberto = 'meus'; // de onde veio o filme aberto: 'meus' ou 'sala'

const revelacao = criarRevelacao({
  raiz: $('#revelacao'),
  rolagem: $('#res-rolagem'),
  fundo: $('#res-fundo'),
  canvasConfete: $('#confete'),
  aoFechar: async ({ girar: girarDeNovo }) => {
    acenderLuzes();
    await recarregarDisputa();
    if (girarDeNovo) {
      await esperar(350);
      girar();
    }
  },
  aoAcao: (tipo, filme) => decidir(tipo, filme),
  aoAvaliar: (filme, nota) => avaliarFilme(filme.id, nota, contextoAberto),
});

/* ---------- Lâmpadas da roleta ---------- */

function montarLampadas() {
  const total = 36;
  const caixa = $('#lampadas');
  caixa.style.setProperty('--n', total);
  caixa.innerHTML = Array.from({ length: total }, (_, i) => (
    `<span class="lampada" style="--i:${i};--f:${i % 3}"></span>`
  )).join('');
}

/* ---------- Estado da tela e dos comandos ---------- */

let acaoSituacao = null;

function definirEstado(estado, texto, acao = null) {
  estadoAtual = estado;
  elRoleta.dataset.estado = estado;
  if (texto !== undefined) {
    elContagem.textContent = texto;
    // No ingresso o texto cabe numa linha só: mensagens longas ficam só na tela principal.
    $('#ingresso-contagem').textContent = estado === 'vazio' ? 'Nenhum filme com esse ingresso'
      : estado === 'erro' ? 'Não foi possível buscar filmes' : texto;
  }
  acaoSituacao = acao?.fazer || null;
  btnSituacao.hidden = !acao;
  if (acao) btnSituacao.textContent = acao.rotulo;
  atualizarComandos();
}

btnSituacao.addEventListener('click', () => acaoSituacao?.());

function atualizarComandos() {
  const temFilmes = estadoAtual === 'pronto';
  const naSala = sala.ativa;
  btnPronto.hidden = !naSala;
  elEspera.hidden = !naSala || ocupado;

  if (naSala) {
    const eu = sala.euPronto();
    btnPronto.setAttribute('aria-pressed', String(eu));
    btnPronto.textContent = eu ? 'Pronto!' : 'Pronto';
    btnPronto.disabled = ocupado;
    const { faltam, todos } = sala.situacao();
    btnGirar.disabled = !temFilmes || !todos || ocupado;
    elEspera.textContent = todos
      ? 'Todos prontos! Qualquer um pode girar a roleta.'
      : `Esperando o PRONTO de: ${faltam.map((m) => (m.uid === sala.eu ? 'você' : primeiroNome(m.nome))).join(', ')}.`;
  } else {
    btnGirar.disabled = !temFilmes || ocupado;
  }
  btnCubo.disabled = btnGirar.disabled;
}

function textoContagem(total) {
  if (!api.modoAoVivo()) return `${total} de ${FILMES_DEMO.length} filmes de exemplo`;
  const aproximado = filtros.portugues === 'dublado' || Number(filtros.votosMin) > 0
    || (api.fonteDaNota() === 'imdb' && (Number(filtros.notaMin) > 0 || filtros.achado !== 'qualquer'));
  if (total === 1) return '1 filme';
  // Para "Dublado" o total conta os filmes antes de conferir o lançamento nos cinemas.
  if (filtros.portugues === 'dublado') return `Até ${numero(total)} filmes`;
  return `${aproximado ? 'Cerca de ' : ''}${numero(total)} filmes`;
}

let pedidoAtual = 0;

// Os últimos filmes sorteados neste aparelho: com filtros apertados, o mesmo filme não volta logo.
const RECENTES_MAX = 30;
const recentes = () => store.get('recentes', []);
function lembrarRecente(id) {
  store.set('recentes', [id, ...recentes().filter((x) => x !== id)].slice(0, RECENTES_MAX));
}

async function recarregarDisputa() {
  const meu = ++pedidoAtual;
  if (ocupado) return;
  definirEstado('carregando', 'Buscando filmes…');

  try {
    // Além de ocultos e assistidos, não repete os últimos filmes sorteados neste aparelho.
    const excluir = new Set([...(sala.ativa ? await sala.excluidos() : meus.excluidos()), ...recentes()]);
    const { total, filmes } = await api.sortearCandidatos(filtros, excluir, CONFIG.AMOSTRA);
    if (meu !== pedidoAtual) return;

    amostra = filmes;
    roleta.limparDestaque();
    if (!filmes.length) {
      definirEstado('vazio', 'Nenhum filme passou por esse ingresso. Baixe a nota mínima ou o mínimo de avaliações, ou amplie a época.', {
        rotulo: 'Abrir ingresso', fazer: abrirIngresso,
      });
      return;
    }
    definirEstado('pronto', textoContagem(total));
  } catch (erro) {
    if (meu !== pedidoAtual) return;
    amostra = [];
    const mensagem = erro instanceof api.ErroApi ? erro.message : 'Algo deu errado ao buscar os filmes. Tente de novo.';
    definirEstado('erro', mensagem, erro.tipo === 'chave'
      ? { rotulo: 'Conferir chave', fazer: abrirConfig }
      : { rotulo: 'Tentar de novo', fazer: recarregarDisputa });
    if (!(erro instanceof api.ErroApi)) console.error(erro);
  }
}

let recargaAgendada = null;
function agendarRecarga(ms = 400) {
  clearTimeout(recargaAgendada);
  recargaAgendada = setTimeout(() => {
    if (!ocupado && !revelacao.aberta) recarregarDisputa();
  }, ms);
}

/* ---------- A sessão: luzes, contagem, giro e revelação ---------- */

function apagarLuzes() {
  elCinema.dataset.luz = 'apagada';
  document.body.classList.add('apagado');
  som.luzes(true);
}

function acenderLuzes() {
  if (elCinema.dataset.luz === 'acesa') return;
  elCinema.dataset.luz = 'acesa';
  document.body.classList.remove('apagado');
  setTimeout(() => elCinema.dataset.luz === 'acesa' && som.ambiente(), 1500);
}

async function contagemRegressiva() {
  if (movimentoReduzido()) return;
  const lider = $('#lider');
  const numeroLider = $('#lider-numero');
  lider.hidden = false;
  for (const n of [3, 2, 1]) {
    numeroLider.textContent = n;
    som.contagem(n === 1);
    vibrar(18);
    await esperar(560);
  }
  lider.hidden = true;
}

function fecharDialogos() {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
}

/** Na sala o filme e o giro chegam pelo banco; sozinho, saem daqui. Todos veem a mesma sessão. */
async function executarSessao({ filme, parametros, anuncio = '', contexto = 'meus' }) {
  if (ocupado || revelacao.aberta) return;
  ocupado = true;
  pedidoAtual++; // descarta buscas que ainda estejam a caminho
  fecharDialogos();
  definirEstado('girando', 'Apagando as luzes…');

  const detalhes = api.detalhes(filme.id, filme.idioma);
  detalhes.then((d) => {
    // O cartaz e o fundo já vão carregando enquanto a roleta gira.
    for (const url of [d.posterGrande || d.poster, d.fundo]) {
      if (url) new Image().src = url;
    }
  }).catch(() => {});

  apagarLuzes();
  const desligarProjetor = som.projetor();
  await esperar(movimentoReduzido() ? 0 : 650);
  await contagemRegressiva();

  definirEstado('girando', anuncio ? `${anuncio}…` : 'Girando…');
  document.body.classList.add('girando');
  som.arrancada();
  await (roleta.girar(parametros) || Promise.resolve());

  document.body.classList.remove('girando');
  desligarProjetor();
  definirEstado('venceu', 'Parou! Abrindo a cortina…');
  som.fanfarra();
  vibrar([30, 60, 40]);
  await esperar(1250);

  ocupado = false;
  contextoAberto = contexto;
  lembrarRecente(filme.id);
  await revelacao.mostrar(filme, detalhes, { ...contextoDoFilme(filme.id, contexto), anuncio });
}

async function girar() {
  if (ocupado || !amostra.length || revelacao.aberta) return;
  const filme = sortearUm(amostra);
  const parametros = Roleta.parametros(CONFIG.FATIAS);

  if (!sala.ativa) {
    executarSessao({ filme, parametros, contexto: 'meus' });
    return;
  }
  if (!sala.situacao().todos) {
    avisar('Todos na sala precisam apertar PRONTO.');
    return;
  }
  btnGirar.disabled = true;
  try {
    const seq = await sala.girar(filme, parametros);
    if (!seq) avisar('Alguém ainda não está pronto.');
    // A sessão começa quando o giro chega pela sala, ao mesmo tempo para todos.
  } catch (erro) {
    avisar(erro.message || 'Não foi possível girar agora.');
  } finally {
    atualizarComandos();
  }
}

btnGirar.addEventListener('click', girar);
btnCubo.addEventListener('click', girar);

document.addEventListener('keydown', (evento) => {
  if (evento.code !== 'Space' || evento.repeat) return;
  if (evento.target.closest('input, select, textarea, button, a, dialog')) return;
  if (document.querySelector('dialog[open]') || revelacao.aberta) return;
  evento.preventDefault();
  girar();
});

/* ---------- Decisões e notas ---------- */

/** O que a revelação precisa saber sobre um filme: decisão já tomada e nota. */
function contextoDoFilme(id, contexto) {
  if (contexto === 'sala' && sala.ativa) {
    const item = sala.historico.find((h) => h.id === id);
    const d = sala.dados?.decisao;
    let decisao = null;
    if (item) decisao = { tipo: item.decisao, porNome: item.porNome, eu: item.por === sala.eu };
    else if (d && d.filmeId === id && d.tipo !== 'oculto') decisao = { tipo: d.tipo, porNome: d.porNome, eu: d.por === sala.eu };
    return { sala: true, decisao, nota: item?.notas?.[sala.eu] ?? null };
  }
  const registro = meus.registro(id);
  return {
    sala: false,
    decisao: registro ? { tipo: registro.decisao, eu: true } : null,
    nota: registro?.nota ?? null,
  };
}

async function decidir(tipo, filme) {
  if (contextoAberto === 'sala' && sala.ativa) {
    await sala.decidir(filme, tipo);
    if (tipo === 'oculto') {
      await meus.ocultar(filme).catch(() => {});
      avisar('Ocultado para a sala e para você.', {
        rotulo: 'Desfazer',
        fazer: async () => {
          await Promise.all([sala.desocultar(filme.id), meus.desocultar(filme.id)]).catch(() => {});
          agendarRecarga(0);
        },
      });
    }
    return true;
  }
  if (tipo === 'oculto') {
    await meus.ocultar(filme);
    avisar('Ocultado. Ele não sai mais nos seus sorteios.', {
      rotulo: 'Desfazer',
      fazer: async () => {
        await meus.desocultar(filme.id);
        agendarRecarga(0);
      },
    });
    return true;
  }
  await meus.registrar(filme, tipo);
  return true;
}

async function avaliarFilme(id, nota, contexto) {
  try {
    if (contexto === 'sala' && sala.ativa) await sala.avaliar(id, nota);
    else await meus.avaliar(id, nota);
    som.nota();
    avisar(`Nota ${nota1(nota)} salva.`);
  } catch (erro) {
    avisar('Não foi possível salvar a nota. Tente de novo.');
    console.warn(erro);
  }
}

/* ---------- Filtros (o ingresso) ---------- */

let temporizador = null;
let esperaSala = null;

function mudou({ imediato = false } = {}) {
  atualizarResumo();
  if (sala.ativa) {
    clearTimeout(esperaSala);
    esperaSala = setTimeout(() => {
      esperaSala = null;
      sala.mudarFiltros(filtros).catch(() => avisar('Não foi possível mudar o ingresso da sala.'));
    }, 600);
  } else {
    meus.salvarFiltros(filtros);
  }
  clearTimeout(temporizador);
  temporizador = setTimeout(recarregarDisputa, imediato ? 0 : 450);
}

function filtrosAtivos() {
  return [
    ...Object.values(filtros.generos).filter(Boolean),
    filtros.epoca !== 'qualquer',
    Number(filtros.notaMin) > 0,
    Number(filtros.votosMin) > 0,
    filtros.portugues !== 'qualquer',
    filtros.duracao !== 'qualquer',
    filtros.achado !== 'qualquer',
    filtros.provedores.length > 0,
    Boolean(filtros.classificacao),
  ].filter(Boolean).length;
}

function atualizarResumo() {
  const ativos = filtrosAtivos();
  $('#resumo-filtros').textContent = ativos === 0
    ? 'Sem filtros: qualquer filme pode sair.'
    : `${ativos} ${ativos === 1 ? 'filtro ativo' : 'filtros ativos'}. A roleta só sorteia o que passar por eles.`;
  const contador = $('#ingresso-contador');
  contador.hidden = ativos === 0;
  contador.textContent = ativos;
}

const htmlChips = (opcoes) => opcoes.map(([valor, rotulo]) => (
  `<button type="button" class="chip" data-valor="${valor}">${rotulo}</button>`
)).join('');

function chipsDeEscolha(caixa, opcoes, chave, converter = (v) => v) {
  caixa.innerHTML = htmlChips(opcoes);
  caixa.addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    filtros[chave] = converter(chip.dataset.valor);
    som.clique();
    sincronizar();
    mudou();
  });
}

const ROTULO_GENERO = { 1: 'incluído', '-1': 'excluído', 0: 'sem filtro' };

function montarFiltros() {
  // Gêneros: nada → incluir → excluir → nada
  const caixaGeneros = $('#f-generos');
  caixaGeneros.innerHTML = `<button type="button" class="chip" data-qualquer>Qualquer gênero</button>${GENEROS.map((g) => (
    `<button type="button" class="chip" data-id="${g.id}">${g.nome}</button>`
  )).join('')}`;
  caixaGeneros.addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    if (chip.hasAttribute('data-qualquer')) {
      filtros.generos = {};
      som.clique();
      sincronizar();
      mudou();
      return;
    }
    const { id } = chip.dataset;
    const atual = filtros.generos[id] || 0;
    const proximo = atual === 0 ? 1 : atual === 1 ? -1 : 0;
    if (proximo) filtros.generos[id] = proximo;
    else delete filtros.generos[id];
    som.clique();
    sincronizar();
    mudou();
  });

  chipsDeEscolha($('#f-combinar-opcoes'), COMBINAR, 'combinar');
  chipsDeEscolha($('#f-epoca'), EPOCAS, 'epoca');
  chipsDeEscolha($('#f-votos'), VOTOS, 'votosMin', Number);
  chipsDeEscolha($('#f-portugues'), PORTUGUES, 'portugues');
  chipsDeEscolha($('#f-duracao'), DURACOES, 'duracao');
  chipsDeEscolha($('#f-achado'), ACHADOS, 'achado');

  // Prêmios: "Qualquer prêmio" limpa; os demais se somam (basta ter ganho um deles).
  $('#f-premios').addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    if (chip.hasAttribute('data-qualquer')) filtros.premios = [];
    else {
      const chave = chip.dataset.valor;
      filtros.premios = filtros.premios.includes(chave)
        ? filtros.premios.filter((x) => x !== chave)
        : [...filtros.premios, chave];
    }
    som.clique();
    sincronizar();
    mudou();
  });

  for (const [campo, chave] of [['#f-ano-de', 'anoDe'], ['#f-ano-ate', 'anoAte']]) {
    $(campo).addEventListener('input', (evento) => {
      filtros[chave] = evento.target.value;
      mudou();
    });
  }

  $('#f-nota').addEventListener('input', (evento) => {
    filtros.notaMin = Number(evento.target.value);
    sincronizar();
    mudou();
  });

  const opcoes = (lista) => lista.map(([v, r]) => `<option value="${v}">${r}</option>`).join('');
  $('#f-classificacao').innerHTML = opcoes(CLASSIFICACOES);
  $('#f-classificacao').addEventListener('change', (evento) => {
    filtros.classificacao = evento.target.value;
    mudou();
  });

  $('#f-provedores').addEventListener('click', (evento) => {
    const botao = evento.target.closest('.provedor');
    if (!botao) return;
    if (botao.hasAttribute('data-todos')) {
      filtros.provedores = [];
    } else {
      const id = Number(botao.dataset.id);
      filtros.provedores = filtros.provedores.includes(id)
        ? filtros.provedores.filter((p) => p !== id)
        : [...filtros.provedores, id];
    }
    som.clique();
    sincronizar();
    mudou();
  });

  $('#btn-limpar').addEventListener('click', limparFiltros);
  $('#btn-limpar-topo').addEventListener('click', limparFiltros);
  $('#btn-surpresa').addEventListener('click', sortearFiltros);
}

/** Deixa todos os controles iguais ao objeto `filtros`. */
function sincronizar() {
  const semGenero = Object.keys(filtros.generos).length === 0;
  for (const chip of document.querySelectorAll('#f-generos .chip')) {
    if (chip.hasAttribute('data-qualquer')) {
      chip.setAttribute('aria-pressed', String(semGenero));
      continue;
    }
    const estado = filtros.generos[chip.dataset.id] || 0;
    chip.dataset.estado = estado === 1 ? 'incluir' : estado === -1 ? 'excluir' : '';
    chip.setAttribute('aria-pressed', String(estado !== 0));
    chip.setAttribute('aria-label', `${chip.textContent}: ${ROTULO_GENERO[estado]}`);
  }
  const incluidos = Object.values(filtros.generos).filter((v) => v === 1).length;
  $('#f-combinar').hidden = incluidos < 2;

  for (const [caixa, chave] of [
    ['#f-combinar-opcoes', 'combinar'], ['#f-epoca', 'epoca'], ['#f-votos', 'votosMin'],
    ['#f-portugues', 'portugues'], ['#f-duracao', 'duracao'], ['#f-achado', 'achado'],
  ]) {
    for (const chip of document.querySelectorAll(`${caixa} .chip`)) {
      chip.setAttribute('aria-pressed', String(chip.dataset.valor === String(filtros[chave])));
    }
  }

  $('#f-anos').hidden = filtros.epoca !== 'custom';
  $('#f-ano-de').value = filtros.anoDe;
  $('#f-ano-ate').value = filtros.anoAte;

  const nota = Number(filtros.notaMin) || 0;
  const campoNota = $('#f-nota');
  campoNota.value = nota;
  campoNota.style.setProperty('--preenchido', `${(nota / 9) * 100}%`);
  $('#f-nota-valor').textContent = nota ? `${nota1(nota)} ou mais` : 'Qualquer nota';

  $('#f-portugues-dica').textContent = DICAS_PORTUGUES[filtros.portugues] || '';
  $('#f-classificacao').value = filtros.classificacao;

  const premiados = filtros.achado === 'premiados';
  $('#campo-premios').hidden = !premiados;
  const cobertura = api.infoDosCriticos()?.comNota;
  $('#f-achado-dica').textContent = premiados ? ''
    : filtros.achado === 'criticos' && cobertura
      ? `${DICAS_ACHADO.criticos} Hoje a base tem notas de ${numero(cobertura)} filmes.`
      : (DICAS_ACHADO[filtros.achado] || '');
  $('#f-premios-dica').textContent = premiados ? DICAS_ACHADO.premiados : '';
  for (const chip of document.querySelectorAll('#f-premios .chip')) {
    chip.setAttribute('aria-pressed', String(chip.hasAttribute('data-qualquer')
      ? filtros.premios.length === 0
      : filtros.premios.includes(chip.dataset.valor)));
  }

  for (const botao of document.querySelectorAll('#f-provedores .provedor')) {
    botao.setAttribute('aria-pressed', String(botao.hasAttribute('data-todos')
      ? filtros.provedores.length === 0
      : filtros.provedores.includes(Number(botao.dataset.id))));
  }
  atualizarResumo();
}

/** "Limpar filtros": tudo em "qualquer", inclusive o mínimo de avaliações. */
function limparFiltros() {
  filtros = normalizarFiltros({ votosMin: 0 });
  som.clique();
  sincronizar();
  mudou({ imediato: true });
}

function sortearFiltros() {
  const novo = normalizarFiltros({ generos: { [sortearUm(GENEROS).id]: 1 } });
  if (api.modoAoVivo()) {
    novo.epoca = sortearUm(['qualquer', '2020', '2010', '2000', '1990', '1980', 'classicos']);
    novo.notaMin = sortearUm([0, 6, 6.5, 7, 7.5]);
    novo.achado = sortearUm(['qualquer', 'qualquer', 'usuarios', 'joias']);
  }
  filtros = novo;
  som.brilho();
  sincronizar();
  mudou({ imediato: true });
}

/** Troca os filtros na tela quando vierem de fora (outra conta, a sala, outro aparelho). */
function usarFiltros(novos) {
  const normalizados = normalizarFiltros(novos);
  if (JSON.stringify(normalizados) === JSON.stringify(filtros)) return false;
  filtros = normalizados;
  sincronizar();
  return true;
}

function abrirIngresso() {
  pintarIngresso();
  dlgIngresso.showModal();
}
$('#btn-ingresso').addEventListener('click', () => {
  som.clique();
  abrirIngresso();
});

function pintarIngresso() {
  $('#ingresso-titulo').textContent = sala.ativa ? 'Ingresso da sala' : 'Seu ingresso';
  $('#ingresso-aviso-sala').hidden = !sala.ativa;
}

/* ---------- Modo ao vivo × demonstração ---------- */

let provedoresCarregados = false;

async function aplicarModo() {
  const aoVivo = api.modoAoVivo();
  $('#faixa-demo').hidden = aoVivo;
  $('#btn-config').hidden = api.configuradoPeloDono();
  $('#campo-classificacao').hidden = !aoVivo;
  $('#campo-portugues').hidden = !aoVivo;
  const imdb = !aoVivo || api.fonteDaNota() === 'imdb';
  $('#f-nota-rotulo').textContent = imdb ? 'Nota mínima no IMDb' : 'Nota mínima no TMDB';
  $('#f-votos-rotulo').textContent = imdb ? 'Mínimo de avaliações no IMDb' : 'Mínimo de avaliações no TMDB';

  // Sem o catálogo ao vivo não há como saber de legenda, dublagem e prêmios.
  $('#f-portugues').innerHTML = htmlChips(PORTUGUES);
  if (!aoVivo) filtros.portugues = 'qualquer';
  const premiosOk = aoVivo && api.temPremios();
  const criticosOk = aoVivo && api.temCriticos();
  $('#f-achado').innerHTML = htmlChips(ACHADOS.filter(([valor]) => (premiosOk || valor !== 'premiados')
    && (criticosOk || valor !== 'criticos')));
  if (!premiosOk && filtros.achado === 'premiados') filtros.achado = 'qualquer';
  if (!criticosOk && filtros.achado === 'criticos') filtros.achado = 'qualquer';
  $('#f-premios').innerHTML = `<button type="button" class="chip" data-qualquer>Qualquer prêmio</button>${
    api.listaDePremios().map(([chave, nome]) => `<button type="button" class="chip" data-valor="${chave}">${esc(nome)}</button>`).join('')}`;
  sincronizar();

  const campoProvedores = $('#campo-provedores');
  campoProvedores.hidden = !aoVivo || !provedoresCarregados;
  if (aoVivo && !provedoresCarregados) {
    try {
      const lista = await api.provedoresBR();
      $('#f-provedores').innerHTML = `<button type="button" class="provedor provedor--todos" data-todos aria-pressed="true">Todos</button>${lista.map((p) => (
        `<button type="button" class="provedor" data-id="${p.id}" aria-pressed="false" aria-label="${esc(p.nome)}" title="${esc(p.nome)}">
          <img src="${esc(p.logo)}" alt="" loading="lazy" width="46" height="46">
        </button>`
      )).join('')}`;
      provedoresCarregados = lista.length > 0;
      campoProvedores.hidden = !provedoresCarregados;
      sincronizar();
    } catch {
      /* sem a lista de serviços o resto dos filtros continua valendo */
    }
  }
}

/* ---------- Plateia: as poltronas e quem está sentado ---------- */

const primeiroNome = (nome = '') => String(nome).trim().split(/\s+/)[0] || 'Alguém';

// Fotos de perfil: a minha vem do meu perfil; a dos outros é buscada uma vez por versão
// e guardada no aparelho (a sala só leva o número da versão, para não pesar).
const fotosGuardadas = new Map(); // uid → { v, url }
const fotosPedidas = new Set();

function pedirFoto(uid, v) {
  const chave = `${uid}:${v}`;
  if (fotosPedidas.has(chave)) return;
  fotosPedidas.add(chave);
  nuvem.fotoPropriaDe(uid).then((url) => {
    if (!url) return;
    const guardada = { v, url };
    fotosGuardadas.set(uid, guardada);
    store.set(`foto:${uid}`, guardada);
    pintarPlateia();
    if (dlgSala.open && sala.ativa) pintarDialogoSala();
  }).catch(() => fotosPedidas.delete(chave));
}

function urlDaFoto(pessoa) {
  if (pessoa.eu) return meus.fotoPropria || pessoa.foto || '';
  const v = pessoa.fotoV || 0;
  if (v) {
    const guardada = fotosGuardadas.get(pessoa.uid) || store.get(`foto:${pessoa.uid}`, null);
    if (guardada?.v === v) {
      fotosGuardadas.set(pessoa.uid, guardada);
      return guardada.url;
    }
    pedirFoto(pessoa.uid, v);
  }
  return pessoa.foto || '';
}

function htmlAvatar(pessoa, classe = '') {
  const url = urlDaFoto(pessoa);
  if (url) {
    return `<span class="avatar ${classe}"><img src="${esc(url)}" alt="" referrerpolicy="no-referrer" decoding="async"></span>`;
  }
  return `<span class="avatar ${classe}">${esc(primeiroNome(pessoa.nome).charAt(0))}</span>`;
}

function htmlPoltrona(m, fila, i, novos) {
  const numeroPoltrona = `${fila}${i + 1}`;
  if (!m) {
    return `<div class="poltrona"><div class="poltrona__encosto"></div><span class="poltrona__numero">${numeroPoltrona}</span></div>`;
  }
  const estado = !m.presente ? 'ausente' : m.pronto ? 'pronta' : '';
  const situacao = !m.presente ? 'ausente' : m.pronto ? 'PRONTO' : 'esperando';
  return `<div class="poltrona" title="${esc(m.nome)}: ${situacao}">
    <div class="pessoa ${estado ? `pessoa--${estado}` : ''} ${novos.has(m.uid) ? 'pessoa--chegou' : ''}">${htmlAvatar(m)}</div>
    <div class="poltrona__encosto"></div>
    <span class="placa ${estado ? `placa--${estado}` : ''}">${esc(m.eu ? 'Você' : primeiroNome(m.nome))}<small>${situacao}</small></span>
  </div>`;
}

let sentadosAntes = new Set();

function pintarPlateia() {
  const estreito = matchMedia('(max-width: 560px)').matches;
  const nFrente = estreito ? 4 : 5;
  const nFundo = estreito ? 5 : 7;
  const membros = sala.ativa ? sala.membros() : [];

  // As primeiras pessoas sentam no meio da fileira da frente; depois, atrás.
  const doMeio = (n) => [...Array(n).keys()].sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
  const lugares = [...doMeio(nFrente).map((i) => ['frente', i]), ...doMeio(nFundo).map((i) => ['fundo', i])];
  const ocupantes = { frente: Array(nFrente).fill(null), fundo: Array(nFundo).fill(null) };
  membros.slice(0, lugares.length).forEach((m, k) => {
    const [fila, i] = lugares[k];
    ocupantes[fila][i] = m;
  });

  const novos = new Set(membros.map((m) => m.uid).filter((uid) => !sentadosAntes.has(uid)));
  sentadosAntes = new Set(membros.map((m) => m.uid));

  for (const [fila, el, letra] of [['frente', $('#fileira-frente'), 'F'], ['fundo', $('#fileira-fundo'), 'G']]) {
    const html = ocupantes[fila].map((m, i) => htmlPoltrona(m, letra, i, novos)).join('');
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  }
}
matchMedia('(max-width: 560px)').addEventListener('change', pintarPlateia);
// A presença muda com o tempo, sem ninguém mexer: confere de 15 em 15 segundos.
setInterval(() => {
  if (!sala.ativa) return;
  pintarPlateia();
  atualizarComandos();
}, 15_000);

/* ---------- Página de entrada (login obrigatório) ---------- */

const entrada = $('#entrada');
const botaoGoogle = $('#btn-entrar-google');
const rotuloGoogle = $('#btn-entrar-google span').textContent;

/**
 * Estados da página de entrada: 'carregando' (ainda não sabemos se já há login), 'login',
 * 'erro' (sem conexão) e 'aberto' (entrou: mostra o app).
 */
function mostrarEntrada(estado) {
  const aberto = estado === 'aberto';
  entrada.hidden = aberto;
  entrada.dataset.estado = estado;
  // Enquanto a porta está fechada, nada do app recebe toque nem foco.
  for (const el of document.querySelectorAll('.topo, .faixa-demo, .faixa-sala, .cinema, .rodape')) el.inert = !aberto;
  if (estado === 'login') {
    botaoGoogle.disabled = false;
    botaoGoogle.querySelector('span').textContent = rotuloGoogle;
    botaoGoogle.focus({ preventScroll: true });
  }
}

function avisoDaEntrada(texto, comPlanoB = false) {
  $('#entrada-aviso').textContent = texto;
  $('#btn-entrar-aba').hidden = !comPlanoB;
}

// O botão abre a janelinha do Google direto do toque (senão o navegador a bloqueia).
botaoGoogle.addEventListener('click', async () => {
  botaoGoogle.disabled = true;
  botaoGoogle.querySelector('span').textContent = 'Aguardando o Google…';
  avisoDaEntrada('');
  try {
    await nuvem.entrar();
  } catch (erro) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(erro.code)) {
      avisoDaEntrada('O navegador bloqueou a janela do Google. Libere os pop-ups deste site ou entre por esta aba.', true);
    } else {
      console.warn(erro);
      avisoDaEntrada('Não foi possível entrar. Tente de novo.');
    }
  } finally {
    // Se entrou, a página some sozinha; se a pessoa fechou a janela, o botão volta.
    botaoGoogle.disabled = false;
    botaoGoogle.querySelector('span').textContent = rotuloGoogle;
  }
});
$('#btn-entrar-aba').addEventListener('click', () => {
  nuvem.entrarNestaAba().catch(() => avisoDaEntrada('Não foi possível entrar. Tente de novo.'));
});
$('#btn-entrada-tentar').addEventListener('click', () => location.reload());

/* ---------- Conta ---------- */

let nuvemPronta = false;
let convitePendente = null;
let linkDiretoFeito = false;

/** Abre o filme de um link compartilhado (?filme=ID), depois do login e do perfil. */
function tentarLinkDireto() {
  if (linkDiretoFeito || !meus.conta || !meus.perfilCompleto) return;
  linkDiretoFeito = true;
  abrirLinkDireto();
}

function pintarConta(conta) {
  const botao = $('#btn-conta');
  botao.hidden = !nuvemPronta;
  $('#conta-rotulo').textContent = conta ? primeiroNome(nuvem.perfilBasico(conta).nome) : 'Entrar';
  const foto = conta ? (meus.fotoPropria || conta.photoURL) : '';
  $('#conta-avatar').innerHTML = conta
    ? (foto
      ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer">`
      : esc(primeiroNome(nuvem.perfilBasico(conta).nome).charAt(0)))
    : '';
  botao.setAttribute('aria-label', conta ? `Sua conta: ${nuvem.perfilBasico(conta).nome}` : 'Entrar com sua conta Google');
}

/**
 * Entrar com Google: abre a janelinha do Google direto do toque no botão. Só se o navegador
 * bloquear a janela é que oferece entrar na própria aba.
 */
async function entrarNaConta() {
  try {
    await nuvem.entrar();
  } catch (erro) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(erro.code)) {
      avisar('O navegador bloqueou a janela de login. Libere os pop-ups deste site ou entre por esta aba.', {
        rotulo: 'Entrar nesta aba',
        fazer: () => nuvem.entrarNestaAba().catch(() => avisar('Não foi possível entrar. Tente de novo.')),
      });
      return;
    }
    console.warn(erro);
    avisar('Não foi possível entrar. Tente de novo.');
  }
}

/* ---------- Perfil: o meu e o de quem está nas minhas salas ---------- */

let perfilAberto = null; // { uid, proprio, perfil, historico, erro, carregando }
let editandoApelido = false;
let destinoFoto = 'perfil'; // para onde vai a foto escolhida: 'perfil' ou 'boasvindas'

function htmlItemPerfil(h, proprio) {
  const f = h.filme || {};
  const temNota = typeof h.nota === 'number';
  const original = f.original && f.original !== f.titulo ? `${esc(f.original)} · ` : '';
  const pendente = proprio
    ? `<button type="button" class="pendente" data-avaliar-pendente="${h.id}">Nota pendente · toque para avaliar</button>`
    : '<span class="pendente pendente--quieto">Sem nota ainda</span>';
  return `<li class="filme-item">
    ${capa(f)}
    <div class="filme-item__corpo">
      <div class="filme-item__titulo">
        <strong>${esc(f.titulo)}</strong>
        ${temNota ? `<span class="selo-nota" aria-label="Nota dada">${nota1(h.nota)}</span>` : ''}
      </div>
      <p class="filme-item__meta">${original}${esc(f.ano || '')} · ${rotuloDecisao(h.decisao)} em ${dataCurta(h.em)}</p>
      ${temNota ? '' : pendente}
    </div>
  </li>`;
}

function pintarDialogoConta() {
  const a = perfilAberto;
  if (!a) return;
  const proprio = a.proprio;
  const conta = meus.conta;
  const pessoa = proprio
    ? { ...nuvem.perfilBasico(conta), nome: meus.apelido || nuvem.perfilBasico(conta).nome, eu: true, uid: a.uid }
    : { uid: a.uid, nome: a.perfil?.apelido || '…', foto: a.perfil?.foto || '', fotoV: a.perfil?.fotoV || 0 };
  const lista = proprio ? meus.historico : (a.historico || []);
  const pendentes = lista.filter((h) => typeof h.nota !== 'number').length;

  const cabecalho = editandoApelido && proprio
    ? `<form class="apelido-form" data-conta-form="apelido">
        <label class="entrada">Apelido
          <input type="text" id="perfil-apelido" maxlength="20" value="${esc(meus.apelido)}" autocomplete="nickname" spellcheck="false">
        </label>
        <div class="janela__acoes">
          <button type="submit" class="botao botao--latao botao--compacto">Salvar</button>
          <button type="button" class="botao botao--liso-claro" data-conta="cancelar-apelido">Cancelar</button>
        </div>
        <p class="janela__aviso" id="perfil-aviso" role="status" aria-live="polite"></p>
      </form>`
    : `<div class="conta-perfil__texto">
        <strong class="conta-perfil__nome">${esc(pessoa.nome)}${proprio ? ' <small>(você)</small>' : ''}</strong>
        <span class="conta-perfil__dica">${proprio
          ? 'É assim que você aparece nas salas de cinema.'
          : 'Só quem divide uma sala com a pessoa vê este perfil.'}</span>
      </div>`;

  const acoes = proprio ? `
    <div class="janela__acoes">
      <button type="button" class="botao botao--contorno botao--compacto" data-conta="trocar-foto">Trocar foto</button>
      <button type="button" class="botao botao--contorno botao--compacto so-toque" data-conta="tirar-foto">Tirar foto</button>
      <button type="button" class="botao botao--contorno botao--compacto" data-conta="apelido">Mudar apelido</button>
    </div>
    <button type="button" class="botao botao--latao botao--larga" data-conta="salas">Ver salas de cinema</button>` : '';

  let filmes;
  if (a.carregando) filmes = '<p class="gaveta__vazio">Carregando os filmes…</p>';
  else if (a.erro) filmes = `<p class="janela__aviso" data-tipo="erro">${esc(a.erro)}</p>`;
  else if (!lista.length) {
    filmes = proprio
      ? '<p class="gaveta__vazio">Quando você escolher “Vamos assistir” ou “Já vi” num filme sorteado, ele aparece aqui, com a sua nota.</p>'
      : '<p class="gaveta__vazio">Esta pessoa ainda não marcou nenhum filme.</p>';
  } else {
    filmes = `<ul class="perfil-filmes">${lista.map((h) => htmlItemPerfil(h, proprio)).join('')}</ul>`;
  }

  $('#conta-titulo').textContent = proprio ? 'Seu perfil' : `Perfil de ${pessoa.nome}`;
  $('#conta-corpo').innerHTML = `
    <div class="conta-perfil">
      ${htmlAvatar(pessoa, 'avatar--grande')}
      ${cabecalho}
    </div>
    ${acoes}
    <section class="perfil-secao">
      <h3 class="gaveta-subtitulo">Filmes assistidos${a.carregando || a.erro ? '' : ` (${lista.length})`}</h3>
      ${pendentes && !a.carregando && !a.erro
        ? `<p class="gaveta__dica">${proprio
          ? `${pendentes} ${pendentes === 1 ? 'filme espera' : 'filmes esperam'} a sua nota. Toque em “Nota pendente” para avaliar.`
          : `${pendentes} ${pendentes === 1 ? 'filme ainda está' : 'filmes ainda estão'} sem nota.`}</p>` : ''}
      ${filmes}
    </section>
    ${proprio ? '<div class="janela__acoes"><button type="button" class="botao botao--liso-claro" data-conta="sair">Sair da conta</button></div>' : ''}`;
}

/** Abre o perfil de uma pessoa. O de outra pessoa só abre para quem divide uma sala com ela. */
async function abrirPerfilDe(uid) {
  if (!meus.conta) return;
  const proprio = uid === meus.conta.uid;
  editandoApelido = false;
  perfilAberto = { uid, proprio, carregando: !proprio, perfil: null, historico: [], erro: '' };
  pintarDialogoConta();
  if (!dlgConta.open) dlgConta.showModal();
  if (proprio) return;

  try {
    const [perfil, historico] = await Promise.all([nuvem.perfilDe(uid), nuvem.historicoDe(uid)]);
    if (perfilAberto?.uid !== uid) return;
    if (perfil.fotoPropria) {
      const guardada = { v: perfil.fotoV, url: perfil.fotoPropria };
      fotosGuardadas.set(uid, guardada);
      store.set(`foto:${uid}`, guardada);
    }
    Object.assign(perfilAberto, { perfil, historico, carregando: false });
  } catch (erro) {
    if (perfilAberto?.uid !== uid) return;
    console.warn(erro);
    Object.assign(perfilAberto, {
      carregando: false,
      erro: 'Não foi possível abrir este perfil. Ele só aparece para quem está na mesma sala que a pessoa.',
    });
  }
  pintarDialogoConta();
}

$('#btn-conta').addEventListener('click', () => {
  if (!meus.conta) {
    entrarNaConta();
    return;
  }
  abrirPerfilDe(meus.conta.uid);
});

$('#conta-corpo').addEventListener('click', async (evento) => {
  const pendente = evento.target.closest('[data-avaliar-pendente]');
  if (pendente) {
    abrirDialogoNota(Number(pendente.dataset.avaliarPendente));
    return;
  }
  const botao = evento.target.closest('[data-conta]');
  if (!botao) return;
  const acao = botao.dataset.conta;
  if (acao === 'trocar-foto') {
    destinoFoto = 'perfil';
    $('#foto-arquivo').click();
  }
  if (acao === 'tirar-foto') {
    destinoFoto = 'perfil';
    $('#foto-camera').click();
  }
  if (acao === 'apelido') {
    editandoApelido = true;
    pintarDialogoConta();
    $('#perfil-apelido')?.focus();
  }
  if (acao === 'cancelar-apelido') {
    editandoApelido = false;
    pintarDialogoConta();
  }
  if (acao === 'salas') {
    dlgConta.close();
    abrirSala();
  }
  if (acao === 'sair') {
    dlgConta.close();
    await sala.sair().catch(() => {});
    await nuvem.sair();
    avisar('Você saiu da conta.');
  }
});

$('#conta-corpo').addEventListener('submit', async (evento) => {
  const formulario = evento.target.closest('[data-conta-form="apelido"]');
  if (!formulario) return;
  evento.preventDefault();
  const apelido = $('#perfil-apelido').value.trim();
  const aviso = $('#perfil-aviso');
  if (!nuvem.apelidoValido(apelido)) {
    aviso.textContent = 'Use de 2 a 20 letras ou números.';
    aviso.dataset.tipo = 'erro';
    return;
  }
  try {
    await nuvem.salvarApelido(meus.conta.uid, apelido);
    nuvem.definirMeuApelido(apelido);
    await nuvem.apelidoNasSalas(meus.conta.uid, apelido, meus.salas.map((x) => x.codigo));
    editandoApelido = false;
    som.nota();
    avisar('Apelido atualizado.');
    pintarConta(meus.conta);
    pintarDialogoConta();
  } catch {
    aviso.textContent = 'Não foi possível salvar o apelido. Tente de novo.';
    aviso.dataset.tipo = 'erro';
  }
});

/* ---------- Foto escolhida (galeria ou câmera) ---------- */

let fotoBoasVindas = '';

async function aoEscolherFoto(evento) {
  const arquivo = evento.target.files?.[0];
  evento.target.value = '';
  if (!arquivo || !meus.conta) return;
  try {
    const texto = await editarFoto(arquivo); // posição e zoom; sai compactada
    if (!texto) return;
    if (destinoFoto === 'boasvindas') {
      fotoBoasVindas = texto;
      pintarBoasVindas();
      return;
    }
    await nuvem.salvarFotoPropria(meus.conta.uid, texto);
    som.nota();
    avisar('Foto atualizada.');
  } catch (erro) {
    avisar(erro.message || 'Não foi possível salvar a foto. Tente de novo.');
  }
}
$('#foto-arquivo').addEventListener('change', aoEscolherFoto);
$('#foto-camera').addEventListener('change', aoEscolherFoto);

/* ---------- Criar o perfil: apelido e foto obrigatórios ---------- */

const dlgBoasVindas = $('#dlg-boasvindas');

function pintarBoasVindas() {
  const apelido = $('#boasvindas-apelido').value.trim();
  const apelidoOk = nuvem.apelidoValido(apelido);
  $('#boasvindas-avatar').innerHTML = fotoBoasVindas
    ? `<img src="${esc(fotoBoasVindas)}" alt="Sua foto">`
    : esc(apelido.charAt(0).toUpperCase() || '?');
  $('#boasvindas-salvar').disabled = !(apelidoOk && fotoBoasVindas);
  const falta = [!fotoBoasVindas && 'a foto', !apelidoOk && 'o apelido'].filter(Boolean).join(' e ');
  const aviso = $('#boasvindas-aviso');
  aviso.dataset.tipo = '';
  aviso.textContent = falta ? `Falta ${falta}.` : 'Tudo pronto.';
}

/** Quem acabou de ligar a conta Google precisa criar o perfil antes de continuar. */
function verificarPerfil() {
  const precisa = Boolean(meus.conta) && meus.perfilPronto && !meus.perfilCompleto;
  if (precisa && !dlgBoasVindas.open) {
    fecharDialogos();
    fotoBoasVindas = meus.fotoPropria || '';
    $('#boasvindas-apelido').value = meus.apelido || '';
    dlgBoasVindas.showModal();
    pintarBoasVindas();
  } else if (!precisa && dlgBoasVindas.open) {
    dlgBoasVindas.close();
  }
}

// A janela não fecha com Esc nem com toque fora: só concluindo o perfil ou saindo da conta.
dlgBoasVindas.addEventListener('cancel', (evento) => evento.preventDefault());
$('#boasvindas-apelido').addEventListener('input', pintarBoasVindas);
$('#boasvindas-galeria').addEventListener('click', () => {
  destinoFoto = 'boasvindas';
  $('#foto-arquivo').click();
});
$('#boasvindas-camera').addEventListener('click', () => {
  destinoFoto = 'boasvindas';
  $('#foto-camera').click();
});
$('#boasvindas-sair').addEventListener('click', async () => {
  dlgBoasVindas.close();
  await nuvem.sair();
  avisar('Você saiu da conta.');
});
$('#boasvindas-salvar').addEventListener('click', async () => {
  const apelido = $('#boasvindas-apelido').value.trim();
  if (!nuvem.apelidoValido(apelido) || !fotoBoasVindas || !meus.conta) return;
  const botao = $('#boasvindas-salvar');
  botao.disabled = true;
  try {
    await nuvem.salvarPerfilInicial(meus.conta.uid, { apelido, fotoPropria: fotoBoasVindas });
    nuvem.definirMeuApelido(apelido);
    som.fanfarra();
    dlgBoasVindas.close();
    avisar(`Perfil criado. Bem-vindo, ${apelido}!`);
    pintarConta(meus.conta);
    tentarLinkDireto();
  } catch (erro) {
    console.warn(erro);
    const aviso = $('#boasvindas-aviso');
    aviso.textContent = 'Não foi possível salvar. Tente de novo.';
    aviso.dataset.tipo = 'erro';
    botao.disabled = false;
  }
});

/* ---------- Janelinha de avaliação (nota de um filme que já vi) ---------- */

const dlgNota = $('#dlg-nota');

function abrirDialogoNota(id) {
  const h = meus.historico.find((x) => x.id === id);
  if (!h) return;
  const f = h.filme || {};
  $('#nota-corpo').innerHTML = `
    <div class="filme-item filme-item--nota">
      ${capa(f)}
      <div class="filme-item__corpo">
        <strong>${esc(f.titulo)}</strong>
        <p class="filme-item__meta">${esc(f.ano || '')} · ${rotuloDecisao(h.decisao)}</p>
      </div>
    </div>
    ${htmlAvaliacao({ id, valor: h.nota, contexto: 'nota', rotulo: 'Que nota você dá?', botao: 'Salvar nota' })}`;
  dlgNota.showModal();
}
ligarAvaliacoes($('#nota-corpo'), async (id, nota) => {
  await avaliarFilme(id, nota, 'meus');
  dlgNota.close();
});

async function iniciarConta() {
  const fb = await nuvem.iniciarNuvem();
  nuvemPronta = Boolean(fb);
  pintarConta(null);
  if (!fb) {
    if (nuvem.ehLocal) {
      mostrarEntrada('aberto'); // teste local sem os emuladores: o app abre sem contas
    } else {
      $('#entrada-erro-texto').textContent = 'Não foi possível conectar ao Nan Cine. Confira sua internet e tente de novo.';
      mostrarEntrada('erro');
    }
    return;
  }

  let primeira = true;
  nuvem.aoMudarConta(async (conta) => {
    pintarConta(conta);
    // Uma falha no perfil não pode impedir a volta para a sala (e vice-versa).
    await meus.usarConta(conta).catch((erro) => console.warn('Perfil:', erro));
    if (!conta) {
      perfilAberto = null;
      for (const d of [dlgConta, dlgBoasVindas, dlgNota]) d.close();
    }
    verificarPerfil(); // primeiro acesso: abre a criação do perfil (apelido e foto) antes de tudo
    mostrarEntrada(conta ? 'aberto' : 'login');
    pintarConta(conta); // agora com o apelido e a foto do perfil
    if (!sala.ativa && meus.filtros) usarFiltros(meus.filtros);
    await sala.usarConta(conta).catch((erro) => console.warn('Sala:', erro));
    if (sala.ativa) usarFiltros(sala.dados.filtros);
    if (primeira) {
      primeira = false;
      tratarConviteNaUrl();
    }
    // O convite sobrevive ao login por redirecionamento (comum no celular).
    const convite = convitePendente || store.get('convite', null);
    if (conta && convite) {
      convitePendente = null;
      store.remover('convite');
      await entrarNaSala(convite);
    }
    pintarSala();
    recarregarDisputa();
    tentarLinkDireto();
  });
}

/* ---------- Sala de cinema ---------- */

function tratarConviteNaUrl() {
  const parametros = new URLSearchParams(location.search);
  const codigo = nuvem.normalizarCodigo(parametros.get('sala'));
  if (!codigo) return;
  parametros.delete('sala');
  const resto = parametros.toString();
  history.replaceState(null, '', `${location.pathname}${resto ? `?${resto}` : ''}`);
  if (meus.conta) entrarNaSala(codigo);
  else {
    convitePendente = codigo;
    store.set('convite', codigo);
    const convite = $('#entrada-convite');
    convite.textContent = `Você foi convidado para a sala ${codigo}. Entre para sentar com a turma.`;
    convite.hidden = false;
  }
}

async function entrarNaSala(codigo, fecharJanela = true) {
  try {
    await sala.entrar(codigo);
    som.entrou();
    avisar(`Você entrou na sala ${sala.dados?.nome || codigo}.`);
    if (fecharJanela && dlgSala.open) dlgSala.close();
    carregarSalasInfo();
    if (dlgSala.open) pintarDialogoSala();
  } catch (erro) {
    avisar(erro.message || 'Não foi possível entrar na sala.');
  }
}

// Nome e membros de cada sala da lista "Minhas salas" (buscados quando a janela abre).
const salasInfo = new Map();
async function carregarSalasInfo() {
  const codigos = meus.salas.map((x) => x.codigo);
  if (!codigos.length) return;
  const infos = await nuvem.lerSalas(codigos).catch(() => []);
  for (const info of infos) salasInfo.set(info.codigo, info);
  if (dlgSala.open) pintarDialogoSala();
}

function pintarSala() {
  const ativa = sala.ativa;
  $('#faixa-sala').hidden = !ativa;
  if (ativa) {
    $('#sala-nome').textContent = sala.dados.nome;
    $('#sala-codigo').textContent = sala.codigo;
  }
  $('#btn-sala').querySelector('.rotulo').textContent = ativa ? 'Na sala' : 'Sala';
  $('#historico-abas').hidden = !ativa;
  // A sala guarda a versão da minha foto: se mudou (ou eu acabei de entrar), atualiza.
  const euNaSala = ativa ? sala.dados.membros?.[sala.eu] : null;
  if (euNaSala && meus.perfilPronto && (euNaSala.fotoV || 0) !== meus.fotoV) {
    sala.atualizarMinhaFoto(meus.fotoV).catch(() => {});
  }
  pintarIngresso();
  pintarPlateia();
  atualizarComandos();
  atualizarContador();
  if (dlgSala.open) pintarDialogoSala();
}

function abrirSala(mensagem = '') {
  pintarDialogoSala(mensagem);
  if (!dlgSala.open) dlgSala.showModal();
  if (meus.conta) carregarSalasInfo();
}
$('#btn-sala').addEventListener('click', () => {
  som.clique();
  abrirSala();
});

function htmlMembrosDaSala(membros) {
  return `<ul class="membros">${membros.map((m) => `<li class="membro">
    <button type="button" class="membro__botao" data-perfil="${esc(m.uid)}" aria-label="Ver o perfil de ${esc(m.nome)}">
      ${htmlAvatar(m)}<span class="membro__nome">${esc(m.eu ? `${m.nome} (você)` : m.nome)}</span>
    </button>
    <span class="membro__estado ${m.pronto && m.presente ? 'membro__estado--pronto' : ''}">${!m.presente ? 'ausente' : m.pronto ? 'PRONTO' : 'esperando'}</span></li>`).join('')}</ul>`;
}

function htmlMinhasSalas() {
  const lista = meus.salas;
  if (!lista.length) return '';
  return `<h3 class="gaveta-subtitulo">Minhas salas</h3>
    <ul class="salas-lista">${lista.map((x) => {
      const info = salasInfo.get(x.codigo);
      const aqui = sala.ativa && sala.codigo === x.codigo;
      const sumiu = info?.existe === false;
      const nomes = info?.membros?.length ? info.membros.map((m) => primeiroNome(m.nome)).join(', ') : '';
      return `<li class="sala-item ${aqui ? 'sala-item--aqui' : ''}">
        <div class="sala-item__texto">
          <strong>${esc(info?.nome || x.nome)}</strong>
          <span>código ${esc(x.codigo)}</span>
          ${sumiu ? '<small>Esta sala não existe mais.</small>' : nomes ? `<small>${esc(nomes)}</small>` : ''}
        </div>
        <div class="sala-item__acoes">
          ${aqui ? '<span class="selo-aqui">Aqui</span>' : sumiu ? '' : `<button type="button" class="botao botao--mini" data-sala="ir" data-codigo="${esc(x.codigo)}">Entrar</button>`}
          <button type="button" class="link-pequeno" data-sala="deixar" data-codigo="${esc(x.codigo)}">Sair da sala</button>
        </div>
      </li>`;
    }).join('')}</ul>`;
}

function pintarDialogoSala(mensagem = '') {
  const corpo = $('#sala-corpo');
  const aviso = mensagem ? `<p class="janela__aviso" data-tipo="ok">${esc(mensagem)}</p>` : '';

  if (!nuvemPronta) {
    corpo.innerHTML = `<p class="janela__texto">As salas precisam de contas, e elas ainda não estão ligadas nesta versão do site.</p>`;
    return;
  }
  if (!meus.conta) {
    corpo.innerHTML = `${aviso}
      <p class="janela__texto">Numa sala, você e seus amigos sentam juntos, cada um no seu aparelho. Quando todos apertam PRONTO, qualquer um gira a roleta e todos veem o sorteio e o resultado ao mesmo tempo.</p>
      <div class="janela__acoes"><button type="button" class="botao botao--latao" data-sala="entrar-conta">Entrar com Google</button></div>`;
    return;
  }

  const ativa = sala.ativa
    ? `<p class="janela__texto">Você está em <strong>${esc(sala.dados.nome)}</strong>. Toque numa pessoa para ver o perfil dela. Mande o convite para quem vai assistir junto.</p>
      <div class="convite">
        <input type="text" readonly value="${esc(sala.linkDeConvite())}" aria-label="Link de convite" class="entrada-convite">
        <button type="button" class="botao botao--latao botao--compacto" data-sala="convidar">Convidar</button>
      </div>
      <h3 class="gaveta-subtitulo">Na sala</h3>
      ${htmlMembrosDaSala(sala.membros())}
      <div class="janela__acoes"><button type="button" class="botao botao--contorno botao--compacto" data-sala="desativar">Voltar ao sorteio sozinho</button></div>`
    : '';

  corpo.innerHTML = `${aviso}
    ${ativa}
    ${htmlMinhasSalas()}
    <h3 class="gaveta-subtitulo">${sala.ativa || meus.salas.length ? 'Outra sala' : 'Nova sala'}</h3>
    <p class="janela__texto">Crie uma sala e mande o convite, ou entre numa sala com o código que recebeu.</p>
    <label class="entrada">Nome da sala
      <input type="text" id="sala-novo-nome" maxlength="40" placeholder="Sessão de sexta">
    </label>
    <div class="janela__acoes"><button type="button" class="botao botao--latao" data-sala="criar">Criar sala</button></div>
    <p class="janela__ou">ou</p>
    <label class="entrada">Código da sala
      <input type="text" id="sala-codigo-entrar" class="codigo" maxlength="6" autocapitalize="characters" spellcheck="false" placeholder="K7P2QX">
    </label>
    <div class="janela__acoes"><button type="button" class="botao botao--contorno" data-sala="entrar">Entrar na sala</button></div>
    <p class="janela__aviso" id="sala-aviso" role="status" aria-live="polite"></p>`;
}

$('#sala-corpo').addEventListener('click', async (evento) => {
  const perfilBotao = evento.target.closest('[data-perfil]');
  if (perfilBotao) {
    abrirPerfilDe(perfilBotao.dataset.perfil);
    return;
  }
  const botao = evento.target.closest('[data-sala]');
  if (!botao) return;
  const acao = botao.dataset.sala;
  const aviso = (texto) => {
    const el = $('#sala-aviso');
    if (el) {
      el.textContent = texto;
      el.dataset.tipo = 'erro';
    } else avisar(texto);
  };

  if (acao === 'entrar-conta') entrarNaConta();
  if (acao === 'convidar') compartilharConvite();
  if (acao === 'desativar') {
    sala.desativar();
    pintarDialogoSala('Você voltou ao sorteio sozinho. A sala continua em “Minhas salas”.');
  }
  if (acao === 'ir') {
    botao.disabled = true;
    await entrarNaSala(botao.dataset.codigo, false);
  }
  if (acao === 'deixar') {
    const codigo = botao.dataset.codigo;
    const nome = salasInfo.get(codigo)?.nome || meus.salas.find((x) => x.codigo === codigo)?.nome || codigo;
    if (!window.confirm(`Sair da sala “${nome}”? Para voltar, vai precisar do código ${codigo}.`)) return;
    try {
      await sala.deixar(codigo);
      salasInfo.delete(codigo);
      avisar('Você saiu da sala.');
      pintarDialogoSala();
    } catch {
      avisar('Não foi possível sair da sala. Tente de novo.');
    }
  }
  if (acao === 'criar') {
    botao.disabled = true;
    try {
      await sala.criar($('#sala-novo-nome').value.trim(), filtros);
      som.entrou();
      carregarSalasInfo();
      pintarDialogoSala('Sala criada. Agora é só convidar.');
    } catch (erro) {
      aviso(erro.message || 'Não foi possível criar a sala.');
    } finally {
      botao.disabled = false;
    }
  }
  if (acao === 'entrar') {
    botao.disabled = true;
    await entrarNaSala($('#sala-codigo-entrar').value, false);
    botao.disabled = false;
  }
});
$('#sala-corpo').addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter') return;
  if (evento.target.id === 'sala-codigo-entrar') $('[data-sala="entrar"]')?.click();
  if (evento.target.id === 'sala-novo-nome') $('[data-sala="criar"]')?.click();
});
$('#sala-corpo').addEventListener('focusin', (evento) => {
  if (evento.target.classList.contains('entrada-convite')) evento.target.select();
});

async function compartilharConvite() {
  const link = sala.linkDeConvite();
  const texto = `Vem pra minha sala no Nan Cine: ${sala.dados?.nome || ''} (código ${sala.codigo})`;
  if (navigator.share) {
    navigator.share({ title: 'Nan Cine', text: texto, url: link }).catch(() => {});
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    avisar('Link do convite copiado.');
  } catch {
    abrirSala('Copie o link abaixo e mande para quem vai assistir junto.');
    $('.entrada-convite')?.focus();
  }
}

$('#btn-convidar').addEventListener('click', compartilharConvite);
$('#btn-salas-faixa').addEventListener('click', () => {
  som.clique();
  abrirSala();
});

btnPronto.addEventListener('click', async () => {
  if (!sala.ativa || ocupado) return;
  const vai = !sala.euPronto();
  som.pronto(vai);
  vibrar(vai ? 25 : 10);
  try {
    await sala.alternarPronto();
  } catch {
    avisar('Não foi possível marcar PRONTO. Tente de novo.');
  }
});

sala.aoMudar((tipo, info) => {
  if (tipo === 'sala') {
    if (!esperaSala && usarFiltros(sala.dados.filtros)) agendarRecarga(0);
    const chave = Object.keys(sala.dados.ocultos || {}).sort().join(',');
    if (chave !== chaveOcultosSala) {
      chaveOcultosSala = chave;
      if (dlgHistorico.open) desenharHistorico();
    }
    pintarSala();
  }
  if (tipo === 'giro') {
    const eu = info.por === sala.eu;
    (async () => {
      // Se a pessoa estava olhando outro filme, a cortina fecha para o giro da sala.
      if (revelacao.aberta) await revelacao.fechar();
      executarSessao({
        filme: info.filme,
        parametros: info,
        anuncio: eu ? 'Você girou a roleta' : `${primeiroNome(info.porNome)} girou a roleta`,
        contexto: 'sala',
      });
    })();
  }
  if (tipo === 'decisao') {
    const aberto = revelacao.filme;
    if (aberto && contextoAberto === 'sala' && aberto.id === info.filmeId && info.por !== sala.eu) {
      if (info.tipo === 'oculto') {
        avisar(`${primeiroNome(info.porNome)} ocultou este filme.`);
        revelacao.fechar();
      } else {
        revelacao.atualizarDecisao({ tipo: info.tipo, porNome: primeiroNome(info.porNome), eu: false });
      }
    }
  }
  if (tipo === 'entrou') {
    som.entrou();
    avisar(`${info.map(primeiroNome).join(', ')} entrou na sala.`);
  }
  if (tipo === 'aviso') {
    avisar(`${info} Confirme o PRONTO de novo.`);
  }
  if (tipo === 'historico') {
    atualizarContador();
    if (dlgHistorico.open) desenharHistorico();
  }
  if (tipo === 'saiu') {
    if (info) avisar(info);
    if (meus.filtros) usarFiltros(meus.filtros);
    pintarSala();
    if (dlgHistorico.open) desenharHistorico();
    agendarRecarga(0);
  }
});

/* ---------- Meus filmes e histórico da sala ---------- */

let abaHistorico = 'sala';
let chaveOcultosSala = '';

function pendentesMeus() {
  return meus.historico.filter((h) => h.nota == null);
}
function pendentesSala() {
  if (!sala.ativa) return [];
  return sala.historico.filter((h) => typeof h.notas?.[sala.eu] !== 'number');
}

function atualizarContador() {
  const total = pendentesMeus().length + pendentesSala().length;
  const contador = $('#historico-contador');
  contador.hidden = total === 0;
  contador.textContent = total;
}

const dataCurta = (t) => {
  const quando = nuvem.ms(t);
  return quando ? new Date(quando).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '';
};
const capa = (f) => (f.poster
  ? `<img src="${esc(f.poster)}" alt="" loading="lazy">`
  : '<span class="sem-capa"></span>');
const rotuloDecisao = (d) => (d === 'visto' ? 'Já vi' : 'Vamos assistir');

function itemMeu(h, { comNota }) {
  const f = h.filme || {};
  const original = f.original && f.original !== f.titulo ? `${esc(f.original)} · ` : '';
  return `<li class="filme-item">
    ${capa(f)}
    <div class="filme-item__corpo">
      <div class="filme-item__titulo">
        <button type="button" data-abrir="${h.id}" data-de="meus">${esc(f.titulo)}</button>
        ${h.nota != null ? `<span class="selo-nota" aria-label="Sua nota">${nota1(h.nota)}</span>` : ''}
      </div>
      <p class="filme-item__meta">${original}${esc(f.ano || '')} · ${rotuloDecisao(h.decisao)} em ${dataCurta(h.em)}</p>
      ${comNota ? htmlAvaliacao({ id: h.id, valor: h.nota, contexto: 'meus', botao: h.nota != null ? 'Atualizar nota' : 'Salvar nota' }) : ''}
      <div class="filme-item__acoes">
        ${!comNota ? `<button type="button" class="link-pequeno" data-mudar-nota="${h.id}">Mudar nota</button>` : ''}
        <button type="button" class="link-pequeno" data-tirar="${h.id}" data-de="meus">Tirar do histórico</button>
      </div>
    </div>
  </li>`;
}

function itemSala(h, barraAberta = false) {
  const f = h.filme || {};
  const membrosAgora = sala.dados?.membros || {};
  const { lista, media } = resumoDasNotas(h.notas, h.nomes, membrosAgora);
  const deram = new Set(lista.map((x) => x.uid));
  const faltam = (h.participantes || []).filter((uid) => !deram.has(uid))
    .map((uid) => primeiroNome(membrosAgora[uid]?.nome || h.nomes?.[uid] || ''))
    .filter((n) => n !== 'Alguém');
  const minha = h.notas?.[sala.eu];
  return `<li class="filme-item">
    ${capa(f)}
    <div class="filme-item__corpo">
      <div class="filme-item__titulo">
        <button type="button" data-abrir="${h.id}" data-de="sala">${esc(f.titulo)}</button>
        ${media != null ? `<span class="selo-nota" aria-label="Média da sala">${nota1(media)}</span>` : ''}
      </div>
      <p class="filme-item__meta">${esc(f.ano || '')} · ${rotuloDecisao(h.decisao)} · ${esc(primeiroNome(h.porNome))} em ${dataCurta(h.em)}</p>
      <div class="notas-sala">
        ${lista.map((x) => `<span>${esc(x.uid === sala.eu ? 'Você' : primeiroNome(x.nome))} ${nota1(x.nota)}</span>`).join('')}
        ${media != null && lista.length > 1 ? `<span class="media">Média ${nota1(media)}</span>` : ''}
        ${faltam.map((n) => `<span class="falta">${esc(n)}: falta</span>`).join('')}
      </div>
      ${typeof minha !== 'number'
        ? htmlAvaliacao({ id: h.id, contexto: 'sala' })
        : barraAberta
          ? htmlAvaliacao({ id: h.id, contexto: 'sala', valor: minha, botao: 'Atualizar nota' })
          : `<div class="filme-item__acoes"><button type="button" class="link-pequeno" data-mudar-nota="${h.id}" data-de="sala">Mudar minha nota</button></div>`}
    </div>
  </li>`;
}

function itemOculto(f, de) {
  return `<li class="filme-item">
    ${capa(f)}
    <div class="filme-item__corpo">
      <div class="filme-item__titulo"><strong>${esc(f.titulo)}</strong></div>
      <p class="filme-item__meta">${esc(f.ano || '')}</p>
      <div class="filme-item__acoes"><button type="button" class="link-pequeno" data-desocultar="${f.id}" data-de="${de}">Mostrar de novo nos sorteios</button></div>
    </div>
  </li>`;
}

const notasAbertas = new Set(); // itens com a barra de nota aberta para mudar

function desenharHistorico() {
  const naSala = sala.ativa;
  if (!naSala) abaHistorico = 'meus';
  $('#historico-titulo').textContent = naSala && abaHistorico === 'sala' ? 'Histórico da sala' : 'Meus filmes';
  for (const aba of document.querySelectorAll('#historico-abas .aba')) {
    aba.setAttribute('aria-selected', String(aba.dataset.aba === abaHistorico));
  }
  const corpo = $('#historico-corpo');
  corpo.innerHTML = abaHistorico === 'sala' ? htmlHistoricoSala() : htmlMeusFilmes();
}

function htmlMeusFilmes() {
  const pendentes = pendentesMeus();
  const avaliados = meus.historico.filter((h) => h.nota != null);
  const ocultos = Object.values(meus.ocultos);
  const semConta = nuvemPronta && !meus.conta
    ? '<p class="gaveta__dica">Entre com sua conta Google para guardar seus filmes, notas e filtros em qualquer aparelho.</p>'
    : '';
  return `${semConta}
    <section>
      <h3>Esperando sua nota</h3>
      ${pendentes.length
        ? `<ul>${pendentes.map((h) => itemMeu(h, { comNota: true })).join('')}</ul>`
        : '<p class="gaveta__vazio">Nada pendente. Quando escolher “Vamos assistir” ou “Já vi” num filme sorteado, ele aparece aqui para você dar a nota.</p>'}
    </section>
    <section>
      <h3>Já avaliados</h3>
      ${avaliados.length
        ? `<ul>${avaliados.map((h) => itemMeu(h, { comNota: notasAbertas.has(`meus:${h.id}`) })).join('')}</ul>`
        : '<p class="gaveta__vazio">Suas notas aparecem aqui.</p>'}
    </section>
    <section>
      <h3>Ocultos</h3>
      ${ocultos.length
        ? `<p class="gaveta__dica">Estes filmes não saem mais nos seus sorteios.</p><ul>${ocultos.map((f) => itemOculto(f, 'meus')).join('')}</ul>`
        : '<p class="gaveta__vazio">Toque na lixeira de um filme sorteado para ele não aparecer mais.</p>'}
    </section>`;
}

function htmlHistoricoSala() {
  const pendentes = pendentesSala();
  const outros = sala.historico.filter((h) => typeof h.notas?.[sala.eu] === 'number');
  const ocultos = Object.values(sala.dados?.ocultos || {});
  return `
    <section>
      <h3>Esperando sua nota</h3>
      ${pendentes.length
        ? `<ul>${pendentes.map((h) => itemSala(h)).join('')}</ul>`
        : '<p class="gaveta__vazio">Você já deu nota para todos os filmes da sala.</p>'}
    </section>
    <section>
      <h3>Filmes da sala</h3>
      ${outros.length
        ? `<ul>${outros.map((h) => itemSala(h, notasAbertas.has(`sala:${h.id}`))).join('')}</ul>`
        : '<p class="gaveta__vazio">Os filmes que a sala escolher com “Vamos assistir” ou “Já vi” ficam aqui, com a nota de cada um.</p>'}
    </section>
    <section>
      <h3>Ocultos da sala</h3>
      ${ocultos.length
        ? `<ul>${ocultos.map((f) => itemOculto(f, 'sala')).join('')}</ul>`
        : '<p class="gaveta__vazio">Nenhum filme oculto na sala.</p>'}
    </section>`;
}

$('#btn-historico').addEventListener('click', () => {
  som.clique();
  if (sala.ativa && !dlgHistorico.open) abaHistorico = pendentesSala().length || !pendentesMeus().length ? 'sala' : 'meus';
  desenharHistorico();
  dlgHistorico.showModal();
});

$('#historico-abas').addEventListener('click', (evento) => {
  const aba = evento.target.closest('.aba');
  if (!aba) return;
  abaHistorico = aba.dataset.aba;
  desenharHistorico();
});

ligarAvaliacoes($('#historico-corpo'), async (id, nota, contexto) => {
  notasAbertas.delete(`${contexto}:${id}`);
  await avaliarFilme(id, nota, contexto);
});

$('#historico-corpo').addEventListener('click', async (evento) => {
  const mudar = evento.target.closest('[data-mudar-nota]');
  if (mudar) {
    notasAbertas.add(`${mudar.dataset.de || 'meus'}:${mudar.dataset.mudarNota}`);
    desenharHistorico();
    return;
  }
  const tirar = evento.target.closest('[data-tirar]');
  if (tirar) {
    const id = Number(tirar.dataset.tirar);
    await meus.remover(id);
    avisar('Tirado do histórico. Ele pode voltar a sair no sorteio.');
    agendarRecarga();
    return;
  }
  const desocultar = evento.target.closest('[data-desocultar]');
  if (desocultar) {
    const id = Number(desocultar.dataset.desocultar);
    if (desocultar.dataset.de === 'sala') await sala.desocultar(id);
    else await meus.desocultar(id);
    avisar('Pronto: ele volta a sair nos sorteios.');
    agendarRecarga();
    return;
  }
  const abrir = evento.target.closest('[data-abrir]');
  if (abrir && !ocupado) {
    const id = Number(abrir.dataset.abrir);
    const de = abrir.dataset.de;
    const item = (de === 'sala' ? sala.historico : meus.historico).find((h) => h.id === id);
    if (!item) return;
    dlgHistorico.close();
    contextoAberto = de;
    const base = { ...item.filme, data: item.filme.ano ? `${item.filme.ano}-01-01` : '' };
    revelacao.mostrar(base, api.detalhes(id, item.filme.idioma), {
      ...contextoDoFilme(id, de),
      anuncio: de === 'sala' ? 'Do histórico da sala' : 'Dos seus filmes',
    });
  }
});

meus.aoMudar((origem) => {
  if (origem === 'foto' || origem === 'cadastro') {
    pintarConta(meus.conta);
    verificarPerfil();
    pintarSala();
    if (dlgConta.open && perfilAberto?.proprio) pintarDialogoConta();
  }
  if (origem === 'cadastro' && dlgSala.open) pintarDialogoSala();
  if (origem === 'historico' && dlgConta.open && perfilAberto?.proprio) pintarDialogoConta();
  if ((origem === 'filtros' || origem === 'perfil') && !sala.ativa && meus.filtros) {
    if (usarFiltros(meus.filtros)) agendarRecarga(0);
  }
  if (origem === 'historico' || origem === 'ocultos') {
    atualizarContador();
    if (dlgHistorico.open) desenharHistorico();
  }
});

/* ---------- Som ---------- */

const btnSom = $('#btn-som');
function pintarSom() {
  btnSom.setAttribute('aria-pressed', String(som.ativo));
  btnSom.setAttribute('aria-label', som.ativo ? 'Som ligado' : 'Som desligado');
}
btnSom.addEventListener('click', () => {
  som.alternar();
  pintarSom();
  if (som.ativo && elCinema.dataset.luz === 'acesa') som.ambiente();
});

// O burburinho da plateia começa no primeiro toque (o navegador só libera som depois disso).
// O navegador só libera som depois do primeiro toque ou tecla: a trilha e os sussurros começam aí
// (já na página de entrada).
const comecarAmbiente = () => {
  if (elCinema.dataset.luz === 'acesa') som.ambiente();
  for (const tipo of ['pointerdown', 'touchstart', 'keydown', 'click']) document.removeEventListener(tipo, comecarAmbiente);
};
for (const tipo of ['pointerdown', 'touchstart', 'keydown', 'click']) document.addEventListener(tipo, comecarAmbiente);

/* ---------- Configuração das chaves ---------- */

const dlgConfig = $('#dlg-config');
const cfgAviso = $('#cfg-aviso');

function avisoConfig(texto, tipo = '') {
  cfgAviso.textContent = texto;
  cfgAviso.dataset.tipo = tipo;
}

function abrirConfig() {
  const salvas = store.get('chaves', {});
  $('#cfg-tmdb').value = salvas.tmdb || '';
  $('#cfg-omdb').value = salvas.omdb || '';
  avisoConfig('As chaves ficam guardadas só neste navegador.');
  dlgConfig.showModal();
}

$('#btn-config').addEventListener('click', abrirConfig);
$('#btn-conectar').addEventListener('click', abrirConfig);

$('#form-config').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const tmdb = $('#cfg-tmdb').value.trim();
  const omdb = $('#cfg-omdb').value.trim();

  if (tmdb) {
    avisoConfig('Testando a chave no TMDB…');
    $('#cfg-salvar').disabled = true;
    try {
      await api.testarChave(tmdb);
    } catch (erro) {
      avisoConfig(erro.message || 'Não foi possível testar a chave.', 'erro');
      $('#cfg-salvar').disabled = false;
      return;
    }
    $('#cfg-salvar').disabled = false;
  }

  store.set('chaves', { tmdb, omdb });
  dlgConfig.close();
  avisar(tmdb ? 'Chave salva. Catálogo ao vivo ligado.' : 'Sem chave do TMDB: modo demonstração.');
  await aplicarModo();
  mudou({ imediato: true });
});

$('#cfg-remover').addEventListener('click', async () => {
  store.set('chaves', {});
  dlgConfig.close();
  avisar('Chaves removidas deste navegador.');
  await aplicarModo();
  mudou({ imediato: true });
});

for (const botao of document.querySelectorAll('[data-fechar]')) {
  botao.addEventListener('click', () => botao.closest('dialog').close());
}
// Clique fora da janela (no fundo escurecido) também fecha.
for (const dialogo of document.querySelectorAll('dialog')) {
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo && !dialogo.hasAttribute('data-obrigatorio')) dialogo.close();
  });
}

/* ---------- Rodapé e link direto ---------- */

function pintarRodape() {
  const info = api.infoImdb();
  if (!info?.atualizado) return;
  const dia = new Date(info.atualizado).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#rodape-fontes').append(` Notas do IMDb atualizadas em ${dia}.`);
}

async function abrirLinkDireto() {
  const id = Number(new URLSearchParams(location.search).get('filme'));
  if (!id || !api.modoAoVivo()) return;
  try {
    const filme = await api.detalhes(id);
    contextoAberto = 'meus';
    await revelacao.mostrar(filme, filme, { ...contextoDoFilme(id, 'meus'), anuncio: 'Indicaram para você' });
  } catch {
    avisar('Não foi possível abrir o filme deste link.');
  }
}

/* ---------- Instalar como aplicativo (PWA) ---------- */

let conviteDeInstalacao = null;
window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  conviteDeInstalacao = evento;
  $('#btn-instalar').hidden = false;
});
$('#btn-instalar').addEventListener('click', async () => {
  if (!conviteDeInstalacao) return;
  conviteDeInstalacao.prompt();
  await conviteDeInstalacao.userChoice.catch(() => {});
  conviteDeInstalacao = null;
  $('#btn-instalar').hidden = true;
});
window.addEventListener('appinstalled', () => {
  $('#btn-instalar').hidden = true;
  avisar('Nan Cine instalado.');
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- Largada ---------- */

async function iniciar() {
  // Com contas ligadas o login é obrigatório: a página de entrada cobre o app até saber quem é.
  // Já aproveita para baixar o Firebase enquanto o resto carrega.
  if (nuvem.nuvemDisponivel()) {
    mostrarEntrada('carregando');
    nuvem.iniciarNuvem();
  } else {
    mostrarEntrada('aberto');
  }
  montarLampadas();
  montarFiltros();
  await meus.usarConta(null);
  if (meus.filtros) filtros = normalizarFiltros(meus.filtros);
  sincronizar();
  pintarSom();
  pintarPlateia();
  atualizarContador();
  atualizarComandos();
  document.fonts?.ready.then(() => roleta.desenhar());

  await Promise.all([api.prepararImdb(), api.prepararPremios(), api.prepararCriticos()]);
  pintarRodape();
  await aplicarModo();
  $('#btn-sala').hidden = false;
  iniciarConta();
  await recarregarDisputa();
  if (!nuvem.nuvemDisponivel()) abrirLinkDireto();
}

iniciar();
