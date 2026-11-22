// Barra de nota de 1 a 10, de meio em meio ponto. A mesma peça aparece no
// resultado do sorteio, em "Meus filmes" e no histórico da sala.

import { esc, nota1 } from './util.js';

export const NOTA_MIN = 1;
export const NOTA_MAX = 10;
export const NOTA_INICIAL = 7;

const preenchido = (v) => `${((v - NOTA_MIN) / (NOTA_MAX - NOTA_MIN)) * 100}%`;

/**
 * @param {object} o
 * @param {number} o.id         filme
 * @param {number|null} o.valor nota já dada, se houver
 * @param {string} o.rotulo     texto acima da barra
 * @param {string} o.botao      texto do botão
 * @param {string} o.contexto   'meus' | 'sala' | 'resultado'
 */
export function htmlAvaliacao({ id, valor = null, rotulo = 'Sua nota', botao = 'Salvar nota', contexto = 'meus' }) {
  const v = valor ?? NOTA_INICIAL;
  const campo = `nota-${contexto}-${id}`;
  return `<div class="avaliar" data-avaliar="${id}" data-contexto="${esc(contexto)}">
    <label class="avaliar__rotulo" for="${campo}">${esc(rotulo)}</label>
    <div class="avaliar__linha">
      <input type="range" id="${campo}" min="${NOTA_MIN}" max="${NOTA_MAX}" step="0.5" value="${v}"
        style="--preenchido:${preenchido(v)}" aria-valuetext="${nota1(v)}">
      <output for="${campo}">${nota1(v)}</output>
    </div>
    <button type="button" class="botao botao--latao botao--compacto" data-salvar-nota="${id}">${esc(botao)}</button>
  </div>`;
}

/**
 * Liga as barras dentro de `raiz`: o número acompanha a barra e o botão chama
 * `aoSalvar(id, nota, contexto, elemento)`.
 */
export function ligarAvaliacoes(raiz, aoSalvar) {
  raiz.addEventListener('input', (evento) => {
    const barra = evento.target.closest('.avaliar input[type="range"]');
    if (!barra) return;
    const v = Number(barra.value);
    barra.style.setProperty('--preenchido', preenchido(v));
    barra.setAttribute('aria-valuetext', nota1(v));
    barra.closest('.avaliar').querySelector('output').textContent = nota1(v);
  });
  raiz.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('[data-salvar-nota]');
    if (!botao) return;
    const caixa = botao.closest('.avaliar');
    const nota = Number(caixa.querySelector('input').value);
    botao.disabled = true;
    try {
      await aoSalvar(Number(caixa.dataset.avaliar), nota, caixa.dataset.contexto, caixa);
    } finally {
      botao.disabled = false;
    }
  });
}

/** "Ana 8,0 · Bruno 7,5" e a média, para o histórico da sala. */
export function resumoDasNotas(notas = {}, nomes = {}, membros = {}) {
  const lista = Object.entries(notas)
    .filter(([, n]) => typeof n === 'number')
    .map(([uid, n]) => ({ uid, nome: membros[uid]?.nome || nomes[uid] || 'Ex-membro', nota: n }));
  const media = lista.length ? lista.reduce((s, x) => s + x.nota, 0) / lista.length : null;
  return { lista, media };
}
