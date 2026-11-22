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

  /** As luzes da sala apagam: o estalo do disjuntor e o zumbido das lâmpadas sumindo. */
  luzes(apagar = true) {
    if (!preparar()) return;
    tom({ tipo: 'sine', de: apagar ? 110 : 70, para: apagar ? 45 : 120, dur: 0.35, ganho: 0.22, ataque: 0.004 });
    ruido({ dur: 0.05, ganho: 0.16, ataque: 0.002, tipo: 'highpass', de: 2500 });
    tom({
      tipo: 'sawtooth', de: 120, para: apagar ? 40 : 120, inicio: 0.02, dur: apagar ? 1.6 : 0.5,
      ganho: 0.025, ataque: apagar ? 0.01 : 0.3, corte: 500,
    });
    silenciarPlateia();
  },

  /** O projetor liga: motor grave e o obturador batendo 24 vezes por segundo. Devolve a função que desliga. */
  projetor() {
    if (!preparar()) return () => {};
    const t = ctx.currentTime;
    const geral = ctx.createGain();
    geral.gain.setValueAtTime(0.0001, t);
    geral.gain.exponentialRampToValueAtTime(1, t + 0.5);
    geral.connect(saida);

    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 47;
    const filtroMotor = ctx.createBiquadFilter();
    filtroMotor.type = 'lowpass';
    filtroMotor.frequency.value = 260;
    const volMotor = ctx.createGain();
    volMotor.gain.value = 0.05;
    motor.connect(filtroMotor).connect(volMotor).connect(geral);

    const chiado = ctx.createBufferSource();
    chiado.buffer = bufferRuido;
    chiado.loop = true;
    const filtroChiado = ctx.createBiquadFilter();
    filtroChiado.type = 'bandpass';
    filtroChiado.frequency.value = 2400;
    filtroChiado.Q.value = 1.2;
    const obturador = ctx.createGain();
    obturador.gain.value = 0.012;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 24;
    const fundoLfo = ctx.createGain();
    fundoLfo.gain.value = 0.012;
    lfo.connect(fundoLfo).connect(obturador.gain);
    chiado.connect(filtroChiado).connect(obturador).connect(geral);

    motor.start(t);
    chiado.start(t, Math.random());
    lfo.start(t);
    let ligado = true;
    return () => {
      if (!ligado) return;
      ligado = false;
      const fim = ctx.currentTime;
      geral.gain.cancelScheduledValues(fim);
      geral.gain.setValueAtTime(geral.gain.value || 1, fim);
      geral.gain.exponentialRampToValueAtTime(0.0001, fim + 0.8);
      motor.frequency.exponentialRampToValueAtTime(20, fim + 0.8);
      lfo.frequency.linearRampToValueAtTime(8, fim + 0.8);
      [motor, chiado, lfo].forEach((no) => no.stop(fim + 0.9));
    };
  },

  /** Bipe da contagem do filme antigo (3, 2, 1). O último é mais agudo. */
  contagem(final = false) {
    if (!preparar()) return;
    tom({ tipo: 'sine', de: final ? 1320 : 1000, dur: final ? 0.32 : 0.12, ganho: 0.13, ataque: 0.003 });
  },

  /** Alguém apertou PRONTO: o carimbo no ingresso. */
  pronto(ligou = true) {
    if (!preparar()) return;
    tom({ tipo: 'sine', de: ligou ? 160 : 120, para: 60, dur: 0.16, ganho: 0.26, ataque: 0.003 });
    ruido({ dur: 0.07, ganho: 0.12, ataque: 0.002, tipo: 'bandpass', de: 1800, q: 0.7 });
    if (ligou) tom({ de: 1568, inicio: 0.08, dur: 0.25, ganho: 0.04, ataque: 0.004 });
  },

  /** Alguém entrou na sala. */
  entrou() {
    if (!preparar()) return;
    tom({ de: 784, dur: 0.3, ganho: 0.06, ataque: 0.006 });
    tom({ de: 1175, inicio: 0.12, dur: 0.45, ganho: 0.06, ataque: 0.006 });
  },

  /** Filme ocultado. */
  ocultar() {
    if (!preparar()) return;
    tom({ tipo: 'triangle', de: 520, para: 180, dur: 0.22, ganho: 0.1, ataque: 0.004 });
  },

  /** Nota salva. */
  nota() {
    if (!preparar()) return;
    tom({ de: 1046.5, dur: 0.2, ganho: 0.06, ataque: 0.004 });
    tom({ de: 1568, inicio: 0.09, dur: 0.35, ganho: 0.06, ataque: 0.004 });
  },

  /** Burburinho da plateia antes do filme. Some sozinho quando as luzes apagam. */
  plateia() {
    if (!preparar() || plateia) return;
    const t = ctx.currentTime;
    const geral = ctx.createGain();
    geral.gain.setValueAtTime(0.0001, t);
    geral.gain.exponentialRampToValueAtTime(0.5, t + 2);
    geral.connect(saida);
    const vozes = [420, 680, 950, 1300].map((freq, i) => {
      const fonte = ctx.createBufferSource();
      fonte.buffer = bufferRuido;
      fonte.loop = true;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = freq;
      filtro.Q.value = 5;
      const vol = ctx.createGain();
      vol.gain.value = 0.006;
      // Cada "voz" sobe e desce num ritmo próprio, como conversas soltas.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7 + i * 0.53;
      const profundidade = ctx.createGain();
      profundidade.gain.value = 0.005;
      lfo.connect(profundidade).connect(vol.gain);
      fonte.connect(filtro).connect(vol).connect(geral);
      fonte.start(t, Math.random() * 1.5);
      lfo.start(t);
      return [fonte, lfo];
    });
    plateia = { geral, nos: vozes.flat() };
  },
};

let plateia = null;
function silenciarPlateia() {
  if (!plateia || !ctx) return;
  const { geral, nos } = plateia;
  plateia = null;
  const t = ctx.currentTime;
  geral.gain.cancelScheduledValues(t);
  geral.gain.setValueAtTime(geral.gain.value || 0.5, t);
  geral.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  nos.forEach((no) => no.stop(t + 1.5));
}
export const calarPlateia = silenciarPlateia;
