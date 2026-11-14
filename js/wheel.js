// A roleta é só espetáculo: fatias misteriosas com "????", sem nenhum filme.
// O filme é sorteado à parte (em main.js), entre todos os que passam pelos
// filtros, e só aparece quando a cortina abre.
//
// As fatias são desenhadas uma vez num canvas, e o canvas inteiro gira por
// transform (barato para a GPU, liso até em celular).

import { movimentoReduzido } from './util.js';

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const FUNDOS = ['#8E1126', '#35101A', '#5C0A18', '#22080F'];
const LATAO = '#D9A441';
const LAMPADA = '#FFE9A8';
const PAPEL = '#F3E3C3';

// Quatro interrogações por fatia, crescendo do centro para a borda.
const INTERROGACOES = [
  { raio: 0.41, corpo: 0.1 },
  { raio: 0.545, corpo: 0.125 },
  { raio: 0.695, corpo: 0.15 },
  { raio: 0.86, corpo: 0.175 },
];

export class Roleta {
  constructor({ canvas, giro, ponteiro, fatias = 12, aoTique }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.giro = giro;
    this.ponteiro = ponteiro;
    this.fatias = Math.max(6, fatias);
    this.aoTique = aoTique || (() => {});
    this.angulo = 0;
    this.destaque = -1;
    this.girando = false;

    new ResizeObserver(() => this.redimensionar()).observe(giro);
    this.redimensionar();
  }

  /** Apaga o brilho da fatia em que a roda parou na rodada anterior. */
  limparDestaque() {
    if (this.destaque < 0 || this.girando) return;
    this.destaque = -1;
    this.desenhar();
  }

  redimensionar() {
    const lado = this.giro.clientWidth;
    if (!lado) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(lado * dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    this.desenhar();
  }

  desenhar() {
    const { ctx } = this;
    const L = this.canvas.width;
    if (!L) return;
    const c = L / 2;
    const traco = Math.max(1.5, L * 0.004);
    const R = c - traco;
    const rCubo = R * 0.27;
    const n = this.fatias;
    const seg = TAU / n;
    const meio = seg / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, L, L);
    ctx.translate(c, c);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate(i * seg);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, -Math.PI / 2 - meio, -Math.PI / 2 + meio);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = FUNDOS[i % FUNDOS.length];
      ctx.fillRect(-R, -R, 2 * R, R + 2);

      // Luz suave vinda da borda, para a fatia não ficar chapada.
      const luz = ctx.createLinearGradient(0, -R, 0, -rCubo);
      luz.addColorStop(0, 'rgba(255,233,168,.16)');
      luz.addColorStop(0.5, 'rgba(255,233,168,0)');
      luz.addColorStop(1, 'rgba(20,5,10,.45)');
      ctx.fillStyle = luz;
      ctx.fillRect(-R, -R, 2 * R, R + 2);

      INTERROGACOES.forEach((marca, k) => {
        ctx.font = `400 ${R * marca.corpo}px Anton, "Arial Narrow", Impact, sans-serif`;
        ctx.fillStyle = (i + k) % 2 === 0 ? LATAO : PAPEL;
        ctx.globalAlpha = 0.5 + k * 0.16;
        ctx.fillText('?', 0, -R * marca.raio);
      });
      ctx.globalAlpha = 1;

      if (this.destaque >= 0 && i !== this.destaque) {
        ctx.fillStyle = 'rgba(20,5,10,.7)';
        ctx.fillRect(-R, -R, 2 * R, R + 2);
      }
      ctx.restore();
    }

    // Frisos de latão entre as fatias e na borda.
    ctx.strokeStyle = LATAO;
    ctx.lineWidth = traco;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i * seg - Math.PI / 2 - meio;
      ctx.moveTo(Math.cos(a) * rCubo * 0.6, Math.sin(a) * rCubo * 0.6);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R - traco / 2, 0, TAU);
    ctx.stroke();

    if (this.destaque >= 0) {
      ctx.save();
      ctx.rotate(this.destaque * seg);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R - traco, -Math.PI / 2 - meio, -Math.PI / 2 + meio);
      ctx.closePath();
      ctx.strokeStyle = LAMPADA;
      ctx.lineWidth = traco * 2.4;
      ctx.shadowColor = 'rgba(255,214,120,.9)';
      ctx.shadowBlur = L * 0.03;
      ctx.stroke();
      ctx.restore();
    }
  }

  aplicarAngulo() {
    this.giro.style.transform = `rotate(${this.angulo}rad)`;
  }

  /** Qual fatia está sob o ponteiro (no topo) para o ângulo atual. */
  fatiaNoPonteiro() {
    const seg = TAU / this.fatias;
    return Math.floor((norm(-this.angulo) + seg / 2) / seg) % this.fatias;
  }

  baterPonteiro(ritmo) {
    if (!this.ponteiro?.animate) return;
    this.ponteiro.animate(
      [{ transform: `rotate(${-10 - ritmo * 14}deg)` }, { transform: 'rotate(0deg)' }],
      { duration: 90 + (1 - ritmo) * 160, easing: 'cubic-bezier(.2,.9,.3,1.4)' },
    );
  }

  /**
   * Gira e para numa fatia qualquer. Devolve uma Promise que resolve quando
   * a roda para, ou null se ela já estiver girando.
   */
  girar() {
    if (this.girando) return null;
    this.girando = true;
    this.destaque = -1;
    this.desenhar();

    const seg = TAU / this.fatias;
    const parada = Math.floor(Math.random() * this.fatias);
    const folga = (Math.random() - 0.5) * seg * 0.72; // não para sempre no meio da fatia
    const reduzido = movimentoReduzido();
    const recuo = reduzido ? 0 : 0.22;
    const voltas = reduzido ? 1 : 6 + Math.floor(Math.random() * 3);
    const duracao = reduzido ? 1400 : 6600 + Math.random() * 1400;
    const tRecuo = reduzido ? 0 : 320;

    const inicio = this.angulo;
    const partida = inicio - recuo;
    let delta = norm(-parada * seg + folga) - norm(partida);
    if (delta < 0) delta += TAU;
    const total = delta + voltas * TAU;

    let ultimaFatia = this.fatiaNoPonteiro();
    let anguloAnterior = this.angulo;
    const t0 = performance.now();

    return new Promise((resolver) => {
      const quadro = (agora) => {
        const decorrido = agora - t0;
        if (decorrido < tRecuo) {
          // Antecipação: a roda recua um pouco antes de disparar.
          const t = decorrido / tRecuo;
          this.angulo = inicio - recuo * (1 - (1 - t) * (1 - t));
        } else {
          const t = Math.min(1, (decorrido - tRecuo) / duracao);
          const suave = 1 - (1 - t) ** 4;
          this.angulo = partida + total * suave;
        }
        this.aplicarAngulo();

        const fatia = this.fatiaNoPonteiro();
        if (fatia !== ultimaFatia && decorrido >= tRecuo) {
          ultimaFatia = fatia;
          const ritmo = Math.min(1, Math.abs(this.angulo - anguloAnterior) / 0.32);
          this.aoTique(ritmo);
          this.baterPonteiro(ritmo);
        }
        anguloAnterior = this.angulo;

        if (decorrido - tRecuo < duracao) {
          requestAnimationFrame(quadro);
        } else {
          this.angulo = norm(partida + total);
          this.aplicarAngulo();
          this.girando = false;
          this.destaque = parada;
          this.desenhar();
          resolver();
        }
      };
      requestAnimationFrame(quadro);
    });
  }
}
