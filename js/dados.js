// "Meus filmes": filtros, histórico (com notas) e ocultos de quem está usando.
// Sem conta, tudo fica no navegador. Com conta, fica na nuvem e vale em qualquer
// aparelho; o que já estava no navegador vai junto no primeiro acesso.

import { store } from './storage.js';
import * as nuvem from './nuvem.js';

const ouvintes = new Set();
let conta = null;
let historico = [];
let ocultos = {};
let filtros = null;
let perfilNuvem = {};
let perfilCarregado = false;
let cancelar = [];
let espera = null;

function avisarMudanca(origem) {
  for (const cb of ouvintes) cb(origem);
}

/* ---------- Dados do navegador ---------- */

function historicoLocal() {
  let lista = store.get('historico', null);
  if (!lista) {
    // Versão anterior: "Quero ver" e "Já vi" viram histórico.
    const antigos = [
      ...store.get('vistos', []).map((f) => ({ f, decisao: 'visto' })),
      ...store.get('queroVer', []).map((f) => ({ f, decisao: 'assistir' })),
    ];
    lista = antigos.map(({ f, decisao }) => ({
      id: f.id, filme: nuvem.resumoCurto(f), decisao, em: Date.now(), nota: null,
    }));
    store.set('historico', lista);
  }
  return lista;
}

const salvarLocal = () => {
  store.set('historico', historico);
  store.set('ocultos', ocultos);
};

/* ---------- Troca de conta ---------- */

async function usarConta(novaConta) {
  if (novaConta && conta && novaConta.uid === conta.uid) return; // mesma conta, já ligada
  cancelar.forEach((fn) => fn());
  cancelar = [];
  clearTimeout(espera);
  conta = novaConta;
  perfilNuvem = {};
  perfilCarregado = false;
  nuvem.definirMinhaFotoV(0);
  nuvem.definirMeuApelido('');

  if (!conta) {
    historico = historicoLocal();
    ocultos = store.get('ocultos', {});
    filtros = store.get('filtros', null);
    avisarMudanca('conta');
    return;
  }

  // Enquanto a nuvem responde, usa a cópia rápida desta conta.
  filtros = store.get(`filtros:${conta.uid}`, null);
  historico = [];
  ocultos = {};
  avisarMudanca('conta');

  const { dados } = await nuvem.abrirPerfil(conta);
  if (conta?.uid !== novaConta.uid) return;
  // Já dá para saber se o perfil está completo (apelido e foto) antes do primeiro aviso da nuvem.
  perfilNuvem = dados;
  perfilCarregado = true;
  nuvem.definirMinhaFotoV(dados.fotoV);
  nuvem.definirMeuApelido(dados.apelido);

  // Primeira vez com esta conta neste aparelho: leva o que estava no navegador.
  if (!dados.filtros) {
    const locais = { f: store.get('filtros', null), h: historicoLocal(), o: store.get('ocultos', {}) };
    if (locais.f) await nuvem.salvarFiltros(conta.uid, locais.f);
    for (const filme of Object.values(locais.o)) await nuvem.ocultarNoPerfil(conta.uid, filme);
    for (const item of locais.h) await nuvem.registrarNoHistorico(conta.uid, item.filme, item.decisao, item.nota);
    filtros = locais.f;
  } else {
    filtros = dados.filtros;
  }
  store.set(`filtros:${conta.uid}`, filtros);
  avisarMudanca('perfil');

  const uid = conta.uid;
  cancelar.push(nuvem.ouvirPerfil(uid, (perfil) => {
    const fotoMudou = (perfil.fotoV || 0) !== (perfilNuvem.fotoV || 0);
    const apelidoMudou = (perfil.apelido || '') !== (perfilNuvem.apelido || '');
    const salasMudaram = Object.keys(perfil.salas || {}).sort().join() !== Object.keys(perfilNuvem.salas || {}).sort().join();
    perfilNuvem = perfil;
    perfilCarregado = true;
    nuvem.definirMinhaFotoV(perfil.fotoV);
    nuvem.definirMeuApelido(perfil.apelido);
    if (fotoMudou) avisarMudanca('foto');
    if (apelidoMudou || fotoMudou || salasMudaram) avisarMudanca('cadastro');
    ocultos = perfil.ocultos || {};
    const vieram = perfil.filtros || null;
    if (vieram && JSON.stringify(vieram) !== JSON.stringify(filtros) && !espera) {
      filtros = vieram; // mudou em outro aparelho
      store.set(`filtros:${uid}`, filtros);
      avisarMudanca('filtros');
    }
    avisarMudanca('ocultos');
  }));
  cancelar.push(nuvem.ouvirHistorico(uid, (lista) => {
    historico = lista;
    avisarMudanca('historico');
  }));
}

