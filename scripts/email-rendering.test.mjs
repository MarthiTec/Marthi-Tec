import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
process.env.JWT_SECRET='test-only-secret-'.repeat(4);
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
process.env.SMTP_HOST='smtp.example.com';process.env.SMTP_USER='preview';process.env.SMTP_PASS='preview';
process.env.INTERNAL_NOTIFICATION_EMAIL='team@example.com';
process.env.FRONTEND_URL='https://app.example.com';
const captured=[];
nodemailer.createTransport=(config)=>{assert.equal(config.tls.rejectUnauthorized,true);return {sendMail:async(mail)=>{captured.push(mail);return {messageId:'preview-only'};}};};
const {pool}=await import('../dist/db/pool.js');pool.query=async()=>({rows:[]});
const email=await import('../dist/services/emailService.js');
test('customer and internal mail use readable valid table layout and escape user HTML',async()=>{
 await email.sendWelcomeEmail({toEmail:'preview@example.com',contactName:'<script>test</script>',companyName:'Loja de validação',planName:'Golden',activationToken:'preview-only'});
 await email.sendInternalNotificationEmail({companyName:'Loja de validação',contactName:'Responsável',email:'preview@example.com',phone:'',planName:'Golden',paymentMethod:'Pix',paymentStatus:'Confirmado',contractedAt:new Date().toISOString(),clientId:'preview'});
 await email.sendPasswordResetEmail({toEmail:'preview@example.com',userName:'Administrador Marthi',resetToken:'preview-only'});
 await email.sendSignupReceivedEmail({toEmail:'preview@example.com',contactName:'Responsável',companyName:'Loja',planName:'Silver',paymentMethod:'Pix',protocol:'preview-only'});
 assert.equal(captured.length,4);
 for(const mail of captured){assert.ok(mail.html.includes('bgcolor="#ffffff"'));assert.ok(!mail.html.includes('#0b0f14'));assert.ok(!mail.html.includes('data:image'));assert.ok(mail.html.includes('<table role="presentation"'));assert.ok(!mail.html.includes('<script>'));assert.ok(Buffer.byteLength(mail.html,'utf8')<30_000);assert.ok(mail.text.length>0);}
 assert.ok(captured[0].html.includes('&lt;script&gt;'));
 if(process.env.EMAIL_PREVIEW_DIR){fs.mkdirSync(process.env.EMAIL_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.EMAIL_PREVIEW_DIR+'/email-cliente.html',captured[0].html);fs.writeFileSync(process.env.EMAIL_PREVIEW_DIR+'/email-interno.html',captured[1].html);fs.writeFileSync(process.env.EMAIL_PREVIEW_DIR+'/email-recuperacao.html',captured[2].html);}
 await pool.end();
});
