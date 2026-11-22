// Sala de cinema ao vivo: quem está na sala, o PRONTO de cada um, o ingresso
// (filtros) da sala, o giro que todos assistem juntos e o histórico com as notas.
// Este módulo guarda o estado e conversa com o banco; a tela fica em main.js.

import * as nuvem from './nuvem.js';
import { store } from './storage.js';

const ouvintes = new Set();
let conta = null;
let codigo = null;
let dados = null;
let historico = [];
let cancelar = [];
let pulso = null;
let ultimoGiro = null;     // número do último giro já tratado
let ultimaDecisao = '';
let ultimoAviso = 0;
let membrosAntes = null;
let cacheOcultos = { em: 0, chave: '', ids: new Set() };

const emitir = (tipo, info) => ouvintes.forEach((cb) => cb(tipo, info));
const quem = () => ({ uid: conta.uid, nome: nuvem.perfilBasico(conta).nome });

function pararDeOuvir() {
  cancelar.forEach((fn) => fn());
  cancelar = [];
  clearInterval(pulso);
  pulso = null;
}

function darSinalDeVida() {
  if (codigo && conta && document.visibilityState === 'visible') {
    nuvem.sinalDeVida(codigo, conta.uid).catch(() => {});
  }
}
document.addEventListener('visibilitychange', darSinalDeVida);

function aoChegarSala(novos) {
  if (!novos || !novos.membros?.[conta.uid]?.nome) {
    const motivo = novos ? 'Você saiu da sala.' : 'Esta sala foi fechada.';
    largar();
    emitir('saiu', motivo);
    return;
  }
  const primeira = dados === null;
  dados = novos;

  // Quem entrou ou saiu (para o som e o aviso).
  const agora = new Set(nuvem.listaDeMembros(dados).map((m) => m.uid));
  if (membrosAntes) {
    const entraram = [...agora].filter((uid) => !membrosAntes.has(uid));
    if (entraram.length) emitir('entrou', entraram.map((uid) => dados.membros[uid].nome));
  }
  membrosAntes = agora;

  // Um giro novo: todo mundo assiste. Ao entrar, o giro antigo não é repetido.
  const giro = dados.giro;
  if (primeira) {
    ultimoGiro = giro?.seq ?? 0;
  } else if (giro && giro.seq > ultimoGiro) {
    ultimoGiro = giro.seq;
    if (Date.now() - nuvem.ms(giro.em) < 60_000) emitir('giro', giro);
  }

  const decisao = dados.decisao ? `${dados.decisao.seq}:${dados.decisao.tipo}:${dados.decisao.por}` : '';
  if (decisao !== ultimaDecisao) {
    ultimaDecisao = decisao;
    if (dados.decisao && !primeira) emitir('decisao', dados.decisao);
  }

  if (dados.aviso && dados.aviso.em > ultimoAviso) {
    if (!primeira && dados.aviso.por !== conta.uid) emitir('aviso', dados.aviso.texto);
    ultimoAviso = dados.aviso.em;
  }

  emitir('sala', dados);
}

async function ouvir(novoCodigo) {
  pararDeOuvir();
  codigo = novoCodigo;
  dados = null;
  historico = [];
  membrosAntes = null;
  ultimaDecisao = '';
  ultimoAviso = 0;
  store.set(`sala:${conta.uid}`, codigo);

  await new Promise((resolver, rejeitar) => {
    let primeira = true;
    cancelar.push(nuvem.ouvirSala(codigo, (novos) => {
      aoChegarSala(novos);
      if (primeira) {
        primeira = false;
        resolver();
      }
    }, (erro) => {
      if (primeira) rejeitar(erro);
    }));
  });
  if (!codigo) return;
  cancelar.push(nuvem.ouvirHistoricoSala(codigo, (lista) => {
    historico = lista;
    emitir('historico', historico);
  }));
  pulso = setInterval(darSinalDeVida, 30_000);
}

function largar() {
  pararDeOuvir();
  if (conta) store.remover(`sala:${conta.uid}`);
  codigo = null;
  dados = null;
  historico = [];
}

