CREATE TABLE IF NOT EXISTS segment_attribute_templates (
 segment TEXT NOT NULL, template_key TEXT NOT NULL, name TEXT NOT NULL,
 values JSONB NOT NULL, filter_on_totem BOOLEAN NOT NULL DEFAULT false,
 sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(segment,template_key)
);
INSERT INTO segment_attribute_templates(segment,template_key,name,values,filter_on_totem,sort) VALUES
 ('assistencia_tecnica','color','Cor','["Preto","Branco","Azul","Prateado","Cinza","Dourado","Rosa","Verde","Roxo","Titânio natural"]',true,1),
 ('assistencia_tecnica','capacity','Capacidade','["32GB","64GB","128GB","256GB","512GB","1TB","2TB"]',true,2),
 ('assistencia_tecnica','pickup','Tipo de Retirada','["Em mão","Por encomenda"]',false,3)
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS store_attribute_provisioning (
 store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 segment TEXT NOT NULL, template_key TEXT NOT NULL,
 provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(store_id,segment,template_key)
);
ALTER TABLE product_attributes ADD COLUMN IF NOT EXISTS use_on_pdv BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_attributes ADD COLUMN IF NOT EXISTS use_on_external_sale BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]';
-- Templates are copied once into independently editable store records.
CREATE OR REPLACE FUNCTION provision_store_attributes(target_store TEXT,target_segment TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE template RECORD; attr_id TEXT; claimed INTEGER;
BEGIN
 PERFORM id FROM stores WHERE id=target_store FOR UPDATE;
 FOR template IN SELECT * FROM segment_attribute_templates WHERE segment=target_segment ORDER BY sort LOOP
  INSERT INTO store_attribute_provisioning(store_id,segment,template_key)
   VALUES(target_store,target_segment,template.template_key) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed=0 THEN CONTINUE; END IF;
  SELECT id INTO attr_id FROM product_attributes WHERE store_id=target_store
   AND lower(trim(name))=lower(template.name) ORDER BY id LIMIT 1;
  IF attr_id IS NOT NULL THEN CONTINUE; END IF;
  attr_id := 'ATTR-' || md5(target_store || ':' || target_segment || ':' || template.template_key);
  INSERT INTO product_attributes(id,store_id,name,use_on_totem,filter_on_totem,use_on_stock,use_on_pdv,use_on_external_sale,sort,active)
   VALUES(attr_id,target_store,template.name,true,template.filter_on_totem,true,true,true,template.sort,true);
  INSERT INTO product_attribute_values(id,attribute_id,value,price_delta,sort)
   SELECT 'ATV-' || md5(attr_id || ':' || value),attr_id,value,0,ordinality::integer
    FROM jsonb_array_elements_text(template.values) WITH ORDINALITY;
 END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION provision_store_segment_attributes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM provision_store_attributes(NEW.id,NEW.segment);
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS store_segment_attributes ON stores;
CREATE TRIGGER store_segment_attributes AFTER INSERT OR UPDATE OF segment ON stores
 FOR EACH ROW EXECUTE FUNCTION provision_store_segment_attributes();
SELECT provision_store_attributes(id,segment) FROM stores;
