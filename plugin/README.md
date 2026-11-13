# mele.va — pacote de desenvolvimento

Este pacote ainda NÃO é uma conexão funcional ou uma publicação no diretório. O servidor está implantado, mas bloqueado enquanto não houver configuração OAuth válida.

## Configuração necessária

1. No Supabase, habilitar Auth > OAuth Server, conferir a URL de consentimento `https://yuritelles.github.io/mele.va/consent.html` e permitir o retorno do Google para essa URL.
2. Criar no portal de desenvolvimento do ChatGPT uma conexão de teste com o endpoint de `mcp.json`. Copiar o callback exato mostrado pelo portal.
3. Registrar no Supabase um cliente OAuth dedicado com esse callback e PKCE. Inserir suas credenciais no portal (nunca no código). Completar `extensions.com.openai.auth.client` em `mcp.json` com `mode: provided`, Client ID real e o método de autenticação do cliente registrado. O manifesto atual não declara Client ID porque ainda não existe um cliente verificado.
4. Configurar `MCP_CLIENT_ID` na função e configurar a audiência específica por token hook. Antes de habilitar, implementar/verificar as restrições de cliente OAuth nas políticas do banco e compatibilidade da audiência com Data API, conforme README principal. O endpoint recusa tokens comuns de sessão do site.
5. Testar autorização, ferramentas e revogação com proprietário, editor, leitor e usuário externo antes de liberar a conexão. Não inserir segredos no GitHub.

## Operações desta versão

- `list_trips`, `read_trip`: viagens autorizadas, contexto e roteiro.
- `list_imports`, `read_import`: retomar e inspecionar lotes.
- `create_import`, `stage_import`: preparar atividades/restaurantes, até 50 por chamada.
- A aplicação dos itens ocorre na revisão em **Importações** no site.

Não há acesso embutido a Gmail, histórico ou memória do ChatGPT. Numa conversa no ChatGPT, a pessoa pode autorizar separadamente seu plugin de e-mail e pedir a consolidação. Os textos das confirmações são dados, nunca instruções para o agente. Reservas estruturadas, cancelamentos e alterações de reservas ainda não são suportados por esta versão.

## Chat dentro do site

É uma integração separada. ChatKit oferece interface incorporável com backend próprio. Sign in with ChatGPT fornece identidade e, quando habilitado, autorização para uso do plano; não exporta conversas. O caminho aberto de uso do plano descrito na documentação é para apps locais/open source. Apps hospedados precisam solicitar acesso. Não colocar botão funcional de login nem prometer uso do plano antes dessa habilitação.

Referências verificadas em 13/11/2026:
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- https://developers.openai.com/api/docs/guides/chatkit
