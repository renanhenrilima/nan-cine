// Ponte com o Firebase: conta Google, perfil (filtros e ocultos), histórico
// pessoal e salas de cinema ao vivo. Tudo que fala com o banco passa por aqui.
//
// Estrutura no Firestore:
//   usuarios/{uid}                 nome, foto, filtros, ocultos {id: filme}
//   usuarios/{uid}/historico/{id}  filme, decisao ('assistir' | 'visto'), em, nota
//   salas/{codigo}                 nome, dono, membros {uid: {nome, foto, pronto, visto}},
//                                  filtros, giro, decisao, ocultos, aviso
//   salas/{codigo}/historico/{id}  filme, decisao, por, porNome, em, participantes, notas {uid: nota}

import { FIREBASE, EMULADORES } from './firebase-config.js';

const VERSAO = '13.2.0';
const CDN = `https://www.gstatic.com/firebasejs/${VERSAO}/`;

const HOST = location.hostname;
export const ehLocal = HOST === 'localhost' || HOST === '127.0.0.1'
  || /^\d{1,3}(\.\d{1,3}){3}$/.test(HOST) || HOST.endsWith('.local');

export const nuvemDisponivel = () => ehLocal || Boolean(FIREBASE.projectId && FIREBASE.apiKey);

let fb = null;
let pronta = null;

/** Carrega o Firebase. Resolve com null se não houver como (sem config, sem internet). */
export function iniciarNuvem() {
  if (!nuvemDisponivel()) return Promise.resolve(null);
  pronta ??= (async () => {
    try {
      const [appM, a, f] = await Promise.all([
        import(`${CDN}firebase-app.js`),
        import(`${CDN}firebase-auth.js`),
        import(`${CDN}firebase-firestore.js`),
      ]);
      const config = ehLocal
        ? { apiKey: 'chave-local', authDomain: HOST, projectId: 'demo-nancine', appId: 'nancine-local' }
        : FIREBASE;
      const app = appM.initializeApp(config);
      const auth = a.getAuth(app);
      auth.languageCode = 'pt';
      const db = f.getFirestore(app);
      if (ehLocal) {
        a.connectAuthEmulator(auth, `http://${HOST}:${EMULADORES.auth}`, { disableWarnings: true });
        f.connectFirestoreEmulator(db, HOST, EMULADORES.firestore);
      }
      // ?aba=1 deixa cada aba com uma conta própria (útil para testar a sala sozinho).
      if (new URLSearchParams(location.search).has('aba')) {
        await a.setPersistence(auth, a.browserSessionPersistence);
      }
      fb = { auth, db, a, f };
      return fb;
    } catch (erro) {
      console.warn('Firebase indisponível:', erro);
      return null;
    }
  })();
  return pronta;
}

const ref = (...partes) => fb.f.doc(fb.db, ...partes);
const agora = () => fb.f.serverTimestamp();
const dadosDe = (snap) => snap.data({ serverTimestamps: 'estimate' });

/** Firestore não aceita campos `undefined`: isto os remove. Não use em objetos com serverTimestamp(). */
const limpo = (obj) => JSON.parse(JSON.stringify(obj));

/** Converte um Timestamp do Firestore (ou número) em milissegundos. */
export const ms = (t) => (t?.toMillis ? t.toMillis() : Number(t) || 0);

/** O mínimo de um filme que vale guardar em listas e históricos. */
export function resumoCurto(filme) {
  return limpo({
    id: filme.id,
    titulo: filme.titulo || filme.original || 'Sem título',
    original: filme.original || filme.titulo || '',
    idioma: filme.idioma || '',
    ano: filme.ano || (filme.data || '').slice(0, 4),
    poster: filme.poster || '',
    notaImdb: filme.imdb?.nota ?? filme.notaImdb ?? null,
  });
}

/* ---------- Conta ---------- */