/* ---------- Interface ---------- */

export const meus = {
  get conta() { return conta; },
  get historico() { return historico; },
  get ocultos() { return ocultos; },
  get filtros() { return filtros; },
  /** Foto enviada pelo usuário (texto da imagem) e a versão dela; vazio se não enviou. */
  get fotoPropria() { return perfilNuvem.fotoPropria || ''; },
  get fotoV() { return perfilNuvem.fotoV || 0; },
  /** O perfil da nuvem já chegou (sem isso, "sem foto" pode ser só demora). */
  get perfilPronto() { return perfilCarregado; },
  get apelido() { return perfilNuvem.apelido || ''; },
  /** O cadastro está completo: apelido e foto, os dois obrigatórios. */
  get perfilCompleto() { return Boolean(perfilNuvem.apelido && perfilNuvem.fotoPropria); },
  /** Salas em que a pessoa participa, da mais recente para a mais antiga. */
  get salas() {
    return Object.entries(perfilNuvem.salas || {})
      .map(([codigo, s]) => ({ codigo, nome: s?.nome || codigo, em: nuvem.ms(s?.em) }))
      .sort((a, b) => b.em - a.em);
  },

  usarConta,

  aoMudar(cb) {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  },

  /** Filmes que não devem mais sair no sorteio solo. */
  excluidos() {
    return new Set([...historico.map((h) => h.id), ...Object.keys(ocultos).map(Number)]);
  },

  registro(id) {
    return historico.find((h) => h.id === id) || null;
  },

  salvarFiltros(novos) {
    filtros = novos;
    if (!conta) {
      store.set('filtros', novos);
      return;
    }
    store.set(`filtros:${conta.uid}`, novos);
    clearTimeout(espera);
    const uid = conta.uid;
    espera = setTimeout(() => {
      espera = null;
      nuvem.salvarFiltros(uid, novos).catch((erro) => console.warn('Filtros não salvos:', erro));
    }, 700);
  },

  async registrar(filme, decisao, nota = null) {
    if (conta) return nuvem.registrarNoHistorico(conta.uid, filme, decisao, nota);
    historico = [
      { id: filme.id, filme: nuvem.resumoCurto(filme), decisao, em: Date.now(), nota },
      ...historico.filter((h) => h.id !== filme.id),
    ];
    salvarLocal();
    avisarMudanca('historico');
  },

  async avaliar(id, nota) {
    if (conta) return nuvem.avaliarNoHistorico(conta.uid, id, nota);
    historico = historico.map((h) => (h.id === id ? { ...h, nota } : h));
    salvarLocal();
    avisarMudanca('historico');
  },

  async remover(id) {
    if (conta) return nuvem.tirarDoHistorico(conta.uid, id);
    historico = historico.filter((h) => h.id !== id);
    salvarLocal();
    avisarMudanca('historico');
  },

  async ocultar(filme) {
    if (conta) return nuvem.ocultarNoPerfil(conta.uid, filme);
    ocultos = { ...ocultos, [filme.id]: nuvem.resumoCurto(filme) };
    salvarLocal();
    avisarMudanca('ocultos');
  },

  async desocultar(id) {
    if (conta) return nuvem.desocultarNoPerfil(conta.uid, id);
    const resto = { ...ocultos };
    delete resto[id];
    ocultos = resto;
    salvarLocal();
    avisarMudanca('ocultos');
  },
};
