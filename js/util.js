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
/** Recado curto que aparece no rodapé da tela e some sozinho. */
export function avisar(texto) {
  avisoAtual?.remove();
  const el = document.createElement('div');
  el.className = 'aviso-flutuante';
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.append(el);
  avisoAtual = el;
  setTimeout(() => el.remove(), 3400);
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