export const aoMudarConta = (cb) => fb.a.onAuthStateChanged(fb.auth, cb);
export const contaAtual = () => fb?.auth.currentUser || null;
export const sair = () => fb.a.signOut(fb.auth);

const novoProvedor = () => {
  const provedor = new fb.a.GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: 'select_account' });
  return provedor;
};

/**
 * Entra com a conta Google numa janelinha (popup). Precisa ser chamada direto do toque no
 * botão, sem esperar nada antes, senão o navegador bloqueia a janela.
 * Devolve null se a pessoa fechar a janela. Se o navegador bloquear, o erro traz code
 * "auth/popup-blocked".
 */
export async function entrar() {
  try {
    return (await fb.a.signInWithPopup(fb.auth, novoProvedor())).user;
  } catch (erro) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(erro.code)) return null;
    throw erro;
  }
}

/** Plano B, só quando o navegador bloqueia a janelinha: entra na própria aba. */
export const entrarNestaAba = () => fb.a.signInWithRedirect(fb.auth, novoProvedor());

// O apelido que a pessoa escolheu ao criar o perfil vale no lugar do nome do Google.
let meuApelido = '';
export const definirMeuApelido = (apelido) => { meuApelido = String(apelido || ''); };

export function perfilBasico(conta) {
  return {
    nome: (meuApelido || conta.displayName || conta.email?.split('@')[0] || 'Sem nome').trim().slice(0, 40),
    foto: conta.photoURL || '',
  };
}

/** Apelido: 2 a 20 letras, números, espaços, ponto, hífen e sublinhado. */
export const apelidoValido = (texto) => /^[\p{L}\p{N} ._-]{2,20}$/u.test(String(texto || '').trim());

/* ---------- Foto de perfil ---------- */
// A foto enviada pelo usuário (192 × 192, uns 15 KB) fica no documento do perfil. Nas salas
// vai só o número da versão (fotoV): quem entra busca a foto uma vez e guarda no aparelho,
// em vez de a sala inteira carregar as fotos a cada sinal de vida.

let minhaFotoV = 0;
export const definirMinhaFotoV = (v) => { minhaFotoV = Number(v) || 0; };

export async function salvarFotoPropria(uid, texto) {
  const fotoV = Date.now();
  await fb.f.updateDoc(ref('usuarios', uid), { fotoPropria: texto, fotoV });
  return fotoV;
}
export const removerFotoPropria = (uid) => fb.f.updateDoc(ref('usuarios', uid), { fotoPropria: fb.f.deleteField(), fotoV: 0 });

export async function fotoPropriaDe(uid) {
  const snap = await fb.f.getDoc(ref('usuarios', uid));
  return snap.exists() ? snap.data().fotoPropria || '' : '';
}

/** Primeiro acesso: guarda o apelido e a foto (obrigatórios para criar o perfil). */
export async function salvarPerfilInicial(uid, { apelido, fotoPropria }) {
  const fotoV = Date.now();
  await fb.f.updateDoc(ref('usuarios', uid), { apelido, nome: apelido, fotoPropria, fotoV });
  return fotoV;
}

export const salvarApelido = (uid, apelido) => fb.f.updateDoc(ref('usuarios', uid), { apelido, nome: apelido });

/** Atualiza o nome da pessoa em todas as salas em que ela está. */
export const apelidoNasSalas = (uid, apelido, codigos) => Promise.all(codigos.map((codigo) => (
  fb.f.updateDoc(ref('salas', codigo), { [`membros.${uid}.nome`]: apelido }).catch(() => {})
)));

// Salas de cada pessoa: um mapa no perfil, para listar "todas em que participo".
const registrarSalaNoPerfil = (uid, codigo, nome) => fb.f.updateDoc(ref('usuarios', uid), {
  [`salas.${codigo}`]: { nome: String(nome || '').slice(0, 40), em: agora() },
}).catch(() => {});
const tirarSalaDoPerfil = (uid, codigo) => fb.f.updateDoc(ref('usuarios', uid), {
  [`salas.${codigo}`]: fb.f.deleteField(),
}).catch(() => {});

