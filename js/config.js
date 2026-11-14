// Configuração do Nan Cine.
// Para publicar com link público, preencha TMDB_KEY (ou TMDB_PROXY) aqui.
// Sem nada preenchido, o app abre em modo demonstração e cada visitante
// pode colar a própria chave pelo botão "Configurar".

export const CONFIG = {
  // Chave v3 ("Chave da API") ou token v4 ("Token de leitura") do TMDB.
  // Crie grátis em https://www.themoviedb.org/settings/api
  TMDB_KEY: '',

  // Opcional: endereço de um proxy que esconde a chave (ex.: '/api/tmdb').
  // Veja functions/api/tmdb/[[caminho]].js e o README.
  TMDB_PROXY: '',

  // Opcional: chave do OMDb para mostrar também a nota do IMDb.
  // Crie grátis em https://www.omdbapi.com/apikey.aspx
  OMDB_KEY: '',

  IDIOMA: 'pt-BR',
  REGIAO: 'BR',

  // Quantas fatias a roleta tem. É só visual: as fatias mostram "????".
  FATIAS: 12,

  // A cada rodada o app tira esta quantidade de filmes, ao acaso, de todo o
  // catálogo que passa pelos filtros, e o sorteado sai deles. Depois de cada
  // giro a amostra é refeita, então o sorteio nunca fica preso a uma lista fixa.
  AMOSTRA: 12,
};
