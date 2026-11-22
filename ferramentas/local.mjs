// Sobe o Nan Cine completo para testar em casa, no computador e no celular:
//   - os emuladores do Firebase (contas e banco de dados, tudo na sua máquina);
//   - o servidor do site.
// Uso: node ferramentas/local.mjs   (ou dê dois cliques em iniciar.bat)
//
// Os dados de teste (contas, salas, notas) ficam guardados na pasta .emulador
// e voltam na próxima vez. Para começar do zero, apague essa pasta.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, '.emulador');
const windows = process.platform === 'win32';

// Caminho relativo: no Windows o comando passa por um shell, e a pasta do projeto tem espaço no nome.
const argumentos = ['emulators:start', '--project', 'demo-nancine', '--only', 'auth,firestore', '--export-on-exit', '.emulador'];
if (existsSync(path.join(DADOS, 'firebase-export-metadata.json'))) argumentos.push('--import', '.emulador');

console.log('Ligando os emuladores do Firebase (contas e banco de dados locais)…');
const emuladores = spawn(windows ? 'firebase.cmd' : 'firebase', argumentos, {
  cwd: RAIZ, shell: windows, stdio: ['ignore', 'pipe', 'pipe'],
});

let servidor = null;
const ligarServidor = () => {
  if (servidor) return;
  servidor = spawn(process.execPath, [path.join(RAIZ, 'servidor.mjs')], { cwd: RAIZ, stdio: 'inherit' });
};

emuladores.stdout.on('data', (pedaco) => {
  const texto = pedaco.toString();
  if (/All emulators ready|It is now safe to connect/i.test(texto)) {
    console.log('Emuladores prontos. Painel do banco de teste: http://127.0.0.1:8645');
    ligarServidor();
  }
  if (/error|could not|failed/i.test(texto)) process.stdout.write(texto);
});
emuladores.stderr.on('data', (pedaco) => process.stderr.write(pedaco));
emuladores.on('exit', (codigo) => {
  if (!servidor) console.error(`Os emuladores não ligaram (código ${codigo}). Confira se o Java e o firebase-tools estão instalados.`);
  servidor?.kill();
  process.exit(codigo ?? 0);
});

// Ctrl+C: o servidor para e os emuladores guardam os dados antes de fechar.
process.on('SIGINT', () => {
  console.log('\nDesligando e guardando os dados de teste…');
  servidor?.kill();
  emuladores.kill('SIGINT');
});