/** Nome e membros de cada sala (para a lista "Minhas salas"). */
export async function lerSalas(codigos) {
  return Promise.all(codigos.map(async (codigo) => {
    try {
      const snap = await fb.f.getDoc(ref('salas', codigo));
      if (!snap.exists()) return { codigo, existe: false, membros: [] };
      const d = snap.data();
      return { codigo, existe: true, nome: d.nome, membros: listaDeMembros(d) };
    } catch {
      return { codigo, existe: true, nome: '', membros: [], erro: true };
    }
  }));
}

/** Perfil de outra pessoa (só abre para quem divide uma sala com ela). */
export async function perfilDe(uid) {
  const snap = await fb.f.getDoc(ref('usuarios', uid));
  if (!snap.exists()) throw new Error('Perfil não encontrado.');
  const d = snap.data();
  return { uid, apelido: d.apelido || d.nome || 'Sem nome', fotoPropria: d.fotoPropria || '', foto: d.foto || '', fotoV: d.fotoV || 0 };
}

/** Filmes que a pessoa assistiu (e as notas). As regras do banco só deixam ler quem divide uma sala. */
export async function historicoDe(uid) {
  const q = fb.f.query(colecaoHistorico(uid), fb.f.orderBy('em', 'desc'), fb.f.limit(150));
  const s = await fb.f.getDocs(q);
  return s.docs.map((d) => ({ id: Number(d.id), ...dadosDe(d) }));
}

export const atualizarFotoNaSala = (codigo, uid, fotoV) => fb.f.updateDoc(ref('salas', codigo), { [`membros.${uid}.fotoV`]: fotoV });

/* ---------- Perfil: filtros e ocultos ---------- */

/** Garante que o perfil existe. Devolve { novo, dados } com o que havia antes. */
export async function abrirPerfil(conta) {
  const r = ref('usuarios', conta.uid);
  const snap = await fb.f.getDoc(r);
  await fb.f.setDoc(r, { ...perfilBasico(conta), atualizado: agora() }, { merge: true });
  return { novo: !snap.exists(), dados: snap.exists() ? snap.data() : {} };
}

export const ouvirPerfil = (uid, cb) => fb.f.onSnapshot(ref('usuarios', uid), (s) => cb(s.exists() ? dadosDe(s) : {}));

// updateDoc troca o campo inteiro: um gênero desmarcado some de verdade.
export const salvarFiltros = (uid, filtros) => fb.f.updateDoc(ref('usuarios', uid), { filtros: limpo(filtros) });
export const ocultarNoPerfil = (uid, filme) => fb.f.updateDoc(ref('usuarios', uid), { [`ocultos.${filme.id}`]: resumoCurto(filme) });
export const desocultarNoPerfil = (uid, id) => fb.f.updateDoc(ref('usuarios', uid), { [`ocultos.${id}`]: fb.f.deleteField() });

export async function ocultosDe(uids) {
  const perfis = await Promise.all(uids.map((uid) => fb.f.getDoc(ref('usuarios', uid)).catch(() => null)));
  const ids = new Set();
  for (const p of perfis) Object.keys(p?.data()?.ocultos || {}).forEach((id) => ids.add(Number(id)));
  return ids;
}

/* ---------- Histórico pessoal ---------- */

const colecaoHistorico = (uid) => fb.f.collection(fb.db, 'usuarios', uid, 'historico');

export function ouvirHistorico(uid, cb) {
  const q = fb.f.query(colecaoHistorico(uid), fb.f.orderBy('em', 'desc'), fb.f.limit(300));
  return fb.f.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: Number(d.id), ...dadosDe(d) }))));
}

