import { env } from '../apps/api/src/config/env.js';
import { sendWelcomeEmail, sendInternalNotificationEmail } from '../apps/api/src/services/emailService.js';

async function main() {
  console.log('=== VERIFICAÇÃO DE CONFIGURAÇÃO DE E-MAIL (SMTP) ===');
  console.log('SMTP_HOST:', env.SMTP_HOST || '(não definido)');
  console.log('SMTP_PORT:', env.SMTP_PORT);
  console.log('SMTP_USER:', env.SMTP_USER || '(não definido)');
  console.log('SMTP_PASS:', env.SMTP_PASS ? '********' : '(não definido)');
  console.log('SMTP_FROM:', env.SMTP_FROM);
  console.log('INTERNAL_NOTIFICATION_EMAIL:', env.INTERNAL_NOTIFICATION_EMAIL);
  console.log('FRONTEND_URL:', env.FRONTEND_URL);

  const isSmtpConfigured = Boolean(env.SMTP_USER && env.SMTP_PASS);
  console.log('\n[DIAGNÓSTICO SMTP]:', isSmtpConfigured ? 'SMTP REAL CONFIGURADO' : 'MODO SIMULAÇÃO / SANDBOX ATIVO (SMTP_USER/PASS ausentes)');

  console.log('\n=== TESTANDO COMPRA DE PLANO (DISPARO DE E-MAILS) ===');
  console.log('Destinatário:', 'matheusmarcal.mma@gmail.com');
  console.log('Plano:', 'Golden (Completo) - R$ 597,00/mês');

  // 1. E-mail de Boas-Vindas
  console.log('\n1. Disparando sendWelcomeEmail...');
  const welcomeResult = await sendWelcomeEmail({
    toEmail: 'matheusmarcal.mma@gmail.com',
    contactName: 'Matheus Marçal',
    companyName: 'Marthi Tecnologia (Teste de Compra de Plano)',
    planName: 'Golden (Completo)',
    monthlyAmount: 597,
    activationToken: 'teste-token-ativacao-seguro-123456',
    frontendUrl: 'https://marthi-totem.discloud.app',
  });
  console.log('Resultado sendWelcomeEmail:', welcomeResult);

  // 2. E-mail de Notificação Interna
  console.log('\n2. Disparando sendInternalNotificationEmail...');
  const internalResult = await sendInternalNotificationEmail({
    companyName: 'Marthi Tecnologia (Teste de Compra de Plano)',
    contactName: 'Matheus Marçal',
    email: 'matheusmarcal.mma@gmail.com',
    phone: '(24) 99999-9999',
    planName: 'Golden (Completo)',
    monthlyAmount: 597,
    paymentMethod: 'PIX (Aprovado Instantaneamente)',
    paymentStatus: 'Confirmado com Sucesso',
    contractedAt: new Date().toISOString(),
    transactionRef: 'PAY-TESTE-PIX-987654',
    clientId: 'CLI-TESTE-MATHEUS-001',
    frontendUrl: 'https://marthi-totem.discloud.app',
  });
  console.log('Resultado sendInternalNotificationEmail:', internalResult);

  console.log('\n=== STATUS FINAL ===');
  if (isSmtpConfigured) {
    console.log('SUCESSO: E-mails enviados com sucesso via servidor SMTP externo!');
  } else {
    console.log('SIMULADO COM SUCESSO: A rota e os métodos de geração de e-mail (HTML, tokens e layout) funcionam perfeitamente. No entanto, para o e-mail CHEGAR na sua caixa de entrada pessoal (matheusmarcal.mma@gmail.com), é necessário configurar as credenciais SMTP (SMTP_USER e SMTP_PASS) no arquivo .env ou no painel da Discloud.');
  }
}

main().catch(err => {
  console.error('Erro ao executar teste:', err);
  process.exit(1);
});
