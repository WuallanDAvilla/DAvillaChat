const MSG_TYPES = {
  JOIN: "join",
  USER_MESSAGE: "user_message",
  SYSTEM_MESSAGE: "system_message",
  PRIVATE_MESSAGE: "private_message",
  PRIVATE_MESSAGE_RECEIVED: "private_message_received",
  PRIVATE_MESSAGE_SENT: "private_message_sent",
  USER_TYPING: "user_typing",
  TYPING_START: "typing_start",
  TYPING_STOP: "typing_stop",
  USER_LIST: "userlist",
  ERROR: "error",
  MESSAGE: "message",
  CLEAR_CHAT_COMMAND: "clear_chat_command",
  CLEAR_CHAT_SELF: "clear_chat_self",
  HISTORY_MESSAGES: "history_messages",
};

let ws;
let username = "";
let userAvatarStyle = "thumbs";
let userAvatarSeed = "";

const userColors = {};
const originalTitle = document.title;
let unreadMessages = 0;
let isTabActive = true;
let currentOnlineUsers = [];

const pageBody = document.getElementById("pageBody");
const darkModeToggleButton = document.getElementById("darkModeToggle");
const logoutButton = document.getElementById("logoutButton");

const joinScreenDiv = document.getElementById("joinScreen");
const chatUiDiv = document.querySelector(".chat-ui");
const usernameInput = document.getElementById("username");
const avatarStyleSelect = document.getElementById("avatarStyleSelect");
const avatarSeedInput = document.getElementById("avatarSeed");
const avatarPreviewImg = document.getElementById("avatarPreview");
const joinButton = document.getElementById("joinButton");
let originalJoinButtonText = joinButton.textContent;

const messageInputWrapper = document.getElementById("messageInputWrapper");
const chatDiv = document.getElementById("chat");
const usersDiv = document.getElementById("users");
const userListUl = document.getElementById("userList");
const msgInput = document.getElementById("msg");
const sendButton = document.getElementById("send");
const updatesPanel = document.getElementById("updatesPanel");
const toggleUpdatesButton = document.getElementById("toggleUpdates");
const typingIndicatorDiv = document.getElementById("typingIndicator");
const errorDisplayDiv = document.getElementById("errorDisplay");
const messageErrorDisplayDiv = document.getElementById("messageErrorDisplay");
const newMessagesIndicator = document.getElementById("newMessagesIndicator");

let typingTimeout;
const TYPING_TIMER_LENGTH = 2000;
let currentlyTypingUsers = new Set();

// --- Utility Functions ---
function generateColorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
}

function getColorForUser(name) {
  if (!userColors[name]) {
    userColors[name] = generateColorForName(name);
  }
  return userColors[name];
}

function getAvatarURL(name, style = "thumbs", seed = "") {
  const effectiveSeed = (seed || name || "default").toLowerCase().trim();
  const encodedSeed = encodeURIComponent(effectiveSeed);
  const encodedStyle = encodeURIComponent(style.toLowerCase().trim());
  return `https://api.dicebear.com/7.x/${encodedStyle}/svg?seed=${encodedSeed}&size=24`;
}

function updateAvatarPreview() {
  const currentUsername = usernameInput.value.trim() || "preview";
  const currentStyle = avatarStyleSelect.value;
  const currentSeed = avatarSeedInput.value.trim();
  avatarPreviewImg.src = getAvatarURL(
    currentUsername,
    currentStyle,
    currentSeed
  );
}

