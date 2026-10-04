ALTER TABLE stores ADD COLUMN IF NOT EXISTS attribute_automation_enabled BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS product_attribute_templates (
 segment TEXT NOT NULL, name TEXT NOT NULL, values JSONB NOT NULL, sort INTEGER NOT NULL,
 PRIMARY KEY(segment,name)
);
INSERT INTO product_attribute_templates(segment,name,values,sort) VALUES
 ('assistencia_tecnica','Cor','["Preto","Branco","Azul","Verde","Roxo","Rosa","Prata","Dourado","Titânio Natural"]',1),
 ('assistencia_tecnica','Capacidade','["32 GB","64 GB","128 GB","256 GB","512 GB","1 TB","2 TB"]',2),
 ('assistencia_tecnica','Tipo de Retirada','["Em mão","Por encomenda"]',3)
ON CONFLICT DO NOTHING;
