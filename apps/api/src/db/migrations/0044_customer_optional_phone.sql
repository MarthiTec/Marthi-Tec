-- Unknown phone numbers must not become a fabricated shared customer identifier.
ALTER TABLE customers ALTER COLUMN phone_digits DROP NOT NULL;
UPDATE customers SET phone_digits=NULL WHERE trim(phone)='' AND phone_digits IN ('','0000000000');