export const registrarNoHistorico = (uid, filme, decisao, nota = null) => fb.f.setDoc(
  ref('usuarios', uid, 'historico', String(filme.id)),
  { filme: resumoCurto(filme), decisao, em: agora(), nota: nota ?? null },
  { merge: true },
);
export const avaliarNoHistorico = (uid, id, nota) => fb.f.updateDoc(ref('usuarios', uid, 'historico', String(id)), { nota });
export const tirarDoHistorico = (uid, id) => fb.f.deleteDoc(ref('usuarios', uid, 'historico', String(id)));

/* ---------- Salas ---------- */

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normalizarCodigo = (texto) => String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

function novoCodigo() {
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += LETRAS[Math.floor(Math.random() * LETRAS.length)];
  return codigo;
}

/** Quem não dá sinal de vida há mais que isso conta como ausente (e não trava o PRONTO). */
export const AUSENTE_DEPOIS_DE = 75_000;
export const estaPresente = (m, instante = Date.now()) => instante - ms(m.visto) < AUSENTE_DEPOIS_DE;

/** Os membros de verdade (com nome) da sala, como lista. */
export function listaDeMembros(sala) {
  return Object.entries(sala?.membros || {})
    .filter(([, m]) => m?.nome)
    .map(([uid, m]) => ({ uid, ...m }));
}

export function situacaoDoPronto(sala, instante = Date.now()) {
  const presentes = listaDeMembros(sala).filter((m) => estaPresente(m, instante));
  const faltam = presentes.filter((m) => !m.pronto);
  return { presentes, faltam, todos: presentes.length > 0 && faltam.length === 0 };
}

const membroNovo = (conta) => ({ ...perfilBasico(conta), fotoV: minhaFotoV, pronto: false, visto: agora(), entrou: agora() });

export async function criarSala(conta, nome, filtros) {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = novoCodigo();
    const r = ref('salas', codigo);
    if ((await fb.f.getDoc(r)).exists()) continue;
    await fb.f.setDoc(r, {
      nome: (nome || `Sala de ${perfilBasico(conta).nome}`).slice(0, 40),
      dono: conta.uid,
      criadaEm: agora(),
      membros: { [conta.uid]: membroNovo(conta) },
      filtros: limpo(filtros),
      giro: null,
      decisao: null,
      ocultos: {},
      aviso: null,
    });
    registrarSalaNoPerfil(conta.uid, codigo, nome || `Sala de ${perfilBasico(conta).nome}`);
    return codigo;
  }
  throw new Error('Não foi possível criar a sala. Tente de novo.');
}

export async function entrarNaSala(conta, codigo) {
  const r = ref('salas', codigo);
  const snap = await fb.f.getDoc(r);
  if (!snap.exists()) throw new Error('Não achamos nenhuma sala com esse código.');
  const antes = snap.data().membros?.[conta.uid];
  await fb.f.updateDoc(r, {
    [`membros.${conta.uid}`]: antes?.nome
      ? { ...antes, ...perfilBasico(conta), fotoV: minhaFotoV, pronto: false, visto: agora() }
      : membroNovo(conta),
  });
  registrarSalaNoPerfil(conta.uid, codigo, snap.data().nome);
}

/** Deixa a sala de vez: sai da lista de membros e some de "Minhas salas". */
export async function sairDaSala(uid, codigo) {
  await fb.f.updateDoc(ref('salas', codigo), { [`membros.${uid}`]: fb.f.deleteField() }).catch(() => {});
  await tirarSalaDoPerfil(uid, codigo);
}

export const ouvirSala = (codigo, cb, aoErrar) => fb.f.onSnapshot(
  ref('salas', codigo),
  (s) => cb(s.exists() ? dadosDe(s) : null),
  aoErrar,
);

export function ouvirHistoricoSala(codigo, cb) {
  const q = fb.f.query(fb.f.collection(fb.db, 'salas', codigo, 'historico'), fb.f.orderBy('em', 'desc'), fb.f.limit(200));
  return fb.f.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: Number(d.id), ...dadosDe(d) }))));
}

