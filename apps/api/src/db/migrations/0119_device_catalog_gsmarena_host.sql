-- O fornecedor DeviceSpecs publica a API na RapidAPI como "GSMArenaParser"
-- (host gsmarenaparser.p.rapidapi.com); a listagem antiga "deviceultraparser" saiu do marketplace.
-- As rotas são as mesmas (/api/values/clean/getspecs/{marca}/{modelo}).
UPDATE device_catalog_providers
   SET base_url = 'https://gsmarenaparser.p.rapidapi.com/api/values',
       docs_url = 'https://rapidapi.com/controller2042000/api/gsmarenaparser'
 WHERE id = 'devicespecs' AND base_url LIKE '%deviceultraparser.p.rapidapi.com%';
