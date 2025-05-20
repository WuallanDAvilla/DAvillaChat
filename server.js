const http = require('http'); // Importa o módulo HTTP para criar o servidor.
const fs = require('fs'); // Importa o módulo File System para manipular arquivos.
const path = require('path'); // Importa o módulo Path para manipular caminhos de arquivos.
const WebSocket = require('ws'); // Importa o módulo WebSocket para comunicação em tempo real.

const server = http.createServer((req, res) => { // Cria um servidor HTTP.
  let filePath = './public' + (req.url === '/' ? '/index.html' : req.url); // Define o caminho do arquivo solicitado.
  const extname = String(path.extname(filePath)).toLowerCase(); // Obtém a extensão do arquivo solicitado.
  const mimeTypes = { // Define os tipos MIME suportados.
    '.html': 'text/html',
    '.js': 'text/javascript',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream'; // Define o tipo de conteúdo com base na extensão.

  fs.readFile(filePath, (error, content) => { // Lê o arquivo solicitado.
    if (error) { // Se ocorrer um erro ao ler o arquivo...
      res.writeHead(404); // Retorna o código de status 404.
      res.end('Arquivo não encontrado'); // Envia uma mensagem de erro.
    } else { // Se o arquivo for encontrado...
      res.writeHead(200, { 'Content-Type': contentType }); // Retorna o código de status 200 e o tipo de conteúdo.
      res.end(content, 'utf-8'); // Envia o conteúdo do arquivo.
    }
  });
});

const wss = new WebSocket.Server({ server }); // Cria um servidor WebSocket associado ao servidor HTTP.
const clients = new Map(); // ws => nome // Mapeia os clientes conectados ao WebSocket e seus nomes.

function broadcast(data) { // Função para enviar mensagens a todos os clientes conectados.
  wss.clients.forEach((client) => { // Itera sobre todos os clientes conectados.
    if (client.readyState === WebSocket.OPEN) { // Verifica se o cliente está com a conexão aberta.
      client.send(JSON.stringify(data)); // Envia os dados em formato JSON.
    }
  });
}

function updateUserList() { // Função para atualizar a lista de usuários conectados.
  const userList = Array.from(clients.values()); // Obtém os nomes de todos os usuários conectados.
  broadcast({ type: 'userlist', users: userList }); // Envia a lista de usuários para todos os clientes.
}

wss.on('connection', (ws) => { // Evento disparado quando um cliente se conecta ao WebSocket.
  ws.on('message', (msg) => { // Evento disparado quando o servidor recebe uma mensagem de um cliente.
    const data = JSON.parse(msg); // Converte a mensagem recebida de JSON para objeto.

    if (data.type === 'join') { // Se o tipo da mensagem for "join" (entrada no chat)...
      clients.set(ws, data.name); // Adiciona o cliente e seu nome ao mapa de clientes.
      broadcast({ type: 'message', text: `🔵 ${data.name} entrou no chat.` }); // Notifica todos os clientes que o usuário entrou.
      updateUserList(); // Atualiza a lista de usuários conectados.
    }

    if (data.type === 'message') { // Se o tipo da mensagem for "message" (mensagem de chat)...
      const name = clients.get(ws); // Obtém o nome do cliente que enviou a mensagem.
      broadcast({ type: 'message', text: `${name}: ${data.text}` }); // Envia a mensagem para todos os clientes.
    }
  });

  ws.on('close', () => { // Evento disparado quando um cliente desconecta.
    const name = clients.get(ws); // Obtém o nome do cliente que desconectou.
    clients.delete(ws); // Remove o cliente do mapa de clientes.
    if (name) { // Se o cliente tinha um nome associado...
      broadcast({ type: 'message', text: `🔴 ${name} saiu do chat.` }); // Notifica todos os clientes que o usuário saiu.
      updateUserList(); // Atualiza a lista de usuários conectados.
    }
  });
});

server.listen(3000, '0.0.0.0', () => { // Inicia o servidor HTTP na porta 3000.
  console.log('Servidor rodando em http://localhost:3000'); // Exibe uma mensagem no console indicando que o servidor está rodando.
});


