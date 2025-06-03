// ... (variáveis globais e funções getColorForUser, getAvatarURL, sanitizeHTML continuam as mesmas) ...
let ws;
let username = "";
const userColors = {};

const pageBody = document.getElementById("pageBody");
const darkModeToggleButton = document.getElementById("darkModeToggle");
const usernameInput = document.getElementById("username");
const joinButton = document.getElementById("joinButton");
const nameInputWrapper = document.getElementById("nameInputWrapper");
const messageInputWrapper = document.getElementById("messageInputWrapper");
const chatDiv = document.getElementById("chat");
const usersDiv = document.getElementById("users");
const userListUl = document.getElementById("userList");
const msgInput = document.getElementById("msg");
const sendButton = document.getElementById("send");
const updatesPanel = document.getElementById("updatesPanel");
const toggleUpdatesButton = document.getElementById("toggleUpdates");
const typingIndicatorDiv = document.getElementById("typingIndicator");

let typingTimeout;
const TYPING_TIMER_LENGTH = 2000;
let currentlyTypingUsers = new Set();

function getColorForUser(name) {
  if (!userColors[name]) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    const hue = Math.abs(hash % 360);
    userColors[name] = `hsl(${hue}, 70%, 60%)`;
  }
  return userColors[name];
}

function getAvatarURL(name) {
  const encoded = encodeURIComponent(name.toLowerCase().trim());
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encoded}&size=24`;
}

function sanitizeHTML(str) {
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

function displayMessage(data) {
  const messageElement = document.createElement("div");
  const timestamp = new Date(data.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const scrollThreshold = 50;
  const isScrolledToBottom =
    chatDiv.scrollHeight - chatDiv.clientHeight <=
    chatDiv.scrollTop + scrollThreshold;

  const avatarImg = document.createElement("img");
  avatarImg.className = "avatar";

  const timeSpan = document.createElement("span");
  timeSpan.className = "timestamp";
  timeSpan.textContent = ` (${timestamp})`;

  if (data.type === "user_message" && data.sender && data.content) {
    avatarImg.src = getAvatarURL(data.sender);
    avatarImg.alt = data.sender;

    const senderStrong = document.createElement("strong");
    senderStrong.style.color = getColorForUser(data.sender);
    senderStrong.textContent = sanitizeHTML(data.sender) + ": ";

    const contentTextNode = document.createTextNode(sanitizeHTML(data.content));

    messageElement.appendChild(avatarImg);
    messageElement.appendChild(senderStrong);
    messageElement.appendChild(contentTextNode);
    messageElement.appendChild(timeSpan);
  } else if (data.type === "system_message" && data.text) {
    messageElement.textContent = sanitizeHTML(data.text);
    messageElement.classList.add("system-message");
    messageElement.appendChild(timeSpan); // Adiciona timestamp para mensagens do sistema também
  } else if (
    data.type === "private_message_received" &&
    data.sender &&
    data.content
  ) {
    // MENSAGEM PRIVADA RECEBIDA
    messageElement.classList.add("private-message");
    avatarImg.src = getAvatarURL(data.sender);
    avatarImg.alt = data.sender;

    const pmIndicator = document.createElement("span");
    pmIndicator.className = "pm-indicator";
    pmIndicator.textContent = `(Privado de ${sanitizeHTML(data.sender)}): `;
    pmIndicator.style.color = getColorForUser(data.sender);

    const contentTextNode = document.createTextNode(sanitizeHTML(data.content));

    messageElement.appendChild(avatarImg);
    messageElement.appendChild(pmIndicator);
    messageElement.appendChild(contentTextNode);
    messageElement.appendChild(timeSpan);
  } else if (
    data.type === "private_message_sent" &&
    data.recipient &&
    data.content
  ) {
    // MENSAGEM PRIVADA ENVIADA (CONFIRMAÇÃO)
    messageElement.classList.add("private-message");
    // Poderia usar o avatar do usuário atual, mas para simplificar, não vamos adicionar avatar aqui
    // avatarImg.src = getAvatarURL(username); // Se quisesse avatar do remetente (você)
    // avatarImg.alt = username;

    const pmIndicator = document.createElement("span");
    pmIndicator.className = "pm-indicator";
    pmIndicator.textContent = `(Privado para ${sanitizeHTML(
      data.recipient
    )}): `;
    pmIndicator.style.color = getColorForUser(data.recipient); // Cor do destinatário

    const contentTextNode = document.createTextNode(sanitizeHTML(data.content));

    // messageElement.appendChild(avatarImg); // Opcional
    messageElement.appendChild(pmIndicator);
    messageElement.appendChild(contentTextNode);
    messageElement.appendChild(timeSpan);
  } else if (data.type === "error" && data.text) {
    messageElement.textContent = `Erro: ${sanitizeHTML(data.text)}`;
    messageElement.style.color = "red";
    messageElement.style.fontWeight = "bold";
  } else {
    console.warn("Mensagem desconhecida recebida:", data);
    return;
  }

  chatDiv.appendChild(messageElement);
  if (isScrolledToBottom) {
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }
}

function sendPrivateMessage(recipientName) {
  if (recipientName === username) {
    alert("Você não pode enviar uma mensagem privada para si mesmo.");
    return;
  }
  const messageContent = prompt(
    `Digite sua mensagem privada para ${recipientName}:`
  );
  if (messageContent && messageContent.trim() !== "") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "private_message",
          recipient: recipientName,
          content: messageContent.trim(),
        })
      );
    } else {
      alert("Não conectado ao chat. Tente recarregar.");
    }
  } else if (messageContent !== null) {
    // Se não cancelou o prompt mas deixou em branco
    alert("A mensagem privada não pode estar vazia.");
  }
}

function updateUserListUI(users) {
  userListUl.innerHTML = "";
  users.forEach((name) => {
    const li = document.createElement("li");

    const avatarImg = document.createElement("img");
    avatarImg.src = getAvatarURL(name);
    avatarImg.alt = "avatar";
    avatarImg.style.width = "20px";
    avatarImg.style.height = "20px";
    avatarImg.style.borderRadius = "50%";
    avatarImg.style.marginRight = "8px";
    avatarImg.style.verticalAlign = "middle";

    li.appendChild(avatarImg);
    li.appendChild(document.createTextNode(sanitizeHTML(name)));
    li.style.color = getColorForUser(name);

    // Adiciona funcionalidade de clique para mensagem privada
    if (name !== username) {
      // Não permite enviar msg privada para si mesmo via clique
      li.style.cursor = "pointer";
      li.title = `Enviar mensagem privada para ${name}`;
      li.addEventListener("click", () => sendPrivateMessage(name));
    } else {
      li.appendChild(document.createTextNode(" (Você)"));
      li.style.fontWeight = "bold";
    }
    userListUl.appendChild(li);
  });
}

function updateTypingIndicatorUI() {
  // ... (função continua a mesma)
  if (currentlyTypingUsers.size === 0) {
    typingIndicatorDiv.textContent = "";
    typingIndicatorDiv.style.visibility = "hidden";
  } else {
    typingIndicatorDiv.style.visibility = "visible";
    const names = Array.from(currentlyTypingUsers);
    if (names.length === 1) {
      typingIndicatorDiv.textContent = `${sanitizeHTML(
        names[0]
      )} está digitando...`;
    } else if (names.length === 2) {
      typingIndicatorDiv.textContent = `${sanitizeHTML(
        names[0]
      )} e ${sanitizeHTML(names[1])} estão digitando...`;
    } else {
      typingIndicatorDiv.textContent = "Várias pessoas estão digitando...";
    }
  }
}

function handleUserTyping(name, isTyping) {
  // ... (função continua a mesma)
  if (name === username) return;

  if (isTyping) {
    currentlyTypingUsers.add(name);
  } else {
    currentlyTypingUsers.delete(name);
  }
  updateTypingIndicatorUI();
}

function connectWebSocket() {
  // ... (início da função continua o mesmo)
  username = usernameInput.value.trim();
  if (!username) {
    alert("Por favor, digite um nome de usuário.");
    return;
  }

  const existingError = chatDiv.querySelector(".temp-error");
  if (existingError) existingError.remove();

  ws = new WebSocket(`ws://${location.host}`);

  ws.onopen = () => {
    console.log("Conectado ao servidor WebSocket.");
    ws.send(JSON.stringify({ type: "join", name: username }));

    chatDiv.classList.remove("hidden");
    usersDiv.classList.remove("hidden");
    messageInputWrapper.style.display = "flex";
    msgInput.disabled = false;
    sendButton.disabled = false;

    nameInputWrapper.classList.add("hidden");
    usernameInput.disabled = true;
    joinButton.disabled = true;

    msgInput.focus();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (
        data.type === "user_message" ||
        data.type === "system_message" ||
        data.type === "error" ||
        data.type === "private_message_received" || // NOVO
        data.type === "private_message_sent"
      ) {
        // NOVO
        displayMessage(data);
      } else if (data.type === "userlist") {
        updateUserListUI(data.users);
        const currentOnlineUsers = new Set(data.users);
        currentlyTypingUsers.forEach((typingUser) => {
          if (!currentOnlineUsers.has(typingUser)) {
            currentlyTypingUsers.delete(typingUser);
          }
        });
        updateTypingIndicatorUI();
      } else if (data.type === "user_typing") {
        handleUserTyping(data.name, data.isTyping);
      } else if (
        data.type === "error" &&
        data.text.includes("nome já está em uso")
      ) {
        alert(data.text);
        ws.close();
        nameInputWrapper.classList.remove("hidden");
        usernameInput.disabled = false;
        joinButton.disabled = false;
        usernameInput.focus();
        usernameInput.select();
        chatDiv.classList.add("hidden");
        usersDiv.classList.add("hidden");
        messageInputWrapper.style.display = "none";
        msgInput.disabled = true;
        sendButton.disabled = true;
      }
    } catch (e) {
      console.error("Erro ao processar mensagem do servidor:", e, event.data);
    }
  };

  // ws.onerror e ws.onclose continuam os mesmos
  ws.onerror = (error) => {
    console.error("Erro no WebSocket:", error);
    const errorDiv = document.createElement("div");
    errorDiv.className = "temp-error";
    errorDiv.textContent =
      "Erro de conexão. O servidor pode estar indisponível. Tente recarregar.";
    errorDiv.style.color = "red";
    errorDiv.style.fontWeight = "bold";
    errorDiv.style.textAlign = "center";
    errorDiv.style.padding = "10px";
    if (chatDiv.firstChild) {
      chatDiv.insertBefore(errorDiv, chatDiv.firstChild);
    } else {
      chatDiv.appendChild(errorDiv);
    }
    chatDiv.classList.remove("hidden");

    msgInput.disabled = true;
    sendButton.disabled = true;
    nameInputWrapper.classList.remove("hidden");
    usernameInput.disabled = false;
    joinButton.disabled = false;
    usersDiv.classList.add("hidden");
    messageInputWrapper.style.display = "none";
    typingIndicatorDiv.style.visibility = "hidden";
  };

  ws.onclose = (event) => {
    console.log(
      "Desconectado do servidor WebSocket. Código:",
      event.code,
      "Motivo:",
      event.reason
    );
    if (!event.wasClean && username) {
      const infoDiv = document.createElement("div");
      infoDiv.textContent = "Desconectado do chat. Tente entrar novamente.";
      infoDiv.style.color = "orange";
      infoDiv.style.fontWeight = "bold";
      infoDiv.style.textAlign = "center";
      infoDiv.style.padding = "10px";
      if (chatDiv.firstChild) {
        chatDiv.insertBefore(infoDiv, chatDiv.firstChild);
      } else {
        chatDiv.appendChild(infoDiv);
      }
      chatDiv.classList.remove("hidden");
    }

    msgInput.disabled = true;
    sendButton.disabled = true;
    nameInputWrapper.classList.remove("hidden");
    usernameInput.disabled = false;
    joinButton.disabled = false;
    usersDiv.classList.add("hidden");
    userListUl.innerHTML = "<li>Desconectado</li>";
    messageInputWrapper.style.display = "none";
    username = "";
    currentlyTypingUsers.clear();
    updateTypingIndicatorUI();
    typingIndicatorDiv.style.visibility = "hidden";
  };
}

