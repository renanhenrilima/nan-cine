# Nan Cine: plano do projeto

Situação em 14 de novembro de 2026: o app está no ar em https://renanhenrilima.github.io/nan-cine/ (repositório: https://github.com/renanhenrilima/nan-cine), com o catálogo ao vivo do TMDB ligado e testado. A chave do TMDB está cadastrada como segredo `TMDB_KEY` do repositório. A publicação roda a cada envio para a `main` e todo dia, quando renova as notas do IMDb.

Medição no TMDB real: sem filtro nenhum o catálogo tem **18.313 filmes**. O TMDB entrega no máximo 500 páginas (10 mil filmes) por ordenação, então o sorteio alterna entre nove ordenações, incluindo as invertidas, para alcançar o catálogo inteiro.

## 1. O que é

Uma página única em português. O visitante marca os filtros (ou não marca nenhum), gira a roleta e recebe um filme. A roleta é misteriosa: as fatias mostram só "????" e nenhum filme aparece antes da hora. Ao parar, a cortina abre e revela o escolhido, sorteado entre todos os filmes que passam pelos filtros.

O resultado traz: título em português, título original e idioma de origem, data de estreia, duração, classificação indicativa, gêneros, nota do IMDb, sinopse, direção, elenco, sinais de versão em português, onde assistir no Brasil, cartaz e trailer.

## 2. De onde vêm os dados

| O que | Fonte | Custo | Observação |
|---|---|---|---|
| Catálogo, títulos em português e original, sinopse, cartaz, trailer | TMDB | Grátis | Atualizado continuamente; exige uma chave gratuita |
| Nota de referência e filtro de nota mínima | IMDb (arquivo oficial diário) | Grátis | Uso pessoal e não comercial |
| Nota do IMDb de reserva | OMDb | Grátis até 1.000 consultas por dia | Opcional; só entra se o filme faltar no arquivo |
| Onde assistir no Brasil | JustWatch, via TMDB | Grátis | |
| Notas do AdoroCinema | Link para a busca do site | Grátis | Ver seção 3 |

### Por que não "a API do IMDb"

O IMDb não tem API gratuita; a oficial é paga. O que ele oferece de graça é um arquivo com as notas de todos os títulos, atualizado todo dia. O script `ferramentas/atualizar-imdb.mjs` baixa esse arquivo, guarda os títulos com 100 votos ou mais (436 mil na última execução) e reparte em 256 arquivos pequenos.

Com isso a nota exibida é a do IMDb e o filtro "Nota mínima" confere a nota do IMDb filme a filme. Como o TMDB só sabe filtrar pela própria nota, o app pede ao TMDB um ponto a menos e descarta depois quem ficou abaixo no IMDb. Por isso a contagem "cerca de N filmes combinam" é aproximada quando há nota mínima. O app baixa só os pedaços do arquivo que contêm os filmes da amostra de cada rodada.

O arquivo do IMDb não tem títulos em português, sinopse, cartaz nem trailer. Por isso o catálogo vem do TMDB, e os dois se ligam pelo código do filme no IMDb (o `tt...`), que o TMDB informa.

## 3. Limites que você precisa conhecer

**AdoroCinema.** O site não tem API pública, e copiar as notas automaticamente fere os termos de uso dele. A versão atual abre a busca do filme no AdoroCinema, onde aparecem as notas de imprensa e de usuários. Mostrar essas notas dentro do Nan Cine exigiria um acordo com o site.

**Dublado ou legendado.** Nenhuma fonte gratuita registra, filme a filme, se existe dublagem ou legenda em português. O filtro "Em português" usa pistas:

| Opção | O que o app exige | Confiabilidade |
|---|---|---|
| Legendado | Filme disponível em algum serviço no Brasil | Alta para legenda |
| Dublado | Filme lançado nos cinemas do Brasil (a maioria tem sessão dublada) | Média: é uma pista, não uma confirmação. A tela avisa e recomenda "Tanto faz" para ver mais resultados |

Medido no TMDB real: cerca de 80% dos filmes populares têm lançamento nos cinemas do Brasil. Já os trailers em português cadastrados no TMDB são, na prática, todos de Portugal (nenhum com região Brasil em 100 filmes), por isso o trailer deixou de ser pista de dublagem. O áudio original em português saiu do filtro, a pedido.

A tela do resultado tem a linha "Em português", que diz qual sinal foi encontrado.

