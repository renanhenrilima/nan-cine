// Baixa as notas oficiais do IMDb e prepara a pasta dados/imdb/ para o app.
//
//   node ferramentas/atualizar-imdb.mjs
//
// Fonte: https://datasets.imdbws.com/title.ratings.tsv.gz (atualizado todo dia
// pelo IMDb, liberado para uso pessoal e não comercial).
//
// O arquivo é repartido em 256 fatias pequenas (00.txt … ff.txt). O app baixa
// só as fatias dos filmes que estão na roleta, então nada pesa no carregamento.
// Cada linha: <número do id sem "tt">,<nota × 10>,<votos arredondados>

import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGEM = 'https://datasets.imdbws.com/title.ratings.tsv.gz';
const FATIAS = 256;
const MIN_VOTOS = Number(process.env.IMDB_MIN_VOTOS || 100);
const DESTINO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dados', 'imdb');

// Votos com 2 algarismos significativos: 2.134.567 → 2.100.000.
function arredondar(votos) {
  if (votos < 100) return votos;
  const casa = 10 ** (String(votos).length - 2);
  return Math.round(votos / casa) * casa;
}

console.log(`Baixando ${ORIGEM} …`);
const resposta = await fetch(ORIGEM);
if (!resposta.ok || !resposta.body) {
  console.error(`O IMDb respondeu com erro ${resposta.status}. Nada foi alterado.`);
  process.exit(1);
}

const linhas = createInterface({
  input: Readable.fromWeb(resposta.body).pipe(createGunzip()),
  crlfDelay: Infinity,
});

const fatias = Array.from({ length: FATIAS }, () => []);
let lidos = 0;
let guardados = 0;

for await (const linha of linhas) {
  if (!linha.startsWith('tt')) continue; // pula o cabeçalho
  lidos++;
  const [tconst, nota, votosBrutos] = linha.split('\t');
  const votos = Number(votosBrutos);
  const id = Number(tconst.slice(2));
  const nota10 = Math.round(Number(nota) * 10);
  if (!id || !nota10 || votos < MIN_VOTOS) continue;
  fatias[id % FATIAS].push(`${id},${nota10},${arredondar(votos)}`);
  guardados++;
}

if (guardados < 10000) {
  console.error(`Só ${guardados} títulos lidos: o arquivo parece incompleto. Nada foi alterado.`);
  process.exit(1);
}

await rm(DESTINO, { recursive: true, force: true });
await mkdir(DESTINO, { recursive: true });
await Promise.all(fatias.map((conteudo, i) => (
  writeFile(path.join(DESTINO, `${i.toString(16).padStart(2, '0')}.txt`), conteudo.join('\n'))
)));

const agora = new Date();
await writeFile(path.join(DESTINO, 'info.json'), JSON.stringify({
  fonte: 'IMDb (datasets.imdbws.com)',
  atualizado: agora.toISOString(),
  versao: agora.toISOString().slice(0, 10).replaceAll('-', ''),
  fatias: FATIAS,
  minVotos: MIN_VOTOS,
  titulos: guardados,
}, null, 2));

console.log(`${lidos.toLocaleString('pt-BR')} títulos lidos, ${guardados.toLocaleString('pt-BR')} guardados (${MIN_VOTOS}+ votos).`);
console.log(`Pasta pronta: ${DESTINO}`);