export const sala = {
  get ativa() { return Boolean(codigo && dados); },
  get codigo() { return codigo; },
  get dados() { return dados; },
  get historico() { return historico; },
  get eu() { return conta?.uid || null; },

  aoMudar(cb) {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  },

  /** Conta trocou: sai da sala atual e, se houver, volta para a última sala desta conta. */
  async usarConta(novaConta) {
    // O login pode avisar duas vezes a mesma conta: não sai da sala por isso.
    if (novaConta && conta && novaConta.uid === conta.uid) return;
    if (codigo) {
      largar();
      emitir('saiu', null);
    }
    conta = novaConta;
    const salva = conta ? store.get(`sala:${conta.uid}`, null) : null;
    if (salva) {
      try {
        await nuvem.entrarNaSala(conta, salva);
        await ouvir(salva);
      } catch {
        largar();
      }
    }
  },

  async criar(nome, filtros) {
    const novo = await nuvem.criarSala(conta, nome, filtros);
    await ouvir(novo);
    return novo;
  },

  async entrar(codigoDigitado) {
    const alvo = nuvem.normalizarCodigo(codigoDigitado);
    if (alvo.length !== 6) throw new Error('O código da sala tem 6 letras e números.');
    if (alvo === codigo) return alvo;
    if (codigo) this.desativar(); // troca de sala, sem deixar a anterior
    await nuvem.entrarNaSala(conta, alvo);
    await ouvir(alvo);
    return alvo;
  },

  /** Fecha a sala na tela, mas continua sendo membro (ela segue em "Minhas salas"). */
  desativar() {
    if (!codigo) return;
    largar();
    emitir('saiu', null);
  },

  /** Deixa uma sala de vez (a ativa ou qualquer outra da lista). */
  async deixar(codigoAlvo) {
    if (codigoAlvo === codigo) return this.sair();
    await nuvem.sairDaSala(conta.uid, codigoAlvo);
    return undefined;
  },

  async sair() {
    if (!codigo) return;
    const saindo = codigo;
    largar();
    emitir('saiu', null);
    await nuvem.sairDaSala(conta.uid, saindo).catch(() => {});
  },

  membros(instante = Date.now()) {
    return nuvem.listaDeMembros(dados)
      .map((m) => ({ ...m, presente: nuvem.estaPresente(m, instante), eu: m.uid === conta?.uid }))
      .sort((a, b) => nuvem.ms(a.entrou) - nuvem.ms(b.entrou));
  },

  situacao(instante = Date.now()) {
    return nuvem.situacaoDoPronto(dados, instante);
  },

  euPronto() {
    return Boolean(dados?.membros?.[conta?.uid]?.pronto);
  },

  alternarPronto() {
    return nuvem.marcarPronto(codigo, conta.uid, !this.euPronto());
  },

  /** Avisa a sala que a foto deste usuário mudou (os outros buscam a nova). */
  atualizarMinhaFoto(fotoV) {
    return nuvem.atualizarFotoNaSala(codigo, conta.uid, fotoV);
  },

  mudarFiltros(filtros) {
    return nuvem.mudarFiltrosSala(codigo, quem(), filtros);
  },

  girar(filme, parametros) {
    return nuvem.girarNaSala(codigo, quem(), filme, parametros);
  },

  decidir(filme, tipo, nota = null) {
    return nuvem.decidirNaSala(codigo, dados, quem(), filme, tipo, nota);
  },

  avaliar(id, nota) {
    return nuvem.avaliarNaSala(codigo, id, quem(), nota);
  },

  remover(id) {
    return nuvem.tirarDoHistoricoSala(codigo, id);
  },

  desocultar(id) {
    return nuvem.desocultarNaSala(codigo, id);
  },

  /** Não sorteia o que a sala já viu ou ocultou, nem o que algum membro ocultou para si. */
  async excluidos() {
    const ids = new Set([...historico.map((h) => h.id), ...Object.keys(dados?.ocultos || {}).map(Number)]);
    const uids = nuvem.listaDeMembros(dados).map((m) => m.uid).sort();
    const chave = uids.join(',');
    if (chave !== cacheOcultos.chave || Date.now() - cacheOcultos.em > 60_000) {
      cacheOcultos = { em: Date.now(), chave, ids: await nuvem.ocultosDe(uids).catch(() => new Set()) };
    }
    cacheOcultos.ids.forEach((id) => ids.add(id));
    return ids;
  },

  linkDeConvite() {
    return `${location.origin}${location.pathname}?sala=${codigo}`;
  },
};
