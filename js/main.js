// Maestro do Nan Cine: liga os filtros (o "ingresso"), a roleta e a revelação.

import { CONFIG } from './config.js';
import { store, listas } from './storage.js';
import * as api from './api.js';
import { GENEROS, FILMES_DEMO } from './demo-data.js';
import { Roleta } from './wheel.js';
import { som } from './audio.js';
import { criarRevelacao } from './reveal.js';
import { esc, esperar, avisar, numero, nota1, sortearUm } from './util.js';

const $ = (seletor) => document.querySelector(seletor);

/* ---------- Opções dos filtros ---------- */

const EPOCAS = [
  ['qualquer', 'Qualquer época'], ['cartaz', 'Em cartaz'], ['ano', 'Último ano'],
  ['2020', 'Anos 2020'], ['2010', 'Anos 2010'], ['2000', 'Anos 2000'],
  ['1990', 'Anos 90'], ['1980', 'Anos 80'], ['classicos', 'Até 1979'], ['custom', 'Escolher anos'],
];
const DURACOES = [
  ['qualquer', 'Qualquer duração'], ['curto', 'Até 1h30'], ['medio', 'De 1h30 a 2h'], ['longo', 'Mais de 2h'],
];
const ACHADOS = [
  ['qualquer', 'Tanto faz'], ['populares', 'Populares'], ['aclamados', 'Aclamados'], ['joias', 'Joias escondidas'],
];
const PORTUGUES = [
  ['qualquer', 'Tanto faz'], ['disponivel', 'Legendado ou dublado'],
  ['dublado', 'Dublado'], ['original', 'Áudio original em português'],
];
const DICAS_PORTUGUES = {
  disponivel: 'Sorteia só filmes disponíveis em serviços no Brasil, que trazem legenda em português e, muitas vezes, dublagem.',
  dublado: 'Sorteia só filmes com trailer dublado cadastrado no Brasil. É o sinal mais seguro de dublagem, mas deixa de fora filmes dublados que não têm trailer.',
  original: 'Sorteia só filmes falados em português.',
};
const COMBINAR = [['qualquer', 'pelo menos um deles'], ['todos', 'todos eles']];
const IDIOMAS = [
  ['', 'Qualquer idioma'], ['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol'], ['fr', 'Francês'],
  ['it', 'Italiano'], ['de', 'Alemão'], ['ja', 'Japonês'], ['ko', 'Coreano'], ['zh', 'Chinês'],
  ['hi', 'Hindi'], ['ru', 'Russo'], ['sv', 'Sueco'], ['da', 'Dinamarquês'], ['tr', 'Turco'],
];
const CLASSIFICACOES = [
  ['', 'Qualquer'], ['L', 'Livre'], ['10', '10 anos'], ['12', '12 anos'],
  ['14', '14 anos'], ['16', '16 anos'], ['18', '18 anos'],
];

const PADRAO = {
  generos: {}, combinar: 'qualquer',
  epoca: 'qualquer', anoDe: '', anoAte: '',
  notaMin: 0, portugues: 'qualquer', duracao: 'qualquer', achado: 'qualquer',
  provedores: [], idioma: '', classificacao: '',
};

let filtros = { ...PADRAO, ...store.get('filtros', {}) };
filtros.generos = { ...(filtros.generos || {}) };
filtros.provedores = [...(filtros.provedores || [])];

/* ---------- Elementos ---------- */

const elRoleta = $('#roleta');
const btnGirar = $('#btn-girar');
const elContagem = $('#contagem');
const btnSituacao = $('#btn-situacao');

const roleta = new Roleta({
  canvas: $('#roda'),
  giro: $('#giro'),
  ponteiro: $('#ponteiro'),
  fatias: CONFIG.FATIAS,
  aoTique: (ritmo) => som.tique(ritmo),
});

// Filmes tirados ao acaso do catálogo filtrado para a próxima rodada.
// Ficam escondidos: a roleta só mostra "????" e o sorteado aparece na revelação.
let amostra = [];

const revelacao = criarRevelacao({
  raiz: $('#revelacao'),
  rolagem: $('#res-rolagem'),
  fundo: $('#res-fundo'),
  canvasConfete: $('#confete'),
  aoFechar: async ({ girar: girarDeNovo }) => {
    await recarregarDisputa();
    if (girarDeNovo) {
      await esperar(350);
      girar();
    }
  },
});

/* ---------- Lâmpadas do letreiro ---------- */

function montarLampadas() {
  const total = 36;
  const caixa = $('#lampadas');
  caixa.style.setProperty('--n', total);
  caixa.innerHTML = Array.from({ length: total }, (_, i) => (
    `<span class="lampada" style="--i:${i};--f:${i % 3}"></span>`
  )).join('');
}

