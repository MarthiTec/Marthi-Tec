-- Chave Pix oficial de recebimento da Marthi (assinaturas / faturamento lojista).
-- Ops pode alterar em /admin/recebimentos; este seed só preenche se a chave estiver vazia
-- ou ainda for o placeholder antigo. Não sobrescreve chave customizada já validada.

DO $$
DECLARE
  actor_id TEXT;
  current_key TEXT;
BEGIN
  SELECT id INTO actor_id
  FROM users
  WHERE lower(email) IN ('marthi.tecnologia@gmail.com', 'teste@marthi.com.br')
     OR global_role = 'superadmin'
  ORDER BY CASE WHEN lower(email) = 'marthi.tecnologia@gmail.com' THEN 0 ELSE 1 END
  LIMIT 1;

  IF actor_id IS NULL THEN
    RAISE NOTICE '0112_platform_payout_pix_marthi: nenhum usuário para updated_by; pulando seed.';
    RETURN;
  END IF;

  SELECT NULLIF(trim(pix->>'keyValue'), '') INTO current_key
  FROM platform_payout_settings
  WHERE id = 'platform';

  IF current_key IS NOT NULL
     AND lower(current_key) <> 'marthi.tecnologia@gmail.com'
     AND current_key NOT ILIKE '%example%'
     AND current_key NOT ILIKE '%placeholder%' THEN
    RAISE NOTICE '0112_platform_payout_pix_marthi: chave Pix customizada presente (%); mantida.', current_key;
    RETURN;
  END IF;

  INSERT INTO platform_payout_settings (id, bank_account, pix, updated_by, updated_at)
  VALUES (
    'platform',
    '{}'::jsonb,
    jsonb_build_object(
      'keyType', 'email',
      'keyValue', 'marthi.tecnologia@gmail.com',
      'receiverName', 'Marthi Tecnologia',
      'isValidated', false,
      'updatedAt', now()::text,
      'updatedBy', 'migration:0112'
    ),
    actor_id,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    pix = CASE
      WHEN NULLIF(trim(platform_payout_settings.pix->>'keyValue'), '') IS NULL
        OR lower(trim(platform_payout_settings.pix->>'keyValue')) = 'marthi.tecnologia@gmail.com'
        OR platform_payout_settings.pix->>'keyValue' ILIKE '%example%'
        OR platform_payout_settings.pix->>'keyValue' ILIKE '%placeholder%'
      THEN EXCLUDED.pix
      ELSE platform_payout_settings.pix
    END,
    updated_by = CASE
      WHEN NULLIF(trim(platform_payout_settings.pix->>'keyValue'), '') IS NULL
        OR lower(trim(platform_payout_settings.pix->>'keyValue')) = 'marthi.tecnologia@gmail.com'
        OR platform_payout_settings.pix->>'keyValue' ILIKE '%example%'
        OR platform_payout_settings.pix->>'keyValue' ILIKE '%placeholder%'
      THEN EXCLUDED.updated_by
      ELSE platform_payout_settings.updated_by
    END,
    updated_at = CASE
      WHEN NULLIF(trim(platform_payout_settings.pix->>'keyValue'), '') IS NULL
        OR lower(trim(platform_payout_settings.pix->>'keyValue')) = 'marthi.tecnologia@gmail.com'
        OR platform_payout_settings.pix->>'keyValue' ILIKE '%example%'
        OR platform_payout_settings.pix->>'keyValue' ILIKE '%placeholder%'
      THEN now()
      ELSE platform_payout_settings.updated_at
    END;
END $$;
