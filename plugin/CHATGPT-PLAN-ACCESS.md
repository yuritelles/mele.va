# Solicitação de acesso: plano próprio no mele.va

Status: solicitação preparada, não enviada. O proprietário precisa solicitar acesso em https://developers.openai.com/siwc/request-client-id e seguir o processo indicado para uso de planos em aplicações hospedadas. Habilitar identidade apenas não habilita inferência pelo plano.

## Dados para a solicitação

- Aplicativo: mele.va
- URL: https://yuritelles.github.io/mele.va/
- Código: https://github.com/yuritelles/mele.va
- Plataforma: aplicação web hospedada; frontend estático, backend Supabase.
- Caso de uso: planejamento de viagens pessoais e compartilhadas, com assistente contextual dentro da página.
- Modelo desejado: cada usuário vincula sua própria conta ChatGPT e autoriza explicitamente solicitações de IA elegíveis pelo próprio plano. Não usar conta, assinatura ou chave de API compartilhada do proprietário do mele.va.
- Ações: consultar roteiro/preferências da viagem autorizada, propor alterações e preparar importações revisáveis.
- Autorização: conta local Supabase e papéis de proprietário/editor/leitor por viagem, independentes da conta OpenAI; vinculação explícita à sessão já autenticada.
- Histórico: conversas da aplicação separadas por usuário e viagem; não pressupor acesso às conversas, memória, skills ou conexões privadas do ChatGPT.
- Controles previstos: identificação da conta conectada, desconexão, indicação de uso do plano e tratamento dos limites individuais; sem mudança automática para cobrança de API do proprietário.
- Estado: painel de entrada preparado. Login, armazenamento de tokens e inferência aguardam aprovação e contrato de integração confirmado. Nenhum uso de IA ocorre atualmente pelo painel.

## Critérios para ativação

1. Aprovação explícita para aplicação hospedada e inferência com plano do usuário (não só login).
2. Client ID e callbacks registrados conforme o fluxo aprovado; credenciais protegidas no servidor, nunca no bundle público.
3. Verificar assinatura/issuer/audience/nonce e PKCE; vincular pelo identificador estável, não automaticamente por coincidência de e-mail.
4. Cada solicitação deve usar exclusivamente a autorização do usuário que a iniciou. Leitores não podem gravar; compartilhamento da viagem não compartilha tokens nem histórico de conversa.
5. Se não houver autorização, plano elegível ou saldo/limite disponível, informar e interromper. Não usar credenciais alternativas.
6. Testar com duas contas, troca de usuário, expiração, revogação e limites antes de habilitar o chat.

Este documento descreve requisitos, não recursos já implementados. O pacote MCP em `plugin/` é a integração inversa: ChatGPT acessando o mele.va.
