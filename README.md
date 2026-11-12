# mele.va — Ásia 2027

Interface estática para GitHub Pages com Supabase Auth e Postgres. Os dados de viagem ficam exclusivamente no banco com RLS; este repositório contém apenas código e a chave pública do cliente.

## Desenvolvimento

`npm ci`, `npm test`, `npm run build`. Publicação pelo GitHub Pages a partir da raiz de `main`. Não adicionar `timeline.json`, backups pessoais, chaves secretas ou credenciais OAuth ao repositório.

## Configuração de autenticação pendente

No Google Cloud, criar cliente OAuth do tipo Web. Origem: `https://yuritelles.github.io`. URI de redirecionamento: `https://porzljqjsqlqutwtwyqb.supabase.co/auth/v1/callback`.

No Supabase Auth, ativar Google com o Client ID e Client Secret (apenas no painel, nunca no frontend). Site URL e Redirect URL permitida: `https://yuritelles.github.io/mele.va/`.

A lista de acesso fica em `public.trip_access`. O login Google não concede acesso por si só: o email precisa estar autorizado pelas políticas de RLS. A função `save_trip` usa revisão esperada para rejeitar gravações concorrentes desatualizadas.

## Migrar alterações locais

No planejador anterior, usar **Exportar alterações** em cada navegador que tenha edições. No novo app autenticado, usar **Importar alterações** e revisar divergências. A ausência de restaurantes em um arquivo não apaga registros da nuvem. O app não importa automaticamente o protótipo antigo do mele.va, que tinha outro formato.

A sincronização consulta atualizações a cada 15 segundos e ao voltar à janela, quando nenhum editor está aberto. Salvamento exige conexão; falhas permanecem no editor e geram um backup pendente local para exportação. Não há edição offline automática.
