// Monta dados/criticos: as notas dos críticos (Metacritic e Rotten Tomatoes) e o resumo
// de prêmios de cada filme, vindos do OMDb.
//
//   OMDB_KEY=xxxx TMDB_KEY=yyyy node ferramentas/atualizar-criticos.mjs [--max 900]
//
// O OMDb libera 1.000 consultas por dia na chave gratuita. Por isso o script junta pouco
// a pouco: a cada execução consulta até --max filmes (os de mais votos no IMDb primeiro;
// quando todos já foram vistos, renova os mais antigos) e soma ao que já existia. O que
// existia vem do site publicado (ou, na primeira vez, da pasta dados/criticos).
// Assim ninguém no site gasta a cota: o app só lê os arquivos prontos.
//
// Arquivos gerados em dados/criticos:
//   info.json        resumo (quantos filmes, quando)
//   00.txt … ff.txt  uma linha por filme: id do IMDb, Metascore, Rotten Tomatoes, dia, prêmios
//                    (repartidos pelo id do IMDb, como as notas do IMDb)
//   pool.json        filmes com média dos críticos de 70 ou mais, com ano, gêneros e duração,
//                    para o sorteio do filtro "Melhor avaliação dos críticos"

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, 'dados', 'criticos');
const PASTA_IMDB = path.join(RAIZ, 'dados', 'imdb');
const SITE = (process.env.SITE_URL || 'https://renanhenrilima.github.io/nan-cine/').replace(/\/?$/, '/');
const FATIAS = 256;
const VOTOS_MIN = 3000;      // só vale a pena consultar filmes que os críticos já comentaram
const MEDIA_MIN_POOL = 70;
const HOJE = Math.floor(Date.now() / 864e5); // dias desde 1970

const argumento = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : padrao;
};
const MAXIMO = Number(argumento('max', process.env.CRITICOS_MAX ?? 900));
const OMDB = (process.env.OMDB_KEY || '').trim();
const TMDB = (process.env.TMDB_KEY || '').trim();
if (MAXIMO > 0 && !OMDB) {
  console.error('Faltou a variável OMDB_KEY.');
  process.exit(1);
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const nomeFatia = (id) => (id % FATIAS).toString(16).padStart(2, '0');
const idImdb = (n) => `tt${String(n).padStart(7, '0')}`;

/* ---------- O que já existia ---------- */

async function lerTexto(arquivo, url) {
  try {
    const r = await fetch(`${SITE}${url}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    if (r.ok) return { texto: await r.text(), origem: 'site' };
  } catch { /* cai para o arquivo local */ }
  try {
    return { texto: await readFile(path.join(PASTA, arquivo), 'utf8'), origem: 'repositório' };
  } catch {
    return { texto: '', origem: '' };
  }
}

/** Linha: id \t Metascore \t RT \t dia \t prêmios. Metascore "x" = não é filme (não consultar de novo). */
function lerLinhas(texto, mapa) {
  for (const linha of texto.split('\n')) {
    if (!linha) continue;
    const [id, meta, rt, dia, premio] = linha.split('\t');
    mapa.set(Number(id), { meta, rt, dia: Number(dia) || 0, premio: premio || '' });
  }
}

async function carregarBase() {
  const base = new Map();
  let origem = '';
  await Promise.all(Array.from({ length: FATIAS }, async (_, i) => {
    const nome = i.toString(16).padStart(2, '0');
    const { texto, origem: o } = await lerTexto(`${nome}.txt`, `dados/criticos/${nome}.txt`);
    if (o && !origem) origem = o;
    lerLinhas(texto, base);
  }));
  const { texto } = await lerTexto('pool.json', 'dados/criticos/pool.json');
  let pool = [];
  try { pool = JSON.parse(texto).filmes || []; } catch { /* sem pool anterior */ }
  return { base, pool, origem };
}

/* ---------- Quem consultar ---------- */

async function candidatos() {
  const lista = [];
  for (const arq of await readdir(PASTA_IMDB)) {
    if (!/^[0-9a-f]{2}\.txt$/.test(arq)) continue;
    for (const linha of (await readFile(path.join(PASTA_IMDB, arq), 'utf8')).split('\n')) {
      const [id, , votos] = linha.split(',');
      if (id && Number(votos) >= VOTOS_MIN) lista.push([Number(id), Number(votos)]);
    }
  }
  return lista.sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/* ---------- OMDb ---------- */

class LimiteAtingido extends Error {}

async function omdb(id) {
  const url = `https://www.omdbapi.com/?${new URLSearchParams({ apikey: OMDB, i: idImdb(id) })}`;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (r.status === 401) throw new LimiteAtingido('chave recusada ou limite do dia');
      const d = await r.json();
      if (d.Response === 'False') {
        if (/limit/i.test(d.Error || '')) throw new LimiteAtingido(d.Error);
        if (/invalid api key/i.test(d.Error || '')) throw new LimiteAtingido(d.Error);
        return { meta: 'x', rt: '', premio: '' }; // não achou no OMDb
      }
      if (d.Type !== 'movie') return { meta: 'x', rt: '', premio: '' };
      const meta = Number.parseInt(d.Metascore, 10);
      const rt = Number.parseInt((d.Ratings || []).find((x) => x.Source === 'Rotten Tomatoes')?.Value, 10);
      return {
        meta: Number.isFinite(meta) ? String(meta) : '',
        rt: Number.isFinite(rt) ? String(rt) : '',
        premio: d.Awards && d.Awards !== 'N/A' ? d.Awards.replace(/[\t\n]/g, ' ') : '',
      };
    } catch (erro) {
      if (erro instanceof LimiteAtingido) throw erro;
      if (tentativa === 3) return null;
      await esperar(1000 * tentativa);
    }
  }
  return null;
}

const media = ({ meta, rt }) => {
  const notas = [meta, rt].filter((v) => v !== '' && v !== 'x' && Number.isFinite(Number(v))).map(Number);
  return notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
};

/* ---------- TMDB (para o pool) ---------- */

async function tmdb(caminho, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let headers;
  if (TMDB.startsWith('eyJ')) headers = { authorization: `Bearer ${TMDB}` };
  else url.searchParams.set('api_key', TMDB);
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (r.status === 429) { await esperar(2000 * tentativa); continue; }
    if (!r.ok) throw new Error(`TMDB respondeu ${r.status}`);
    return r.json();
  }
  throw new Error('limite do TMDB');
}

