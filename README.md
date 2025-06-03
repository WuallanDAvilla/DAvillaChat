# 💬 D'Avilla Chat

O D'Avilla Chat é uma aplicação web de chat em tempo real, rica em funcionalidades, construída com Node.js e WebSockets. Ele oferece uma interface moderna e amigável, com avatares personalizáveis, mensagens privadas, edição/exclusão de mensagens, suporte a emojis e muito mais.

## 🌟 Principais Funcionalidades

**Funcionalidades Essenciais do Chat:**

- **Mensagens em Tempo Real:** Entrega instantânea de mensagens usando WebSockets.
- **Presença de Usuários:** Veja quem está online com uma lista de usuários atualizada automaticamente.
- **Indicadores de Digitação:** Saiba quando outros usuários estão digitando, tanto globalmente quanto na lista de usuários.
- **Mensagens do Sistema:** Notificações para usuários que entram ou saem do chat.
- **Histórico de Mensagens:** Carrega as últimas 20 mensagens ao entrar no chat.
- **Logout:** Saia da sessão de chat de forma segura.

**Experiência do Usuário & Interface:**

- **UI Moderna & Responsiva:** Interface limpa e centralizada que se adapta a todos os tamanhos de tela.
- **Modo Escuro:** Alterne entre temas claro e escuro, com a preferência salva no `localStorage`.
- **Avatares Personalizáveis:**
  - Escolha entre 10 estilos diferentes de avatar (fornecidos pela API DiceBear).
  - Opcionalmente, personalize seu avatar com uma "semente" (seed) customizada.
  - Pré-visualização do avatar em tempo real na tela de entrada.
  - Avatares exibidos nas mensagens e na lista de usuários.
- **Nomes de Usuário com Cores:** Cores únicas geradas para cada nome de usuário para fácil identificação.
- **Seletor de Emojis:** Insira emojis facilmente em suas mensagens. 😀
- **URLs Clicáveis:** URLs nas mensagens são automaticamente convertidas em links clicáveis.
- **Suporte Básico a Markdown:** Formate mensagens com `*itálico*`, `**negrito**` e `~tachado~`.
- **Rolagem Suave & Notificações:**
  - O chat rola automaticamente para novas mensagens.
  - O botão "⬇️ Novas Mensagens" aparece se você rolou para cima.
  - Notificações na aba (contagem de mensagens não lidas no título da página) quando o chat não está em foco.
- **Feedback Visual (Inline):** Mensagens de erro não intrusivas e atualizações de status de conexão.
- **Painel de Atualizações:** Um painel deslizante mostra as últimas funcionalidades e o changelog.
- **Barras de Rolagem Estilizadas:** Barras de rolagem personalizadas para um visual consistente.

**Interações com Mensagens:**

- **Responder a Mensagens:** Cite e responda a mensagens específicas, com um recurso de clique para pular para a mensagem original.
- **Editar Próprias Mensagens:** Edite suas mensagens enviadas dentro de uma janela de 5 minutos.
- **Excluir Próprias Mensagens:** Exclua suas mensagens enviadas (o conteúdo será substituído por "[Mensagem excluída...]").

**Comandos & Privacidade:**

- **Mensagens Privadas (Sussurros):**
  - Envie mensagens privadas usando `/pm <usuário> <mensagem>` ou `/w <usuário> <mensagem>`.
  - Clique em um nome de usuário na lista para iniciar uma mensagem privada através de um prompt.
- **Limpar Chat Local:** Use `/clear` para limpar seu histórico de mensagens local (requer confirmação).

**Segurança & Desempenho:**

- **Proteção XSS:** Conteúdo gerado pelo usuário é sanitizado para prevenir cross-site scripting.
- **Validação de Entradas:** Validação no lado do servidor e do cliente para nomes de usuário e comprimentos de mensagem.
- **Rate Limiting:** Limitação básica de taxa no lado do servidor para prevenir spam de mensagens.

## 📦 Tecnologias Utilizadas

- **Backend:** Node.js, módulo `http` (para o servidor), `ws` (para comunicação WebSocket)
- **Frontend:** HTML5, CSS3, JavaScript Puro (Vanilla JS - ES6+ Módulos)
- **APIs:** DiceBear Avatars API (para geração dinâmica de avatares)
- **Armazenamento:** `localStorage` (para preferência do modo escuro)

## 🛠️ Estrutura do Projeto

.
├── public/ # Arquivos do lado do cliente servidos ao navegador
│ ├── assets/ # Recursos estáticos como ícones
│ │ └── IconeDoMeuSite.png
│ ├── styles/ # Folhas de estilo CSS
│ │ └── style.css
│ ├── index.html # Arquivo HTML principal para a interface do chat
│ └── script.js # Lógica JavaScript do lado do cliente
├── server.js # Lógica do servidor Node.js com WebSocket
├── package.json # Metadados do projeto e dependências
├── package-lock.json # Versões exatas das dependências
└── README.md # Este arquivo

## 🚀 Como Rodar o Projeto

1.  **Clone o repositório:**

    ```bash
    git clone https://github.com/WuallanDAvilla/chat.git
    cd chat
    ```

2.  **Instale as dependências:**
    (Assume que `ws` está listado nas dependências do seu `package.json`)

    ```bash
    npm install
    ```

3.  **Inicie o servidor:**
    (Assume que seu `package.json` tem um script de início como `"start": "node server.js"`)

    ```bash
    npm start
    ```

4.  **Acesse no navegador:**
    Abra seu navegador web e navegue para `http://localhost:3000` (ou a porta especificada em `server.js`).

## 🧑‍💻 Autor

Feito com dedicação por **Wuallan D'Avilla**
🔗 [Meu GitHub](https://github.com/WuallanDAvilla)
© Direitos Autorais reservados a Wuallan D'Avilla