function sanitizeHTML(str) {
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

function parseMarkdown(text) {
  let html = text;
  html = html.replace(/\*(.+?)\*/g, "<strong>$1</strong>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");
  html = html.replace(/~(.+?)~/g, "<del>$1</del>");
  return html;
}

function autolink(text) {
  const urlPattern =
    /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;
  return text.replace(urlPattern, (url) => {
    let fullUrl = url;
    if (
      !url.match(/^https?:\/\//i) &&
      !url.match(/^ftp:\/\//i) &&
      !url.match(/^file:\/\//i)
    ) {
      fullUrl = "http://" + url;
    }
    if (url.includes("<") || url.includes(">")) return url;
    return `<a href="${sanitizeHTML(
      fullUrl
    )}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function formatMessageContent(content) {
  let processedContent = sanitizeHTML(content);
  processedContent = parseMarkdown(processedContent);
  processedContent = autolink(processedContent);
  return processedContent;
}

function displayInlineError(
  message,
  targetDiv = errorDisplayDiv,
  duration = 5000
) {
  targetDiv.textContent = message;
  targetDiv.style.display = "block";
  setTimeout(() => {
    if (targetDiv.textContent === message) {
      targetDiv.textContent = "";
      targetDiv.style.display = "none";
    }
  }, duration);
}

function scrollToBottom() {
  chatDiv.scrollTop = chatDiv.scrollHeight;
  newMessagesIndicator.classList.add("hidden");
}

function resetToJoinScreen() {
  joinScreenDiv.classList.remove("hidden");
  chatUiDiv.classList.add("hidden");
  logoutButton.classList.add("hidden");

  usernameInput.disabled = false;
  avatarStyleSelect.disabled = false;
  avatarSeedInput.disabled = false;
  joinButton.disabled = false;
  joinButton.textContent = originalJoinButtonText;

  // Limpar campos da tela de join pode ser opcional, mas bom para novo login
  // usernameInput.value = "";
  // avatarSeedInput.value = "";
  // avatarStyleSelect.value = "thumbs"; // Reset para o padrão
  // updateAvatarPreview();

  usernameInput.focus();

  // Limpar estado do chat
  username = "";
  currentOnlineUsers = [];
  currentlyTypingUsers.clear();
  chatDiv.innerHTML = ""; // Limpa mensagens do chat
  userListUl.innerHTML = ""; // Limpa lista de usuários
  updateTypingIndicatorUI();
  typingIndicatorDiv.style.visibility = "hidden";
  newMessagesIndicator.classList.add("hidden");
  document.title = originalTitle;
  unreadMessages = 0;
  errorDisplayDiv.style.display = "none"; // Limpar erros antigos da tela de join
  messageErrorDisplayDiv.style.display = "none"; // Limpar erros de mensagem
}

// --- Message Rendering Logic ---
const messageRenderers = {
  [MSG_TYPES.USER_MESSAGE]: (data, messageElement) => {
    const avatarUrl = getAvatarURL(
      data.sender,
      data.avatarStyle,
      data.avatarSeed
    );
    const avatarImg = document.createElement("img");
    avatarImg.className = "avatar";
    avatarImg.src = avatarUrl;
    avatarImg.alt = data.sender;

    const senderStrong = document.createElement("strong");
    senderStrong.style.color = getColorForUser(data.sender);
    senderStrong.textContent = data.sender + ": ";

    messageElement.appendChild(avatarImg);
    messageElement.appendChild(senderStrong);
    messageElement.innerHTML += formatMessageContent(data.content);
  },
  [MSG_TYPES.SYSTEM_MESSAGE]: (data, messageElement) => {
    messageElement.innerHTML = formatMessageContent(data.text);
    messageElement.classList.add("system-message");
  },
  [MSG_TYPES.PRIVATE_MESSAGE_RECEIVED]: (data, messageElement) => {
    messageElement.classList.add("private-message");
    const avatarUrl = getAvatarURL(
      data.sender,
      data.avatarStyle,
      data.avatarSeed
    );
    const avatarImg = document.createElement("img");
    avatarImg.className = "avatar";
    avatarImg.src = avatarUrl;
    avatarImg.alt = data.sender;

    const pmIndicator = document.createElement("span");
    pmIndicator.className = "pm-indicator";
    pmIndicator.textContent = `🔒 (Privado de ${data.sender}): `;
    pmIndicator.style.color = getColorForUser(data.sender);

    messageElement.appendChild(avatarImg);
    messageElement.appendChild(pmIndicator);
    messageElement.innerHTML += formatMessageContent(data.content);
  },
  [MSG_TYPES.PRIVATE_MESSAGE_SENT]: (data, messageElement) => {
    messageElement.classList.add("private-message");
    const recipientAvatarUrl = getAvatarURL(
      data.recipient,
      data.recipientAvatarStyle,
      data.recipientAvatarSeed
    );
    const avatarImg = document.createElement("img");
    avatarImg.className = "avatar";
    avatarImg.src = recipientAvatarUrl;
    avatarImg.alt = data.recipient;
    avatarImg.style.opacity = "0.7";

    const pmIndicator = document.createElement("span");
    pmIndicator.className = "pm-indicator";
    pmIndicator.textContent = `🔒 (Privado para ${data.recipient}): `;
    pmIndicator.style.color = getColorForUser(data.recipient);

    messageElement.appendChild(avatarImg);
    messageElement.appendChild(pmIndicator);
    messageElement.innerHTML += formatMessageContent(data.content);
  },
};

function displayMessage(data, isHistorical = false) {
  const isNearBottom =
    chatDiv.scrollHeight - chatDiv.clientHeight <= chatDiv.scrollTop + 100;

  const messageElement = document.createElement("div");
  const timestamp = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const renderer = messageRenderers[data.type];
  if (renderer) {
    renderer(data, messageElement);
    if (timestamp) {
      const timeSpan = document.createElement("span");
      timeSpan.className = "timestamp";
      timeSpan.textContent = ` (${timestamp})`;
      messageElement.appendChild(timeSpan);
    }
  } else {
    console.warn(
      "Renderizador de mensagem não encontrado para o tipo:",
      data.type,
      data
    );
    return;
  }

  if (isHistorical) {
    messageElement.classList.add("historical-message");
  }
  chatDiv.appendChild(messageElement);

  if (!isHistorical) {
    if (isNearBottom) {
      scrollToBottom();
    } else {
      if (
        (!data.sender || data.sender !== username) &&
        data.type !== MSG_TYPES.SYSTEM_MESSAGE
      ) {
        newMessagesIndicator.classList.remove("hidden");
      }
    }

    if (
      !isTabActive &&
      (!data.sender || data.sender !== username) &&
      data.type !== MSG_TYPES.SYSTEM_MESSAGE
    ) {
      unreadMessages++;
      document.title = `(${unreadMessages}) ${originalTitle}`;
    }
  } else if (
    isHistorical &&
    chatDiv.childElementCount === (data.history ? data.history.length : 0) + 1
  ) {
    scrollToBottom();
  }
}

// --- UI Update Functions ---
function updateUserListUI(usersData) {
  userListUl.innerHTML = "";
  usersData.forEach((userData) => {
    const li = document.createElement("li");
    const avatarUrl = getAvatarURL(
      userData.name,
      userData.avatarStyle,
      userData.avatarSeed
    );

    const avatarImg = document.createElement("img");
    avatarImg.src = avatarUrl;
    avatarImg.alt = "avatar";
    li.appendChild(avatarImg);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = userData.name;
    nameSpan.style.color = getColorForUser(userData.name);
    li.appendChild(nameSpan);

    if (currentlyTypingUsers.has(userData.name) && userData.name !== username) {
      const typingSpan = document.createElement("span");
      typingSpan.className = "user-typing-indicator";
      typingSpan.textContent = " (digitando...)";
      li.appendChild(typingSpan);
    }

    if (userData.name !== username) {
      li.style.cursor = "pointer";
      li.title = `Enviar mensagem privada para ${userData.name}`;
      li.addEventListener("click", () =>
        sendPrivateMessagePrompt(userData.name)
      );
    } else {
      const youSpan = document.createElement("span");
      youSpan.textContent = " (Você)";
      youSpan.style.fontWeight = "bold";
      li.appendChild(youSpan);
    }
    userListUl.appendChild(li);
  });
}

function updateTypingIndicatorUI() {
  if (currentlyTypingUsers.size === 0) {
    typingIndicatorDiv.textContent = "";
    typingIndicatorDiv.style.visibility = "hidden";
  } else {
    typingIndicatorDiv.style.visibility = "visible";
    const names = Array.from(currentlyTypingUsers).filter(
      (name) => name !== username
    );
    if (names.length === 1) {
      typingIndicatorDiv.textContent = `${names[0]} está digitando...`;
    } else if (names.length === 2) {
      typingIndicatorDiv.textContent = `${names[0]} e ${names[1]} estão digitando...`;
    } else if (names.length > 2) {
      typingIndicatorDiv.textContent = "Várias pessoas estão digitando...";
    } else {
      typingIndicatorDiv.textContent = "";
      typingIndicatorDiv.style.visibility = "hidden";
    }
  }
}

function handleUserTyping(name, isTyping) {
  if (name === username && isTyping) return;

  const oldSize = currentlyTypingUsers.size;
  if (isTyping) {
    currentlyTypingUsers.add(name);
  } else {
    currentlyTypingUsers.delete(name);
  }

  if (
    oldSize !== currentlyTypingUsers.size ||
    (isTyping && oldSize === 0) ||
    (!isTyping && currentlyTypingUsers.size === 0)
  ) {
    updateTypingIndicatorUI();
    if (
      ws &&
      ws.readyState === WebSocket.OPEN &&
      currentOnlineUsers.length > 0
    ) {
      updateUserListUI(currentOnlineUsers);
    }
  }
}

// --- WebSocket Logic ---
function connectWebSocket() {
  username = usernameInput.value.trim();
  userAvatarStyle = avatarStyleSelect.value;
  userAvatarSeed = avatarSeedInput.value.trim();

  if (!username) {
    displayInlineError("Por favor, digite um nome de usuário.");
    return;
  }
  if (username.length > 25) {
    displayInlineError("Nome de usuário muito longo (máx 25 caracteres).");
    return;
  }

  errorDisplayDiv.style.display = "none";
  joinButton.textContent = "Conectando...";
  joinButton.disabled = true;
  usernameInput.disabled = true;
  avatarStyleSelect.disabled = true;
  avatarSeedInput.disabled = true;

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${wsProtocol}//${location.host}`);

  ws.onopen = () => {
    console.log("Conectado ao servidor WebSocket.");
    ws.send(
      JSON.stringify({
        type: MSG_TYPES.JOIN,
        name: username,
        avatarStyle: userAvatarStyle,
        avatarSeed: userAvatarSeed,
      })
    );

    joinScreenDiv.classList.add("hidden");
    chatUiDiv.classList.remove("hidden");
    logoutButton.classList.remove("hidden");

    msgInput.disabled = false;
    sendButton.disabled = false;
    msgInput.focus();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (
        data.type === MSG_TYPES.USER_MESSAGE ||
        data.type === MSG_TYPES.SYSTEM_MESSAGE ||
        data.type === MSG_TYPES.PRIVATE_MESSAGE_RECEIVED ||
        data.type === MSG_TYPES.PRIVATE_MESSAGE_SENT
      ) {
        displayMessage(data);
      } else if (data.type === MSG_TYPES.HISTORY_MESSAGES) {
        if (data.history && Array.isArray(data.history)) {
          chatDiv.innerHTML = "";
          if (data.history.length > 0) {
            displayMessage(
              {
                type: MSG_TYPES.SYSTEM_MESSAGE,
                text: "Carregando histórico...",
                timestamp: null,
              },
              true
            );
            data.history.forEach((msgData) => displayMessage(msgData, true));
            if (
              chatDiv.firstChild &&
              chatDiv.firstChild.textContent.includes("Carregando histórico...")
            ) {
              chatDiv.removeChild(chatDiv.firstChild);
            }
          } else {
            displayMessage(
              {
                type: MSG_TYPES.SYSTEM_MESSAGE,
                text: "Nenhuma mensagem anterior no chat.",
                timestamp: null,
              },
              true
            );
          }
          scrollToBottom();
        }
      } else if (data.type === MSG_TYPES.USER_LIST) {
        currentOnlineUsers = data.users;
        const onlineUserSet = new Set(currentOnlineUsers.map((u) => u.name));

        for (const nameKey in userColors) {
          if (
            Object.prototype.hasOwnProperty.call(userColors, nameKey) &&
            !onlineUserSet.has(nameKey)
          ) {
            delete userColors[nameKey];
          }
        }

        currentlyTypingUsers.forEach((typingUser) => {
          if (!onlineUserSet.has(typingUser)) {
            currentlyTypingUsers.delete(typingUser);
          }
        });

        updateUserListUI(currentOnlineUsers);
        updateTypingIndicatorUI();
      } else if (data.type === MSG_TYPES.USER_TYPING) {
        handleUserTyping(data.name, data.isTyping);
      } else if (data.type === MSG_TYPES.ERROR) {
        const errorText = data.text;

        if (
          errorText.includes("Nome já em uso") ||
          errorText.includes("Nome inválido")
        ) {
          if (
            ws &&
            ws.readyState !== WebSocket.CLOSING &&
            ws.readyState !== WebSocket.CLOSED
          ) {
            ws.close(1000, "Client acknowledging invalid name error."); // Fecha com código genérico, o resetToJoinScreen cuida da UI
          } else {
            // Se o ws já estiver fechado, força o reset da UI
            resetToJoinScreen();
          }
          displayInlineError(errorText);
        } else if (
          errorText.includes("muito longa") ||
          errorText.includes("Rate limit") ||
          errorText.includes("inválido") ||
          errorText.includes("offline") ||
          errorText.includes("Entre no chat primeiro") ||
          errorText.includes("para si mesmo")
        ) {
          displayInlineError(errorText, messageErrorDisplayDiv);
        } else {
          // Erros que não resetam para join, mas ainda são importantes
          displayInlineError(
            errorText,
            errorDisplayDiv.style.display !== "none"
              ? errorDisplayDiv
              : messageErrorDisplayDiv
          );
        }
      } else if (data.type === MSG_TYPES.CLEAR_CHAT_SELF) {
        chatDiv.innerHTML = "";
        const systemClearMsg = {
          type: MSG_TYPES.SYSTEM_MESSAGE,
          text: "Seu chat local foi limpo.",
          timestamp: new Date().toISOString(),
        };
        displayMessage(systemClearMsg, true);
      } else {
        console.warn(
          "Tipo de mensagem desconhecida recebida do servidor:",
          data
        );
      }
    } catch (e) {
      console.error("Erro ao processar mensagem do servidor:", e, event.data);
      displayInlineError("Erro ao processar dados do servidor.");
    }
  };

  ws.onerror = (error) => {
    console.error("Erro no WebSocket:", error);
    displayInlineError(
      "Erro de conexão. O servidor pode estar indisponível. Tente recarregar."
    );
    resetToJoinScreen();
  };

  ws.onclose = (event) => {
    console.log(
      "Desconectado do servidor WebSocket. Código:",
      event.code,
      "Motivo:",
      event.reason
    );
    const reasonStr = event.reason ? event.reason.toString() : "";
    // Não mostrar "Desconectado" se for por erro de nome ou logout explícito
    if (
      username &&
      !reasonStr.includes("Nome em uso") &&
      !reasonStr.includes("Nome inválido") &&
      reasonStr !== "Client requested logout"
    ) {
      displayInlineError("Desconectado do chat. Tente entrar novamente.");
    }
    resetToJoinScreen();
  };
}

// --- Action Functions ---
function sendPrivateMessageToServer(recipientName, content) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    displayInlineError("Não conectado ao chat.", messageErrorDisplayDiv);
    return false;
  }
  if (recipientName === username) {
    displayInlineError(
      "Você não pode enviar uma mensagem privada para si mesmo.",
      messageErrorDisplayDiv
    );
    return false;
  }
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    displayInlineError(
      "A mensagem privada não pode estar vazia.",
      messageErrorDisplayDiv
    );
    return false;
  }
  if (trimmedContent.length > 500) {
    displayInlineError(
      "Mensagem privada muito longa (máx 500 caracteres).",
      messageErrorDisplayDiv
    );
    return false;
  }

  ws.send(
    JSON.stringify({
      type: MSG_TYPES.PRIVATE_MESSAGE,
      recipient: recipientName,
      content: trimmedContent,
    })
  );
  return true;
}

function sendPrivateMessagePrompt(recipientName) {
  const messageContent = prompt(
    `Digite sua mensagem privada para ${recipientName}:`
  );
  if (messageContent === null) return;
  sendPrivateMessageToServer(recipientName, messageContent);
}

function handleUserInputChange() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  if (!typingTimeout) {
    ws.send(JSON.stringify({ type: MSG_TYPES.TYPING_START }));
  }
  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: MSG_TYPES.TYPING_STOP }));
    }
    typingTimeout = null;
  }, TYPING_TIMER_LENGTH);
}

