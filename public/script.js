let ws; // Declara uma variável para armazenar a conexão WebSocket.
let username = ''; // Declara uma variável para armazenar o nome do usuário.
const userColors = {}; // Declara um objeto para armazenar as cores associadas a cada usuário.

function getColorForUser(name) { // Função para obter ou gerar uma cor para um usuário.
  if (!userColors[name]) { // Se o usuário ainda não tem uma cor associada...
    const hue = Math.floor(Math.random() * 360); // Gera um valor aleatório para o matiz (hue).
    userColors[name] = `hsl(${hue}, 70%, 50%)`; // Define uma cor HSL para o usuário.
  }
  return userColors[name]; // Retorna a cor associada ao usuário.
}

function getAvatarURL(name) { // Função para gerar a URL do avatar de um usuário.
  const encoded = encodeURIComponent(name.toLowerCase().trim()); // Codifica o nome do usuário para ser usado na URL.
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encoded}`; // Retorna a URL do avatar gerado.
}

function setName() { // Função para configurar o nome do usuário e inicializar o WebSocket.
  const nameInput = document.getElementById('username'); // Obtém o campo de entrada do nome do usuário.
  username = nameInput.value.trim(); // Armazena o valor do campo de entrada, removendo espaços extras.
  if (!username) { // Se o nome do usuário estiver vazio...
    alert('Digite um nome!'); // Exibe um alerta pedindo para digitar um nome.
    return; // Interrompe a execução da função.
  }

  ws = new WebSocket(`ws://${location.host}`); // Cria uma nova conexão WebSocket com o servidor.

  ws.onopen = () => { // Define o que acontece quando a conexão WebSocket é aberta.
    ws.send(JSON.stringify({ type: 'join', name: username })); // Envia uma mensagem ao servidor informando que o usuário entrou.
  };

  ws.onmessage = (event) => { // Define o que acontece quando uma mensagem é recebida pelo WebSocket.
    const data = JSON.parse(event.data); // Converte a mensagem recebida de JSON para um objeto JavaScript.

    if (data.type === 'message') { // Se a mensagem for do tipo "message"...
      const chat = document.getElementById('chat'); // Obtém o elemento do chat.
      const message = document.createElement('div'); // Cria um novo elemento <div> para a mensagem.

      const nameMatch = data.text.match(/^([^:]+):/); // Extrai o nome do remetente da mensagem.
      if (nameMatch) { // Se o nome do remetente foi encontrado...
        const name = nameMatch[1]; // Armazena o nome do remetente.
        const color = getColorForUser(name); // Obtém a cor associada ao remetente.
        const avatarURL = getAvatarURL(name); // Obtém a URL do avatar do remetente.

        message.innerHTML = `
          <img src="${avatarURL}" alt="avatar" style="width: 24px; height: 24px; vertical-align: middle; border-radius: 50%; margin-right: 6px;">
          <strong style="color: ${color};">${data.text}</strong> 
        `; // Define o conteúdo HTML da mensagem.
      } else { // Se o nome do remetente não foi encontrado...
        message.textContent = data.text; // Define o texto da mensagem diretamente.
      }

      chat.appendChild(message); // Adiciona a mensagem ao chat.
      chat.scrollTop = chat.scrollHeight; // Rola o chat para mostrar a nova mensagem.
    }

    if (data.type === 'userlist') { // Se a mensagem for do tipo "userlist"...
      const userList = document.getElementById('userList'); // Obtém o elemento da lista de usuários.
      userList.innerHTML = ''; // Limpa a lista de usuários.
      data.users.forEach((name) => { // Para cada usuário na lista recebida...
        const li = document.createElement('li'); // Cria um novo elemento <li> para o usuário.
        const avatar = document.createElement('img'); // Cria um elemento <img> para o avatar do usuário.
        avatar.src = getAvatarURL(name); // Define a URL do avatar.
        avatar.alt = 'avatar'; // Define o texto alternativo do avatar.
        avatar.style.width = '20px'; // Define a largura do avatar.
        avatar.style.height = '20px'; // Define a altura do avatar.
        avatar.style.borderRadius = '50%'; // Define o avatar como circular.
        avatar.style.marginRight = '6px'; // Adiciona um espaço à direita do avatar.
        avatar.style.verticalAlign = 'middle'; // Alinha o avatar verticalmente ao meio.

        li.appendChild(avatar); // Adiciona o avatar ao elemento <li>.
        li.appendChild(document.createTextNode(name)); // Adiciona o nome do usuário ao elemento <li>.
        li.style.color = getColorForUser(name); // Define a cor do texto do nome do usuário.
        userList.appendChild(li); // Adiciona o elemento <li> à lista de usuários.
      });
    }
  };

  document.getElementById('chat').style.display = 'block'; // Exibe o elemento do chat.
  document.getElementById('users').style.display = 'block'; // Exibe o elemento da lista de usuários.
  document.getElementById('msg').disabled = false; // Habilita o campo de entrada de mensagens.
  document.getElementById('send').disabled = false; // Habilita o botão de envio de mensagens.
  nameInput.disabled = true; // Desabilita o campo de entrada do nome do usuário.

  document.getElementById('send').onclick = () => { // Define o que acontece ao clicar no botão de envio.
    const msg = document.getElementById('msg'); // Obtém o campo de entrada de mensagens.
    if (msg.value.trim() !== '') { // Se o campo de entrada não estiver vazio...
      ws.send(JSON.stringify({ type: 'message', text: msg.value })); // Envia a mensagem ao servidor.
      msg.value = ''; // Limpa o campo de entrada.
    }
  };
}

function toggleDarkMode() { // Função para alternar entre os modos claro e escuro.
  const body = document.getElementById('pageBody'); // Obtém o elemento do corpo da página.
  body.classList.toggle('dark-mode'); // Alterna a classe "dark-mode" no corpo da página.

  const btn = document.querySelector('button[onclick="toggleDarkMode()"]'); // Obtém o botão de alternância.
  if (body.classList.contains('dark-mode')) { // Se o modo escuro estiver ativado...
    btn.textContent = '☀️ Modo Claro'; // Altera o texto do botão para "Modo Claro".
    localStorage.setItem('theme', 'dark'); // Salva o tema escuro no armazenamento local.
  } else { // Se o modo claro estiver ativado...
    btn.textContent = '🌙 Modo Escuro'; // Altera o texto do botão para "Modo Escuro".
    localStorage.setItem('theme', 'light'); // Salva o tema claro no armazenamento local.
  }
}

window.onload = () => { // Define o que acontece quando a página é carregada.
  if (localStorage.getItem('theme') === 'dark') { // Se o tema salvo for "dark"...
    document.getElementById('pageBody').classList.add('dark-mode'); // Ativa o modo escuro.
    document.querySelector('button[onclick="toggleDarkMode()"]').textContent = '☀️ Modo Claro'; // Altera o texto do botão para "Modo Claro".
  }
};

document.getElementById('msg').addEventListener('keydown', (event) => { // Adiciona um evento ao pressionar uma tecla no campo de entrada de mensagens.
  if (event.key === 'Enter') { // Se a tecla pressionada for "Enter"...
    document.getElementById('send').click(); // Simula um clique no botão de envio.
  }
});

// Painel de atualizações
document.getElementById('toggleUpdates').addEventListener('click', () => { // Adiciona um evento ao clicar no botão de alternância do painel de atualizações.
  const panel = document.getElementById('updatesPanel'); // Obtém o elemento do painel de atualizações.
  panel.classList.toggle('open'); // Alterna a classe "open" no painel de atualizações.
});

