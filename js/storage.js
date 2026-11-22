// O que o app lembra no navegador (localStorage). Com a conta ligada, os dados
// do usuário vão para a nuvem (ver dados.js) e aqui fica só uma cópia rápida.

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
  remover(chave) {
    try {
      localStorage.removeItem(PREFIXO + chave);
    } catch {
      /* nada a fazer */
    }
  },
};
