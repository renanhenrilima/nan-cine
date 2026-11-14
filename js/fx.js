// Chuva de confete dourado na revelação do filme.

import { movimentoReduzido } from './util.js';

const CORES = ['#D9A441', '#FFE9A8', '#F3E3C3', '#8E1126', '#BFE3F2'];

export function confete(canvas, quantidade = 150) {
  if (movimentoReduzido()) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const larg = window.innerWidth;
  const alt = window.innerHeight;
  canvas.width = larg * dpr;
  canvas.height = alt * dpr;
  canvas.hidden = false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Duas rajadas, saindo dos cantos de cima do "palco".
  const pecas = Array.from({ length: quantidade }, (_, i) => {
    const daEsquerda = i % 2 === 0;
    const angulo = (daEsquerda ? -0.35 : Math.PI + 0.35) + (Math.random() - 0.5) * 1.1;
    const forca = 7 + Math.random() * 11;
    return {
      x: daEsquerda ? larg * 0.08 : larg * 0.92,
      y: alt * 0.22,
      vx: Math.cos(angulo) * forca,
      vy: Math.sin(angulo) * forca - 5,
      largura: 5 + Math.random() * 7,
      altura: 8 + Math.random() * 10,
      giro: Math.random() * Math.PI,
      vGiro: (Math.random() - 0.5) * 0.4,
      balanco: Math.random() * Math.PI * 2,
      cor: CORES[Math.floor(Math.random() * CORES.length)],
      vida: 1,
    };
  });

  let anterior = performance.now();
  const quadro = (agora) => {
    const dt = Math.min(2.2, (agora - anterior) / 16.67);
    anterior = agora;
    ctx.clearRect(0, 0, larg, alt);

    let vivas = 0;
    for (const p of pecas) {
      p.vx *= 0.985 ** dt;
      p.vy = p.vy * 0.985 ** dt + 0.32 * dt;
      p.balanco += 0.12 * dt;
      p.x += (p.vx + Math.sin(p.balanco) * 0.9) * dt;
      p.y += p.vy * dt;
      p.giro += p.vGiro * dt;
      if (p.y > alt * 0.6) p.vida -= 0.012 * dt;
      if (p.vida <= 0 || p.y > alt + 30) continue;
      vivas++;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.vida));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.scale(1, Math.cos(p.balanco)); // a peça "vira" enquanto cai
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura);
      ctx.restore();
    }

    if (vivas) {
      requestAnimationFrame(quadro);
    } else {
      ctx.clearRect(0, 0, larg, alt);
      canvas.hidden = true;
    }
  };
  requestAnimationFrame(quadro);
}
