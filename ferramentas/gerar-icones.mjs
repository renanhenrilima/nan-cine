// Desenha os ícones do app e a imagem de capa do link (PNG) sem depender de nenhum programa:
//   node ferramentas/gerar-icones.mjs
// Saída em img/: icone-192.png, icone-512.png, icone-maskable-512.png e capa.png (1200 × 630).
// Os arquivos já estão no repositório; só rode de novo se quiser mudar o desenho.

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PASTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'img');

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const VINHO = hex('#8e1126');
const VELUDO = hex('#35101a');
const FUNDO = hex('#14050a');
const LATAO = hex('#d9a441');
const LATAO_CLARO = hex('#f0c56a');
const LAMPADA = hex('#ffe9a8');
const PRETO = hex('#0c0306');
const mistura = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Cor da roleta no ponto (x, y), em unidades do raio (centro em 0,0). Devolve null fora dela. */
function roleta(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1) return null;
  const ang = Math.atan2(y, x);

  if (r > 0.94) return LATAO;
  if (r > 0.86) {
    // Aro escuro com as lâmpadas (36 pontinhos).
    const passo = (Math.PI * 2) / 36;
    const d = Math.abs(((ang % passo) + passo) % passo - passo / 2);
    return (Math.abs(r - 0.9) * 1 < 0.032 && d * r < 0.03) ? LAMPADA : PRETO;
  }

  // Ponteiro dourado no topo.
  const px = Math.abs(x);
  if (y < -0.62 && y > -0.9 && px < (y + 0.9) * 0.34 + 0.0) return LATAO_CLARO;

  if (r > 0.3) {
    const fatia = (Math.PI * 2) / 12;
    const a = (((ang + Math.PI / 2 + fatia / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dentro = a % fatia;
    const indice = Math.floor(a / fatia);
    const borda = Math.min(dentro, fatia - dentro) * r;
    if (borda < 0.014) return LATAO;
    const base = indice % 2 === 0 ? VINHO : VELUDO;
    // Luz suave vinda da borda.
    return mistura(base, LAMPADA, Math.max(0, (r - 0.7) / 0.16) * 0.12);
  }

  // Miolo dourado.
  if (r > 0.27) return PRETO;
  return mistura(LATAO_CLARO, LATAO, r / 0.27);
}

function desenhar(largura, altura, pixelFn) {
  const dados = Buffer.alloc((largura * 4 + 1) * altura);
  const AA = 3; // 3 × 3 amostras por pixel, para bordas lisas
  for (let py = 0; py < altura; py++) {
    const linha = py * (largura * 4 + 1);
    dados[linha] = 0;
    for (let px = 0; px < largura; px++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < AA; sy++) {
        for (let sx = 0; sx < AA; sx++) {
          const cor = pixelFn(px + (sx + 0.5) / AA, py + (sy + 0.5) / AA);
          if (cor) { r += cor[0]; g += cor[1]; b += cor[2]; a += 1; }
        }
      }
      const o = linha + 1 + px * 4;
      if (a) {
        dados[o] = Math.round(r / a);
        dados[o + 1] = Math.round(g / a);
        dados[o + 2] = Math.round(b / a);
        dados[o + 3] = Math.round((a / (AA * AA)) * 255);
      }
    }
  }
  return dados;
}

const tabelaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = tabelaCrc[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function bloco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

function png(largura, altura, pixelFn) {
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(largura, 0);
  cab.writeUInt32BE(altura, 4);
  cab[8] = 8; // 8 bits por canal
  cab[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cab),
    bloco('IDAT', deflateSync(desenhar(largura, altura, pixelFn), { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/** Ícone quadrado: fundo de veludo e a roleta com `raio` (fração do lado). */
const icone = (lado, raio, cantos) => png(lado, lado, (x, y) => {
  const cx = lado / 2;
  const cy = lado / 2;
  const cor = roleta((x - cx) / (raio * lado), (y - cy) / (raio * lado));
  if (cor) return cor;
  if (cantos) {
    // Cantos arredondados no ícone comum; o "maskable" vai até a borda.
    const dx = Math.max(Math.abs(x - cx) - (cx - lado * 0.18), 0);
    const dy = Math.max(Math.abs(y - cy) - (cy - lado * 0.18), 0);
    if (Math.hypot(dx, dy) > lado * 0.18) return null;
  }
  return mistura(FUNDO, VELUDO, Math.hypot(x - cx, y - cy) / lado * 0.6);
});

/** Capa do link (1200 × 630): cortinas dos lados e a roleta no centro. */
const capa = () => png(1200, 630, (x, y) => {
  const cor = roleta((x - 600) / 250, (y - 330) / 250);
  if (cor) return cor;
  if (x < 250 || x > 950) {
    const lado = x < 250 ? x : 1200 - x;
    const prega = 0.5 + 0.5 * Math.sin(lado / 11);
    const topo = Math.min(1, 0.6 + y / 260);
    return mistura(mistura(hex('#48060f'), hex('#a3162e'), prega), FUNDO, 1 - topo * (1 - Math.max(0, (lado - 200) / 120) * 0.5));
  }
  // Tela escura com um brilho suave atrás da roleta.
  const d = Math.hypot((x - 600) / 420, (y - 330) / 300);
  return mistura(hex('#2b2326'), FUNDO, Math.min(1, d * 0.9));
});

await mkdir(PASTA, { recursive: true });
await writeFile(path.join(PASTA, 'icone-192.png'), icone(192, 0.42, true));
await writeFile(path.join(PASTA, 'icone-512.png'), icone(512, 0.42, true));
await writeFile(path.join(PASTA, 'icone-maskable-512.png'), icone(512, 0.34, false));
await writeFile(path.join(PASTA, 'capa.png'), capa());
console.log('Ícones gravados em img/.');
