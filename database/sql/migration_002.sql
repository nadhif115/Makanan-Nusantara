-- Migrasi 002: kolom foto produk.
-- Aman dijalankan berulang (hanya menambah kolom bila belum ada) dan tidak mengubah data menu lama.
-- Backup dulu: mysqldump nusantara_bites > backup.sql

USE nusantara_bites;

SET @has_photo = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu' AND COLUMN_NAME = 'photo'
);
SET @ddl = IF(@has_photo = 0,
    'ALTER TABLE menu ADD COLUMN photo VARCHAR(255) NULL DEFAULT NULL AFTER was',
    'SELECT ''kolom photo sudah ada'' AS info');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
