# Autenticação e persistência: proposta de correção

Esta alteração fecha os atalhos de autenticação do Express. Ainda não é uma certificação de prontidão para produção nem uma migração completa de todos os módulos para PostgreSQL.

## Comportamento corrigido

- JWTs exigem assinatura HS256, emissor, destinatário e expiração. Tokens locais e de demonstração são rejeitados.
- A identidade, o papel administrativo e o estado ativo são consultados no banco a cada requisição. O cabeçalho da loja exige vínculo em `user_stores` e pertencimento ao tenant.
- Sessões antigas são invalidadas na redefinição de senha e nas mudanças administrativas de acesso.
- A aplicação exige conexão com PostgreSQL e migrations concluídas antes de aceitar conexões. Não há inicialização automática de usuários ou redefinição de senhas para `123`.
- APIs administrativas, criação direta de usuários e confirmação manual de pagamentos exigem superadmin autenticado. O cliente não pode aprovar seu próprio pagamento com `payNow`.
- Rotas públicas de migração, diagnóstico SMTP e limpeza de dados foram removidas.
- Tokens de ativação e recuperação são aleatórios e persistidos por hash. IDs de conta, documentos e tokens `TK-*` não servem como recuperação de senha.
- Alterar senha e consumir o token acontece na mesma transação. Novos hashes usam scrypt; hashes SHA-256 existentes são atualizados após login válido. Senhas conhecidas e expostas (`123` e a antiga senha especial de staff) precisam ser redefinidas.
- OTPs, limites e verificações de telefone são persistidos no banco. Falhas de WhatsApp não simulam envio nem imprimem o código.
- Erros de banco em estoque, atributos, contratações e configurações SMTP são propagados. O frontend não fabrica token demo e não marca uma sincronização malsucedida como pronta.

## Antes de implantar em marthi-totem

1. Faça backup do MarthiDB e teste esta versão em uma aplicação de homologação com cópia do banco.
2. Revogue a chave Discloud compartilhada no chat. Não copie segredos para o repositório, ZIP ou variáveis `VITE_*`.
3. Configure `JWT_SECRET` aleatório com pelo menos 32 caracteres, exclusivamente no servidor. A rotação e o novo formato exigem novo login.
4. Confirme que `DATABASE_URL` ou as credenciais `DB_*` apontam para o MarthiDB correto. Links do dashboard e uma chave de gerenciamento Discloud não são uma conexão PostgreSQL. Veja [a documentação do Discloud](https://docs.discloud.com/en/api-and-integrations/databases).
5. Preserve um usuário real com `global_role = 'superadmin'`. Para acessar lojas, mantenha os vínculos reais em `user_stores`. A aplicação não cria administradores automaticamente.
6. A migration `0020_security_persistence.sql` adiciona `phone_otps`, `users.session_version` e `stores.smtp_settings`. Revise contra o schema existente antes da execução em produção.
7. Teste login, recuperação por e-mail, primeiro acesso, autorização entre lojas, confirmação de pagamento, cadastro de estoque e reinício da aplicação. As antigas rotas `/health/migrate` e `/health/cleanup-tests` não existem mais.
8. O proxy legado agora exige `NEST_API_URL` explícito. Se o Nest continuar em uso, confirme seu banco, seu formato de sessão e a confiança entre os serviços antes de habilitá-lo. Nenhum token é enviado automaticamente ao endereço antigo.

## Validação local

- `npm run test:security`: 28 testes passam; autenticação usa adaptador isolado e vendas usam PostgreSQL PGlite real, sem usar credenciais de produção.
- Compilação TypeScript da API passou.
- Compilação TypeScript e Vite do frontend passou. Neste ambiente Windows, o bundle foi gerado com `vite build --configLoader native` para contornar restrição de leitura do sandbox ao carregar a configuração.
- O teste de falha de banco produz um erro esperado no log do servidor.

Não foi realizado teste contra o MarthiDB real, nem execução das migrations no Discloud. Não houve implantação ou alteração de dados de produção.

## Pendências para garantir que tudo seja salvo no MarthiDB

O frontend ainda possui módulos com gravação local (por exemplo, ordens de serviço, fiscal, e-commerce e operações auxiliares). Várias dessas rotas dependem do backend Nest externo e não estão implementadas neste repositório. O caminho obrigatório é mapear cada mutação para uma API persistente, migrar os dados locais existentes com identificação do tenant e remover respostas de sucesso quando a API não gravar.

O fluxo de ativação de pagamento existente também precisa de teste PostgreSQL e transação única para cliente, loja, licença e vínculo de usuário. Há diferenças entre nomes de colunas esperados por rotas antigas e o schema inicial. A migração 0021 e os testes PGlite verificam as diferenças do fluxo de venda externa. Outros módulos ainda exigem análise.

Não habilite esta proposta diretamente em produção sem essas verificações. A validação de assinatura segue [as opções oficiais do jose](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md).

## Venda externa, e-mails e proteção da empresa

A migração 0021 adiciona os campos ausentes no catálogo e nas vendas, compatibiliza as referências de estoque e venda, impede troca de proprietário de registros e valida referências de clientes, vendedores, fornecedores e financeiro contra a loja. Não corrige dados históricos nem reatribui empresas automaticamente.

A venda é transacional, usa o usuário da sessão, valida os vínculos, agrega quantidades repetidas e suporta requestId para repetição segura. Parcelas são recebíveis pendentes, sem entrada no livro caixa antes do recebimento. Cancelamento estorna somente a receita registrada e recusa troca já movimentada.

O formulário usa a loja ativa e os dados da API; o comprovante é consultado após a gravação. Foram removidos nomes fixos de empresa, vendedor e recolhedor e a chave fixa de WhatsApp. E-mails usam tabelas HTML válidas, fundo claro, cores explícitas e dados escapados. Falha SMTP não é sucesso simulado.

Verificação do Discloud em 03/10/2026: aplicação marthi-totem e MarthiDB online; banco PostgreSQL 17 privado, porta 5432, cluster NOVA. A aplicação tem DATABASE_URL e configuração SMTP. JWT_SECRET não apareceu nas variáveis da aplicação; o responsável confirmou que está no arquivo .env. O valor não foi acessado. O console encerrou a sessão com “Erro ao verificar o status do container”; não foi possível concluir a auditoria SQL dos registros reais. Nenhuma migração ou implantação foi executada na produção.
