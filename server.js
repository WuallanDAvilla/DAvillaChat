// server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

// ... (código do http.createServer e mimeTypes continua o mesmo) ...
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
      if (error.code === "ENOENT") {
        res.writeHead(404);
        res.end("Arquivo não encontrado");
      } else {
        res.writeHead(500);
        res.end("Erro interno do servidor: " + error.code);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const wss = new WebSocket.Server({ server });
const clients = new Map(); // ws => { name: string, isTyping: boolean }

// Função para encontrar um cliente (ws) pelo nome
function findClientByName(name) {
  for (const [ws, clientData] of clients.entries()) {
    if (clientData.name === name) {
      return ws;
    }
  }
  return null;
}

function broadcast(data, SENDER_WS = null) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      if (SENDER_WS && client === SENDER_WS && data.type === "user_typing")
        return;
      try {
        client.send(JSON.stringify(data));
      } catch (e) {
        console.error("Erro ao enviar mensagem para o cliente:", e);
      }
    }
  });
}

function updateUserList() {
  const userList = Array.from(clients.values()).map(
    (clientData) => clientData.name
  );
  broadcast({ type: "userlist", users: userList });
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("Mensagem inválida recebida:", msg);
      ws.send(
        JSON.stringify({ type: "error", text: "Formato de mensagem inválido." })
      );
      return;
    }

    const clientData = clients.get(ws);

    if (data.type === "join") {
      let name = String(data.name || "").trim();
      name = name.replace(/[<>]/g, "");
      if (name.length === 0 || name.length > 25) {
        ws.send(
          JSON.stringify({
            type: "error",
            text: "Nome inválido (vazio ou muito longo - máx 25 caracteres).",
          })
        );
        ws.close();
        return;
      }
      if (Array.from(clients.values()).some((c) => c.name === name)) {
        ws.send(
          JSON.stringify({ type: "error", text: "Este nome já está em uso." })
        );
        ws.close();
        return;
      }
      clients.set(ws, { name: name, isTyping: false });
      broadcast({
        type: "system_message",
        text: `🔵 ${name} entrou no chat.`,
        timestamp: new Date().toISOString(),
      });
      updateUserList();
    } else if (clientData) {
      if (data.type === "message") {
        const messageText = String(data.text || "").trim();
        if (messageText.length > 0 && messageText.length <= 500) {
          broadcast({
            type: "user_message",
            sender: clientData.name,
            content: messageText,
            timestamp: new Date().toISOString(),
          });
        } else if (messageText.length > 500) {
          ws.send(
            JSON.stringify({
              type: "error",
              text: "Sua mensagem é muito longa (máx 500 caracteres).",
            })
          );
        }
      } else if (data.type === "typing_start") {
        if (!clientData.isTyping) {
          clientData.isTyping = true;
          broadcast(
            { type: "user_typing", name: clientData.name, isTyping: true },
            ws
          );
        }
      } else if (data.type === "typing_stop") {
        if (clientData.isTyping) {
          clientData.isTyping = false;
          broadcast(
            { type: "user_typing", name: clientData.name, isTyping: false },
            ws
          );
        }
      } else if (data.type === "private_message") {
        // NOVA LÓGICA
        const recipientName = String(data.recipient || "").trim();
        const privateContent = String(data.content || "").trim();

        if (!recipientName || !privateContent) {
          ws.send(
            JSON.stringify({
              type: "error",
              text: "Destinatário ou conteúdo da mensagem privada ausente.",
            })
          );
          return;
        }
        if (privateContent.length > 500) {
          ws.send(
            JSON.stringify({
              type: "error",
              text: "Sua mensagem privada é muito longa (máx 500 caracteres).",
            })
          );
          return;
        }

        const recipientWs = findClientByName(recipientName);

        if (recipientWs) {
          // Envia para o destinatário
          if (recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(
              JSON.stringify({
                type: "private_message_received",
                sender: clientData.name,
                content: privateContent,
                timestamp: new Date().toISOString(),
              })
            );
          }
          // Envia confirmação/cópia para o remetente
          ws.send(
            JSON.stringify({
              type: "private_message_sent",
              recipient: recipientName,
              content: privateContent,
              timestamp: new Date().toISOString(),
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              text: `Usuário "${recipientName}" não encontrado ou offline.`,
            })
          );
        }
      }
    } else if (data.type !== "join") {
      ws.send(
        JSON.stringify({
          type: "error",
          text: "Você precisa entrar no chat primeiro.",
        })
      );
    }
  });

  ws.on("close", () => {
    const clientData = clients.get(ws);
    if (clientData) {
      clients.delete(ws);
      if (clientData.isTyping) {
        broadcast(
          { type: "user_typing", name: clientData.name, isTyping: false },
          ws
        );
      }
      broadcast({
        type: "system_message",
        text: `🔴 ${clientData.name} saiu no chat.`,
        timestamp: new Date().toISOString(),
      });
      updateUserList();
    }
  });

  ws.on("error", (error) => {
    console.error("Erro no WebSocket do cliente:", error);
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Servidor rodando em http://localhost:3000");
});
