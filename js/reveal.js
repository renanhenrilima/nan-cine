// A revelação: a cortina fecha sobre a página, o filme é montado atrás dela
// e a cortina abre com cartaz, título letra a letra, nota, sinopse e trailer.

import { GENEROS } from './demo-data.js';
import { modoAoVivo, fonteDaNota } from './api.js';
import { som } from './audio.js';
import { confete } from './fx.js';
import { htmlAvaliacao, ligarAvaliacoes } from './avaliacao.js';
import {
  esc, esperar, avisar, dataPorExtenso, duracaoTexto, nomeIdioma, nota1, movimentoReduzido, aoVoltar, premiosEmPortugues,
} from './util.js';

const ICONE_OCULTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

/** Notas dos críticos (Metacritic e Rotten Tomatoes) e resumo de prêmios, quando a base já tem o filme. */
function blocoCriticos(f) {
  const c = f.criticos;
  if (!c) return '';
  const notas = [
    c.meta !== null ? `Metacritic ${c.meta}` : '',
    c.rt !== null ? `Rotten Tomatoes ${c.rt}%` : '',
  ].filter(Boolean);
  const linhas = [];
  if (notas.length) linhas.push(`<p class="nota-extra"><strong>Críticos:</strong> ${notas.join(' · ')}</p>`);
  if (c.premio) linhas.push(`<p class="nota-extra"><strong>Prêmios:</strong> ${esc(premiosEmPortugues(c.premio))}</p>`);
  return linhas.join('');
}

function blocoNotas(f) {
  const temImdb = Boolean(f.imdb?.nota);
  const nota = temImdb ? f.imdb.nota : f.nota;
  const votos = temImdb ? f.imdb.votos : f.votos;
  const fonte = temImdb ? 'IMDb' : 'TMDB';

  if (!nota) {
    return `<p class="nota-extra">Este filme ainda não tem nota.</p>${blocoCriticos(f)}`;
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
    <div class="res__notas-extra">${extra}${blocoCriticos(f)}</div>`;
}

function blocoCanhoto(f) {
  const generos = f.generosNomes?.length
    ? f.generosNomes
    : (f.generos || []).map((id) => GENEROS.find((g) => g.id === id)?.nome).filter(Boolean);
  const classificacao = f.classificacao === 'L' ? 'Livre' : (f.classificacao ? `${f.classificacao} anos` : '');
  const dataEstreia = f.estreiaBR || f.data;
  const estreia = dataEstreia ? dataPorExtenso(dataEstreia) : (f.ano || 'Data não informada');

  const itens = [
    [f.estreiaBR ? 'Estreia no Brasil' : 'Estreia', estreia],
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
  if (p.cinemaNoBrasil && p.noBrasil) return 'Lançado nos cinemas do Brasil, onde a maioria tem sessão dublada, e disponível em serviços no Brasil. Não dá para confirmar a dublagem.';
  if (p.cinemaNoBrasil) return 'Lançado nos cinemas do Brasil, onde a maioria tem sessão dublada. Não dá para confirmar a dublagem.';
  if (p.noBrasil) return 'Disponível em serviços no Brasil, que trazem legenda em português e, muitas vezes, dublagem.';
  if (p.lancadoNoBrasil) return 'Foi lançado no Brasil, então existe versão legendada ou dublada.';
  return 'Não achamos sinal de versão dublada ou legendada em português.';
}

/** A busca é o nome do filme + "trailer" (por exemplo, "Superman trailer"). */
const consultaYoutube = (f) => `${f.titulo} trailer`;

function linkYoutube(f, classe = '') {
  const consulta = consultaYoutube(f);
  const href = `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}`;
  return `<a class="${classe}" href="${esc(href)}" target="_blank" rel="noopener" data-youtube="${esc(consulta)}">Ver no YouTube</a>`;
}

/** No celular, tenta abrir o app do YouTube; se ele não estiver instalado, abre o site. */
function abrirNoYoutube(evento, consulta) {
  const web = `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}`;
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    evento.preventDefault();
    location.href = `intent://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(web)};end`;
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    evento.preventDefault();
    location.href = `youtube://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}`;
    // Sem o app, a página continua aqui: abre o site depois de um instante.
    setTimeout(() => { if (document.visibilityState === 'visible') window.open(web, '_blank', 'noopener'); }, 1400);
  }
}

