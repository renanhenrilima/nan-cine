// A revelação: a cortina fecha sobre a página, o filme é montado atrás dela
// e a cortina abre com cartaz, título letra a letra, nota, sinopse e trailer.

import { GENEROS } from './demo-data.js';
import { modoAoVivo, fonteDaNota } from './api.js';
import { listas } from './storage.js';
import { som } from './audio.js';
import { confete } from './fx.js';
import {
  esc, esperar, avisar, dataPorExtenso, duracaoTexto, nomeIdioma, nota1, movimentoReduzido,
} from './util.js';

const CIRCUNFERENCIA = 251.3; // 2π × raio 40 do anel da nota

const votosCurtos = (n) => new Intl.NumberFormat('pt-BR', {
  notation: 'compact', maximumFractionDigits: 1,
}).format(n);

function tituloEmLetras(titulo) {
  let i = 0;
  return String(titulo).split(/\s+/).filter(Boolean).map((palavra) => {
    const letras = [...palavra].map((l) => `<span class="letra" style="--i:${i++}">${esc(l)}</span>`).join('');
    return `<span class="palavra">${letras}</span>`;
  }).join(' ');
}

function blocoNotas(f) {
  const temImdb = Boolean(f.imdb?.nota);
  const nota = temImdb ? f.imdb.nota : f.nota;
  const votos = temImdb ? f.imdb.votos : f.votos;
  const fonte = temImdb ? 'IMDb' : 'TMDB';

  if (!nota) {
    return '<p class="nota-extra">Este filme ainda não tem nota.</p>';
  }

  let extra = '';
  if (temImdb && modoAoVivo() && f.nota) {
    extra = `<p class="nota-extra">No TMDB: ${nota1(f.nota)}</p>`;
  } else if (!temImdb && fonteDaNota() === 'imdb') {
    extra = '<p class="nota-extra">Sem nota no IMDb por enquanto; esta é a do TMDB.</p>';
  }

  return `
    <div class="mostrador">
      <div class="mostrador__anel" data-nota="${nota}">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="trilho" cx="50" cy="50" r="40"/>
          <circle class="valor" cx="50" cy="50" r="40"/>
        </svg>
        <b aria-hidden="true">0,0</b>
      </div>
      <div class="mostrador__texto">
        <strong>Nota ${nota1(nota)} no ${fonte}</strong>
        <span>${votos ? `${votosCurtos(votos)} votos` : 'de 0 a 10'}</span>
      </div>
    </div>
    ${extra}`;
}

function blocoCanhoto(f) {
  const generos = f.generosNomes?.length
    ? f.generosNomes
    : (f.generos || []).map((id) => GENEROS.find((g) => g.id === id)?.nome).filter(Boolean);
  const classificacao = f.classificacao === 'L' ? 'Livre' : (f.classificacao ? `${f.classificacao} anos` : '');
  const estreia = f.data ? dataPorExtenso(f.data) : (f.ano || 'Data não informada');

  const itens = [
    ['Estreia', estreia],
    ['Duração', duracaoTexto(f.duracao)],
    ['Classificação', classificacao],
    ['Gênero', generos.slice(0, 3).join(', ')],
  ].filter(([, valor]) => valor);

  return `<dl class="canhoto anima" style="--o:2">${
    itens.map(([rotulo, valor]) => `<div><dt>${rotulo}</dt><dd>${esc(valor)}</dd></div>`).join('')
  }</dl>`;
}

