# Consulta de aparelhos e cadastro de produtos

Acesse Retaguarda → API de aparelhos (`/erp/api-aparelhos`). O fornecedor DeviceSpecs / RapidAPI é registrado pela migração 0040. Crie a chave seguindo a documentação em https://ds.gtgroup.dev/docs, cadastre-a nessa tela e ative a consulta para a loja selecionada. Não é necessário informar a chave no chat ou incluí-la no código.

No cadastro, a ajuda de variações precisa estar habilitada. Informe o nome completo, como Samsung Galaxy S24, Xiaomi Redmi Note 13 ou Motorola Moto G84. O sistema consulta o modelo exato; cores, capacidades e a resposta completa ficam registradas no banco para aquela loja. Modelos ausentes ou erros do fornecedor não geram dados fictícios. As consultas salvas são reutilizadas pelo prazo configurado; se uma atualização falhar, dados anteriores são identificados como desatualizados.

A chave fica criptografada no servidor e nunca é retornada ao navegador. A criptografia depende de JWT_SECRET; uma troca desse segredo exige recadastrar a chave. Credenciais, cache e políticas pertencem à loja. Nenhuma chave vem pré-configurada.

SKU é formado com marca, nome, variações e condição, com sufixo para colisões na mesma loja. Um SKU manual permanece editável. A sugestão de venda exige custo e percentual escolhido: markup de 25% sobre custo de R$ 100 sugere R$ 125; margem bruta desejada de 20% também sugere R$ 125. O preço só muda ao aplicar a sugestão.

Última entrada utiliza movimentos reais de estoque. Entradas por nota mostram número, série, emissão e data de entrada informada. Alterar descrição ou preço não cria uma nova entrada. Processar uma nota atualiza quantidade e custo médio em uma transação; repetir o processamento não duplica saldo. Cancelamento respeita reservas e mantém o histórico.

Validação: `npm run build` e `node --test scripts/*.test.mjs`. O teste de transporte do fornecedor usa resposta isolada apenas no teste; o sistema em execução utiliza HTTPS real. A autenticação e a cobertura efetiva do fornecedor precisam ser verificadas após cadastrar uma chave válida.
