# Nan Cine

A roleta que escolhe o seu filme. Você ajusta os filtros no "ingresso" e gira a roleta misteriosa (as fatias mostram só "????"). Quando ela para, a cortina abre com um filme sorteado entre todos os que passam pelos filtros: título em português, título original, data, sinopse, nota do IMDb, cartaz, onde assistir no Brasil e trailer.

É um site estático (HTML, CSS e JavaScript puro), sem etapa de build e sem custo: roda em qualquer hospedagem gratuita.

O planejamento completo, as decisões e os próximos passos estão em [docs/PLANO.md](docs/PLANO.md).

## Rodar no seu computador

Dê dois cliques em `iniciar.bat`. Ele sobe um servidor local e abre `http://127.0.0.1:8642` no navegador.

Pelo terminal:

```bash
node servidor.mjs
```

Sem chave configurada, o app abre em **modo demonstração**, com 24 filmes de exemplo. Serve para ver a roleta, os sons e as animações.

## Ligar o catálogo ao vivo (grátis)

O catálogo vem do TMDB, que é gratuito para uso não comercial.

1. Crie uma conta em [themoviedb.org](https://www.themoviedb.org/signup).
2. Em [Configurações › API](https://www.themoviedb.org/settings/api), peça uma chave de uso pessoal.
3. No Nan Cine, clique em **Conectar chave** e cole a "Chave da API" (ou o "Token de leitura").

Assim a chave fica só no seu navegador. Para todo visitante já entrar com o catálogo ligado, a chave precisa ir na publicação (veja abaixo).

## Atualizar as notas do IMDb

As notas vêm do arquivo oficial que o IMDb publica todo dia. Para renovar a cópia local:

```bash
node ferramentas/atualizar-imdb.mjs
```

O script baixa o arquivo (cerca de 8 MB) e recria a pasta `dados/imdb/`. Na publicação pelo GitHub isso acontece sozinho, todo dia.

## Publicar com link público (GitHub Pages)

1. Crie um repositório no GitHub e envie esta pasta para a branch `main`.
2. No repositório: **Settings › Pages › Source: GitHub Actions**.
3. Em **Settings › Secrets and variables › Actions**, crie o segredo `TMDB_KEY` com a sua chave do TMDB. O segredo `OMDB_KEY` é opcional.
4. Abra a aba **Actions** e rode "Publicar Nan Cine" (ou faça um novo envio para a `main`).

O link fica no formato `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`. A partir daí, o fluxo em `.github/workflows/publicar.yml` republica a cada envio e uma vez por dia, já com as notas do IMDb renovadas.

Caminho alternativo, sem GitHub: preencha `TMDB_KEY` em `js/config.js` e arraste a pasta para o [Netlify Drop](https://app.netlify.com/drop). Nesse caso as notas do IMDb só mudam quando você rodar o script e publicar de novo.

**Sobre a chave:** num site estático, a chave do TMDB fica visível para quem inspecionar a página. Ela só lê dados públicos e é gratuita; o risco é alguém gastar a sua cota. Se isso acontecer, gere outra chave no TMDB. A proteção completa (um intermediário que esconde a chave) está no roteiro em `docs/PLANO.md`.

## Estrutura

```
index.html                  página única
css/styles.css              todo o visual e as animações
js/
  config.js                 chaves e ajustes (idioma, região, fatias, tamanho da amostra)
  main.js                   liga filtros, roleta, listas e configuração
  api.js                    TMDB, notas do IMDb, OMDb e modo demonstração
  wheel.js                  desenho e física da roleta
  reveal.js                 cortina e tela do filme sorteado
  audio.js                  sons sintetizados (Web Audio)
  fx.js                     confete
  storage.js                o que fica salvo no navegador
  demo-data.js              gêneros e os 24 filmes de exemplo
  util.js                   formatação de datas, notas e textos
dados/imdb/                 notas do IMDb em 256 fatias (gerado pelo script)
ferramentas/
  atualizar-imdb.mjs        baixa e prepara as notas do IMDb
  gravar-chaves.mjs         grava as chaves na hora de publicar
.github/workflows/publicar.yml   publicação automática e atualização diária
servidor.mjs, iniciar.bat   servidor local para testes
```

## Créditos e condições de uso

- Catálogo, capas e trailers: [TMDB](https://www.themoviedb.org/). Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
- Notas: informação cortesia do [IMDb](https://www.imdb.com), usada com permissão. Os arquivos do IMDb são liberados para **uso pessoal e não comercial**.
- Onde assistir: dados do JustWatch, entregues pelo TMDB.

Se o projeto virar comercial (anúncios, assinatura), as licenças do TMDB e do IMDb precisam ser revistas antes.
