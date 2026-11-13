# mele.va

Planejador de viagens estático (GitHub Pages), com Google login, Supabase Auth e Postgres. Dados pessoais ficam no banco protegido por RLS, nunca no repositório.

## Desenvolvimento e publicação

`npm ci`, `npm test`, `npm run build`. GitHub Pages publica a raiz de `main`. Nunca adicionar backups, `timeline.json`, chaves secretas ou credenciais OAuth. A chave publishable é pública por definição; a autorização depende do banco.

## Viagens e usuários

O primeiro login Google cria a conta. Cada pessoa vê as viagens que criou ou recebeu por compartilhamento. O proprietário pode conceder edição ou somente leitura por e-mail e remover acessos. Compartilhar não envia e-mail automaticamente. As preferências são armazenadas por viagem. O histórico registra alterações do planejamento; não oferece restauração automática.

A viagem existente foi vinculada ao proprietário e ao compartilhamento já autorizado sem substituir seu roteiro. Os scripts em `db/` documentam a evolução; a migração inicial exige a identificação do proprietário existente por configuração de sessão. Não executar novamente em um banco já migrado.

## Sincronização e backups

Atualizações são consultadas a cada 15 segundos e ao retornar à janela, quando nenhum editor está aberto. Revisões rejeitam gravações concorrentes desatualizadas. Não há edição offline automática. Falhas geram backup pendente local por usuário/viagem. Exporte-o e importe para revisar diferenças. Backups de outra viagem são rejeitados; arquivos antigos sem ID só podem ser importados na viagem original.

## Importações longas — primeira etapa

Lotes persistem no banco, em blocos de até 50 itens. É possível retomá-los pelo ID. Cada item tem uma chave estável de origem; repetir a mesma chave não duplica o registro. Chaves diferentes não são deduplicadas semanticamente. O usuário revisa itens em **Importações** antes de aplicar.

Suporte atual: atividades e restaurantes. Importação de reservas estruturadas (hospedagem, localizador, custos, cancelamentos e revisões de confirmação) ainda precisa ser implementada. Não anunciar importação completa de confirmações antes dessa etapa. O servidor não acessa caixas de e-mail: o ChatGPT precisa de uma conexão de e-mail e autorização próprias.

## Conexão ChatGPT — ativação pendente

`server/` contém a função `mele-mcp` com leitura de viagens e preparação de lotes; `consent.html` contém a autorização. O endpoint fica bloqueado (503) enquanto `MCP_CLIENT_ID` não estiver configurado. Tokens comuns do navegador são recusados. Ainda é necessário validar o fluxo OAuth completo em conta real antes de considerar a integração disponível.

Para ativar, configurar no painel Supabase:

1. Auth > OAuth Server: habilitar o servidor; configurar a URL de consentimento para `https://yuritelles.github.io/mele.va/consent.html`. Conferir a URL resultante do Site URL + Authorization Path, pois o app está numa subpasta. Adicionar essa URL em Auth > URL Configuration > Redirect URLs para o retorno do login Google.
2. Registrar um cliente OAuth dedicado ao ChatGPT, com PKCE e o callback exato apresentado pela interface de conexão do ChatGPT. Não habilitar registro dinâmico irrestrito. Guardar o segredo apenas nos painéis adequados. Definir o Client ID como `MCP_CLIENT_ID` na função.
3. Configurar e testar um access-token hook para esse cliente que inclua a audiência `https://porzljqjsqlqutwtwyqb.supabase.co/functions/v1/mele-mcp`. Antes da ativação, restringir também os clientes OAuth permitidos nas políticas do banco e validar a audiência contra o Data API. Não alterar a audiência das sessões normais do app. O código deliberadamente recusa tokens sem a audiência específica.
4. Conectar o endpoint MCP no ChatGPT e testar leitura, preparação, revisão no app, retomada e revogação com contas distintas. A conexão ainda não foi instalada nem validada ponta a ponta.

Documentação: https://supabase.com/docs/guides/auth/oauth-server/getting-started e https://supabase.com/docs/guides/auth/oauth-server/token-security.

## Editar dados da viagem

O proprietário usa **Editar viagem** na barra superior para alterar nome, datas e destinos gerais. Atividades mantêm suas datas. Dias adicionados ficam vazios. A redução do período é recusada se excluir planejamento, notas ou reservas, inclusive esperas e atividades que cruzam a meia-noite. As cidades dos dias existentes continuam editáveis no próprio dia. Outros dispositivos atualizam os dados ao sincronizar.

O pacote de desenvolvimento do plugin está em `plugin/`; sua ativação ainda depende da configuração OAuth e dos testes descritos ali.

## Continuar no ChatGPT

O painel **Usar no ChatGPT** substitui o chat incorporado adiado. Permite escolher uma tarefa, revisar/copiar o pedido com nome e ID da viagem e abrir o ChatGPT. Não envia mensagens automaticamente nem exporta o roteiro. A conexão MCP ainda precisa ser ativada; o painel informa isso. O plano de cada pessoa é utilizado no próprio ChatGPT, sem chamadas de IA faturadas ao proprietário pelo mele.va.
