// Sonoplastia sintetizada na hora com a Web Audio API.
// Nenhum arquivo de áudio: zero custo, zero licença, carrega instantâneo.

import { store } from './storage.js';

let ctx = null;
let saida = null;
let bufferRuido = null;
let ativo = store.get('som', true);
let ultimoTique = 0;

function preparar() {
  if (!ativo) return false;
  if (!ctx) {
    const Classe = window.AudioContext || window.webkitAudioContext;
    if (!Classe) return false;
    ctx = new Classe();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 5;
    saida = ctx.createGain();
    saida.gain.value = 0.85;
    saida.connect(compressor).connect(ctx.destination);

    bufferRuido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const dados = bufferRuido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function tom({ tipo = 'sine', de, para, inicio = 0, dur = 0.2, ganho = 0.2, ataque = 0.012, corte }) {
  const t = ctx.currentTime + inicio;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(de, t);
  if (para) osc.frequency.exponentialRampToValueAtTime(para, t + dur);
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(ganho, t + ataque);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  let no = osc;
  if (corte) {
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = corte;
    osc.connect(filtro);
    no = filtro;
  }
  no.connect(vol).connect(saida);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function ruido({ inicio = 0, dur = 0.3, ganho = 0.2, ataque = 0.02, tipo = 'bandpass', de = 800, para, q = 1 }) {
  const t = ctx.currentTime + inicio;
  const fonte = ctx.createBufferSource();
  fonte.buffer = bufferRuido;
  fonte.loop = true;
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.Q.value = q;
  filtro.frequency.setValueAtTime(de, t);
  if (para) filtro.frequency.exponentialRampToValueAtTime(para, t + dur);
  const vol = ctx.createGain();
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(ganho, t + ataque);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  fonte.connect(filtro).connect(vol).connect(saida);
  fonte.start(t, Math.random());
  fonte.stop(t + dur + 0.05);
}

export const som = {
  get ativo() {
    return ativo;
  },

  alternar() {
    ativo = !ativo;
    store.set('som', ativo);
    if (ativo) this.clique();
    else if (ctx) ctx.suspend();
    return ativo;
  },

  /** Clique discreto dos controles. */
  clique() {
    if (!preparar()) return;
    tom({ tipo: 'triangle', de: 880, para: 620, dur: 0.06, ganho: 0.07, ataque: 0.004 });
  },

  /** Arrancada da roleta: um sopro que sobe. */
  arrancada() {
    if (!preparar()) return;
    ruido({ dur: 0.9, ganho: 0.22, ataque: 0.25, de: 240, para: 2600, q: 0.8 });
    tom({ tipo: 'sawtooth', de: 70, para: 210, dur: 0.7, ganho: 0.09, ataque: 0.2, corte: 900 });
  },

  /**
   * Estalo da palheta em cada fatia. `ritmo` vai de 0 (quase parando) a 1 (rápido):
   * quanto mais devagar, mais grave e mais seco, como numa roleta de verdade.
   */
  tique(ritmo = 0.5) {
    if (!preparar()) return;
    const agora = performance.now();
    if (agora - ultimoTique < 26) return;
    ultimoTique = agora;
    const base = 900 + ritmo * 900 + Math.random() * 60;
    tom({ tipo: 'triangle', de: base, para: base * 0.45, dur: 0.045, ganho: 0.2, ataque: 0.002 });
    ruido({ dur: 0.03, ganho: 0.12, ataque: 0.002, tipo: 'highpass', de: 3200 });
  },

  /** A roleta parou: fanfarra de metais, prato e sininhos. */
  fanfarra() {
    if (!preparar()) return;
    const metal = (freq, inicio, dur, ganho = 0.085) => {
      tom({ tipo: 'sawtooth', de: freq, inicio, dur, ganho, ataque: 0.02, corte: 2300 });
      tom({ tipo: 'square', de: freq / 2, inicio, dur, ganho: ganho * 0.35, ataque: 0.02, corte: 1200 });
    };
    metal(392.0, 0.0, 0.14);
    metal(523.25, 0.14, 0.14);
    metal(659.25, 0.28, 0.14);
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => metal(f, 0.44, 1.1, 0.06));
    ruido({ inicio: 0.44, dur: 1.1, ganho: 0.07, ataque: 0.005, tipo: 'highpass', de: 5200 });
    [1568, 2093, 2637, 3136, 4186].forEach((f, i) => {
      tom({ de: f, inicio: 0.5 + i * 0.07, dur: 0.6, ganho: 0.045, ataque: 0.004 });
    });
  },

  /** Cortina correndo no trilho. */
  cortina() {
    if (!preparar()) return;
    ruido({ dur: 1.3, ganho: 0.16, ataque: 0.3, tipo: 'lowpass', de: 260, para: 1300, q: 0.4 });
    ruido({ dur: 1.1, ganho: 0.03, ataque: 0.2, tipo: 'bandpass', de: 3800, para: 2200, q: 3 });
  },

  /** Brilho curto quando o filme entra na lista. */
  brilho() {
    if (!preparar()) return;
    [1318.5, 1760, 2637].forEach((f, i) => {
      tom({ de: f, inicio: i * 0.06, dur: 0.35, ganho: 0.05, ataque: 0.004 });
    });
  },
};
