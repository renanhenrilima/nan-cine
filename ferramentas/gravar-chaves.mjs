// Usado na publicação automática: grava em js/config.js a chave do TMDB que vem
// da variável de ambiente TMDB_KEY (segredo do GitHub).
// Assim a chave não precisa ficar escrita no repositório.
//
// A chave do OMDb (OMDB_KEY) NÃO é gravada aqui: ela só é usada pelo script
// ferramentas/atualizar-criticos.mjs, dentro do GitHub. Se fosse para o site, qualquer
// pessoa poderia gastar a cota diária dela.
//
//   TMDB_KEY=xxxx node ferramentas/gravar-chaves.mjs [caminho-do-config]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const padrao = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'config.js');
const arquivo = process.argv[2] ? path.resolve(process.argv[2]) : padrao;

let texto = await readFile(arquivo, 'utf8');
let gravadas = 0;

for (const nome of ['TMDB_KEY']) {
  const valor = (process.env[nome] || '').trim();
  if (!valor) continue;
  if (!/^[\w.-]+$/.test(valor)) {
    console.error(`${nome} tem caracteres inesperados. Confira o segredo.`);
    process.exit(1);
  }
  const antes = texto;
  texto = texto.replace(new RegExp(`(${nome}:\\s*)'[^']*'`), `$1'${valor}'`);
  if (texto !== antes) gravadas++;
}

await writeFile(arquivo, texto);
console.log(gravadas
  ? `${gravadas} chave(s) gravada(s) em ${path.basename(arquivo)}.`
  : 'Nenhuma chave nas variáveis de ambiente: o site sai em modo demonstração.');
