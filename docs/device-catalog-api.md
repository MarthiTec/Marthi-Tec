# Consulta de aparelhos e cadastro de produtos

Acesse Retaguarda → API de aparelhos (`/erp/api-aparelhos`). O fornecedor DeviceSpecs / RapidAPI é registrado pela migração 0040. Assine a API "GSMArenaParser" na RapidAPI (https://rapidapi.com/controller2042000/api/gsmarenaparser — plano Basic grátis com 15 consultas/dia; documentação em https://ds.gtgroup.dev/docs), cadastre-a nessa tela e ative a consulta para a loja selecionada. Não é necessário informar a chave no chat ou incluí-la no código.

**Chave da plataforma (opcional):** defina `DEVICE_CATALOG_API_KEY` nas Variáveis de Ambiente do Site Discloud (`marthi-totem` e/ou `marthi-backend`). Lojas sem chave própria usam essa chave automaticamente para ajuda/ficha de marcas ≠ iPhone. iPhone continua gratuito via `support.apple.com`. A chave nunca é exposta ao navegador.

No cadastro simplificado, Marca → Tipo → Modelo montam a descrição (modelos Android de plataforma na migração 0118). A ajuda de variações precisa estar habilitada. O sistema normaliza nomes do catálogo (ex. `GALAXY S 24 ULTRA` → `Galaxy S24 Ultra`) antes de consultar a DeviceSpecs. Cores, capacidades e a resposta completa ficam registradas no banco da loja. Modelos ausentes ou erros do fornecedor não geram dados fictícios. As consultas salvas são reutilizadas pelo prazo configurado; se uma atualização falhar, dados anteriores são identificados como desatualizados.

A chave da loja fica criptografada no servidor e nunca é retornada ao navegador. A criptografia depende de JWT_SECRET; uma troca desse segredo exige recadastrar a chave da loja. Credenciais por loja, cache e políticas pertencem à loja. Sem `DEVICE_CATALOG_API_KEY` e sem chave da loja, a consulta multi-marca permanece desligada.

SKU é formado com marca, nome, variações e condição, com sufixo para colisões na mesma loja. Um SKU manual permanece editável. A sugestão de venda exige custo e percentual escolhido: markup de 25% sobre custo de R$ 100 sugere R$ 125; margem bruta desejada de 20% também sugere R$ 125. O preço só muda ao aplicar a sugestão.

Última entrada utiliza movimentos reais de estoque. Entradas por nota mostram número, série, emissão e data de entrada informada. Alterar descrição ou preço não cria uma nova entrada. Processar uma nota atualiza quantidade e custo médio em uma transação; repetir o processamento não duplica saldo. Cancelamento respeita reservas e mantém o histórico.

Validação: `npm run build` e `node --test scripts/*.test.mjs`. O teste de transporte do fornecedor usa resposta isolada apenas no teste; o sistema em execução utiliza HTTPS real. A autenticação e a cobertura efetiva do fornecedor precisam ser verificadas após cadastrar uma chave válida.
