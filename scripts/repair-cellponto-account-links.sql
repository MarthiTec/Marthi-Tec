-- One-time, reviewed incident repair; never a startup migration.
-- Run inside BEGIN/COMMIT after preserving the affected non-secret rows.
LOCK TABLE stores,users,user_stores,store_licenses IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM client_accounts WHERE id='PRT-MUM5YWBG8DSR' AND regexp_replace(document,'[^0-9]','','g')='38297104000182') THEN RAISE EXCEPTION 'Real account identity could not be confirmed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM stores WHERE id='STR-CELL-PONTO' AND client_account_id IN ('ACC-MARTHI-DEMO','PRT-MUM5YWBG8DSR')) THEN RAISE EXCEPTION 'Unexpected Cell Ponto ownership'; END IF;
END $$;
ALTER TABLE stores DISABLE TRIGGER marthi_guard_account_owner;
ALTER TABLE users DISABLE TRIGGER marthi_guard_account_owner;
UPDATE stores SET client_account_id='PRT-MUM5YWBG8DSR',updated_at=now() WHERE id='STR-CELL-PONTO';
UPDATE users SET client_account_id='PRT-MUM5YWBG8DSR',session_version=session_version+1,updated_at=now()
WHERE lower(email) IN ('marianaveigatav@gmail.com','gilvanteodo@gmail.com','marinaveigatav@gmail.com')
AND client_account_id IN ('ACC-MARTHI-DEMO','PRT-MUM5YWBG8DSR');
ALTER TABLE stores ENABLE TRIGGER marthi_guard_account_owner;
ALTER TABLE users ENABLE TRIGGER marthi_guard_account_owner;
-- Remove only cross-account memberships; preserve legitimate identities and passwords.
DELETE FROM user_stores us USING users u,stores s WHERE us.user_id=u.id AND us.store_id=s.id
AND u.client_account_id IS DISTINCT FROM s.client_account_id
AND (s.id='STR-CELL-PONTO' OR lower(u.email) IN ('marianaveigatav@gmail.com','gilvanteodo@gmail.com','marinaveigatav@gmail.com'));
UPDATE user_stores us SET is_default=false FROM users u WHERE us.user_id=u.id
AND lower(u.email) IN ('marianaveigatav@gmail.com','gilvanteodo@gmail.com','marinaveigatav@gmail.com');
INSERT INTO user_stores(id,user_id,store_id,role,is_default)
SELECT 'RECOVER-CP-'||md5(u.id),u.id,'STR-CELL-PONTO','admin',true FROM users u
WHERE lower(u.email) IN ('marianaveigatav@gmail.com','gilvanteodo@gmail.com','marinaveigatav@gmail.com') AND u.client_account_id='PRT-MUM5YWBG8DSR'
ON CONFLICT(user_id,store_id) DO UPDATE SET is_default=true;
UPDATE store_licenses SET client_account_id='PRT-MUM5YWBG8DSR',updated_at=now() WHERE store_id='STR-CELL-PONTO';
-- Restore the demo account display from its existing demonstration store, without invented contact data.
UPDATE client_accounts a SET trade_name=s.trade_name,legal_name=s.legal_name,updated_at=now()
FROM stores s WHERE a.id='ACC-MARTHI-DEMO' AND s.id='STR-DEMO-01' AND s.client_account_id=a.id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM user_stores us JOIN users u ON u.id=us.user_id JOIN stores s ON s.id=us.store_id WHERE s.id='STR-CELL-PONTO' AND u.client_account_id IS DISTINCT FROM s.client_account_id) THEN RAISE EXCEPTION 'Cross-account membership remains'; END IF;
 IF (SELECT count(*) FROM user_stores us JOIN users u ON u.id=us.user_id WHERE us.store_id='STR-CELL-PONTO' AND us.is_default AND lower(u.email) IN ('marianaveigatav@gmail.com','gilvanteodo@gmail.com','marinaveigatav@gmail.com'))<>3 THEN RAISE EXCEPTION 'Expected operators missing'; END IF;
END $$;
