// Conexão com o Firebase (contas, filtros salvos, salas e notas).
//
// No computador (localhost ou endereço da rede, como 192.168.x.x) o app usa os
// emuladores do Firebase, que rodam na sua máquina: nada vai para a internet e não
// precisa de conta. Veja "Testar em casa" no README.
//
// Para o link público, crie um projeto gratuito em https://console.firebase.google.com
// (plano Spark), ative "Authentication > Google" e o "Firestore", e cole aqui os
// dados do app da Web. Enquanto estiver vazio, o site público funciona como antes,
// só sem contas e salas.

export const FIREBASE = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};

// Portas dos emuladores (iguais às de firebase.json).
export const EMULADORES = {
  auth: 8644,
  firestore: 8643,
};