function sendMessage() {
  const fullMessageText = msgInput.value;
  const trimmedMessageText = fullMessageText.trim();

  if (trimmedMessageText === "") return;

  if (trimmedMessageText.toLowerCase() === "/clear") {
    if (confirm("Tem certeza que deseja limpar seu histórico de chat local?")) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: MSG_TYPES.CLEAR_CHAT_COMMAND }));
        msgInput.value = "";
        msgInput.focus();
      } else {
        displayInlineError(
          "Não conectado ao chat para limpar.",
          messageErrorDisplayDiv
        );
      }
    } else {
      msgInput.focus();
    }
    return;
  }

  const pmMatch = trimmedMessageText.match(/^\/(pm|w)\s+([\w\d_.-]+)\s+(.+)$/i);
  if (pmMatch) {
    const recipient = pmMatch[2];
    const privateContent = pmMatch[3];
    if (sendPrivateMessageToServer(recipient, privateContent)) {
      msgInput.value = "";
      msgInput.focus();
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
        ws.send(JSON.stringify({ type: MSG_TYPES.TYPING_STOP }));
      }
    }
    return;
  }

  if (trimmedMessageText.length > 500) {
    displayInlineError(
      "Sua mensagem é muito longa (máx 500 caracteres).",
      messageErrorDisplayDiv
    );
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({ type: MSG_TYPES.MESSAGE, text: trimmedMessageText })
    );
    msgInput.value = "";
    msgInput.focus();
    messageErrorDisplayDiv.style.display = "none";

    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
      ws.send(JSON.stringify({ type: MSG_TYPES.TYPING_STOP }));
    }
  } else {
    displayInlineError(
      "Não conectado ao chat. Tente reconectar.",
      messageErrorDisplayDiv
    );
  }
}

