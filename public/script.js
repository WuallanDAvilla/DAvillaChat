const MSG_TYPES = {
  JOIN: "join",
  USER_MESSAGE: "user_message", // Servidor envia este tipo com dados completos
  SYSTEM_MESSAGE: "system_message",
  PRIVATE_MESSAGE: "private_message", // Cliente envia tipo para mandar PM
  PRIVATE_MESSAGE_RECEIVED: "private_message_received", // Servidor envia para o destinatário
  PRIVATE_MESSAGE_SENT: "private_message_sent", // Servidor envia para o remetente (confirmação)
  USER_TYPING: "user_typing",
  TYPING_START: "typing_start",
  TYPING_STOP: "typing_stop",
  USER_LIST: "userlist",
  ERROR: "error",
  MESSAGE: "message", // Cliente envia este tipo para mensagem pública (pode ter replyTo)
  CLEAR_CHAT_COMMAND: "clear_chat_command",
  CLEAR_CHAT_SELF: "clear_chat_self",
  HISTORY_MESSAGES: "history_messages",

  EDIT_MESSAGE: "edit_message", // Cliente -> Servidor (messageId, newContent)
  MESSAGE_EDITED: "message_edited", // Servidor -> Clientes (message object atualizado)
  DELETE_MESSAGE: "delete_message", // Cliente -> Servidor (messageId)
  MESSAGE_DELETED: "message_deleted", // Servidor -> Clientes (message object atualizado)
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

// Cache para elementos de mensagem para fácil atualização (id -> elemento DOM)
const messageElementsCache = new Map();
let currentReplyingTo = null; // { messageId, sender, contentPreview }
const EDIT_WINDOW_CLIENT = 5 * 60 * 1000; // 5 minutos (para UI, servidor tem a autoridade final)

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

const emojiToggleButton = document.getElementById("emojiToggleButton");
const emojiPickerContainer = document.getElementById("emojiPickerContainer");
const emojiPicker = emojiPickerContainer.querySelector("emoji-picker");

const replyingToContainer = document.getElementById("replyingToContainer");
const replyingToPreview = document.getElementById("replyingToPreview");
const cancelReplyButton = document.getElementById("cancelReplyButton");
const messageActionsTemplate = document.getElementById(
  "messageActionsTemplate"
);

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
  // Negrito precisa vir antes de itálico para evitar conflitos com aninhamento incorreto
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"); // **negrito**
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>"); // *itálico*
  // html = html.replace(/_(.+?)_/g, "<em>$1</em>"); // _itálico_ (alternativa, mas pode conflitar com nomes com _)
  html = html.replace(/~(.+?)~/g, "<del>$1</del>"); // ~tachado~
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
    // Evitar criar links dentro de atributos de tags HTML já existentes (ex: dentro de um <a> já)
    if (url.includes("<") || url.includes(">")) return url;
    return `<a href="${sanitizeHTML(
      fullUrl
    )}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function formatMessageContent(content, isDeleted = false) {
  if (isDeleted) {
    // O conteúdo de mensagens deletadas já vem formatado do servidor como "[Mensagem excluída...]"
    // Apenas sanitizamos para segurança.
    return `<span class="deleted-text">${sanitizeHTML(content)}</span>`;
  }
  let processedContent = sanitizeHTML(content); // Sanitize PRIMEIRO
  processedContent = parseMarkdown(processedContent); // DEPOIS Markdown
  processedContent = autolink(processedContent); // POR ÚLTIMO Autolink
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
      // Verifica se a mensagem ainda é a mesma antes de limpar
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

  usernameInput.focus();

  username = "";
  currentOnlineUsers = [];
  currentlyTypingUsers.clear();
  chatDiv.innerHTML = "";
  userListUl.innerHTML = "";
  updateTypingIndicatorUI();
  typingIndicatorDiv.style.visibility = "hidden";
  newMessagesIndicator.classList.add("hidden");
  document.title = originalTitle;
  unreadMessages = 0;
  errorDisplayDiv.style.display = "none";
  messageErrorDisplayDiv.style.display = "none";
  if (emojiPickerContainer) {
    emojiPickerContainer.classList.add("hidden");
  }
  if (replyingToContainer) {
    replyingToContainer.classList.add("hidden");
  }
  currentReplyingTo = null;
  messageElementsCache.clear();
}

// --- Message Rendering Logic ---

function createMessageMainContent(data, isEditing = false) {
  const mainContentDiv = document.createElement("div");
  mainContentDiv.className = "message-main-content";

  const avatarUrl = getAvatarURL(
    data.sender,
    data.avatarStyle,
    data.avatarSeed
  );
  const avatarImg = document.createElement("img");
  avatarImg.className = "avatar";
  avatarImg.src = avatarUrl;
  avatarImg.alt = data.sender;
  mainContentDiv.appendChild(avatarImg);

  const textContentDiv = document.createElement("div");
  textContentDiv.className = "message-text-content";

  const senderStrong = document.createElement("strong");
  senderStrong.style.color = getColorForUser(data.sender);
  senderStrong.textContent = data.sender + ": ";
  textContentDiv.appendChild(senderStrong);

  const contentSpan = document.createElement("span");
  contentSpan.className = "content";
  // Para edição, o conteúdo inicial do contenteditable deve ser o texto puro
  // A formatação será aplicada após salvar.
  contentSpan.innerHTML = isEditing
    ? sanitizeHTML(data.content)
    : formatMessageContent(data.content, data.isDeleted);
  textContentDiv.appendChild(contentSpan);

  if (isEditing) {
    contentSpan.setAttribute("contenteditable", "true");
    contentSpan.setAttribute("role", "textbox");
    contentSpan.setAttribute("aria-multiline", "true");
    // Guardar o conteúdo original não formatado para edição
    contentSpan.dataset.originalUnformattedContent = data.content;
  }
  mainContentDiv.appendChild(textContentDiv);
  return mainContentDiv;
}

function createReplyQuoteElement(replyToData) {
  if (!replyToData || !replyToData.messageId) return null;

  const quoteDiv = document.createElement("div");
  quoteDiv.className = "replied-message-quote";

  const originalSenderStrong = document.createElement("strong");
  originalSenderStrong.textContent = sanitizeHTML(replyToData.sender) + ": ";
  quoteDiv.appendChild(originalSenderStrong);

  const previewParagraph = document.createElement("p");
  previewParagraph.textContent =
    sanitizeHTML(replyToData.contentPreview.substring(0, 100)) +
    (replyToData.contentPreview.length > 100 ? "..." : "");
  quoteDiv.appendChild(previewParagraph);

  quoteDiv.style.cursor = "pointer";
  quoteDiv.title = "Ir para mensagem original";
  quoteDiv.addEventListener("click", () => {
    const originalMsgEl = messageElementsCache.get(replyToData.messageId);
    if (originalMsgEl) {
      originalMsgEl.scrollIntoView({ behavior: "smooth", block: "center" });
      originalMsgEl.classList.add("highlighted-reply");
      setTimeout(
        () => originalMsgEl.classList.remove("highlighted-reply"),
        2000
      );
    } else {
      displayInlineError(
        "Mensagem original não encontrada no chat atual.",
        messageErrorDisplayDiv,
        3000
      );
    }
  });
  return quoteDiv;
}

function createMessageElement(data) {
  const messageElement = document.createElement("div");
  messageElement.className = "message-item";
  messageElement.dataset.messageId = data.id;
  // Guardar o conteúdo original não formatado para facilitar a edição.
  // Isso é útil se a mensagem for editada múltiplas vezes, para não acumular formatação.
  if (data.type === MSG_TYPES.USER_MESSAGE) {
    messageElement.dataset.originalUnformattedContent = data.content;
  }

  if (data.replyTo) {
    const quoteElement = createReplyQuoteElement(data.replyTo);
    if (quoteElement) {
      messageElement.appendChild(quoteElement);
    }
  }

  if (data.type === MSG_TYPES.USER_MESSAGE) {
    messageElement.appendChild(createMessageMainContent(data));
  } else if (data.type === MSG_TYPES.SYSTEM_MESSAGE) {
    messageElement.classList.add("system-message");
    messageElement.innerHTML = formatMessageContent(data.text, data.isDeleted);
  } else if (
    data.type === MSG_TYPES.PRIVATE_MESSAGE_RECEIVED ||
    data.type === MSG_TYPES.PRIVATE_MESSAGE_SENT
  ) {
    messageElement.classList.add("private-message");
    const isReceived = data.type === MSG_TYPES.PRIVATE_MESSAGE_RECEIVED;
    const avatarOwner = isReceived ? data.sender : username;
    const avatarOwnerStyle = isReceived ? data.avatarStyle : userAvatarStyle;
    const avatarOwnerSeed = isReceived ? data.avatarSeed : userAvatarSeed;
    const altUser = isReceived ? data.sender : data.recipient;

    const avatarUrl = getAvatarURL(
      avatarOwner,
      avatarOwnerStyle,
      avatarOwnerSeed
    );
    const avatarImg = document.createElement("img");
    avatarImg.className = "avatar";
    avatarImg.src = avatarUrl;
    avatarImg.alt = altUser;

    const pmIndicator = document.createElement("span");
    pmIndicator.className = "pm-indicator";
    pmIndicator.textContent = isReceived
      ? `🔒 (Privado de ${sanitizeHTML(data.sender)}): `
      : `🔒 (Privado para ${sanitizeHTML(data.recipient)}): `;
    pmIndicator.style.color = getColorForUser(altUser);

    const mainContentDiv = document.createElement("div");
    mainContentDiv.className = "message-main-content";
    mainContentDiv.appendChild(avatarImg);

    const textContentDiv = document.createElement("div");
    textContentDiv.className = "message-text-content";
    textContentDiv.appendChild(pmIndicator);
    const contentSpan = document.createElement("span");
    contentSpan.innerHTML = formatMessageContent(data.content, data.isDeleted); // PMs também podem ser "deletadas" no futuro
    textContentDiv.appendChild(contentSpan);
    mainContentDiv.appendChild(textContentDiv);
    messageElement.appendChild(mainContentDiv);
  }

  const timestamp = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const targetForExtras =
    messageElement.querySelector(".message-text-content") || messageElement;

  if (data.isEdited && !data.isDeleted) {
    // Não mostrar "editado" se já estiver deletado
    const editedSpan = document.createElement("span");
    editedSpan.className = "edited-indicator";
    editedSpan.textContent = " (editado)";
    targetForExtras.appendChild(editedSpan);
  }
  if (timestamp) {
    const timeSpan = document.createElement("span");
    timeSpan.className = "timestamp";
    timeSpan.textContent = ` (${timestamp})`;
    targetForExtras.appendChild(timeSpan);
  }
  if (data.isDeleted) {
    messageElement.classList.add("deleted-message");
  }

  if (data.type === MSG_TYPES.USER_MESSAGE && !data.isDeleted) {
    const actionsClone = messageActionsTemplate.content.cloneNode(true);
    const actionsDiv = actionsClone.querySelector(".message-actions");

    const replyButton = actionsDiv.querySelector(".action-reply");
    replyButton.addEventListener("click", () =>
      startReplying(data.id, data.sender, data.content)
    );

    const editButton = actionsDiv.querySelector(".action-edit");
    // Verifica se o usuário é o sender E se a mensagem não é muito antiga
    const canEdit =
      data.sender === username &&
      Date.now() - new Date(data.timestamp).getTime() < EDIT_WINDOW_CLIENT;
    if (canEdit) {
      editButton.addEventListener("click", () => startEditing(data.id));
    } else {
      editButton.remove();
    }

    const deleteButton = actionsDiv.querySelector(".action-delete");
    if (data.sender === username) {
      deleteButton.addEventListener("click", () => deleteMessage(data.id));
    } else {
      deleteButton.remove();
    }
    if (actionsDiv.childElementCount > 0) {
      messageElement.appendChild(actionsDiv);
    }
  }

  messageElementsCache.set(data.id, messageElement);
  return messageElement;
}

function displayMessage(data, isHistorical = false) {
  const isNearBottom =
    chatDiv.scrollHeight - chatDiv.clientHeight <= chatDiv.scrollTop + 100;
  const messageElement = createMessageElement(data); // Agora usa a função centralizada

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
        data.type !== MSG_TYPES.SYSTEM_MESSAGE &&
        !data.isDeleted
      ) {
        newMessagesIndicator.classList.remove("hidden");
      }
    }
    if (
      !isTabActive &&
      (!data.sender || data.sender !== username) &&
      data.type !== MSG_TYPES.SYSTEM_MESSAGE &&
      !data.isDeleted
    ) {
      unreadMessages++;
      document.title = `(${unreadMessages}) ${originalTitle}`;
    }
  } else if (
    isHistorical &&
    chatDiv.childElementCount === (data.history ? data.history.length : 0)
  ) {
    // Verificação ajustada
    // Somente rola para o final após todos os históricos serem adicionados
    // Se uma mensagem de "carregando" foi adicionada, o contador precisa ser ajustado ou a mensagem removida antes desta checagem.
    // A lógica atual remove a mensagem de "carregando" antes de chegar aqui, então deve funcionar.
    scrollToBottom();
  }
}

function updateDisplayedMessage(updatedMessageData) {
  const existingElement = messageElementsCache.get(updatedMessageData.id);
  if (existingElement) {
    const newElement = createMessageElement(updatedMessageData);
    existingElement.replaceWith(newElement);
    // O cache é atualizado dentro de createMessageElement
  } else {
    // Caso raro onde a mensagem não está no DOM mas recebemos atualização (ex: entrou depois da msg ser enviada)
    // Para simplificar, podemos ignorar ou adicionar ao final se não for histórico.
    // Se a mensagem não estava no histórico e agora aparece, pode ser confuso.
    // Melhor seria garantir que o histórico enviado já contenha o estado mais recente.
    console.warn(
      "Tentativa de atualizar mensagem não encontrada no DOM:",
      updatedMessageData.id
    );
    // Poderia tentar adicionar, mas precisa de cuidado para não duplicar.
    // displayMessage(updatedMessageData, true); // Adiciona como se fosse histórica
  }
}

// --- UI Update Functions (User List, Typing Indicator) ---
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
          messageElementsCache.clear(); // Limpar cache ao carregar histórico

          if (data.history.length > 0) {
            const loadingMsgData = {
              id: "temp-loading-hist",
              type: MSG_TYPES.SYSTEM_MESSAGE,
              text: "Carregando histórico...",
              timestamp: new Date().toISOString(),
            };
            displayMessage(loadingMsgData, true);

            data.history.forEach((msgData) => displayMessage(msgData, true));

            const loadingElement =
              messageElementsCache.get("temp-loading-hist");
            if (loadingElement) loadingElement.remove();
            messageElementsCache.delete("temp-loading-hist");
          } else {
            displayMessage(
              {
                id: "temp-no-hist",
                type: MSG_TYPES.SYSTEM_MESSAGE,
                text: "Nenhuma mensagem anterior no chat.",
                timestamp: new Date().toISOString(),
              },
              true
            );
          }
          // Scroll to bottom after a very short delay to ensure all elements are rendered
          setTimeout(scrollToBottom, 50);
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
            ws.close(1000, "Client acknowledging invalid name error.");
          } else {
            resetToJoinScreen();
          }
          displayInlineError(errorText);
        } else if (
          errorText.includes("muito longa") ||
          errorText.includes("Rate limit") ||
          errorText.includes("inválido") ||
          errorText.includes("offline") ||
          errorText.includes("Não é possível editar") ||
          errorText.includes("Você não pode") ||
          errorText.includes("Tempo limite") ||
          errorText.includes("não encontrada")
        ) {
          displayInlineError(errorText, messageErrorDisplayDiv);
        } else if (errorText.includes("Entre no chat primeiro")) {
          displayInlineError(errorText, errorDisplayDiv); // Erro de não join na tela de join
        } else {
          displayInlineError(
            errorText,
            errorDisplayDiv.style.display !== "none"
              ? errorDisplayDiv
              : messageErrorDisplayDiv
          );
        }
      } else if (data.type === MSG_TYPES.CLEAR_CHAT_SELF) {
        chatDiv.innerHTML = "";
        messageElementsCache.clear();
        const systemClearMsg = {
          id: "self-clear-" + Date.now(),
          type: MSG_TYPES.SYSTEM_MESSAGE,
          text: "Seu chat local foi limpo.",
          timestamp: new Date().toISOString(),
        };
        displayMessage(systemClearMsg, true);
      } else if (data.type === MSG_TYPES.MESSAGE_EDITED) {
        updateDisplayedMessage(data.message);
      } else if (data.type === MSG_TYPES.MESSAGE_DELETED) {
        updateDisplayedMessage(data.message);
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
    if (
      username && // Só mostra desconectado se o usuário tinha um nome (estava no chat)
      !reasonStr.includes("Nome em uso") &&
      !reasonStr.includes("Nome inválido") &&
      reasonStr !== "Client requested logout" &&
      !reasonStr.includes("Client acknowledging invalid name error")
    ) {
      // Não precisa exibir mensagem de desconexão aqui, resetToJoinScreen já é suficiente
      // A tela de join é o indicativo de que não está conectado.
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
  if (messageContent === null) return; // Usuário cancelou
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
        msgInput.value = ""; // Limpa o input após enviar comando
        msgInput.focus();
      } else {
        displayInlineError(
          "Não conectado ao chat para limpar.",
          messageErrorDisplayDiv
        );
      }
    } else {
      msgInput.focus(); // Mantém o foco se cancelar
    }
    return;
  }

  const pmMatch = trimmedMessageText.match(/^\/(pm|w)\s+([\w\d_.-]+)\s+(.+)$/i);
  if (pmMatch) {
    const recipient = pmMatch[2];
    const privateContent = pmMatch[3];
    if (sendPrivateMessageToServer(recipient, privateContent)) {
      msgInput.value = ""; // Limpa o input após enviar PM
      msgInput.focus();
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: MSG_TYPES.TYPING_STOP }));
        }
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
    const messagePayload = {
      type: MSG_TYPES.MESSAGE,
      text: trimmedMessageText,
    };
    if (currentReplyingTo) {
      messagePayload.replyTo = currentReplyingTo;
    }

    ws.send(JSON.stringify(messagePayload));

    msgInput.value = "";
    msgInput.focus();
    messageErrorDisplayDiv.style.display = "none"; // Limpa erros anteriores de mensagem
    cancelReplying();

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
    ws.close(1000, "Client requested logout");
  } else {
    resetToJoinScreen(); // Se não houver conexão, apenas reseta a UI
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

// --- Novas Funções para Edição, Exclusão, Resposta ---
function startReplying(messageId, sender, content) {
  currentReplyingTo = {
    messageId,
    sender,
    contentPreview: content.substring(0, 100),
  };
  replyingToPreview.innerHTML = `<strong>${sanitizeHTML(
    sender
  )}:</strong> ${sanitizeHTML(currentReplyingTo.contentPreview)}`;
  replyingToContainer.classList.remove("hidden");
  msgInput.focus();
}

function cancelReplying() {
  currentReplyingTo = null;
  if (replyingToContainer) replyingToContainer.classList.add("hidden");
  if (replyingToPreview) replyingToPreview.innerHTML = "";
}

function startEditing(messageId) {
  const messageElement = messageElementsCache.get(messageId);
  if (!messageElement || messageElement.classList.contains("editing")) return; // Já editando esta ou não encontrada

  messageElement.classList.add("editing"); // Marcar como em edição para evitar múltiplas edições

  const textContentSpan = messageElement.querySelector(
    ".message-text-content .content"
  );
  if (!textContentSpan) {
    messageElement.classList.remove("editing");
    return;
  }

  // Usar o conteúdo original não formatado guardado no dataset
  const originalUnformattedContent =
    messageElement.dataset.originalUnformattedContent ||
    textContentSpan.textContent;

  textContentSpan.setAttribute("contenteditable", "true");
  textContentSpan.textContent = originalUnformattedContent; // Preencher com texto puro
  textContentSpan.focus();

  const actionsDiv = messageElement.querySelector(".message-actions");
  if (actionsDiv) actionsDiv.style.display = "none";

  const editActionsDiv = document.createElement("div");
  editActionsDiv.className = "edit-actions";
  const saveButton = document.createElement("button");
  saveButton.textContent = "Salvar";
  saveButton.onclick = (e) => {
    e.stopPropagation();
    finishEditing(messageId, textContentSpan.textContent);
  };
  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancelar";
  cancelButton.onclick = (e) => {
    e.stopPropagation();
    cancelEditing(messageId, originalUnformattedContent);
  }; // Passar o texto original

  editActionsDiv.appendChild(saveButton);
  editActionsDiv.appendChild(cancelButton);
  // Adicionar após o .message-main-content ou no final do .message-item
  const mainContent = messageElement.querySelector(".message-main-content");
  if (mainContent && mainContent.parentNode === messageElement) {
    mainContent.insertAdjacentElement("afterend", editActionsDiv);
  } else {
    messageElement.appendChild(editActionsDiv);
  }

  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(textContentSpan);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function finishEditing(messageId, newContent) {
  const messageElement = messageElementsCache.get(messageId);
  if (!messageElement) return;

  const trimmedContent = newContent.trim();
  if (trimmedContent.length === 0 || trimmedContent.length > 500) {
    displayInlineError(
      "Edição inválida (1-500 caracteres). Tente novamente.",
      messageErrorDisplayDiv
    );
    const textContentSpan = messageElement.querySelector(
      ".message-text-content .content"
    );
    if (textContentSpan) textContentSpan.focus(); // Devolve o foco para o usuário corrigir
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: MSG_TYPES.EDIT_MESSAGE,
        messageId: messageId,
        newContent: trimmedContent,
      })
    );
  }
  // A UI será atualizada quando o servidor enviar MESSAGE_EDITED.
  // Apenas removemos o estado de edição localmente para permitir novas interações.
  cleanUpEditingUI(messageId);
}

function cancelEditing(messageId, originalUnformattedContent) {
  const messageElement = messageElementsCache.get(messageId);
  if (!messageElement) return;

  const textContentSpan = messageElement.querySelector(
    ".message-text-content .content"
  );
  if (textContentSpan) {
    textContentSpan.setAttribute("contenteditable", "false");
    // Restaurar com o conteúdo original *formatado* (será re-renderizado pelo updateDisplayedMessage se necessário)
    // Por ora, vamos reverter para o conteúdo não formatado, pois a formatação é complexa.
    // O ideal seria que o servidor reenviasse a mensagem completa em caso de cancelamento,
    // ou o cliente guardasse o HTML original.
    textContentSpan.innerHTML = formatMessageContent(
      originalUnformattedContent
    ); // Re-formata o original
  }
  cleanUpEditingUI(messageId);
}

function cleanUpEditingUI(messageId) {
  const messageElement = messageElementsCache.get(messageId);
  if (!messageElement) return;

  messageElement.classList.remove("editing");
  const textContentSpan = messageElement.querySelector(
    ".message-text-content .content"
  );
  if (textContentSpan) {
    textContentSpan.setAttribute("contenteditable", "false");
  }
  const editActionsDiv = messageElement.querySelector(".edit-actions");
  if (editActionsDiv) editActionsDiv.remove();
  const actionsDiv = messageElement.querySelector(".message-actions");
  if (actionsDiv) actionsDiv.style.display = "";
}

function deleteMessage(messageId) {
  if (!confirm("Tem certeza que deseja excluir esta mensagem?")) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: MSG_TYPES.DELETE_MESSAGE,
        messageId: messageId,
      })
    );
  }
  // A UI será atualizada quando o servidor enviar MESSAGE_DELETED.
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
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}); // Prevenir nova linha com Enter
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

if (emojiToggleButton && emojiPickerContainer && emojiPicker) {
  emojiToggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    emojiPickerContainer.classList.toggle("hidden");
    if (!emojiPickerContainer.classList.contains("hidden")) {
      setTimeout(() => {
        const searchInput = emojiPicker.shadowRoot?.querySelector(
          'input[type="search"]'
        );
        if (searchInput) searchInput.focus();
      }, 0);
    }
  });
  emojiPicker.addEventListener("emoji-click", (event) => {
    msgInput.value += event.detail.unicode;
    msgInput.focus();
  });
  document.addEventListener("click", (event) => {
    if (
      emojiPickerContainer &&
      !emojiPickerContainer.classList.contains("hidden") &&
      !emojiPickerContainer.contains(event.target) &&
      event.target !== emojiToggleButton
    ) {
      emojiPickerContainer.classList.add("hidden");
    }
  });
  emojiPickerContainer.addEventListener("click", (event) => {
    event.stopPropagation();
  });
} else {
  console.warn("Elementos do Emoji Picker não encontrados.");
}

if (cancelReplyButton) {
  cancelReplyButton.addEventListener("click", cancelReplying);
}

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

  if (emojiPickerContainer) emojiPickerContainer.classList.add("hidden");
  if (replyingToContainer) replyingToContainer.classList.add("hidden");

  usernameInput.focus();
  updateAvatarPreview();
  originalJoinButtonText = joinButton.textContent;
};
