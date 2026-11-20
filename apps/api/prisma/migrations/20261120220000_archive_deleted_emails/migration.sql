-- Libera los correos de los usuarios desactivados anteriormente.
-- La fila se conserva (no hay borrado físico) y su correo queda archivado de forma reversible.
UPDATE "User"
SET "email" = 'archived+' || "id"::text || '+' || "email"
WHERE "deletedAt" IS NOT NULL
  AND "email" NOT LIKE 'archived+%';
