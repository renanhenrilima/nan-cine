// Servidor local para testar o Nan Cine no computador e no celular (mesma rede Wi-Fi):
//   node servidor.mjs        → http://localhost:8642 e http://<ip-do-pc>:8642
// Publicado, o Nan Cine é só arquivo estático: não precisa deste servidor.
//
// A chave do TMDB entra só na hora de servir js/config.js: vem da variável
// TMDB_KEY ou, se ela não existir, do config.js do site publicado (que já é público).
// Nenhum arquivo do projeto é alterado.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT || process.argv[2] || 8642);
const SITE_PUBLICADO = 'https://renanhenrilima.github.io/nan-cine/js/config.js';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// O servidor fica aberto para a rede de casa: só entrega o que o site usa.
const PERMITIDOS = [/^\/$/, /^\/index\.html$/, /^\/css\/[\w.-]+\.css$/, /^\/js\/[\w.-]+\.js$/, /^\/dados\/imdb\/[\w.-]+\.(txt|json)$/, /^\/dados\/premios\.json$/, /^\/dados\/criticos\/[\w.-]+\.(txt|json)$/];

async function obterChave() {
  if (process.env.TMDB_KEY) return { chave: process.env.TMDB_KEY.trim(), origem: 'variável TMDB_KEY' };
  try {
    const resposta = await fetch(SITE_PUBLICADO, { signal: AbortSignal.timeout(8000) });
    const texto = await resposta.text();
    const chave = texto.match(/TMDB_KEY:\s*'([\w.-]+)'/)?.[1] || '';
    return { chave, origem: chave ? 'site publicado' : '' };
  } catch {
    return { chave: '', origem: '' };
  }
}

const { chave, origem } = await obterChave();

const servidor = createServer(async (pedido, resposta) => {
  try {
    const caminho = decodeURIComponent(new URL(pedido.url, 'http://localhost').pathname);
    if (!PERMITIDOS.some((regra) => regra.test(caminho))) throw new Error('não permitido');
    let arquivo = path.normalize(path.join(RAIZ, caminho));
    if (!arquivo.startsWith(RAIZ)) throw new Error('fora da pasta');
    if ((await stat(arquivo)).isDirectory()) arquivo = path.join(arquivo, 'index.html');

    let conteudo = await readFile(arquivo);
    if (caminho === '/js/config.js' && chave) {
      conteudo = conteudo.toString('utf8').replace(/TMDB_KEY:\s*''/, `TMDB_KEY: '${chave}'`);
    }
    resposta.writeHead(200, {
      'content-type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    resposta.end('Arquivo não encontrado');
  }
});

function enderecosDaRede() {
  return Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && /^(192\.168|10\.)/.test(i.address))
    .map((i) => i.address);
}

// Se a porta estiver ocupada por outro programa, tenta outras (pulando as dos emuladores, 8643 a 8648).
let porta = PORTA;
servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE' && porta < PORTA + 20) {
    porta = porta === PORTA ? PORTA + 8 : porta + 1;
    servidor.listen(porta, '0.0.0.0');
  } else {
    console.error(`Não foi possível abrir o servidor: ${erro.message}`);
    process.exit(1);
  }
});
servidor.on('listening', () => {
  console.log('');
  console.log(`  Nan Cine no computador:  http://localhost:${porta}`);
  for (const ip of enderecosDaRede()) console.log(`  No celular (mesmo Wi-Fi): http://${ip}:${porta}`);
  console.log(chave ? `  Catálogo ao vivo do TMDB ligado (chave do ${origem}).` : '  Sem chave do TMDB: o app abre no modo demonstração.');
  console.log('');
});
servidor.listen(porta, '0.0.0.0');
