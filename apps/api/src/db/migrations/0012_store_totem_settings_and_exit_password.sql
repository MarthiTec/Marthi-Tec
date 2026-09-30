-- 0012: Persistência das configurações do totem e senha de saída por empresa/loja (stores)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS totem_exit_password TEXT NOT NULL DEFAULT '1234';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS totem_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Popula configurações padrão na loja matriz ou Cell Ponto se totem_settings estiver vazio
UPDATE stores
SET totem_exit_password = COALESCE(NULLIF(totem_exit_password, ''), '1234'),
    totem_settings = CASE 
      WHEN totem_settings IS NULL OR totem_settings = '{}'::jsonb THEN
        '{
          "mode": "kiosk",
          "vertical": "phones",
          "columns": 2,
          "showAttractScreen": true,
          "showActionButtons": true,
          "customGreetingText": "",
          "customSubtitleText": "",
          "storeName": "Cell Ponto",
          "storeLogo": null,
          "attractBackground": null,
          "attractGradientColor": "#0f766e",
          "attractLayout": "standard",
          "keyboardPlacement": "bottom",
          "askCustomerName": false,
          "offerFulfillment": true,
          "printTicket": false,
          "audioAssist": false,
          "storeWhatsApp": "5524981244253",
          "notifyCustomerOnLead": false,
          "locationLabel": "Cell Ponto Três Rios",
          "cardFeePercent": 12.0
        }'::jsonb
      ELSE totem_settings
    END
WHERE id = 'STR-DEMO-01' OR is_matrix = true;
