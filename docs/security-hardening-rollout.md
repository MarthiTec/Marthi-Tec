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

- `npm run test:security`: 15 testes passam com banco simulado, sem usar credenciais de produção.
- Compilação TypeScript da API passou.
- Compilação TypeScript e Vite do frontend passou. Neste ambiente Windows, o bundle foi gerado com `vite build --configLoader native` para contornar restrição de leitura do sandbox ao carregar a configuração.
- O teste de falha de banco produz um erro esperado no log do servidor.

Não foi realizado teste contra o MarthiDB real, nem execução das migrations no Discloud. Não houve implantação ou alteração de dados de produção.

## Pendências para garantir que tudo seja salvo no MarthiDB

O frontend ainda possui módulos com gravação local (por exemplo, ordens de serviço, fiscal, e-commerce e operações auxiliares). Várias dessas rotas dependem do backend Nest externo e não estão implementadas neste repositório. O caminho obrigatório é mapear cada mutação para uma API persistente, migrar os dados locais existentes com identificação do tenant e remover respostas de sucesso quando a API não gravar.

O fluxo de ativação de pagamento existente também precisa de teste PostgreSQL e transação única para cliente, loja, licença e vínculo de usuário. Há diferenças entre nomes de colunas esperados por rotas antigas e o schema inicial. Os testes com banco simulado não verificam essas diferenças.

Não habilite esta proposta diretamente em produção sem essas verificações. A validação de assinatura segue [as opções oficiais do jose](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md).