async function emParalelo(itens, quantos, trabalho) {
  let proximo = 0;
  await Promise.all(Array.from({ length: quantos }, async () => {
    while (proximo < itens.length) await trabalho(itens[proximo++]);
  }));
}

/* ---------- Principal ---------- */

const { base, pool: poolAnterior, origem } = await carregarBase();
console.log(`Base anterior: ${base.size} filmes (${origem || 'nenhuma'}).`);

if (MAXIMO > 0) {
  const todos = await candidatos();
  const novos = todos.filter((id) => !base.has(id));
  const alvos = novos.slice(0, MAXIMO);
  if (alvos.length < MAXIMO) {
    // Tudo já visto: renova os mais antigos.
    const antigos = [...base.entries()].filter(([, v]) => v.meta !== 'x').sort((a, b) => a[1].dia - b[1].dia);
    alvos.push(...antigos.slice(0, MAXIMO - alvos.length).map(([id]) => id));
  }
  console.log(`Consultando ${alvos.length} filmes no OMDb (${novos.length} ainda não vistos).`);

  let feitos = 0;
  let parou = '';
  await emParalelo(alvos, 5, async (id) => {
    if (parou) return;
    try {
      const r = await omdb(id);
      if (!r) return;
      const antes = base.get(id);
      // Se o OMDb vier sem nota num filme que já tinha, mantém a antiga.
      base.set(id, { ...r, meta: r.meta === '' && antes?.meta && antes.meta !== 'x' ? antes.meta : r.meta,
        rt: r.rt === '' && antes?.rt ? antes.rt : r.rt, dia: HOJE });
      feitos++;
    } catch (erro) {
      parou = erro.message;
    }
  });
  console.log(`${feitos} filmes atualizados.${parou ? ` Parou: ${parou}` : ''}`);
}

// Escreve as fatias.
await mkdir(PASTA, { recursive: true });
const porFatia = Array.from({ length: FATIAS }, () => []);
for (const [id, v] of [...base.entries()].sort((a, b) => a[0] - b[0])) {
  porFatia[id % FATIAS].push(`${id}\t${v.meta}\t${v.rt}\t${v.dia}\t${v.premio}`);
}
await Promise.all(porFatia.map((linhas, i) => writeFile(path.join(PASTA, `${i.toString(16).padStart(2, '0')}.txt`), linhas.join('\n'))));

const comNota = [...base.values()].filter((v) => media(v) !== null).length;

// Pool: filmes com média alta, com os dados do TMDB para o sorteio.
const anteriores = new Map(poolAnterior.map((f) => [f[1], f]));
const pool = [];
const faltaTmdb = [];
for (const [id, v] of base) {
  const m = media(v);
  if (m === null || m < MEDIA_MIN_POOL) continue;
  const antes = anteriores.get(id);
  if (antes) pool.push([antes[0], id, antes[2], antes[3], antes[4], m]);
  else faltaTmdb.push([id, m]);
}
if (faltaTmdb.length && !TMDB) {
  console.warn(`${faltaTmdb.length} filmes ficaram fora do pool por falta de TMDB_KEY.`);
} else if (faltaTmdb.length) {
  console.log(`Buscando no TMDB ${faltaTmdb.length} filmes para o pool…`);
  await emParalelo(faltaTmdb, 8, async ([id, m]) => {
    try {
      const achado = await tmdb(`/find/${idImdb(id)}`, { external_source: 'imdb_id' });
      const filme = achado.movie_results?.[0];
      if (!filme) return;
      const d = await tmdb(`/movie/${filme.id}`);
      if (!d.release_date) return;
      pool.push([d.id, id, Number(d.release_date.slice(0, 4)), (d.genres || []).map((g) => g.id), d.runtime || 0, m]);
    } catch { /* tenta de novo na próxima execução */ }
  });
}
pool.sort((a, b) => a[0] - b[0]);

const agora = new Date().toISOString();
await writeFile(path.join(PASTA, 'pool.json'), JSON.stringify({
  fonte: 'OMDb (Metacritic e Rotten Tomatoes) + TMDB',
  atualizado: agora,
  minimo: MEDIA_MIN_POOL,
  // [tmdb, imdb, ano, gêneros, duração, média dos críticos]
  filmes: pool,
}));
await writeFile(path.join(PASTA, 'info.json'), JSON.stringify({
  fonte: 'OMDb (omdbapi.com)',
  atualizado: agora,
  versao: agora.slice(0, 10).replaceAll('-', ''),
  fatias: FATIAS,
  filmes: base.size,
  comNota,
  noPool: pool.length,
}, null, 2));
console.log(`Gravado: ${base.size} filmes (${comNota} com nota de críticos), ${pool.length} no pool.`);