function handleLogout() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close(1000, "Client requested logout"); // Código 1000 é fechamento normal
  } else {
    // Se não houver conexão WS, apenas reseta a UI
    resetToJoinScreen();
  }
}

function toggleDarkMode() {
  pageBody.classList.toggle("dark-mode");
  const isDarkMode = pageBody.classList.contains("dark-mode");
  darkModeToggleButton.textContent = isDarkMode
    ? "☀️ Modo Claro"
    : "🌙 Modo Escuro";
  localStorage.setItem("theme", isDarkMode ? "dark" : "light");
}

// --- Event Listeners ---
joinButton.addEventListener("click", connectWebSocket);
usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connectWebSocket();
});
avatarStyleSelect.addEventListener("change", updateAvatarPreview);
usernameInput.addEventListener("input", updateAvatarPreview);
avatarSeedInput.addEventListener("input", updateAvatarPreview);
logoutButton.addEventListener("click", handleLogout);

sendButton.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendMessage();
});
msgInput.addEventListener("input", handleUserInputChange);

darkModeToggleButton.addEventListener("click", toggleDarkMode);
toggleUpdatesButton.addEventListener("click", () => {
  updatesPanel.classList.toggle("open");
});

newMessagesIndicator.addEventListener("click", scrollToBottom);

chatDiv.addEventListener("scroll", () => {
  if (chatDiv.scrollHeight - chatDiv.clientHeight <= chatDiv.scrollTop + 10) {
    newMessagesIndicator.classList.add("hidden");
  }
});

window.addEventListener("focus", () => {
  isTabActive = true;
  if (unreadMessages > 0) {
    document.title = originalTitle;
    unreadMessages = 0;
  }
});
window.addEventListener("blur", () => {
  isTabActive = false;
});

window.onload = () => {
  if (localStorage.getItem("theme") === "dark") {
    pageBody.classList.add("dark-mode");
    darkModeToggleButton.textContent = "☀️ Modo Claro";
  } else {
    pageBody.classList.remove("dark-mode");
    darkModeToggleButton.textContent = "🌙 Modo Escuro";
  }
  chatUiDiv.classList.add("hidden");
  joinScreenDiv.classList.remove("hidden");
  logoutButton.classList.add("hidden");

  usernameInput.focus();
  updateAvatarPreview();
  originalJoinButtonText = joinButton.textContent;
};