**Trailer.** O app prefere, nesta ordem: trailer em português do Brasil, trailer em português, trailer original. Quando só há o original, as legendas em português são ligadas no player, se o YouTube tiver.

**Chave à mostra.** Em site estático, a chave do TMDB fica visível para quem inspecionar a página (ver roteiro, item 1).

**Uso não comercial.** TMDB e IMDb liberam os dados de graça só para uso não comercial. Anúncios ou cobrança mudam isso.

## 4. Arquitetura

Site estático, sem servidor próprio e sem banco de dados.

```
Navegador do visitante
 ├─ index.html + css + js      (hospedagem gratuita)
 ├─ dados/imdb/*.txt           (notas do IMDb, mesma hospedagem)
 ├─ api.themoviedb.org         (catálogo ao vivo)
 ├─ image.tmdb.org             (capas e fundos)
 ├─ youtube-nocookie.com       (trailer, só quando o visitante clica)
 └─ localStorage               (filtros, "Quero ver", "Já vi", som)

GitHub Actions, uma vez por dia
 └─ baixa as notas do IMDb → grava as chaves → publica no GitHub Pages
```

Escolhas e motivos:

- **JavaScript puro, sem framework e sem build.** A página é uma só; publicar é copiar arquivos.
- **Roleta em canvas, girada por `transform`.** As fatias são desenhadas uma vez e o navegador só gira a imagem, o que mantém a animação lisa no celular.
- **Roleta separada do sorteio.** A roleta é espetáculo; a fatia em que ela para não decide nada. O filme sai de uma amostra tirada ao acaso de todo o catálogo filtrado, refeita a cada giro (ver seção 5).
- **Sons sintetizados na hora.** Nenhum arquivo de áudio para baixar ou licenciar.
- **Sorteado definido na largada.** Enquanto a roleta gira, o app já busca os detalhes do filme; quando ela para, a revelação está pronta.

## 5. Filtros

| Filtro | Opções | Como é aplicado |
|---|---|---|
| Gênero | 18 gêneros; um toque inclui, dois excluem; "pelo menos um" ou "todos" | `with_genres`, `without_genres` |
| Época | Em cartaz, último ano, décadas, até 1979, anos à escolha | `primary_release_date` |
| Nota mínima no IMDb | 0 a 9, de meio em meio ponto | Pré-filtro no TMDB e conferência no IMDb |
| Em português | Tanto faz, legendado, dublado | Ver seção 3 |
| Duração | Até 1h30, de 1h30 a 2h, mais de 2h | `with_runtime` |
| Tipo de achado | Melhor avaliação dos usuários, dos críticos, joias escondidas, vencedores de prêmios | Nota alta do IMDb com muitos votos; piso e teto de votos; lista de premiados (abaixo) |
| Onde assistir | Serviços de streaming do Brasil | `with_watch_providers` |
| Classificação até | Livre a 18 anos | `certification.lte` (Brasil) |
| Mínimo de avaliações | Sem mínimo, 1 mil (padrão), 10 mil, 50 mil, 100 mil | Conferido filme a filme nos votos do IMDb |

**Notas dos críticos e prêmios do filme (OMDb).** O OMDb libera 1.000 consultas por dia na chave gratuita, o que não sustenta uma consulta por giro. Por isso o script `ferramentas/atualizar-criticos.mjs` roda no GitHub, junta até 900 filmes por dia (os de mais votos no IMDb primeiro) e grava os arquivos em `dados/criticos`. O site só lê esses arquivos: ninguém gasta a cota, e a chave `OMDB_KEY` fica guardada só no GitHub, fora do site. Alimenta o filtro "Melhor avaliação dos críticos" (média do Metacritic e do Rotten Tomatoes de 75 ou mais) e as linhas "Críticos" e "Prêmios" do resultado. A cobertura cresce a cada dia (hoje: 800 filmes consultados). O conteúdo do OMDb é CC BY-NC 4.0 (uso não comercial, com crédito no rodapé).

**Vencedores de prêmios.** O Wikidata (base livre da Wikipédia) diz quais filmes ganharam Oscar, Globo de Ouro, BAFTA, Palma de Ouro, Urso de Ouro e Leão de Ouro. O script `ferramentas/atualizar-premios.mjs` junta isso ao TMDB e grava `dados/premios.json` (cerca de 1.480 filmes), renovado todo dia. O sorteio sai dessa lista e aplica os demais filtros. A cobertura do Wikidata varia: o Oscar está bem completo (1.129 filmes, incluindo curtas e prêmios honorários); Globo de Ouro e BAFTA só trazem os prêmios dados ao filme em si (170 e 167). Os Grammys não entram: premiam música, não filmes. 

