// Monta dados/premios.json: a lista de filmes vencedores de prêmios (Oscar, Globo de
// Ouro, BAFTA e os três grandes festivais) para o filtro "Vencedores de prêmios".
//
//   TMDB_KEY=xxxx node ferramentas/atualizar-premios.mjs
//
// De onde vem: o Wikidata (base livre da Wikipédia) diz quais filmes ganharam cada prêmio
// e o código do filme no IMDb; o TMDB traduz esse código no número do filme e dá ano,
// gêneros e duração. O arquivo pronto é pequeno e vai junto com o site.
// Os Grammys não entram: premiam música, não filmes.

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SAIDA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dados', 'premios.json');
const CHAVE = (process.env.TMDB_KEY || '').trim();
if (!CHAVE) {
  console.error('Faltou a variável TMDB_KEY.');
  process.exit(1);
}

export const PREMIOS = {
  oscar: 'Oscar',
  globo: 'Globo de Ouro',
  bafta: 'BAFTA',
  cannes: 'Palma de Ouro (Cannes)',
  berlim: 'Urso de Ouro (Berlim)',
  veneza: 'Leão de Ouro (Veneza)',
};

const CONSULTA = `
SELECT DISTINCT ?imdb ?premio WHERE {
  {
    { ?f wdt:P166 ?aw . ?aw wdt:P31/wdt:P279* wd:Q19020 . BIND("oscar" AS ?premio) }
    UNION { ?f wdt:P166 ?aw . ?aw (wdt:P31|wdt:P279|wdt:P361)* wd:Q1011547 . BIND("globo" AS ?premio) }
    UNION { ?f wdt:P166 ?aw . ?aw (wdt:P31|wdt:P279|wdt:P361)* wd:Q732997 . BIND("bafta" AS ?premio) }
    UNION { ?f wdt:P166 wd:Q179808 . BIND("cannes" AS ?premio) }
    UNION { ?f wdt:P166 wd:Q154590 . BIND("berlim" AS ?premio) }
    UNION { ?f wdt:P166 wd:Q209459 . BIND("veneza" AS ?premio) }
  }
  ?f wdt:P31/wdt:P279* wd:Q11424 ; wdt:P345 ?imdb .
  FILTER(STRSTARTS(?imdb, "tt"))
}`;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function comTentativas(fazer, nome, vezes = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fazer();
    } catch (erro) {
      if (i >= vezes) throw new Error(`${nome}: ${erro.message}`);
      await esperar(1500 * i);
    }
  }
}

async function wikidata() {
  const url = `https://query.wikidata.org/sparql?${new URLSearchParams({ query: CONSULTA, format: 'json' })}`;
  const r = await fetch(url, {
    headers: { accept: 'application/sparql-results+json', 'user-agent': 'NanCine/1.0 (projeto pessoal sem fins comerciais)' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Wikidata respondeu ${r.status}`);
  const dados = await r.json();
  const filmes = new Map(); // tt... → Set de prêmios
  for (const linha of dados.results.bindings) {
    const imdb = linha.imdb.value;
    if (!filmes.has(imdb)) filmes.set(imdb, new Set());
    filmes.get(imdb).add(linha.premio.value);
  }
  return filmes;
}

async function tmdb(caminho, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let headers;
  if (CHAVE.startsWith('eyJ')) headers = { authorization: `Bearer ${CHAVE}` };
  else url.searchParams.set('api_key', CHAVE);
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (r.status === 429) {
    await esperar((Number(r.headers.get('retry-after')) || 2) * 1000);
    throw new Error('limite do TMDB');
  }
  if (!r.ok) throw new Error(`TMDB respondeu ${r.status}`);
  return r.json();
}

async function emParalelo(itens, quantos, trabalho) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  await Promise.all(Array.from({ length: quantos }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await trabalho(itens[i], i);
    }
  }));
  return resultados;
}

console.log('Consultando o Wikidata…');
const vencedores = await comTentativas(wikidata, 'Wikidata');
console.log(`${vencedores.size} filmes com algum prêmio.`);

const lista = [...vencedores.entries()];
let falhas = 0;
const prontos = await emParalelo(lista, 10, async ([imdb, premios]) => {
  try {
    const achado = await comTentativas(() => tmdb(`/find/${imdb}`, { external_source: 'imdb_id' }), imdb);
    const filme = achado.movie_results?.[0];
    if (!filme) return null;
    const d = await comTentativas(() => tmdb(`/movie/${filme.id}`), String(filme.id));
    if (!d.release_date) return null;
    return [
      d.id,
      Number(imdb.replace(/\D/g, '')),
      Number(d.release_date.slice(0, 4)),
      (d.genres || []).map((g) => g.id),
      d.runtime || 0,
      [...premios].sort(),
    ];
  } catch {
    falhas++;
    return null;
  }
});

const filmes = prontos.filter(Boolean).sort((a, b) => a[0] - b[0]);
console.log(`${filmes.length} filmes encontrados no TMDB (${falhas} falhas).`);

// Uma lista muito menor que a esperada quase certamente é uma falha: não sobrescreve a boa.
if (filmes.length < 1200) {
  console.error('Poucos filmes para ser verdade. Mantendo o arquivo anterior.');
  process.exit(1);
}

const contagem = Object.fromEntries(Object.keys(PREMIOS).map((p) => [p, filmes.filter((f) => f[5].includes(p)).length]));
await mkdir(path.dirname(SAIDA), { recursive: true });
await writeFile(SAIDA, JSON.stringify({
  fonte: 'Wikidata + TMDB',
  atualizado: new Date().toISOString(),
  premios: PREMIOS,
  // [tmdb, imdb, ano, gêneros, duração, prêmios]
  filmes,
}));
console.log('Gravado em dados/premios.json:', contagem);
