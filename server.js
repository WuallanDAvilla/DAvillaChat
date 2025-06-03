const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = "./public" + (req.url === "/" ? "/index.html" : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };
  const contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(
        error.code === "ENOENT"
          ? "Arquivo não encontrado"
          : `Erro: ${error.code}`
      );
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const wss = new WebSocket.Server({ server });

const MESSAGE_LIMIT = 5;
const MESSAGE_LIMIT_WINDOW = 10000; // 10 segundos
const MAX_HISTORY_LENGTH = 10;

// Estrutura do clientData: { name: string, avatarStyle: string, avatarSeed: string, isTyping: boolean, messageTimestamps: number[] }
const clients = new Map();
const messageHistory = [];

const MSG_TYPES_SERVER = {
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

function findClientByName(name) {
  for (const [ws, clientData] of clients.entries()) {
    if (clientData.name === name) return ws;
  }
  return null;
}

function broadcast(data, SENDER_WS = null) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      if (
        SENDER_WS &&
        client === SENDER_WS &&
        data.type === MSG_TYPES_SERVER.USER_TYPING
      )
        return;
      try {
        client.send(JSON.stringify(data));
      } catch (e) {
        console.error("Erro ao enviar broadcast:", e);
      }
    }
  });
}

function addToHistory(messageData) {
  if (messageHistory.length >= MAX_HISTORY_LENGTH) {
    messageHistory.shift();
  }
  messageHistory.push(messageData);
}

