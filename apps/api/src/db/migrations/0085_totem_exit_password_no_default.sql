-- Sem senha padrão de saída do totem: cada loja define a sua (as lojas existentes mantêm a que já têm).
ALTER TABLE stores ALTER COLUMN totem_exit_password DROP DEFAULT;