function handleUserInputChange() {
  // ... (função continua a mesma)
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  if (!typingTimeout) {
    ws.send(JSON.stringify({ type: "typing_start" }));
  } else {
    clearTimeout(typingTimeout);
  }

  typingTimeout = setTimeout(() => {
    ws.send(JSON.stringify({ type: "typing_stop" }));
    typingTimeout = null;
  }, TYPING_TIMER_LENGTH);
}

function sendMessage() {
  // ... (função continua a mesma)
  const messageText = msgInput.value.trim();
  if (messageText !== "" && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "message", text: messageText }));
    msgInput.value = "";
    msgInput.focus();

    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    ws.send(JSON.stringify({ type: "typing_stop" }));
  }
}

function toggleDarkMode() {
  // ... (função continua a mesma)
  pageBody.classList.toggle("dark-mode");
  const isDarkMode = pageBody.classList.contains("dark-mode");
  darkModeToggleButton.textContent = isDarkMode
    ? "☀️ Modo Claro"
    : "🌙 Modo Escuro";
  localStorage.setItem("theme", isDarkMode ? "dark" : "light");
}

// Event Listeners (continuam os mesmos)
joinButton.addEventListener("click", connectWebSocket);
usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    connectWebSocket();
  }
});

sendButton.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});
msgInput.addEventListener("input", handleUserInputChange);

darkModeToggleButton.addEventListener("click", toggleDarkMode);

toggleUpdatesButton.addEventListener("click", () => {
  updatesPanel.classList.toggle("open");
});

window.onload = () => {
  // ... (função continua a mesma)
  if (localStorage.getItem("theme") === "dark") {
    pageBody.classList.add("dark-mode");
    darkModeToggleButton.textContent = "☀️ Modo Claro";
  } else {
    pageBody.classList.remove("dark-mode");
    darkModeToggleButton.textContent = "🌙 Modo Escuro";
  }
  messageInputWrapper.style.display = "none";
  usernameInput.focus();
  typingIndicatorDiv.style.visibility = "hidden";
};
