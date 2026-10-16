-- Sistema que abre quando o usuário entra (PDV, OS, Retaguarda...). Vazio = automático pelas áreas liberadas.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS home_area TEXT NOT NULL DEFAULT '';
