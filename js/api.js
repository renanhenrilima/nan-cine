// Camada de dados: TMDB (filmes, capas, trailers, onde assistir),
// OMDb (nota do IMDb, opcional) e o modo demonstração.

import { CONFIG } from './config.js';
import { store } from './storage.js';
import { FILMES_DEMO } from './demo-data.js';
import { embaralhar, sortearUm, isoDia } from './util.js';

const TMDB = 'https://api.themoviedb.org/3';
const IMAGEM = 'https://image.tmdb.org/t/p/';

const cache = new Map();   // respostas por URL
const totais = new Map();  // total de filmes por combinação de filtros

export function chaves() {
  const salvas = store.get('chaves', {});
  return {
    tmdb: (CONFIG.TMDB_KEY || salvas.tmdb || '').trim(),
    omdb: (CONFIG.OMDB_KEY || salvas.omdb || '').trim(),
  };
}

export const configuradoPeloDono = () => Boolean(CONFIG.TMDB_PROXY || CONFIG.TMDB_KEY);
export const modoAoVivo = () => Boolean(CONFIG.TMDB_PROXY || chaves().tmdb);

export class ErroApi extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo; // 'chave' | 'limite' | 'rede' | 'servidor'
  }
}

async function tmdb(caminho, params = {}, chaveAvulsa) {
  const url = new URL((CONFIG.TMDB_PROXY || TMDB) + caminho, location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const headers = { accept: 'application/json' };
  if (!CONFIG.TMDB_PROXY || chaveAvulsa) {
    const chave = chaveAvulsa || chaves().tmdb;
    if (chave.startsWith('eyJ')) headers.authorization = `Bearer ${chave}`;
    else url.searchParams.set('api_key', chave);
  }

  const id = url.toString();
  if (cache.has(id)) return cache.get(id);

  let resposta;
  try {
    resposta = await fetch(url, { headers });
  } catch {
    throw new ErroApi('rede', 'Sem conexão com o TMDB. Confira sua internet e tente de novo.');
  }
  if (resposta.status === 401) {
    throw new ErroApi('chave', 'O TMDB recusou a chave. Confira se ela foi copiada inteira.');
  }
  if (resposta.status === 429) {
    throw new ErroApi('limite', 'Muitas buscas em pouco tempo. Espere alguns segundos e tente de novo.');
  }
  if (!resposta.ok) {
    throw new ErroApi('servidor', `O TMDB respondeu com erro ${resposta.status}. Tente de novo em instantes.`);
  }

  const dados = await resposta.json();
  cache.set(id, dados);
  return dados;
}

export async function testarChave(chave) {
  await tmdb('/configuration', {}, chave.trim());
  return true;
}

/* ---------- Notas do IMDb ---------- */
// Fonte principal: a pasta dados/imdb, gerada por ferramentas/atualizar-imdb.mjs
// a partir do arquivo oficial do IMDb. Reserva: OMDb, se houver chave.

const PASTA_IMDB = 'dados/imdb/';
let baseImdb;                 // undefined = ainda não conferida; null = não existe
const fatiasImdb = new Map(); // nome da fatia → Promise<Map<id, {nota, votos}>>

export async function prepararImdb() {
  if (baseImdb !== undefined) return baseImdb;
  try {
    const r = await fetch(`${PASTA_IMDB}info.json`, { cache: 'no-cache' });
    const info = r.ok ? await r.json() : null;
    baseImdb = info?.fatias ? info : null;
  } catch {
    baseImdb = null;
  }
  return baseImdb;
}

export const infoImdb = () => baseImdb || null;

/** De onde vem a nota que o app mostra e filtra. */
export const fonteDaNota = () => (baseImdb ? 'imdb' : 'tmdb');

function carregarFatia(nome) {
  if (!fatiasImdb.has(nome)) {
    const pedido = fetch(`${PASTA_IMDB}${nome}.txt?v=${baseImdb.versao || ''}`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((texto) => {
        const mapa = new Map();
        for (const linha of texto.split('\n')) {
          const [id, nota10, votos] = linha.split(',');
          if (id) mapa.set(Number(id), { nota: Number(nota10) / 10, votos: Number(votos) });
        }
        return mapa;
      })
      .catch(() => new Map());
    fatiasImdb.set(nome, pedido);
  }
  return fatiasImdb.get(nome);
}

async function notaImdbLocal(imdbId) {
  if (!baseImdb) return null;
  const numero = parseInt(String(imdbId).replace(/\D/g, ''), 10);
  if (!numero) return null;
  const nome = (numero % baseImdb.fatias).toString(16).padStart(2, '0');
  return (await carregarFatia(nome)).get(numero) || null;
}

async function notaImdbOmdb(imdbId) {
  const { omdb } = chaves();
  if (!omdb) return null;
  try {
    const r = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(omdb)}`);
    const d = await r.json();
    const nota = parseFloat(d.imdbRating);
    if (d.Response === 'False' || Number.isNaN(nota)) return null;
    return { nota, votos: parseInt(String(d.imdbVotes || '').replace(/\D/g, ''), 10) || 0 };
  } catch {
    return null;
  }
}

export async function notaImdb(imdbId) {
  if (!imdbId) return null;
  return (await notaImdbLocal(imdbId)) || notaImdbOmdb(imdbId);
}

/* ---------- Vencedores de prêmios ---------- */
// Lista gerada por ferramentas/atualizar-premios.mjs (Wikidata + TMDB):
// [tmdb, imdb, ano, gêneros, duração, prêmios]

let basePremios;   // undefined = ainda não conferida; null = não existe

export async function prepararPremios() {
  if (basePremios !== undefined) return basePremios;
  try {
    const r = await fetch('dados/premios.json', { cache: 'no-cache' });
    const d = r.ok ? await r.json() : null;
    basePremios = d?.filmes?.length ? d : null;
  } catch {
    basePremios = null;
  }
  return basePremios;
}

export const temPremios = () => Boolean(basePremios);
export const listaDePremios = () => Object.entries(basePremios?.premios || {});

/**
 * Filmes de uma lista pronta (prêmios, críticos) que passam pelos filtros que dá para
 * conferir sem consultar cada filme. Cada item: [tmdb, imdb, ano, gêneros, duração, extra].
 */
function listaPossiveis(lista, f, extra) {
  const incluir = Object.keys(f.generos).filter((id) => f.generos[id] === 1).map(Number);
  const excluir = Object.keys(f.generos).filter((id) => f.generos[id] === -1).map(Number);
  const { de, ate } = intervaloEpoca(f);
  const anoDe = de ? Number(de.slice(0, 4)) : 0;
  const anoAte = ate ? Number(ate.slice(0, 4)) : 9999;
  const [durMin, durMax] = DURACOES[f.duracao] || [null, null];

  return lista.filter((item) => {
    const [, , ano, generos, duracao] = item;
    if (!extra(item)) return false;
    if (ano < anoDe || ano > anoAte) return false;
    if (incluir.length) {
      const tem = (id) => generos.includes(id);
      if (f.combinar === 'todos' ? !incluir.every(tem) : !incluir.some(tem)) return false;
    }
    if (excluir.some((id) => generos.includes(id))) return false;
    if (durMin && duracao < durMin) return false;
    if (durMax && duracao > durMax) return false;
    return true;
  });
}

const ORDEM_CLASSIFICACAO = ['L', '10', '12', '14', '16', '18'];
const estadoListas = new Map(); // combinação de filtros → { restantes, aprovados }
const LOTE_DA_LISTA = 24;
const LOTES_POR_RODADA = 6;

/** Confere, filme a filme, o que o TMDB só informa na ficha do filme. */
async function conferirDaLista(id, f, notaMin, votosMin) {
  let d;
  try {
    d = await tmdb(`/movie/${id}`, {
      language: CONFIG.IDIOMA,
      append_to_response: 'videos,release_dates,watch/providers',
      include_video_language: 'pt',
    });
  } catch (erro) {
    if (erro instanceof ErroApi && erro.tipo === 'chave') throw erro;
    return null;
  }
  if (!d.poster_path) return null;

  const imdbId = d.imdb_id || '';
  const filme = { ...resumir(d), imdbId, imdb: await notaImdbLocal(imdbId) };
  const br = lancamentoBR(d);
  const noBrasil = d['watch/providers']?.results?.[CONFIG.REGIAO];
  filme.portugues = sinaisDePortugues(d, noBrasil, br);

  if (fonteDaNota() === 'imdb' && notaMin > 0 && notaDeReferencia(filme) < notaMin) return null;
  if (votosMin > 0 && (votosDeReferencia(filme) || 0) < votosMin) return null;

  if (f.classificacao) {
    const cert = br?.release_dates?.map((r) => r.certification).find(Boolean);
    if (!cert || ORDEM_CLASSIFICACAO.indexOf(cert) < 0
      || ORDEM_CLASSIFICACAO.indexOf(cert) > ORDEM_CLASSIFICACAO.indexOf(f.classificacao)) return null;
  }
  if (f.provedores.length) {
    const daqui = ['flatrate', 'free', 'ads'].flatMap((tipo) => noBrasil?.[tipo] || []).map((p) => p.provider_id);
    if (!f.provedores.some((id) => daqui.includes(id))) return null;
  } else if (f.portugues === 'legendado' && !filme.portugues.noBrasil) {
    return null;
  }
  if (f.portugues === 'dublado' && !(filme.portugues.cinemaNoBrasil || filme.portugues.original)) return null;
  return filme;
}

async function sortearDaLista(nome, lista, f, vistos, quantos, extra) {
  const notaMin = Number(f.notaMin) || 0;
  const votosMin = Math.max(0, Number(f.votosMin ?? 1000) || 0);
  const possiveis = listaPossiveis(lista, f, extra).filter(([id]) => !vistos.has(id));
  if (!possiveis.length) return { total: 0, filmes: [] };

  // Cada combinação de filtros lembra o que já conferiu e o que passou.
  const chave = JSON.stringify([nome, f.generos, f.combinar, f.epoca, f.anoDe, f.anoAte, f.duracao, f.premios,
    f.provedores, f.classificacao, f.portugues, notaMin, votosMin]);
  let estado = estadoListas.get(chave);
  if (!estado) {
    estado = { restantes: embaralhar(possiveis.map(([id]) => id)), aprovados: new Map() };
    estadoListas.set(chave, estado);
  }
  const doConjunto = new Set(possiveis.map(([id]) => id));
  const disponiveis = () => [...estado.aprovados.values()].filter((x) => doConjunto.has(x.id));

  for (let lote = 0; lote < LOTES_POR_RODADA && disponiveis().length < quantos && estado.restantes.length; lote++) {
    const ids = estado.restantes.splice(0, LOTE_DA_LISTA).filter((id) => doConjunto.has(id));
    const filmes = await Promise.all(ids.map((id) => conferirDaLista(id, f, notaMin, votosMin)));
    for (const filme of filmes) if (filme) estado.aprovados.set(filme.id, filme);
  }
  // Acabou a lista sem esgotar a paciência: recomeça do início na próxima rodada.
  if (!estado.restantes.length && !disponiveis().length) estadoListas.delete(chave);

  return { total: possiveis.length, filmes: embaralhar(disponiveis()).slice(0, quantos) };
}

/* ---------- Notas dos críticos e prêmios do filme (OMDb) ---------- */
// Arquivos gerados por ferramentas/atualizar-criticos.mjs: o site só lê; a chave do OMDb
// fica no GitHub. A base cresce todo dia, então nem todo filme tem nota de críticos ainda.

const PASTA_CRITICOS = 'dados/criticos/';
/** Média do Metacritic e do Rotten Tomatoes a partir da qual o filme conta como "melhor avaliado pelos críticos". */
export const LIMITE_CRITICOS = 75;
let infoCriticos;                 // undefined = ainda não conferida; null = não existe
let poolCriticos;
const fatiasCriticos = new Map(); // nome da fatia → Promise<Map<id, { meta, rt, premio }>>

export async function prepararCriticos() {
  if (infoCriticos !== undefined) return infoCriticos;
  try {
    const r = await fetch(`${PASTA_CRITICOS}info.json`, { cache: 'no-cache' });
    const d = r.ok ? await r.json() : null;
    infoCriticos = d?.fatias ? d : null;
  } catch {
    infoCriticos = null;
  }
  return infoCriticos;
}

export const temCriticos = () => Boolean(infoCriticos?.noPool);
export const infoDosCriticos = () => infoCriticos || null;

async function prepararPoolCriticos() {
  if (poolCriticos) return poolCriticos;
  try {
    const r = await fetch(`${PASTA_CRITICOS}pool.json?v=${infoCriticos?.versao || ''}`);
    poolCriticos = r.ok ? await r.json() : { filmes: [] };
  } catch {
    poolCriticos = { filmes: [] };
  }
  return poolCriticos;
}

function fatiaDeCriticos(nome) {
  if (!fatiasCriticos.has(nome)) {
    const pedido = fetch(`${PASTA_CRITICOS}${nome}.txt?v=${infoCriticos?.versao || ''}`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((texto) => {
        const mapa = new Map();
        for (const linha of texto.split('\n')) {
          const [id, meta, rt, , premio] = linha.split('\t');
          if (!id || meta === 'x') continue; // "x": não é filme
          mapa.set(Number(id), {
            meta: meta === '' ? null : Number(meta),
            rt: rt === '' ? null : Number(rt),
            premio: premio || '',
          });
        }
        return mapa;
      })
      .catch(() => new Map());
    fatiasCriticos.set(nome, pedido);
  }
  return fatiasCriticos.get(nome);
}

/** Notas dos críticos e resumo de prêmios de um filme, ou null se a base ainda não tem. */
export async function criticosDe(imdbId) {
  if (!infoCriticos) return null;
  const numero = parseInt(String(imdbId).replace(/\D/g, ''), 10);
  if (!numero) return null;
  const nome = (numero % infoCriticos.fatias).toString(16).padStart(2, '0');
  const achado = (await fatiaDeCriticos(nome)).get(numero);
  if (!achado) return null;
  const notas = [achado.meta, achado.rt].filter((n) => n !== null);
  return { ...achado, media: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null };
}

/* ---------- Filtros → parâmetros ---------- */

const DECADAS = {
  2020: ['2020-01-01', null],
  2010: ['2010-01-01', '2019-12-31'],
  2000: ['2000-01-01', '2009-12-31'],
  1990: ['1990-01-01', '1999-12-31'],
  1980: ['1980-01-01', '1989-12-31'],
  classicos: [null, '1979-12-31'],
};

export function intervaloEpoca(f) {
  const hoje = new Date();
  const diasAtras = (n) => isoDia(new Date(hoje.getTime() - n * 864e5));

  if (f.epoca === 'cartaz') return { de: diasAtras(45), ate: isoDia(hoje) };
  if (f.epoca === 'ano') return { de: diasAtras(365), ate: isoDia(hoje) };
  if (f.epoca === 'custom') {
    let de = Number(f.anoDe) || null;
    let ate = Number(f.anoAte) || null;
    if (de && ate && de > ate) [de, ate] = [ate, de];
    return { de: de ? `${de}-01-01` : null, ate: ate ? `${ate}-12-31` : isoDia(hoje) };
  }
  if (DECADAS[f.epoca]) {
    const [de, ate] = DECADAS[f.epoca];
    return { de, ate: ate || isoDia(hoje) };
  }
  // Sem filtro de época: só evita filmes que ainda não estrearam.
  return { de: null, ate: isoDia(hoje) };
}

const DURACOES = {
  curto: [null, 90],
  medio: [90, 120],
  longo: [120, null],
};

// O TMDB entrega no máximo 500 páginas (10 mil filmes) por ordenação. Com as
// ordenações invertidas, o sorteio também alcança o fim da lista, então um
// catálogo de até 20 mil filmes fica inteiro ao alcance.
const ORDENS_VARIADAS = [
  'popularity.desc', 'popularity.asc',
  'vote_count.desc', 'vote_count.asc',
  'vote_average.desc', 'vote_average.asc',
  'primary_release_date.desc', 'primary_release_date.asc',
  'revenue.desc',
];

function montarBusca(f) {
  const p = {
    language: CONFIG.IDIOMA,
    region: CONFIG.REGIAO,
    include_adult: 'false',
    include_video: 'false',
  };

  const incluir = Object.keys(f.generos).filter((id) => f.generos[id] === 1);
  const excluir = Object.keys(f.generos).filter((id) => f.generos[id] === -1);
  if (incluir.length) p.with_genres = incluir.join(f.combinar === 'todos' ? ',' : '|');
  if (excluir.length) p.without_genres = excluir.join(',');

  const { de, ate } = intervaloEpoca(f);
  if (f.epoca === 'cartaz') {
    // "Em cartaz" vale para os cinemas do Brasil: usa a data de estreia aqui, não a mundial.
    p.region = CONFIG.REGIAO;
    p.with_release_type = '3';
    if (de) p['release_date.gte'] = de;
    if (ate) p['release_date.lte'] = ate;
  } else {
    if (de) p['primary_release_date.gte'] = de;
    if (ate) p['primary_release_date.lte'] = ate;
  }

  const [durMin, durMax] = DURACOES[f.duracao] || [null, null];
  if (durMin) p['with_runtime.gte'] = durMin;
  if (durMax) p['with_runtime.lte'] = durMax;

  if (f.provedores.length) {
    p.with_watch_providers = f.provedores.join('|');
    p.watch_region = CONFIG.REGIAO;
    p.with_watch_monetization_types = 'flatrate|free|ads';
  }

  // Versão em português. Nenhuma fonte gratuita registra dublagem e legenda filme
  // a filme, então usamos sinais: filme disponível em serviços no Brasil (legendado)
  // e lançado nos cinemas do Brasil, onde a maioria tem sessão dublada (dublado).
  if (f.portugues === 'legendado' && !f.provedores.length) {
    p.watch_region = CONFIG.REGIAO;
    p.with_watch_monetization_types = 'flatrate|free|ads|rent|buy';
  }

  if (f.classificacao) {
    p.certification_country = 'BR';
    p['certification.lte'] = f.classificacao;
  }

  // "Tipo de achado" decide o piso de votos, a ordem e até onde sortear.
  const recente = f.epoca === 'cartaz' || f.epoca === 'ano';
  let notaMin = Number(f.notaMin) || 0;
  const votosMin = Math.max(0, Number(f.votosMin ?? 1000) || 0);
  let ordem = sortearUm(ORDENS_VARIADAS);
  let tetoPaginas = 500;

  if (f.achado === 'usuarios') {
    p['vote_count.gte'] = recente ? 100 : 1500;
    notaMin = Math.max(notaMin, 7.5);
    ordem = 'vote_average.desc';
  } else if (f.achado === 'joias') {
    p['vote_count.gte'] = recente ? 15 : 80;
    p['vote_count.lte'] = 1500;
    notaMin = Math.max(notaMin, 7);
  } else {
    // Sem mínimo de avaliações, o piso do TMDB desce para alcançar filmes pouco votados.
    p['vote_count.gte'] = recente || votosMin === 0 ? 10 : 150;
  }

  // Mínimo de avaliações (conferido filme a filme no IMDb). Aqui só sobe o piso de
  // votos do TMDB, que costuma ter uns cem votos para cada um do IMDb.
  if (votosMin > 0) {
    p['vote_count.gte'] = Math.max(p['vote_count.gte'], Math.floor(votosMin / 100));
  }

  // O TMDB só sabe filtrar pela nota dele. Quando a referência é o IMDb, pedimos
  // um ponto a menos aqui e conferimos a nota do IMDb filme a filme depois.
  const piso = fonteDaNota() === 'imdb' ? notaMin - 1 : notaMin;
  if (piso > 0) p['vote_average.gte'] = piso;

  // Filmes lançados nos cinemas do Brasil são os populares: sorteia entre eles.
  const soDublado = f.portugues === 'dublado';
  if (soDublado) {
    ordem = 'popularity.desc';
    tetoPaginas = Math.min(tetoPaginas, 150);
  }

  return { params: p, ordem, tetoPaginas, notaMin, votosMin, soDublado };
}

/** Sinais de que o filme tem versão em português (ver comentário em montarBusca). */
function sinaisDePortugues(d, noBrasil, lancamentoBR) {
  const videosPt = (d.videos?.results || []).filter((v) => v.iso_639_1 === 'pt');
  const ofertas = noBrasil
    ? ['flatrate', 'free', 'ads', 'rent', 'buy'].some((tipo) => noBrasil[tipo]?.length)
    : false;
  return {
    original: d.original_language === 'pt',
    trailer: videosPt.length > 0,
    // "Dobrado" é como se diz dublado em Portugal.
    dublado: videosPt.some((v) => /dublad|dobrad/i.test(v.name || '')),
    legendado: videosPt.some((v) => /legendad/i.test(v.name || '')),
    noBrasil: ofertas,
    lancadoNoBrasil: Boolean(lancamentoBR),
    // Tipos 2 e 3 do TMDB: estreia limitada e estreia nos cinemas.
    cinemaNoBrasil: Boolean(lancamentoBR?.release_dates?.some((r) => r.type === 2 || r.type === 3)),
  };
}

/** Data de estreia nos cinemas do Brasil (a mais antiga), ou a primeira data de lançamento daqui. */
function estreiaNoBrasil(lanc) {
  const datas = (lanc?.release_dates || []).map((r) => ({ tipo: r.type, dia: String(r.release_date || '').slice(0, 10) })).filter((r) => r.dia);
  const cinema = datas.filter((r) => r.tipo === 2 || r.tipo === 3).map((r) => r.dia).sort();
  return cinema[0] || datas.map((r) => r.dia).sort()[0] || '';
}

const lancamentoBR = (d) => d.release_dates?.results?.find((r) => r.iso_3166_1 === CONFIG.REGIAO);

/** Acrescenta a cada candidato o id e a nota do IMDb e os sinais de português. */
async function enriquecer(filmes) {
  return Promise.all(filmes.map(async (filme) => {
    try {
      const d = await tmdb(`/movie/${filme.id}`, {
        language: CONFIG.IDIOMA,
        append_to_response: 'videos,release_dates',
        include_video_language: 'pt',
      });
      const imdbId = d.imdb_id || '';
      return { ...filme, imdbId, imdb: await notaImdbLocal(imdbId), portugues: sinaisDePortugues(d, null, lancamentoBR(d)) };
    } catch {
      return { ...filme, imdb: null, portugues: null };
    }
  }));
}

/** A nota que vale para o filtro: IMDb quando existe, TMDB como reserva. */
export const notaDeReferencia = (filme) => (filme.imdb ? filme.imdb.nota : filme.nota);

/** Quantas avaliações sustentam essa nota (IMDb quando existe, TMDB como reserva). */
const votosDeReferencia = (filme) => (filme.imdb ? filme.imdb.votos : filme.votos);

/* ---------- Sorteio dos candidatos ---------- */

function resumir(m) {
  return {
    id: m.id,
    titulo: m.title || m.original_title,
    original: m.original_title || m.title,
    idioma: m.original_language,
    data: m.release_date || '',
    nota: m.vote_average || 0,
    votos: m.vote_count || 0,
    sinopse: m.overview || '',
    generos: m.genre_ids || (m.genres || []).map((g) => g.id),
    poster: m.poster_path ? `${IMAGEM}w342${m.poster_path}` : null,
    fundo: m.backdrop_path ? `${IMAGEM}w1280${m.backdrop_path}` : null,
  };
}

/** Sorteia páginas ainda não lidas (`lidas`), sem repetir nenhuma. */
function paginasAleatorias(max, quantas, lidas = new Set()) {
  const alvo = Math.min(max - lidas.size, quantas);
  const escolhidas = new Set();
  while (escolhidas.size < alvo) {
    const pagina = 1 + Math.floor(Math.random() * max);
    if (!lidas.has(pagina)) escolhidas.add(pagina);
  }
  return [...escolhidas];
}

// Filmes que já passaram na conferência (nota do IMDb, trailer em português) em cada
// busca. Notas altas deixam pouquíssimos filmes, e uma rodada de páginas sorteadas
// pode não achar nenhum mesmo existindo: guardar os aprovados evita o "nenhum
// resultado" na segunda tentativa com o mesmo filtro.
const aprovadosPorBusca = new Map();
const LEVAS_EXTRAS = 10;

/**
 * Sorteia até `quantos` filmes que passam pelos filtros.
 * Devolve { total, filmes } — total é quantos filmes existem com esses filtros.
 */
export async function sortearCandidatos(filtros, vistos = new Set(), quantos = CONFIG.AMOSTRA) {
  if (!modoAoVivo()) return sortearDemo(filtros, vistos, quantos);

  if (filtros.achado === 'premiados' && temPremios()) {
    const premios = filtros.premios || [];
    return sortearDaLista('premios', basePremios.filmes, filtros, vistos, quantos,
      (item) => !premios.length || premios.some((p) => item[5].includes(p)));
  }
  if (filtros.achado === 'criticos' && temCriticos()) {
    const pool = await prepararPoolCriticos();
    return sortearDaLista('criticos', pool.filmes, filtros, vistos, quantos, (item) => item[5] >= LIMITE_CRITICOS);
  }

  const { params, ordem, tetoPaginas, notaMin, votosMin, soDublado } = montarBusca(filtros);
  const assinatura = JSON.stringify(params);
  const chaveAprovados = `${assinatura}|${notaMin}|${votosMin}|${soDublado}`;

  let meta = totais.get(assinatura);
  if (!meta) {
    const primeira = await tmdb('/discover/movie', { ...params, sort_by: ordem, page: 1 });
    meta = { total: primeira.total_results || 0, paginas: primeira.total_pages || 0 };
    totais.set(assinatura, meta);
  }
  if (!meta.total) return { total: 0, filmes: [] };

  const max = Math.max(1, Math.min(meta.paginas, 500, tetoPaginas));
  const usarImdb = fonteDaNota() === 'imdb';
  const conferirUmAUm = usarImdb || soDublado || votosMin > 0;
  // Notas altas no IMDb eliminam muita gente na conferência: tenta mais levas.
  const levas = soDublado || (usarImdb && notaMin >= 7) ? 4 : 2;
  const aprovados = aprovadosPorBusca.get(chaveAprovados) || new Map();
  aprovadosPorBusca.set(chaveAprovados, aprovados);
  const escolhidos = new Map();
  const lidas = new Set();

  // Mais de uma leva só acontece se a conferência filme a filme cortou gente demais.
  // Se nada passou e nada foi aprovado antes, segue lendo páginas novas até achar ou
  // até acabarem: "nenhum filme" só vale quando o catálogo filtrado foi percorrido.
  for (let leva = 0; escolhidos.size < quantos && lidas.size < max; leva++) {
    const guardados = [...aprovados.values()].filter((f) => !vistos.has(f.id)).length;
    if (leva >= levas && (guardados || escolhidos.size || leva >= levas + LEVAS_EXTRAS)) break;
    const paginas = paginasAleatorias(max, 3, lidas);
    paginas.forEach((pagina) => lidas.add(pagina));
    const respostas = await Promise.all(
      paginas.map((page) => tmdb('/discover/movie', { ...params, sort_by: ordem, page })),
    );

    const unicos = new Map();
    for (const r of respostas) {
      for (const m of r.results || []) {
        if (m.poster_path && !vistos.has(m.id) && !escolhidos.has(m.id)) unicos.set(m.id, resumir(m));
      }
    }

    let candidatos = embaralhar([...unicos.values()]);
    if (conferirUmAUm) {
      // Com nota muito alta sobram poucos filmes: confere mais deles por leva.
      const lote = (usarImdb && notaMin >= 8) || votosMin >= 50000 ? 40 : quantos + 10;
      candidatos = await enriquecer(candidatos.slice(0, lote));
      if (usarImdb && notaMin > 0) {
        candidatos = candidatos.filter((filme) => notaDeReferencia(filme) >= notaMin);
      }
      if (votosMin > 0) {
        candidatos = candidatos.filter((filme) => (votosDeReferencia(filme) || 0) >= votosMin);
      }
      if (soDublado) {
        candidatos = candidatos.filter((filme) => filme.portugues?.cinemaNoBrasil || filme.portugues?.original);
      }
      for (const filme of candidatos) aprovados.set(filme.id, filme);
    }
    for (const filme of candidatos) {
      if (escolhidos.size < quantos) escolhidos.set(filme.id, filme);
    }
    if (!conferirUmAUm) break;
  }

  // Completa com filmes aprovados em rodadas anteriores desta mesma busca.
  if (conferirUmAUm && escolhidos.size < quantos) {
    const reserva = embaralhar([...aprovados.values()].filter((f) => !vistos.has(f.id) && !escolhidos.has(f.id)));
    for (const filme of reserva) {
      if (escolhidos.size < quantos) escolhidos.set(filme.id, filme);
    }
  }

  return { total: meta.total, filmes: [...escolhidos.values()] };
}

function sortearDemo(f, vistos, quantos) {
  const incluir = Object.keys(f.generos).filter((id) => f.generos[id] === 1).map(Number);
  const excluir = Object.keys(f.generos).filter((id) => f.generos[id] === -1).map(Number);
  const { de, ate } = intervaloEpoca(f);
  const [durMin, durMax] = DURACOES[f.duracao] || [null, null];
  let notaMin = Number(f.notaMin) || 0;
  if (f.achado === 'usuarios') notaMin = Math.max(notaMin, 7.5);

  const passam = FILMES_DEMO.filter((m) => {
    if (vistos.has(m.id)) return false;
    if (incluir.length) {
      const tem = (id) => m.generos.includes(id);
      if (f.combinar === 'todos' ? !incluir.every(tem) : !incluir.some(tem)) return false;
    }
    if (excluir.some((id) => m.generos.includes(id))) return false;
    if (de && m.data < de) return false;
    if (ate && m.data > ate) return false;
    if (durMin && m.duracao < durMin) return false;
    if (durMax && m.duracao > durMax) return false;
    if (m.nota < notaMin) return false;
    return true;
  });

  return { total: passam.length, filmes: embaralhar(passam).slice(0, quantos) };
}

/* ---------- Detalhes do filme sorteado ---------- */

function escolherTrailer(videos = []) {
  const pesoTipo = { Trailer: 30, Teaser: 20, Clip: 8, Featurette: 5 };
  let melhor = null;

  for (const v of videos) {
    if (v.site !== 'YouTube' || !v.key) continue;
    const nome = v.name || '';
    const emPortugues = v.iso_639_1 === 'pt';
    let pontos = pesoTipo[v.type] || 1;
    if (emPortugues) pontos += v.iso_3166_1 === 'BR' ? 100 : 90;
    if (/dublad|dobrad|legendad/i.test(nome)) pontos += 6;
    if (v.official) pontos += 2;
    if (!melhor || pontos > melhor.pontos) {
      let versao = 'original';
      if (/dublad|dobrad/i.test(nome)) versao = 'dublado';
      else if (/legendad/i.test(nome)) versao = 'legendado';
      else if (emPortugues) versao = 'portugues';
      melhor = { pontos, chave: v.key, nome, versao, tipo: v.type };
    }
  }
  return melhor;
}

export async function detalhes(id, idiomaOriginal) {
  if (!modoAoVivo()) {
    const demo = FILMES_DEMO.find((m) => m.id === Number(id));
    if (!demo) throw new ErroApi('servidor', 'Filme não encontrado no modo demonstração.');
    return {
      ...demo,
      generosNomes: [], diretores: [], elenco: [], trailer: null, provedores: null,
      portugues: demo.idioma === 'pt' ? { original: true } : null,
      // No modo demonstração a nota guardada já é a do IMDb; a base local só atualiza.
      imdb: (await notaImdb(demo.imdbId)) || { nota: demo.nota, votos: 0 },
    };
  }

  const idiomasVideo = [...new Set(['pt', 'en', idiomaOriginal, 'null'].filter(Boolean))].join(',');
  const d = await tmdb(`/movie/${id}`, {
    language: CONFIG.IDIOMA,
    append_to_response: 'videos,external_ids,release_dates,credits,watch/providers,translations',
    include_video_language: idiomasVideo,
  });

  const ingles = d.translations?.translations?.find((t) => t.iso_639_1 === 'en')?.data;
  const lancBR = d.release_dates?.results?.find((r) => r.iso_3166_1 === CONFIG.REGIAO);
  const classificacao = lancBR?.release_dates?.map((r) => r.certification).find(Boolean) || '';
  const br = d['watch/providers']?.results?.[CONFIG.REGIAO];
  const logos = (lista = []) => lista.map((p) => ({
    nome: p.provider_name,
    logo: p.logo_path ? `${IMAGEM}w92${p.logo_path}` : null,
  }));
  const imdbId = d.imdb_id || d.external_ids?.imdb_id || '';

  return {
    ...resumir(d),
    sinopse: d.overview || ingles?.overview || '',
    sinopseEmIngles: !d.overview && Boolean(ingles?.overview),
    frase: d.tagline || '',
    duracao: d.runtime || 0,
    generosNomes: (d.genres || []).map((g) => g.name),
    classificacao,
    diretores: (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 2),
    elenco: (d.credits?.cast || []).slice(0, 5).map((c) => c.name),
    posterGrande: d.poster_path ? `${IMAGEM}w500${d.poster_path}` : null,
    imdbId,
    estreiaBR: estreiaNoBrasil(lancBR),
    criticos: await criticosDe(imdbId),
    trailer: escolherTrailer(d.videos?.results),
    portugues: sinaisDePortugues(d, br, lancBR),
    provedores: br ? {
      link: br.link,
      assinatura: logos(br.flatrate),
      gratis: logos([...(br.free || []), ...(br.ads || [])]),
      aluguel: logos(br.rent),
      compra: logos(br.buy),
    } : null,
    imdb: await notaImdb(imdbId),
  };
}

/** Serviços de streaming disponíveis no Brasil, para o filtro "Onde assistir". */
export async function provedoresBR() {
  if (!modoAoVivo()) return [];
  const d = await tmdb('/watch/providers/movie', { language: CONFIG.IDIOMA, watch_region: CONFIG.REGIAO });
  const prioridade = (p) => p.display_priorities?.[CONFIG.REGIAO] ?? p.display_priority ?? 999;
  return (d.results || [])
    .filter((p) => p.logo_path)
    .sort((a, b) => prioridade(a) - prioridade(b))
    .slice(0, 14)
    .map((p) => ({ id: p.provider_id, nome: p.provider_name, logo: `${IMAGEM}w92${p.logo_path}` }));
}
