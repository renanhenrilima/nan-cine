// Tudo que o app lembra fica no navegador do visitante (localStorage).

const PREFIXO = 'nancine:';

export const store = {
  get(chave, padrao) {
    try {
      const bruto = localStorage.getItem(PREFIXO + chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch {
      return padrao;
    }
  },
  set(chave, valor) {
    try {
      localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    } catch {
      /* armazenamento indisponível: o app segue funcionando sem lembrar */
    }
  },
};

function resumo(filme) {
  return {
    id: filme.id,
    titulo: filme.titulo,
    original: filme.original,
    idioma: filme.idioma,
    ano: (filme.data || '').slice(0, 4),
    poster: filme.poster || null,
  };
}

export const listas = {
  queroVer: () => store.get('queroVer', []),
  vistos: () => store.get('vistos', []),

  temQueroVer(id) {
    return this.queroVer().some((f) => f.id === id);
  },
  foiVisto(id) {
    return this.vistos().some((f) => f.id === id);
  },

  /** Devolve true se o filme ficou na lista, false se saiu. */
  alternarQueroVer(filme) {
    const atual = this.queroVer();
    const existe = atual.some((f) => f.id === filme.id);
    store.set('queroVer', existe ? atual.filter((f) => f.id !== filme.id) : [resumo(filme), ...atual]);
    return !existe;
  },
  removerQueroVer(id) {
    store.set('queroVer', this.queroVer().filter((f) => f.id !== id));
  },

  marcarVisto(filme) {
    if (!this.foiVisto(filme.id)) store.set('vistos', [resumo(filme), ...this.vistos()]);
    this.removerQueroVer(filme.id);
  },
  removerVisto(id) {
    store.set('vistos', this.vistos().filter((f) => f.id !== id));
  },
};