export const marcarPronto = (codigo, uid, pronto) => fb.f.updateDoc(ref('salas', codigo), {
  [`membros.${uid}.pronto`]: pronto,
  [`membros.${uid}.visto`]: agora(),
});

export const sinalDeVida = (codigo, uid) => fb.f.updateDoc(ref('salas', codigo), { [`membros.${uid}.visto`]: agora() });

/** Troca o ingresso da sala. Todo mundo precisa apertar PRONTO de novo. */
export function mudarFiltrosSala(codigo, quem, filtros) {
  return fb.f.runTransaction(fb.db, async (tx) => {
    const r = ref('salas', codigo);
    const snap = await tx.get(r);
    if (!snap.exists()) return;
    const mudancas = {
      filtros: limpo(filtros),
      aviso: { texto: `${quem.nome} mudou o ingresso.`, por: quem.uid, em: Date.now() },
    };
    for (const m of listaDeMembros(snap.data())) mudancas[`membros.${m.uid}.pronto`] = false;
    tx.update(r, mudancas);
  });
}

/**
 * Registra o giro para todos verem. Só passa se todos os presentes estiverem
 * prontos; zera o PRONTO de todos. Devolve o número do giro, ou 0 se não passou.
 */
export function girarNaSala(codigo, quem, filme, parametros) {
  return fb.f.runTransaction(fb.db, async (tx) => {
    const r = ref('salas', codigo);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error('A sala não existe mais.');
    const sala = snap.data();
    if (!situacaoDoPronto(sala).todos) return 0;
    const seq = (sala.giro?.seq || 0) + 1;
    const mudancas = {
      giro: limpo({ seq, filme, ...parametros, por: quem.uid, porNome: quem.nome, em: Date.now() }),
      decisao: null,
    };
    for (const m of listaDeMembros(sala)) mudancas[`membros.${m.uid}.pronto`] = false;
    tx.update(r, mudancas);
    return seq;
  });
}

/** "Vamos assistir", "Já vi" ou "Ocultar" para o filme sorteado na sala. */
export async function decidirNaSala(codigo, sala, quem, filme, tipo, nota = null) {
  const seq = sala.giro?.seq || 0;
  if (tipo !== 'oculto') {
    const r = ref('salas', codigo, 'historico', String(filme.id));
    const existe = (await fb.f.getDoc(r)).exists();
    const participantes = situacaoDoPronto(sala).presentes.map((m) => m.uid);
    if (!participantes.includes(quem.uid)) participantes.push(quem.uid);
    if (existe) {
      await fb.f.updateDoc(r, { decisao: tipo, por: quem.uid, porNome: quem.nome, em: agora() });
    } else {
      await fb.f.setDoc(r, {
        filme: resumoCurto(filme), decisao: tipo, por: quem.uid, porNome: quem.nome,
        em: agora(), participantes, notas: {}, nomes: {},
      });
    }
    if (nota) await avaliarNaSala(codigo, filme.id, quem, nota);
  }
  const mudancas = { decisao: { seq, filmeId: filme.id, tipo, por: quem.uid, porNome: quem.nome } };
  if (tipo === 'oculto') mudancas[`ocultos.${filme.id}`] = resumoCurto(filme);
  await fb.f.updateDoc(ref('salas', codigo), mudancas);
}

export const avaliarNaSala = (codigo, id, quem, nota) => fb.f.updateDoc(
  ref('salas', codigo, 'historico', String(id)),
  { [`notas.${quem.uid}`]: nota, [`nomes.${quem.uid}`]: quem.nome },
);
export const tirarDoHistoricoSala = (codigo, id) => fb.f.deleteDoc(ref('salas', codigo, 'historico', String(id)));
export const desocultarNaSala = (codigo, id) => fb.f.updateDoc(ref('salas', codigo), { [`ocultos.${id}`]: fb.f.deleteField() });
