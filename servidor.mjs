// Servidor local mínimo, só para testar no seu computador:
//   node servidor.mjs        → http://127.0.0.1:8642
// (Publicado, o Nan Cine é só arquivo estático: não precisa deste servidor.)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT || process.argv[2] || 8642);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const servidor = createServer(async (pedido, resposta) => {
  try {
    const caminho = decodeURIComponent(new URL(pedido.url, 'http://localhost').pathname);
    let arquivo = path.normalize(path.join(RAIZ, caminho));
    if (!arquivo.startsWith(RAIZ)) throw new Error('fora da pasta');
    if ((await stat(arquivo)).isDirectory()) arquivo = path.join(arquivo, 'index.html');
    const conteudo = await readFile(arquivo);
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

// Se a porta estiver ocupada por outro programa, tenta as dez seguintes.
// O endereço 127.0.0.1 é fixo para não dividir a porta com outro servidor local.
const ENDERECO = '127.0.0.1';
let porta = PORTA;
servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE' && porta < PORTA + 10) {
    porta += 1;
    servidor.listen(porta, ENDERECO);
  } else {
    console.error(`Não foi possível abrir o servidor: ${erro.message}`);
    process.exit(1);
  }
});
servidor.on('listening', () => {
  console.log(`Nan Cine no ar: http://${ENDERECO}:${porta}`);
  console.log('Para parar, feche esta janela ou aperte Ctrl+C.');
});
servidor.listen(porta, ENDERECO);