/* ---------- Estado da roleta ---------- */

let acaoSituacao = null;
let ocupado = false;

function definirEstado(estado, texto, acao = null) {
  elRoleta.dataset.estado = estado;
  btnGirar.disabled = estado !== 'pronto';
  if (texto !== undefined) elContagem.textContent = texto;
  acaoSituacao = acao?.fazer || null;
  btnSituacao.hidden = !acao;
  if (acao) btnSituacao.textContent = acao.rotulo;
}

btnSituacao.addEventListener('click', () => acaoSituacao?.());

function textoContagem(total) {
  if (!api.modoAoVivo()) {
    return `${total} de ${FILMES_DEMO.length} filmes de exemplo combinam com seu ingresso`;
  }
  const aproximado = filtros.portugues === 'dublado'
    || (api.fonteDaNota() === 'imdb' && (Number(filtros.notaMin) > 0 || filtros.achado !== 'qualquer'));
  if (total === 1) return '1 filme combina com seu ingresso';
  return `${aproximado ? 'Cerca de ' : ''}${numero(total)} filmes combinam com seu ingresso`;
}

let pedidoAtual = 0;

async function recarregarDisputa() {
  const meu = ++pedidoAtual;
  if (ocupado) return;
  definirEstado('carregando', 'Buscando filmes…');

  try {
    const vistos = new Set(listas.vistos().map((f) => f.id));
    const { total, filmes } = await api.sortearCandidatos(filtros, vistos, CONFIG.AMOSTRA);
    if (meu !== pedidoAtual) return;

    amostra = filmes;
    roleta.limparDestaque();
    if (!filmes.length) {
      definirEstado('vazio', 'Nenhum filme passou por esses filtros. Baixe a nota mínima ou amplie a época.', {
        rotulo: 'Limpar filtros', fazer: limparFiltros,
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

/* ---------- Girar ---------- */

async function girar() {
  if (ocupado || !amostra.length || revelacao.aberta) return;
  const fim = roleta.girar();
  if (!fim) return;

  ocupado = true;
  pedidoAtual++; // descarta buscas que ainda estejam a caminho
  definirEstado('girando', 'Girando…');
  document.body.classList.add('girando');
  som.arrancada();

  // O sorteio não depende da fatia em que a roda para: o filme sai da amostra
  // tirada de todo o catálogo filtrado. Os detalhes já vêm enquanto ela gira.
  const filme = sortearUm(amostra);
  const detalhes = api.detalhes(filme.id, filme.idioma);
  detalhes.catch(() => {});

  await fim;
  document.body.classList.remove('girando');
  definirEstado('venceu', 'Parou! Abrindo a cortina…');
  som.fanfarra();
  await esperar(1250);

  ocupado = false;
  await revelacao.mostrar(filme, detalhes);
}

btnGirar.addEventListener('click', girar);

document.addEventListener('keydown', (evento) => {
  if (evento.code !== 'Space' || evento.repeat) return;
  if (evento.target.closest('input, select, textarea, button, a, dialog')) return;
  if (document.querySelector('dialog[open]') || revelacao.aberta) return;
  evento.preventDefault();
  girar();
});

/* ---------- Filtros ---------- */

let temporizador = null;

function mudou({ imediato = false } = {}) {
  store.set('filtros', filtros);
  atualizarResumo();
  clearTimeout(temporizador);
  temporizador = setTimeout(recarregarDisputa, imediato ? 0 : 450);
}

function atualizarResumo() {
  const ativos = [
    ...Object.values(filtros.generos).filter(Boolean),
    filtros.epoca !== 'qualquer',
    Number(filtros.notaMin) > 0,
    filtros.portugues !== 'qualquer',
    filtros.duracao !== 'qualquer',
    filtros.achado !== 'qualquer',
    filtros.provedores.length > 0,
    Boolean(filtros.idioma),
    Boolean(filtros.classificacao),
  ].filter(Boolean).length;

  $('#resumo-filtros').textContent = ativos === 0
    ? 'Sem filtros: qualquer filme pode sair.'
    : `${ativos} ${ativos === 1 ? 'filtro ativo' : 'filtros ativos'}. A roleta só sorteia o que passar por eles.`;
}

const htmlChips = (opcoes) => opcoes.map(([valor, rotulo]) => (
  `<button type="button" class="chip" data-valor="${valor}">${rotulo}</button>`
)).join('');

function chipsDeEscolha(caixa, opcoes, chave) {
  caixa.innerHTML = htmlChips(opcoes);
  caixa.addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    filtros[chave] = chip.dataset.valor;
    som.clique();
    sincronizar();
    mudou();
  });
}

const ROTULO_GENERO = { 1: 'incluído', '-1': 'excluído', 0: 'sem filtro' };

function montarFiltros() {
  // Gêneros: nada → incluir → excluir → nada
  const caixaGeneros = $('#f-generos');
  caixaGeneros.innerHTML = GENEROS.map((g) => (
    `<button type="button" class="chip" data-id="${g.id}">${g.nome}</button>`
  )).join('');
  caixaGeneros.addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
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
  chipsDeEscolha($('#f-portugues'), PORTUGUES, 'portugues');
  chipsDeEscolha($('#f-duracao'), DURACOES, 'duracao');
  chipsDeEscolha($('#f-achado'), ACHADOS, 'achado');

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
  $('#f-idioma').innerHTML = opcoes(IDIOMAS);
  $('#f-classificacao').innerHTML = opcoes(CLASSIFICACOES);
  $('#f-idioma').addEventListener('change', (evento) => {
    filtros.idioma = evento.target.value;
    mudou();
  });
  $('#f-classificacao').addEventListener('change', (evento) => {
    filtros.classificacao = evento.target.value;
    mudou();
  });

  $('#f-provedores').addEventListener('click', (evento) => {
    const botao = evento.target.closest('.provedor');
    if (!botao) return;
    const id = Number(botao.dataset.id);
    filtros.provedores = filtros.provedores.includes(id)
      ? filtros.provedores.filter((p) => p !== id)
      : [...filtros.provedores, id];
    som.clique();
    sincronizar();
    mudou();
  });

  $('#btn-limpar').addEventListener('click', limparFiltros);
  $('#btn-surpresa').addEventListener('click', sortearFiltros);
}

/** Deixa todos os controles iguais ao objeto `filtros`. */
function sincronizar() {
  for (const chip of document.querySelectorAll('#f-generos .chip')) {
    const estado = filtros.generos[chip.dataset.id] || 0;
    chip.dataset.estado = estado === 1 ? 'incluir' : estado === -1 ? 'excluir' : '';
    chip.setAttribute('aria-pressed', String(estado !== 0));
    chip.setAttribute('aria-label', `${chip.textContent}: ${ROTULO_GENERO[estado]}`);
  }
  const incluidos = Object.values(filtros.generos).filter((v) => v === 1).length;
  $('#f-combinar').hidden = incluidos < 2;

  for (const [caixa, chave] of [
    ['#f-combinar-opcoes', 'combinar'], ['#f-epoca', 'epoca'], ['#f-portugues', 'portugues'],
    ['#f-duracao', 'duracao'], ['#f-achado', 'achado'],
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
  $('#f-idioma').value = filtros.idioma;
  $('#f-classificacao').value = filtros.classificacao;

  for (const botao of document.querySelectorAll('#f-provedores .provedor')) {
    botao.setAttribute('aria-pressed', String(filtros.provedores.includes(Number(botao.dataset.id))));
  }
  atualizarResumo();
}

function limparFiltros() {
  filtros = { ...PADRAO, generos: {}, provedores: [] };
  som.clique();
  sincronizar();
  mudou({ imediato: true });
}

function sortearFiltros() {
  const novo = { ...PADRAO, generos: { [sortearUm(GENEROS).id]: 1 }, provedores: [] };
  if (api.modoAoVivo()) {
    novo.epoca = sortearUm(['qualquer', '2020', '2010', '2000', '1990', '1980', 'classicos']);
    novo.notaMin = sortearUm([0, 6, 6.5, 7, 7.5]);
    novo.achado = sortearUm(['qualquer', 'qualquer', 'populares', 'aclamados', 'joias']);
  }
  filtros = novo;
  som.brilho();
  sincronizar();
  mudou({ imediato: true });
}

/* ---------- Modo ao vivo × demonstração ---------- */

let provedoresCarregados = false;

async function aplicarModo() {
  const aoVivo = api.modoAoVivo();
  $('#faixa-demo').hidden = aoVivo;
  $('#btn-config').hidden = api.configuradoPeloDono();
  $('#campo-classificacao').hidden = !aoVivo;
  $('#f-nota-rotulo').textContent = (!aoVivo || api.fonteDaNota() === 'imdb')
    ? 'Nota mínima no IMDb'
    : 'Nota mínima no TMDB';

  // Sem o catálogo ao vivo não há como saber de legenda e dublagem: sobram duas opções.
  const valeNaDemo = (valor) => valor === 'qualquer' || valor === 'original';
  $('#f-portugues').innerHTML = htmlChips(aoVivo ? PORTUGUES : PORTUGUES.filter(([valor]) => valeNaDemo(valor)));
  if (!aoVivo && !valeNaDemo(filtros.portugues)) filtros.portugues = 'qualquer';
  sincronizar();

  const campoProvedores = $('#campo-provedores');
  campoProvedores.hidden = !aoVivo || !provedoresCarregados;
  if (aoVivo && !provedoresCarregados) {
    try {
      const lista = await api.provedoresBR();
      $('#f-provedores').innerHTML = lista.map((p) => (
        `<button type="button" class="provedor" data-id="${p.id}" aria-pressed="false" aria-label="${esc(p.nome)}" title="${esc(p.nome)}">
          <img src="${esc(p.logo)}" alt="" loading="lazy" width="46" height="46">
        </button>`
      )).join('');
      provedoresCarregados = lista.length > 0;
      campoProvedores.hidden = !provedoresCarregados;
      sincronizar();
    } catch {
      /* sem a lista de serviços o resto dos filtros continua valendo */
    }
  }
}

/* ---------- Minha lista ---------- */

const dlgLista = $('#dlg-lista');

function atualizarContador() {
  const total = listas.queroVer().length;
  const contador = $('#lista-contador');
  contador.hidden = total === 0;
  contador.textContent = total;
}

function itemLista(filme, tipo) {
  const capa = filme.poster
    ? `<img src="${esc(filme.poster)}" alt="" loading="lazy">`
    : '<span class="sem-capa"></span>';
  const original = filme.original && filme.original !== filme.titulo ? `${esc(filme.original)} · ` : '';
  return `<li class="item-lista">
    ${capa}
    <button type="button" class="item-lista__abrir" data-abrir="${filme.id}" data-tipo="${tipo}">
      <strong>${esc(filme.titulo)}</strong>
      <span>${original}${esc(filme.ano || '')}</span>
    </button>
    <button type="button" class="item-lista__tirar" data-tirar="${filme.id}" data-tipo="${tipo}"
      aria-label="Tirar ${esc(filme.titulo)} da lista">Tirar</button>
  </li>`;
}

function desenharLista() {
  const quero = listas.queroVer();
  const vistos = listas.vistos();
  $('#lista-corpo').innerHTML = `
    <section>
      <h3>Quero ver</h3>
      ${quero.length
        ? `<ul>${quero.map((f) => itemLista(f, 'quero')).join('')}</ul>`
        : '<p class="gaveta__vazio">Nada guardado ainda. Gire a roleta e toque em “Quero ver” no filme que te interessar.</p>'}
    </section>
    <section>
      <h3>Já vi</h3>
      ${vistos.length
        ? `<p class="gaveta__vazio">Estes filmes não entram mais na roleta. Tire um da lista para ele voltar.</p>
           <ul>${vistos.map((f) => itemLista(f, 'visto')).join('')}</ul>`
        : '<p class="gaveta__vazio">Marque “Já vi” num filme sorteado e ele não aparece de novo.</p>'}
    </section>`;
  atualizarContador();
}

$('#btn-lista').addEventListener('click', () => {
  desenharLista();
  dlgLista.showModal();
});

$('#lista-corpo').addEventListener('click', (evento) => {
  const tirar = evento.target.closest('[data-tirar]');
  if (tirar) {
    const id = Number(tirar.dataset.tirar);
    if (tirar.dataset.tipo === 'quero') listas.removerQueroVer(id);
    else listas.removerVisto(id);
    desenharLista();
    if (tirar.dataset.tipo === 'visto') mudou({ imediato: true });
    return;
  }
  const abrir = evento.target.closest('[data-abrir]');
  if (abrir && !ocupado) {
    const id = Number(abrir.dataset.abrir);
    const origem = abrir.dataset.tipo === 'quero' ? listas.queroVer() : listas.vistos();
    const filme = origem.find((f) => f.id === id);
    if (!filme) return;
    dlgLista.close();
    revelacao.mostrar(filme, api.detalhes(filme.id, filme.idioma));
  }
});

document.addEventListener('nancine:listas', atualizarContador);

/* ---------- Som ---------- */

const btnSom = $('#btn-som');
function pintarSom() {
  btnSom.setAttribute('aria-pressed', String(som.ativo));
  btnSom.setAttribute('aria-label', som.ativo ? 'Som ligado' : 'Som desligado');
}
btnSom.addEventListener('click', () => {
  som.alternar();
  pintarSom();
});

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
    if (evento.target === dialogo) dialogo.close();
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
    await revelacao.mostrar(filme, filme);
  } catch {
    avisar('Não foi possível abrir o filme deste link.');
  }
}

/* ---------- Largada ---------- */

async function iniciar() {
  montarLampadas();
  montarFiltros();
  sincronizar();
  pintarSom();
  atualizarContador();
  document.fonts?.ready.then(() => roleta.desenhar());

  await api.prepararImdb();
  pintarRodape();
  await aplicarModo();
  await recarregarDisputa();
  abrirLinkDireto();
}

iniciar();