Sem filtro nenhum, o sorteio vale para o catálogo inteiro (com um piso de 150 votos no TMDB, para não cair em filmes sem informação). "Sortear filtros" escolhe uma combinação ao acaso. Os filtros ficam salvos no navegador.

Como o sorteio funciona: o app pergunta ao TMDB quantas páginas de filmes existem para os filtros e sorteia três delas, em qualquer ponto do catálogo. Junta os filmes, tira os marcados como "Já vi", confere as notas do IMDb e guarda uma amostra de até 12, que fica escondida. Ao girar, o filme sai dessa amostra. Depois de cada giro a amostra é refeita com outras páginas, então o sorteio alcança o catálogo filtrado inteiro e não uma lista fixa. O tamanho da amostra é o ajuste `AMOSTRA` em `js/config.js`.

## 6. Experiência

- **Página:** sala de cinema antiga. Veludo vinho, letreiro de marquise, lâmpadas ao redor da roleta, feixe de projetor. Os filtros ficam num ingresso de papel.
- **Roleta:** doze fatias com "????", sem nome nem capa de filme. Recua antes de disparar, gira de 6 a 8 voltas e desacelera. A palheta bate em cada fatia, com um estalo que fica mais grave conforme a roda perde velocidade. As lâmpadas correm em sequência e piscam juntas na vitória.
- **Revelação:** fanfarra, a cortina fecha sobre a página e abre no filme. O cartaz vira, o título cai letra a letra, o anel da nota se preenche e cai confete.
- **Resultado:** "Girar de novo", "Quero ver" (guarda na lista), "Já vi" (tira o filme dos próximos sorteios), links para IMDb, AdoroCinema e YouTube, e "Copiar link do filme" para compartilhar.
- **Acessibilidade:** funciona por teclado (barra de espaço gira, Esc fecha), tem foco visível e respeita a preferência de movimento reduzido do aparelho. O som pode ser desligado.

## 7. O que foi testado

Testado no navegador (Chrome), em tela grande e em largura de celular (390 px):

- modo demonstração completo: giro, sons, cortina, confete, resultado, filtros, lista, "Girar de novo";
- notas do IMDb reais: os 24 filmes de exemplo foram localizados no arquivo oficial;
- trailer do YouTube tocando dentro da página;
- mensagem de chave recusada, com uma chave inválida enviada ao TMDB de verdade.

Testado com um TMDB simulado (31 verificações automáticas): montagem de todos os filtros, conferência da nota do IMDb, escolha do trailer em português, sinais de dublagem, onde assistir, sinopse de reserva em inglês.

Testado com o TMDB real (chave ligada, local e no link público): contagem sem filtro, giro completo com título em português e original, nota do IMDb, onde assistir e trailer, e filtros de nota do IMDb (7 a 9), gêneros (incluir, excluir, todos), época, idioma, classificação, duração, streaming e trailer em português. Notas do IMDb acima de 8,5 deixam poucos filmes (8,5+ rendeu 4 de 12; 9+ rendeu nenhum), e o app avisa quando nada passa pelo filtro.

## 8. Custos

Zero. TMDB, arquivo do IMDb, OMDb (até 1.000 consultas por dia), GitHub Pages e GitHub Actions são gratuitos para este uso. Domínio próprio é opcional e é o único item que custaria algo.

## 9. Próximos passos

Para colocar no ar:

1. Criar a chave do TMDB e testar em casa pelo botão "Conectar chave".
2. Criar o repositório no GitHub, cadastrar o segredo `TMDB_KEY` e publicar (passo a passo no README).

Roteiro de evolução, em ordem de valor:

1. **Esconder a chave.** Um intermediário gratuito (Cloudflare Workers) recebe os pedidos e acrescenta a chave. O app já aceita isso pelo campo `TMDB_PROXY` em `js/config.js`.
2. **Instalar como aplicativo.** Manifesto e ícone para adicionar à tela inicial do celular.
3. **Séries.** Um interruptor "Filmes / Séries"; o TMDB e o arquivo do IMDb já cobrem séries.
4. **Mais notas.** Com a chave do OMDb, exibir também Rotten Tomatoes e Metacritic.
5. **Roleta em grupo.** Um link para amigos montarem o ingresso juntos e girarem a mesma roleta.
6. **AdoroCinema.** Procurar o site para uma parceria que permita exibir as notas.
