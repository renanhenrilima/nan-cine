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
  if (de) p['primary_release_date.gte'] = de;
  if (ate) p['primary_release_date.lte'] = ate;
  if (f.epoca === 'cartaz') p.with_release_type = '2|3';

  const [durMin, durMax] = DURACOES[f.duracao] || [null, null];
  if (durMin) p['with_runtime.gte'] = durMin;
  if (durMax) p['with_runtime.lte'] = durMax;

  if (f.idioma) p.with_original_language = f.idioma;

  if (f.provedores.length) {
    p.with_watch_providers = f.provedores.join('|');
    p.watch_region = CONFIG.REGIAO;
    p.with_watch_monetization_types = 'flatrate|free|ads';
  }

  // Versão em português. Nenhuma fonte gratuita registra dublagem e legenda filme
  // a filme, então usamos sinais: áudio original, disponibilidade no Brasil
  // (serviços daqui trazem legenda e, muitas vezes, dublagem) e trailer dublado.
  if (f.portugues === 'original') p.with_original_language = 'pt';
  if (f.portugues === 'disponivel' && !f.provedores.length) {
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
  let ordem = sortearUm(ORDENS_VARIADAS);
  let tetoPaginas = 500;

  if (f.achado === 'populares') {
    p['vote_count.gte'] = recente ? 20 : 300;
    ordem = 'popularity.desc';
    tetoPaginas = 12;
  } else if (f.achado === 'aclamados') {
    p['vote_count.gte'] = recente ? 100 : 1500;
    notaMin = Math.max(notaMin, 7.5);
    ordem = 'vote_average.desc';
  } else if (f.achado === 'joias') {
    p['vote_count.gte'] = recente ? 15 : 80;
    p['vote_count.lte'] = 1500;
    notaMin = Math.max(notaMin, 7);
  } else {
    p['vote_count.gte'] = recente ? 10 : 150;
  }

  // O TMDB só sabe filtrar pela nota dele. Quando a referência é o IMDb, pedimos
  // um ponto a menos aqui e conferimos a nota do IMDb filme a filme depois.
  const piso = fonteDaNota() === 'imdb' ? notaMin - 1 : notaMin;
  if (piso > 0) p['vote_average.gte'] = piso;

  // Trailer em português é mais comum nos filmes populares: sorteia entre eles.
  const soTrailerPt = f.portugues === 'trailer';
  if (soTrailerPt) {
    ordem = 'popularity.desc';
    tetoPaginas = Math.min(tetoPaginas, 60);
  }

  return { params: p, ordem, tetoPaginas, notaMin, soTrailerPt };
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
  };
}

/** Acrescenta a cada candidato o id e a nota do IMDb e os sinais de português. */
async function enriquecer(filmes) {
  return Promise.all(filmes.map(async (filme) => {
    try {
      const d = await tmdb(`/movie/${filme.id}`, {
        language: CONFIG.IDIOMA,
        append_to_response: 'videos',
        include_video_language: 'pt',
      });
      const imdbId = d.imdb_id || '';
      return { ...filme, imdbId, imdb: await notaImdbLocal(imdbId), portugues: sinaisDePortugues(d) };
    } catch {
      return { ...filme, imdb: null, portugues: null };
    }
  }));
}

/** A nota que vale para o filtro: IMDb quando existe, TMDB como reserva. */
export const notaDeReferencia = (filme) => (filme.imdb ? filme.imdb.nota : filme.nota);

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

function paginasAleatorias(max, quantas) {
  const escolhidas = new Set();
  const alvo = Math.min(max, quantas);
  while (escolhidas.size < alvo) escolhidas.add(1 + Math.floor(Math.random() * max));
  return [...escolhidas];
}

/**
 * Sorteia até `quantos` filmes que passam pelos filtros.
 * Devolve { total, filmes } — total é quantos filmes existem com esses filtros.
 */
export async function sortearCandidatos(filtros, vistos = new Set(), quantos = CONFIG.AMOSTRA) {
  if (!modoAoVivo()) return sortearDemo(filtros, vistos, quantos);

  const { params, ordem, tetoPaginas, notaMin, soTrailerPt } = montarBusca(filtros);
  const assinatura = JSON.stringify(params);

  let meta = totais.get(assinatura);
  if (!meta) {
    const primeira = await tmdb('/discover/movie', { ...params, sort_by: ordem, page: 1 });
    meta = { total: primeira.total_results || 0, paginas: primeira.total_pages || 0 };
    totais.set(assinatura, meta);
  }
  if (!meta.total) return { total: 0, filmes: [] };

  const max = Math.max(1, Math.min(meta.paginas, 500, tetoPaginas));
  const usarImdb = fonteDaNota() === 'imdb';
  const conferirUmAUm = usarImdb || soTrailerPt;
  // Notas altas no IMDb eliminam muita gente na conferência: tenta mais levas.
  const levas = soTrailerPt || (usarImdb && notaMin >= 7) ? 4 : 2;
  const escolhidos = new Map();

  // Mais de uma leva só acontece se a conferência filme a filme cortou gente demais.
  for (let leva = 0; leva < levas && escolhidos.size < quantos; leva++) {
    const paginas = paginasAleatorias(max, 3);
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
      candidatos = await enriquecer(candidatos.slice(0, quantos + 10));
      if (usarImdb && notaMin > 0) {
        candidatos = candidatos.filter((filme) => notaDeReferencia(filme) >= notaMin);
      }
      if (soTrailerPt) {
        candidatos = candidatos.filter((filme) => filme.portugues?.trailer || filme.portugues?.original);
      }
    }
    for (const filme of candidatos) {
      if (escolhidos.size < quantos) escolhidos.set(filme.id, filme);
    }
    if (max <= 3 || !conferirUmAUm) break; // não há páginas novas a tentar
  }

  return { total: meta.total, filmes: [...escolhidos.values()] };
}

function sortearDemo(f, vistos, quantos) {
  const incluir = Object.keys(f.generos).filter((id) => f.generos[id] === 1).map(Number);
  const excluir = Object.keys(f.generos).filter((id) => f.generos[id] === -1).map(Number);
  const { de, ate } = intervaloEpoca(f);
  const [durMin, durMax] = DURACOES[f.duracao] || [null, null];
  let notaMin = Number(f.notaMin) || 0;
  if (f.achado === 'aclamados') notaMin = Math.max(notaMin, 7.5);

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
    if (f.idioma && m.idioma !== f.idioma) return false;
    if (f.portugues === 'original' && m.idioma !== 'pt') return false;
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
    if (/dublado|legendado/i.test(nome)) pontos += 6;
    if (v.official) pontos += 2;
    if (!melhor || pontos > melhor.pontos) {
      let versao = 'original';
      if (/dublado/i.test(nome)) versao = 'dublado';
      else if (/legendado/i.test(nome)) versao = 'legendado';
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