function updateUserList() {
  const userList = Array.from(clients.values()).map((cd) => ({
    name: cd.name,
    avatarStyle: cd.avatarStyle,
    avatarSeed: cd.avatarSeed,
  }));
  broadcast({ type: MSG_TYPES_SERVER.USER_LIST, users: userList });
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("Mensagem inválida:", msg, e);
      ws.send(
        JSON.stringify({
          type: MSG_TYPES_SERVER.ERROR,
          text: "Formato inválido.",
        })
      );
      return;
    }

    const clientData = clients.get(ws);

    if (data.type === MSG_TYPES_SERVER.JOIN) {
      let name = String(data.name || "")
        .trim()
        .replace(/[<>]/g, "");
      let avatarStyle = String(data.avatarStyle || "thumbs").trim();
      let avatarSeed = String(data.avatarSeed || name).trim();

      if (!name || name.length === 0 || name.length > 25) {
        ws.send(
          JSON.stringify({
            type: MSG_TYPES_SERVER.ERROR,
            text: "Nome inválido ou muito longo (1-25 caracteres).",
          })
        );
        ws.close(1008, "Nome inválido");
        return;
      }
      if (Array.from(clients.values()).some((c) => c.name === name)) {
        ws.send(
          JSON.stringify({
            type: MSG_TYPES_SERVER.ERROR,
            text: "Nome já em uso.",
          })
        );
        ws.close(1008, "Nome em uso");
        return;
      }

      clients.set(ws, {
        name,
        avatarStyle,
        avatarSeed,
        isTyping: false,
        messageTimestamps: [],
      });

      if (messageHistory.length > 0) {
        ws.send(
          JSON.stringify({
            type: MSG_TYPES_SERVER.HISTORY_MESSAGES,
            history: messageHistory,
          })
        );
      }

      const joinMessageData = {
        type: MSG_TYPES_SERVER.SYSTEM_MESSAGE,
        text: `🔵 ${name} entrou.`,
        timestamp: new Date().toISOString(),
      };
      broadcast(joinMessageData);
      addToHistory(joinMessageData);
      updateUserList();
    } else if (clientData) {
      if (
        data.type === MSG_TYPES_SERVER.MESSAGE ||
        data.type === MSG_TYPES_SERVER.PRIVATE_MESSAGE
      ) {
        const now = Date.now();
        clientData.messageTimestamps = clientData.messageTimestamps.filter(
          (ts) => now - ts < MESSAGE_LIMIT_WINDOW
        );
        if (clientData.messageTimestamps.length >= MESSAGE_LIMIT) {
          ws.send(
            JSON.stringify({
              type: MSG_TYPES_SERVER.ERROR,
              text: `Limite de mensagens atingido. Tente novamente em ${
                MESSAGE_LIMIT_WINDOW / 1000
              } segundos.`,
            })
          );
          return;
        }
        clientData.messageTimestamps.push(now);
      }

      switch (data.type) {
        case MSG_TYPES_SERVER.MESSAGE:
          const msgText = String(data.text || "").trim();
          if (msgText.length > 0 && msgText.length <= 500) {
            const messageData = {
              type: MSG_TYPES_SERVER.USER_MESSAGE,
              sender: clientData.name,
              avatarStyle: clientData.avatarStyle,
              avatarSeed: clientData.avatarSeed,
              content: msgText,
              timestamp: new Date().toISOString(),
            };
            broadcast(messageData);
            if (messageData.type === MSG_TYPES_SERVER.USER_MESSAGE) {
              addToHistory(messageData);
            }
          } else if (msgText.length > 500) {
            ws.send(
              JSON.stringify({
                type: MSG_TYPES_SERVER.ERROR,
                text: "Mensagem muito longa (máx 500 caracteres).",
              })
            );
          }
          break;
        case MSG_TYPES_SERVER.TYPING_START:
          if (!clientData.isTyping) {
            clientData.isTyping = true;
            broadcast(
              {
                type: MSG_TYPES_SERVER.USER_TYPING,
                name: clientData.name,
                isTyping: true,
              },
              ws
            );
          }
          break;
        case MSG_TYPES_SERVER.TYPING_STOP:
          if (clientData.isTyping) {
            clientData.isTyping = false;
            broadcast(
              {
                type: MSG_TYPES_SERVER.USER_TYPING,
                name: clientData.name,
                isTyping: false,
              },
              ws
            );
          }
          break;
        case MSG_TYPES_SERVER.PRIVATE_MESSAGE:
          const recipientName = String(data.recipient || "").trim();
          const privateContent = String(data.content || "").trim();

          if (!recipientName || !privateContent) {
            ws.send(
              JSON.stringify({
                type: MSG_TYPES_SERVER.ERROR,
                text: "Destinatário ou conteúdo da mensagem privada inválido.",
              })
            );
            return;
          }
          if (privateContent.length > 500) {
            ws.send(
              JSON.stringify({
                type: MSG_TYPES_SERVER.ERROR,
                text: "Mensagem privada muito longa (máx 500 caracteres).",
              })
            );
            return;
          }
          if (recipientName === clientData.name) {
            ws.send(
              JSON.stringify({
                type: MSG_TYPES_SERVER.ERROR,
                text: "Você não pode enviar uma mensagem privada para si mesmo.",
              })
            );
            return;
          }

          const recipientWs = findClientByName(recipientName);
          if (recipientWs) {
            const recipientClientData = clients.get(recipientWs);
            if (recipientWs.readyState === WebSocket.OPEN) {
              recipientWs.send(
                JSON.stringify({
                  type: MSG_TYPES_SERVER.PRIVATE_MESSAGE_RECEIVED,
                  sender: clientData.name,
                  avatarStyle: clientData.avatarStyle,
                  avatarSeed: clientData.avatarSeed,
                  content: privateContent,
                  timestamp: new Date().toISOString(),
                })
              );
            }
            ws.send(
              JSON.stringify({
                type: MSG_TYPES_SERVER.PRIVATE_MESSAGE_SENT,
                recipient: recipientName,
                recipientAvatarStyle: recipientClientData
                  ? recipientClientData.avatarStyle
                  : "thumbs",
                recipientAvatarSeed: recipientClientData
                  ? recipientClientData.avatarSeed
                  : recipientName,
                content: privateContent,
                timestamp: new Date().toISOString(),
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: MSG_TYPES_SERVER.ERROR,
                text: `Usuário "${recipientName}" não encontrado ou offline.`,
              })
            );
          }
          break;
        case MSG_TYPES_SERVER.CLEAR_CHAT_COMMAND:
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: MSG_TYPES_SERVER.CLEAR_CHAT_SELF }));
          }
          break;
        default:
          console.warn("Tipo de mensagem desconhecido do cliente:", data);
          ws.send(
            JSON.stringify({
              type: MSG_TYPES_SERVER.ERROR,
              text: "Comando ou tipo de mensagem desconhecido.",
            })
          );
      }
    } else if (data.type !== MSG_TYPES_SERVER.JOIN) {
      ws.send(
        JSON.stringify({
          type: MSG_TYPES_SERVER.ERROR,
          text: "Você precisa entrar no chat primeiro.",
        })
      );
      ws.close(1008, "Não autenticado");
    }
  });

  ws.on("close", (code, reason) => {
    const clientData = clients.get(ws);
    if (clientData) {
      clients.delete(ws);
      if (clientData.isTyping) {
        broadcast(
          {
            type: MSG_TYPES_SERVER.USER_TYPING,
            name: clientData.name,
            isTyping: false,
          },
          ws
        );
      }
      const reasonStr = reason ? reason.toString() : "";
      // Não anuncia saída se for por nome inválido/em uso, não autenticado ou se o cliente pediu para sair (código 1000 normal)
      const programmaticLeave =
        code === 1000 && reasonStr === "Client requested logout";
      if (
        !programmaticLeave &&
        (code !== 1008 ||
          (!reasonStr.includes("Nome inválido") &&
            !reasonStr.includes("Nome em uso") &&
            !reasonStr.includes("Não autenticado")))
      ) {
        const leaveMessageData = {
          type: MSG_TYPES_SERVER.SYSTEM_MESSAGE,
          text: `🔴 ${clientData.name} saiu.`,
          timestamp: new Date().toISOString(),
        };
        broadcast(leaveMessageData);
        addToHistory(leaveMessageData);
      }
      updateUserList();
    }
  });

  ws.on("error", (error) =>
    console.error("Erro WebSocket cliente:", error.message)
  );
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor D'Avilla Chat rodando em http://localhost:${PORT}`);
});
