// Conexão com o Firebase (contas, filtros salvos, salas e notas).
//
// No computador (localhost ou endereço da rede, como 192.168.x.x) o app usa os
// emuladores do Firebase, que rodam na sua máquina: nada vai para a internet e não
// precisa de conta. Veja "Testar em casa" no README.
//
// No link público vale o projeto "Nan Cine" do Firebase (plano gratuito). Estes dados não
// são segredo: toda página da web com Firebase os mostra. Quem protege o banco são as
// regras de segurança (firestore.rules). Enquanto estiver vazio, o site funciona como antes,
// só sem contas e salas.

export const FIREBASE = {
  apiKey: 'AIzaSyDrwbGbRdAYY7WYxPs2LojJH-c2beTFgC8',
  authDomain: 'nancine-0zs0t3.firebaseapp.com',
  projectId: 'nancine-0zs0t3',
  appId: '1:1054674623928:web:2abd03ecb4dfcbf4d2034d',
};

// Portas dos emuladores (iguais às de firebase.json).
export const EMULADORES = {
  auth: 8644,
  firestore: 8643,
};
