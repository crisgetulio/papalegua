# Papalegua v2 - Changelog

## Correções de Bugs

### server.js
- **Permissões de arquivos**: Todos os diretórios são criados com `chmod 755` e arquivos com `chmod 644` automaticamente
- **Avatar com extensão correta**: Upload de avatar agora preserva extensão (.jpg, .png, etc.) em vez de salvar sem extensão
- **Path traversal**: Download de arquivos privados agora usa `path.basename()` para evitar acesso indevido a arquivos do servidor
- **Login por e-mail**: Agora aceita tanto username quanto e-mail no login
- **Session cookie**: Sessão agora dura 7 dias; `secure: true` ativado automaticamente quando `NODE_ENV=production`
- **Validações**: Senhas mínimo 6 chars, usuário mínimo 3 chars, com mensagens de erro específicas
- **Erros UNIQUE**: Mensagens claras quando usuário ou e-mail já existem
- **Private stop typing**: Evento agora enviado corretamente via `private stop typing` (específico por conversa)
- **Disconnect racing**: Verifica se o socket.id bate antes de remover do mapa online

### Banco de dados
- **Tabela `read_receipts`**: Nova tabela para controle de mensagens lidas
- **Campo `created_at`**: Adicionado na tabela de usuários
- **Avatar padrão SVG**: Agora gerado inline, sem dependência de arquivo PNG externo

## Novas Funcionalidades

### Notificações do Navegador (push nativo)
- Botão 🔔/🔕 no header do chat para ativar/desativar
- Ao ativar, pede permissão ao navegador
- Notificações aparecem mesmo com a aba minimizada/em background
- Inclui avatar do remetente e prévia do conteúdo

### Notificações em Áudio
- Som de "ping" gerado via Web Audio API (sem arquivo externo)
- Dois tons curtos, discretos, ao receber mensagem
- Ativado junto com as notificações do navegador

### Balão Flutuante Interno
- Aparece quando a aba está em background ou minimizada
- Mostra avatar, nome do remetente e prévia da mensagem
- Clicável para focar a janela
- Fecha automaticamente em 5 segundos

### Controle de Mensagens Lidas
- Backend: tabela `read_receipts` persiste última mensagem lida por conversa
- Frontend: emite `mark read` automaticamente ao abrir conversa e ao receber mensagens
- API `GET /api/unread-counts`: retorna contagem de não lidas por contato
- API `POST /api/mark-read`: marca mensagens como lidas

### Badges de Não Lidos (contacts.html)
- Badge dourado ao lado de cada contato com contagem de mensagens não lidas
- Atualização em tempo real via socket `unread update`
- Zera ao entrar na conversa

### Melhorias de UI/UX
- **contacts.html**: Ordenação (online primeiro, depois alfabético), busca em tempo real, avatar com anel de status, dark theme refinado
- **private-chat.html**: Divisores de data, tipo "Hoje"/"Ontem"/"Segunda-feira, 14 de junho", scroll suave, mensagem deletada com estilo próprio
- **login.html + register.html**: Design moderno dark, feedback de erro/sucesso inline
- **Título da aba**: Mostra "(1) Mensagem de X" quando há mensagem não vista

## Como aplicar no servidor

```bash
# Parar o processo atual
pm2 stop papalegua

# Backup do projeto atual
cp -r /caminho/papalegua /caminho/papalegua.bak

# Copiar novos arquivos (preservando data/)
rsync -av --exclude='data/' --exclude='uploads/' --exclude='private_uploads/' --exclude='node_modules/' . /caminho/papalegua/

# Reinstalar dependências (não mudaram)
cd /caminho/papalegua && npm install

# Reiniciar
pm2 restart papalegua
pm2 save
```
