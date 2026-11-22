// Editor da foto de perfil: o usuário escolhe uma imagem, arrasta para posicionar, dá zoom
// e a foto sai recortada e compactada (192 × 192, JPEG) no tamanho que as poltronas usam.
// Fica pequena de propósito (cerca de 10 a 15 KB), para caber no banco gratuito sem pesar.

const SAIDA = 192;        // lado da foto final, em pixels
const LIMITE_TEXTO = 40_000; // tamanho máximo do texto da imagem (data URL)
const V = 320;            // lado interno do quadro de edição
const RAIO = V * 0.46;    // a foto final é o quadrado que envolve este círculo
const ZOOM_MAX = 4;
const TAU = Math.PI * 2;

const $ = (seletor) => document.querySelector(seletor);

async function abrirImagem(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new Error('Esse arquivo não é uma imagem.');
  if (arquivo.size > 25 * 1024 * 1024) throw new Error('A imagem é grande demais (máximo de 25 MB).');
  try {
    // "from-image" aplica a rotação gravada pela câmera (EXIF).
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    return { fonte: bitmap, largura: bitmap.width, altura: bitmap.height };
  } catch {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await new Promise((ok, erro) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => erro(new Error('Não foi possível abrir essa imagem.'));
        i.src = url;
      });
      return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Abre o editor para o arquivo. Resolve com a imagem pronta (texto data URL) ou null se cancelar. */
export async function editarFoto(arquivo) {
  const imagem = await abrirImagem(arquivo);
  const dialogo = $('#dlg-foto');
  const quadro = $('#recorte');
  const tela = $('#recorte-canvas');
  const zoomBarra = $('#foto-zoom');
  const salvar = $('#foto-salvar');
  const ctx = tela.getContext('2d');
  tela.width = V;
  tela.height = V;

  const minimo = (2 * RAIO) / Math.min(imagem.largura, imagem.altura);
  let zoom = 1;
  let cx = V / 2;
  let cy = V / 2;
  const escala = () => minimo * zoom;

  function ajustar() {
    const w = imagem.largura * escala();
    const h = imagem.altura * escala();
    // A imagem sempre cobre o círculo inteiro: não deixa sobrar borda vazia.
    cx = Math.min(V / 2 - RAIO + w / 2, Math.max(V / 2 + RAIO - w / 2, cx));
    cy = Math.min(V / 2 - RAIO + h / 2, Math.max(V / 2 + RAIO - h / 2, cy));
  }

  function desenhar() {
    ajustar();
    const w = imagem.largura * escala();
    const h = imagem.altura * escala();
    ctx.fillStyle = '#120709';
    ctx.fillRect(0, 0, V, V);
    ctx.drawImage(imagem.fonte, cx - w / 2, cy - h / 2, w, h);
    // Escurece o que fica fora do círculo e desenha o contorno.
    ctx.save();
    ctx.fillStyle = 'rgba(8, 2, 4, 0.66)';
    ctx.beginPath();
    ctx.rect(0, 0, V, V);
    ctx.arc(V / 2, V / 2, RAIO, 0, TAU, true);
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(V / 2, V / 2, RAIO, 0, TAU);
    ctx.stroke();
  }

  function mudarZoom(novo) {
    zoom = Math.min(ZOOM_MAX, Math.max(1, novo));
    zoomBarra.value = String(zoom);
    zoomBarra.style.setProperty('--preenchido', `${((zoom - 1) / (ZOOM_MAX - 1)) * 100}%`);
    desenhar();
  }

  /* ---- Arrastar (um dedo) e pinça (dois dedos) ---- */
  const ponteiros = new Map();
  let distanciaAntes = 0;
  const pixel = () => V / tela.getBoundingClientRect().width;
  const distancia = () => {
    const [a, b] = [...ponteiros.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const aoApertar = (e) => {
    tela.setPointerCapture(e.pointerId);
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.size === 2) distanciaAntes = distancia();
  };
  const aoMover = (e) => {
    const antes = ponteiros.get(e.pointerId);
    if (!antes) return;
    const agora = { x: e.clientX, y: e.clientY };
    ponteiros.set(e.pointerId, agora);
    if (ponteiros.size === 1) {
      cx += (agora.x - antes.x) * pixel();
      cy += (agora.y - antes.y) * pixel();
      desenhar();
    } else if (ponteiros.size === 2 && distanciaAntes) {
      const d = distancia();
      mudarZoom(zoom * (d / distanciaAntes));
      distanciaAntes = d;
    }
  };
  const aoSoltar = (e) => {
    ponteiros.delete(e.pointerId);
    distanciaAntes = ponteiros.size === 2 ? distancia() : 0;
  };
  const aoRolar = (e) => {
    e.preventDefault();
    mudarZoom(zoom * Math.exp(-e.deltaY * 0.0015));
  };
  const aoTeclar = (e) => {
    const passo = 8;
    const mover = { ArrowLeft: [passo, 0], ArrowRight: [-passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] }[e.key];
    if (mover) {
      e.preventDefault();
      cx += mover[0];
      cy += mover[1];
      desenhar();
    } else if (e.key === '+' || e.key === '=') mudarZoom(zoom + 0.15);
    else if (e.key === '-') mudarZoom(zoom - 0.15);
  };
  const aoZoom = () => mudarZoom(Number(zoomBarra.value));

  tela.addEventListener('pointerdown', aoApertar);
  tela.addEventListener('pointermove', aoMover);
  tela.addEventListener('pointerup', aoSoltar);
  tela.addEventListener('pointercancel', aoSoltar);
  tela.addEventListener('keydown', aoTeclar);
  quadro.addEventListener('wheel', aoRolar, { passive: false });
  zoomBarra.addEventListener('input', aoZoom);

  /* ---- Foto final ---- */
  function gerar() {
    ajustar();
    const saida = document.createElement('canvas');
    saida.width = SAIDA;
    saida.height = SAIDA;
    const c = saida.getContext('2d');
    c.fillStyle = '#120709';
    c.fillRect(0, 0, SAIDA, SAIDA);
    const k = SAIDA / (2 * RAIO);
    const w = imagem.largura * escala();
    const h = imagem.altura * escala();
    c.imageSmoothingQuality = 'high';
    c.drawImage(imagem.fonte, (cx - w / 2 - (V / 2 - RAIO)) * k, (cy - h / 2 - (V / 2 - RAIO)) * k, w * k, h * k);
    let qualidade = 0.86;
    let texto = saida.toDataURL('image/jpeg', qualidade);
    while (texto.length > LIMITE_TEXTO && qualidade > 0.4) {
      qualidade -= 0.08;
      texto = saida.toDataURL('image/jpeg', qualidade);
    }
    return texto;
  }

  mudarZoom(1);
  dialogo.showModal();
  tela.focus({ preventScroll: true });

  return new Promise((resolver) => {
    let resultado = null;
    const aoSalvar = () => {
      resultado = gerar();
      dialogo.close();
    };
    const aoFechar = () => {
      tela.removeEventListener('pointerdown', aoApertar);
      tela.removeEventListener('pointermove', aoMover);
      tela.removeEventListener('pointerup', aoSoltar);
      tela.removeEventListener('pointercancel', aoSoltar);
      tela.removeEventListener('keydown', aoTeclar);
      quadro.removeEventListener('wheel', aoRolar);
      zoomBarra.removeEventListener('input', aoZoom);
      salvar.removeEventListener('click', aoSalvar);
      imagem.fonte.close?.();
      resolver(resultado);
    };
    salvar.addEventListener('click', aoSalvar);
    dialogo.addEventListener('close', aoFechar, { once: true });
  });
}
