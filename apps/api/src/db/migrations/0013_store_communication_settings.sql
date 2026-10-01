-- 0013: Configurações de comunicação da empresa (WhatsApp Evolution & E-mail SMTP)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Popula valores padrão na matriz Cell Ponto (STR-DEMO-01) para iniciar ativa
UPDATE stores
SET whatsapp_settings = CASE
      WHEN whatsapp_settings IS NULL OR whatsapp_settings = '{}'::jsonb THEN
        '{
          "enabled": true,
          "baseUrl": "https://marthi-tec.discloud.app",
          "instance": "marthi",
          "apiKey": "5E280C9D-239A-4D8B-A765-63D00C291331",
          "storeNumber": "5524981244253",
          "notifyCustomer": true,
          "locationLabel": "Cell Ponto Três Rios"
        }'::jsonb
      ELSE whatsapp_settings
    END,
    smtp_settings = CASE
      WHEN smtp_settings IS NULL OR smtp_settings = '{}'::jsonb THEN
        '{
          "enabled": true,
          "host": "smtp.gmail.com",
          "port": 465,
          "secure": true,
          "user": "matheusmarcal.mma@gmail.com",
          "from": "Cell Ponto <matheusmarcal.mma@gmail.com>"
        }'::jsonb
      ELSE smtp_settings
    END
WHERE id = 'STR-DEMO-01' OR is_matrix = true;
