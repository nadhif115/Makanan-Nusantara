-- Migrasi 001: staf, stok produk, pembatalan, audit.
-- Aditif: tidak ada kolom atau data lama yang dihapus.
-- BACKUP DULU (mysqldump nusantara_bites > backup.sql), lalu jalankan SEKALI
-- setelah database.sql. Menjalankannya dua kali akan gagal di ALTER TABLE.

USE nusantara_bites;

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('owner','kasir','dapur') NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DOUBLE NOT NULL
) ENGINE=InnoDB;

-- stock NULL = stok tidak dilacak (perilaku lama: selalu bisa dipesan).
ALTER TABLE menu ADD COLUMN stock INT NULL DEFAULT NULL AFTER was;

ALTER TABLE orders
    MODIFY status ENUM('menunggu_bayar','diterima','diproses','siap','selesai','dibatalkan')
        NOT NULL DEFAULT 'menunggu_bayar',
    MODIFY payment_status ENUM('pending','paid','refunded') NOT NULL DEFAULT 'pending',
    ADD COLUMN idem_key VARCHAR(64) NULL,
    ADD COLUMN paid_by INT UNSIGNED NULL,
    ADD COLUMN paid_at DOUBLE NULL,
    ADD COLUMN cancelled_by INT UNSIGNED NULL,
    ADD COLUMN cancelled_at DOUBLE NULL,
    ADD COLUMN cancel_reason VARCHAR(255) NULL,
    ADD UNIQUE KEY uq_orders_idem_key (idem_key);

-- Hanya ditambah, tidak pernah diubah atau dihapus oleh aplikasi.
CREATE TABLE stock_movements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    menu_id VARCHAR(20) NOT NULL,
    delta INT NOT NULL,
    stock_after INT NULL,
    reason ENUM('pesanan','batal','buka_hari','koreksi') NOT NULL,
    order_id VARCHAR(40) NULL,
    user_id INT UNSIGNED NULL,
    note VARCHAR(255) NULL,
    created_at DOUBLE NOT NULL,
    INDEX idx_movements_menu (menu_id, created_at),
    FOREIGN KEY (menu_id) REFERENCES menu(id)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action VARCHAR(40) NOT NULL,
    order_id VARCHAR(40) NULL,
    detail JSON NULL,
    created_at DOUBLE NOT NULL,
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;