function blocoOnde(f) {
  if (!modoAoVivo() || f.id < 0) return '';
  const p = f.provedores;
  const grupos = p ? [
    ['Na assinatura', p.assinatura],
    ['De graça', p.gratis],
    ['Para alugar', p.aluguel],
  ].filter(([, lista]) => lista?.length) : [];

  if (!grupos.length) {
    return `<section class="res__onde anima" style="--o:6">
      <h3>Onde assistir no Brasil</h3>
      <p class="nota-extra">Não encontramos este filme em serviços de streaming no Brasil por enquanto.</p>
    </section>`;
  }

  const linhas = grupos.map(([rotulo, lista]) => `
    <div class="onde__grupo"><span>${rotulo}</span>${
      lista.slice(0, 7).map((s) => (s.logo
        ? `<img src="${esc(s.logo)}" alt="${esc(s.nome)}" title="${esc(s.nome)}" loading="lazy">`
        : `<strong>${esc(s.nome)}</strong>`)).join('')
    }</div>`).join('');

  return `<section class="res__onde anima" style="--o:6">
    <h3>Onde assistir no Brasil</h3>
    ${linhas}
    ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Ver todas as opções</a>` : ''}
  </section>`;
}

/** Diz, com base nos sinais encontrados, se o filme tem versão em português. */
function textoPortugues(f) {
  const p = f.portugues;
  if (!p) return '';
  if (p.original) return 'Áudio original em português.';
  if (p.dublado && p.legendado) return 'Dublado e legendado (há trailers nas duas versões no Brasil).';
  if (p.dublado) return 'Dublado (há trailer dublado no Brasil).';
  if (p.legendado) return 'Legendado (há trailer legendado no Brasil).';
  if (p.noBrasil) return 'Disponível em serviços no Brasil, que trazem legenda em português e, muitas vezes, dublagem.';
  if (p.lancadoNoBrasil) return 'Foi lançado no Brasil, então existe versão legendada ou dublada.';
  return 'Não achamos sinal de versão dublada ou legendada em português.';
}

function buscaYoutube(f) {
  const ano = (f.data || '').slice(0, 4) || f.ano || '';
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${f.titulo} ${ano} trailer legendado`)}`;
}

function blocoTrailer(f) {
  const t = f.trailer;
  if (!t) {
    return `<section class="res__trailer anima" style="--o:8">
      <h3>Trailer</h3>
      <p>${modoAoVivo()
        ? 'O TMDB não tem trailer cadastrado para este filme.'
        : 'No modo demonstração o trailer abre direto no YouTube.'}</p>
      <a class="botao botao--contorno" href="${esc(buscaYoutube(f))}" target="_blank" rel="noopener">Buscar trailer legendado no YouTube</a>
    </section>`;
  }

  const legenda = {
    dublado: 'Trailer dublado em português.',
    legendado: 'Trailer legendado em português.',
    portugues: 'Trailer em português.',
    original: 'Não achamos trailer em português para este filme. Este é o original; as legendas em português ligam sozinhas quando o YouTube tem.',
  }[t.versao];

  return `<section class="res__trailer anima" style="--o:8">
    <h3>Trailer</h3>
    <p>${legenda}</p>
    <button type="button" class="trailer" data-acao="trailer" data-chave="${esc(t.chave)}"
      style="background-image:url('https://i.ytimg.com/vi/${esc(t.chave)}/hqdefault.jpg')"
      aria-label="Assistir ao trailer de ${esc(f.titulo)}">
      <span class="trailer__tocar">Assistir ao trailer</span>
    </button>
  </section>`;
}

function montar(f) {
  const cartaz = f.posterGrande || f.poster;
  const idioma = nomeIdioma(f.idioma);
  const naLista = listas.temQueroVer(f.id);
  const ficha = [
    ['Em português', textoPortugues(f)],
    ['Direção', (f.diretores || []).join(', ')],
    ['Elenco', (f.elenco || []).join(', ')],
  ].filter(([, v]) => v);

  let sinopse = `<p>${esc(f.sinopse)}</p>`;
  if (!f.sinopse) sinopse = '<p>Este filme ainda não tem sinopse cadastrada em português.</p>';
  else if (f.sinopseEmIngles) sinopse += '<small>Sinopse disponível só em inglês.</small>';

  const links = [
    f.imdbId ? `<a href="https://www.imdb.com/title/${esc(f.imdbId)}/" target="_blank" rel="noopener">Ver no IMDb</a>` : '',
    `<a href="https://www.adorocinema.com/pesquisar/?q=${encodeURIComponent(f.titulo)}" target="_blank" rel="noopener">Ver notas no AdoroCinema</a>`,
    f.trailer ? `<a href="${esc(buscaYoutube(f))}" target="_blank" rel="noopener">Buscar trailer legendado</a>` : '',
    modoAoVivo() && f.id > 0 ? '<button type="button" data-acao="copiar">Copiar link do filme</button>' : '',
  ].filter(Boolean).join('');

  return `
  <article class="res">
    <div class="res__barra">
      <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar e voltar à roleta">×</button>
    </div>

    <div class="res__principal">
      <div class="res__cartaz anima ${cartaz ? '' : 'res__cartaz--letreiro'}">
        ${cartaz
          ? `<img src="${esc(cartaz)}" alt="Cartaz de ${esc(f.titulo)}" width="500" height="750">`
          : `<div>${esc(f.titulo)}</div>`}
      </div>

      <div class="res__info">
        <p class="res__anuncio anima" style="--o:0">A roleta escolheu</p>
        <h2 class="res__titulo" aria-label="${esc(f.titulo)}"><span aria-hidden="true">${tituloEmLetras(f.titulo)}</span></h2>
        <p class="res__original anima" style="--o:1">Título original:
          <strong lang="${esc(f.idioma || '')}">${esc(f.original || f.titulo)}</strong>${idioma ? ` (${esc(idioma)})` : ''}</p>
        ${f.frase ? `<p class="res__frase anima" style="--o:1">${esc(f.frase)}</p>` : ''}
        ${blocoCanhoto(f)}
        <div class="res__notas anima" style="--o:3">${blocoNotas(f)}</div>
        <div class="res__sinopse anima" style="--o:4">${sinopse}</div>
        ${ficha.length ? `<dl class="res__ficha anima" style="--o:5">${
          ficha.map(([r, v]) => `<div><dt>${r}:</dt><dd>${esc(v)}</dd></div>`).join('')
        }</dl>` : ''}
        ${blocoOnde(f)}
        <div class="res__acoes anima" style="--o:7">
          <button type="button" class="botao botao--latao" data-acao="girar">Girar de novo</button>
          <button type="button" class="botao botao--contorno" data-acao="quero" aria-pressed="${naLista}">${naLista ? 'Na sua lista' : 'Quero ver'}</button>
          <button type="button" class="botao botao--contorno" data-acao="visto">Já vi, não sugerir mais</button>
        </div>
        <div class="res__links anima" style="--o:7">${links}</div>
      </div>
    </div>

    ${blocoTrailer(f)}
  </article>`;
}

function carregarImagem(url) {
  return new Promise((ok) => {
    if (!url) return ok();
    const img = new Image();
    img.onload = img.onerror = () => ok();
    img.src = url;
  });
}

function animarNota(rolagem) {
  const anel = rolagem.querySelector('.mostrador__anel');
  if (!anel) return;
  const nota = Number(anel.dataset.nota) || 0;
  const numero = anel.querySelector('b');
  anel.querySelector('.valor').style.strokeDashoffset = String(CIRCUNFERENCIA * (1 - nota / 10));

  if (movimentoReduzido()) {
    numero.textContent = nota1(nota);
    return;
  }
  const inicio = performance.now() + 1400; // acompanha o atraso do anel no CSS
  const quadro = (agora) => {
    const t = Math.max(0, Math.min(1, (agora - inicio) / 1500));
    numero.textContent = nota1(nota * (1 - (1 - t) ** 3));
    if (t < 1 && numero.isConnected) requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
}

export function criarRevelacao({ raiz, rolagem, fundo, canvasConfete, aoFechar }) {
  let aberta = false;
  let filme = null;
  let focoAnterior = null;

  async function mostrar(base, promessaDetalhes) {
    if (aberta) return;
    aberta = true;
    focoAnterior = document.activeElement;
    const pausa = movimentoReduzido() ? 30 : 620;

    document.body.classList.add('travado');
    rolagem.innerHTML = '';
    fundo.style.backgroundImage = '';
    raiz.hidden = false;
    void raiz.offsetWidth; // garante que a cortina anime a partir de fora da tela
    raiz.dataset.fase = 'fechando';
    som.cortina();

    const [extra] = await Promise.all([
      Promise.resolve(promessaDetalhes).catch(() => null),
      esperar(pausa),
    ]);
    filme = { ...base, ...(extra || {}) };

    rolagem.innerHTML = montar(filme);
    rolagem.scrollTop = 0;
    if (filme.fundo) fundo.style.backgroundImage = `url("${filme.fundo}")`;
    raiz.dataset.fase = 'fechada';

    // Espera o cartaz e o fundo (até 1,6 s) para a cortina não abrir no vazio.
    await Promise.race([
      Promise.all([carregarImagem(filme.posterGrande || filme.poster), carregarImagem(filme.fundo)]),
      esperar(1600),
    ]);
    await esperar(movimentoReduzido() ? 0 : 220);
    if (!aberta) return;

    raiz.dataset.fase = 'aberta';
    som.cortina();
    animarNota(rolagem);
    setTimeout(() => aberta && confete(canvasConfete), 650);
    rolagem.focus({ preventScroll: true });
  }

  async function fechar({ girar = false } = {}) {
    if (!aberta) return;
    aberta = false;
    const pausa = movimentoReduzido() ? 30 : 600;
    raiz.dataset.fase = 'saindo';
    som.cortina();
    await esperar(pausa);
    rolagem.innerHTML = ''; // também interrompe o trailer
    raiz.dataset.fase = '';
    document.body.classList.remove('travado');
    aoFechar({ girar });
    await esperar(pausa);
    if (!aberta) raiz.hidden = true;
    if (!girar && focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true });
  }

  rolagem.addEventListener('click', async (evento) => {
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !filme) return;
    const { acao } = alvo.dataset;

    if (acao === 'fechar') fechar();
    if (acao === 'girar') fechar({ girar: true });

    if (acao === 'quero') {
      const ficou = listas.alternarQueroVer(filme);
      alvo.setAttribute('aria-pressed', String(ficou));
      alvo.textContent = ficou ? 'Na sua lista' : 'Quero ver';
      if (ficou) som.brilho();
      avisar(ficou ? 'Guardado em Minha lista.' : 'Retirado de Minha lista.');
      document.dispatchEvent(new CustomEvent('nancine:listas'));
    }

    if (acao === 'visto') {
      listas.marcarVisto(filme);
      document.dispatchEvent(new CustomEvent('nancine:listas'));
      avisar('Marcado como visto. Ele não volta mais para a roleta.');
      fechar();
    }

    if (acao === 'copiar') {
      const link = `${location.origin}${location.pathname}?filme=${filme.id}`;
      try {
        await navigator.clipboard.writeText(link);
        avisar('Link copiado.');
      } catch {
        avisar('Não deu para copiar. O link é: ' + link);
      }
    }

    if (acao === 'trailer') {
      const chave = encodeURIComponent(alvo.dataset.chave);
      const quadro = document.createElement('div');
      quadro.className = 'trailer';
      quadro.innerHTML = `<iframe
        src="https://www.youtube-nocookie.com/embed/${chave}?autoplay=1&rel=0&hl=pt-BR&cc_lang_pref=pt-BR&cc_load_policy=1"
        title="Trailer de ${esc(filme.titulo)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      alvo.replaceWith(quadro);
    }
  });

  // Esc fecha; Tab fica preso dentro do resultado enquanto ele está aberto.
  document.addEventListener('keydown', (evento) => {
    if (!aberta) return;
    if (evento.key === 'Escape') {
      evento.preventDefault();
      fechar();
      return;
    }
    if (evento.key !== 'Tab') return;
    const focaveis = [...rolagem.querySelectorAll('a[href], button:not([disabled]), iframe')];
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const fora = !rolagem.contains(document.activeElement) || document.activeElement === rolagem;
    if (evento.shiftKey && (document.activeElement === primeiro || fora)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && (document.activeElement === ultimo || fora)) {
      evento.preventDefault();
      primeiro.focus();
    }
  });

  return { mostrar, fechar, get aberta() { return aberta; } };
}
