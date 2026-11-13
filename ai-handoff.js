const requests={review:'Revise o roteiro, identifique conflitos e sugira ajustes.',gaps:'Sugira atividades para os horários livres, considerando localização, deslocamentos e minhas preferências.',restaurants:'Sugira restaurantes nas cidades da viagem, considerando as opções já cadastradas.',import:'Ajude a preparar uma importação de atividades ou restaurantes. Primeiro, identifique comigo as fontes que devem ser utilizadas. Reservas estruturadas e atualizações de reservas ainda não são suportadas pelo plugin.'};
export function tripPrompt(trip,task='review'){
 if(!trip?.id)return '';
 return `Use o plugin mele.va para consultar a viagem ${JSON.stringify(trip.name)} (ID: ${trip.id}). Confira minhas permissões e as preferências salvas. ${requests[task]||requests.review} Antes de importar, confira os itens existentes para evitar duplicações e prepare os novos itens para revisão no app. Se o plugin não estiver conectado, explique como conectar antes de tentar acessar a viagem.`;
}