function blocoTrailer(f) {
  const t = f.trailer;
  if (!t) {
    return `<section class="res__trailer anima" style="--o:8">
      <h3>Trailer</h3>
      <p>${modoAoVivo()
        ? 'O TMDB não tem trailer cadastrado para este filme.'
        : 'No modo demonstração o trailer abre direto no YouTube.'}</p>
      ${linkYoutube(f, 'botao botao--contorno')}
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

/** Texto que aparece depois de "Vamos assistir" ou "Já vi". */
function textoDaDecisao(ctx) {
  const d = ctx.decisao;
  if (!d) return '';
  if (ctx.sala) {
    const quem = d.eu ? 'Você escolheu' : `${esc(d.porNome)} escolheu`;
    if (d.tipo === 'assistir') return `${quem} “Vamos assistir”. O filme foi para o histórico da sala; depois da sessão, cada um dá a sua nota.`;
    if (d.tipo === 'visto') return `${quem} “Já vi”. O filme foi para o histórico da sala. Dê a sua nota:`;
    return '';
  }
  if (d.tipo === 'assistir') return 'Bom filme! Ele foi para Meus filmes. Quando terminar, dê a sua nota por lá ou aqui.';
  if (d.tipo === 'visto') return 'Guardado em Meus filmes. Ele não volta mais para a roleta. Dê a sua nota:';
  return '';
}

/**
 * "Girar de novo" (ou "Voltar para a sala"). No computador fica junto dos outros botões;
 * no celular, no fim da página, depois do trailer, centralizado.
 */
function botaoVoltar(ctx, classe = '') {
  return ctx.sala
    ? `<button type="button" class="botao botao--contorno ${classe}" data-acao="fechar">Voltar para a sala</button>`
    : `<button type="button" class="botao ${classe ? 'botao--contorno' : 'botao--latao'} ${classe}" data-acao="girar">Girar de novo</button>`;
}

function blocoDecidir(f, ctx) {
  const escolhido = ctx.decisao?.tipo || '';
  const travado = Boolean(escolhido);
  const botao = (tipo, rotulo, classe) => `<button type="button" class="botao ${classe} botao--escolha" data-acao="${tipo}"
    aria-pressed="${escolhido === tipo}" ${travado && escolhido !== tipo ? 'disabled' : ''}>${rotulo}</button>`;
  const mostrarNota = (travado && f.id > 0) || ctx.nota != null;
  const temNota = ctx.nota != null;
  return `<div class="res__decidir anima" style="--o:7">
    <div class="res__acoes">
      ${botao('assistir', 'Vamos assistir', 'botao--latao')}
      ${botao('visto', 'Já vi', 'botao--contorno')}
      <button type="button" class="botao botao--ocultar" data-acao="ocultar" ${travado ? 'disabled' : ''}
        aria-label="Ocultar dos resultados" title="Ocultar dos resultados: ele não sai mais no sorteio">${ICONE_OCULTAR}</button>
      ${botaoVoltar(ctx, 'so-largo')}
    </div>
    <p class="res__decisao" data-decisao>${textoDaDecisao(ctx)}</p>
    <div class="res__nota" data-nota-painel ${mostrarNota ? '' : 'hidden'}>
      ${htmlAvaliacao({
        id: f.id, valor: ctx.nota, contexto: 'resultado',
        rotulo: temNota ? 'Sua nota' : 'Que nota você dá?',
        botao: temNota ? 'Atualizar nota' : 'Salvar nota',
      })}
    </div>
  </div>`;
}

function montar(f, ctx) {
  const cartaz = f.posterGrande || f.poster;
  const idioma = nomeIdioma(f.idioma);
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
    linkYoutube(f),
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
        <p class="res__anuncio anima" style="--o:0">${esc(ctx.anuncio || 'A roleta escolheu')}</p>
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
        ${blocoDecidir(f, ctx)}
        <div class="res__links anima" style="--o:7">${links}</div>
      </div>
    </div>

    ${blocoTrailer(f)}

    <div class="res__final so-estreito">${botaoVoltar(ctx)}</div>
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

export function criarRevelacao({ raiz, rolagem, fundo, canvasConfete, aoFechar, aoAcao, aoAvaliar }) {
  let aberta = false;
  let filme = null;
  let ctx = {};
  let focoAnterior = null;
  let liberarVolta = null;

  ligarAvaliacoes(rolagem, async (id, nota) => {
    if (!filme || id !== filme.id) return;
    await aoAvaliar?.(filme, nota);
    ctx.nota = nota;
    const botao = rolagem.querySelector('[data-nota-painel] [data-salvar-nota]');
    if (botao) botao.textContent = 'Atualizar nota';
  });

  /** Mostra quem decidiu o quê (na sala, a decisão pode chegar de outro aparelho). */
  function atualizarDecisao(decisao, nota = ctx.nota) {
    if (!aberta) return;
    ctx = { ...ctx, decisao, nota };
    for (const b of rolagem.querySelectorAll('.botao--escolha')) {
      b.setAttribute('aria-pressed', String(b.dataset.acao === decisao?.tipo));
      b.disabled = Boolean(decisao) && b.dataset.acao !== decisao.tipo;
    }
    const lixeira = rolagem.querySelector('[data-acao="ocultar"]');
    if (lixeira) lixeira.disabled = Boolean(decisao);
    const texto = rolagem.querySelector('[data-decisao]');
    if (texto) texto.innerHTML = textoDaDecisao(ctx);
    const painel = rolagem.querySelector('[data-nota-painel]');
    if (painel && decisao && filme?.id > 0) painel.hidden = false;
  }

  async function mostrar(base, promessaDetalhes, contexto = {}) {
    if (aberta) return;
    aberta = true;
    ctx = { ...contexto };
    focoAnterior = document.activeElement;
    liberarVolta = aoVoltar(() => fechar({ peloVoltar: true }));
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

    rolagem.innerHTML = montar(filme, ctx);
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

  async function fechar({ girar = false, peloVoltar = false } = {}) {
    if (!aberta) return;
    aberta = false;
    if (!peloVoltar) liberarVolta?.();
    liberarVolta = null;
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
    const yt = evento.target.closest('[data-youtube]');
    if (yt) {
      abrirNoYoutube(evento, yt.dataset.youtube);
      return;
    }
    const alvo = evento.target.closest('[data-acao]');
    if (!alvo || !filme) return;
    const { acao } = alvo.dataset;

    if (acao === 'fechar') fechar();
    if (acao === 'girar') fechar({ girar: true });

    if ((acao === 'assistir' || acao === 'visto') && alvo.getAttribute('aria-pressed') !== 'true') {
      alvo.disabled = true;
      try {
        const feito = await aoAcao?.(acao, filme);
        if (feito === false) return;
        som.brilho();
        atualizarDecisao({ tipo: acao, eu: true, porNome: 'Você' });
        if (acao === 'visto') rolagem.querySelector('[data-nota-painel] input')?.focus();
      } catch (erro) {
        avisar(erro.message || 'Não foi possível salvar. Tente de novo.');
      } finally {
        alvo.disabled = false;
      }
    }

    if (acao === 'ocultar') {
      try {
        await aoAcao?.('oculto', filme);
        som.ocultar();
        fechar();
      } catch (erro) {
        avisar(erro.message || 'Não foi possível ocultar. Tente de novo.');
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

  return {
    mostrar, fechar, atualizarDecisao,
    get aberta() { return aberta; },
    get filme() { return aberta ? filme : null; },
  };
}
