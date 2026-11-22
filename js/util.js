export const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

export const movimentoReduzido = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let avisoAtual = null;
/**
 * Recado curto que aparece no rodapé da tela e some sozinho.
 * Com `acao`, ganha um botão (por exemplo, "Desfazer").
 */
export function avisar(texto, acao = null) {
  avisoAtual?.remove();
  const el = document.createElement('div');
  el.className = 'aviso-flutuante';
  el.setAttribute('role', 'status');
  const p = document.createElement('span');
  p.textContent = texto;
  el.append(p);
  if (acao) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = acao.rotulo;
    botao.addEventListener('click', () => {
      el.remove();
      acao.fazer();
    });
    el.append(botao);
  }
  // Dentro de um <dialog> aberto o aviso precisa ficar na camada de cima.
  (document.querySelector('dialog[open]') || document.body).append(el);
  avisoAtual = el;
  setTimeout(() => el.remove(), acao ? 6000 : 3400);
}

/* O botão "voltar" do celular fecha o que está aberto (em vez de sair do site). */
const pilhaVoltar = [];
let ignorarVoltas = 0;
window.addEventListener('popstate', () => {
  if (ignorarVoltas > 0) {
    ignorarVoltas--;
    return;
  }
  pilhaVoltar.pop()?.();
});

/** Registra algo que o "voltar" deve fechar. Devolve a função para usar ao fechar por botão. */
export function aoVoltar(fechar) {
  history.pushState({ nancine: pilhaVoltar.length + 1 }, '');
  pilhaVoltar.push(fechar);
  return () => {
    const i = pilhaVoltar.lastIndexOf(fechar);
    if (i < 0) return;
    pilhaVoltar.splice(i, 1);
    ignorarVoltas++;
    history.back();
  };
}

/** Vibração curta no celular (Android). */
export function vibrar(padrao) {
  try {
    navigator.vibrate?.(padrao);
  } catch {
    /* sem vibração neste aparelho */
  }
}

export const sortearUm =(lista) => lista[Math.floor(Math.random() * lista.length)];

export function dataPorExtenso(iso) {
  if (!iso) return 'Data não informada';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Data não informada';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function duracaoTexto(minutos) {
  if (!minutos) return '';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}

let nomes;
export function nomeIdioma(codigo) {
  if (!codigo) return '';
  try {
    nomes ??= new Intl.DisplayNames(['pt-BR'], { type: 'language' });
    return nomes.of(codigo) || codigo;
  } catch {
    return codigo;
  }
}

export const numero = (n) => Number(n || 0).toLocaleString('pt-BR');

export const nota1 = (n) => Number(n || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function isoDia(data) {
  const d = new Date(data);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Traduz o resumo de prêmios do OMDb ("Won 3 Oscars. 31 wins & 31 nominations total")
 * para o português. Se o texto vier num formato novo, devolve o original.
 */
export function premiosEmPortugues(texto) {
  if (!texto) return '';
  const nome = (n) => n.replace(/\bGolden Globes?\b/g, (m) => (m.endsWith('s') ? 'Globos de Ouro' : 'Globo de Ouro'));
  const plural = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
  const partes = texto.split('. ').map((p) => p.replace(/\.$/, '').trim()).filter(Boolean);
  const saida = [];
  for (const parte of partes) {
    let m;
    if ((m = parte.match(/^Won (\d+) (.+)$/))) saida.push(`Ganhou ${m[1]} ${nome(m[2])}`);
    else if ((m = parte.match(/^Nominated for (\d+) (.+)$/))) saida.push(`Indicado a ${m[1]} ${nome(m[2])}`);
    else if ((m = parte.match(/^(\d+) wins? & (\d+) nominations? total$/))) {
      saida.push(`${plural(m[1], 'vitória', 'vitórias')} e ${plural(m[2], 'indicação', 'indicações')} no total`);
    } else if ((m = parte.match(/^(\d+) wins? total$/))) saida.push(`${plural(m[1], 'vitória', 'vitórias')} no total`);
    else if ((m = parte.match(/^(\d+) nominations? total$/))) saida.push(`${plural(m[1], 'indicação', 'indicações')} no total`);
    else if ((m = parte.match(/^(\d+) wins?( & (\d+) nominations?)?$/))) {
      saida.push(m[3] ? `${plural(m[1], 'vitória', 'vitórias')} e ${plural(m[3], 'indicação', 'indicações')}` : plural(m[1], 'vitória', 'vitórias'));
    } else if ((m = parte.match(/^(\d+) nominations?$/))) saida.push(plural(m[1], 'indicação', 'indicações'));
    else return texto;
  }
  return `${saida.join('. ')}.`;
}
