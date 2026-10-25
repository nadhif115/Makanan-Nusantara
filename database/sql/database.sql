-- =========================================================
-- Nusantara Bites — MySQL / MariaDB Database
-- Import file ini lewat phpMyAdmin
-- =========================================================

CREATE DATABASE IF NOT EXISTS nusantara_bites
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nusantara_bites;

CREATE TABLE IF NOT EXISTS menu (
    id VARCHAR(20) PRIMARY KEY,
    cat VARCHAR(30) NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255) NOT NULL,
    price INT UNSIGNED NOT NULL,
    was INT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(40) PRIMARY KEY,
    queue INT UNSIGNED NOT NULL,
    table_no VARCHAR(30) NOT NULL DEFAULT '-',
    items JSON NOT NULL,
    total INT UNSIGNED NOT NULL,
    method ENUM('cash','dana') NOT NULL DEFAULT 'cash',
    payment_status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    status ENUM('menunggu_bayar','diterima','diproses','siap','selesai')
        NOT NULL DEFAULT 'menunggu_bayar',
    created_at DOUBLE NOT NULL,
    INDEX idx_orders_queue (queue),
    INDEX idx_orders_status (status),
    INDEX idx_orders_payment_status (payment_status),
    INDEX idx_orders_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS counters (
    name VARCHAR(50) PRIMARY KEY,
    value INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO counters (name, value)
VALUES ('queue', 0)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO menu
(id, cat, emoji, name, description, price, was, is_active, sort_order)
VALUES
('m1','Makanan','🍖','Rendang Daging Sapi','Sumatra Barat · empuk, bumbu meresap',28000,NULL,1,1),
('m2','Makanan','🍜','Mie Aceh Goreng','Aceh · pedas rempah, daging sapi',24000,NULL,1,2),
('m3','Makanan','🍲','Coto Makassar','Sulawesi Selatan · kuah kacang gurih',25000,NULL,1,3),
('m4','Makanan','🍗','Ayam Taliwang','Lombok · bakar pedas khas NTB',27000,NULL,1,4),
('m5','Makanan','🍢','Sate Lilit Bali','Bali · ikan, kelapa, rempah khas',23000,NULL,1,5),
('m6','Makanan','🐟','Ikan Kuah Kuning Papeda','Papua & Maluku · segar, kuah asam',29000,NULL,1,6),
('d1','Minuman','🍧','Es Pisang Ijo','Makassar · pisang, santan, sirup merah',12000,NULL,1,7),
('d2','Minuman','🥥','Es Kelapa Muda','Segar, gula aren asli',10000,NULL,1,8),
('d3','Minuman','🫚','Sarabba','Makassar · jahe hangat, santan, rempah',9000,NULL,1,9),
('d4','Minuman','🥒','Es Timun Serut','Aceh · seger, manis, wangi jeruk nipis',8000,NULL,1,10),
('d5','Minuman','☕','Kopi Rarobang','Maluku · kopi rempah khas',10000,NULL,1,11),
('p1','Promo','🎉','Paket Rendang Combo','Rendang Daging Sapi + Es Kelapa Muda',35000,38000,1,12),
('p2','Promo','🎉','Paket Timur Hemat','Mie Aceh Goreng + Es Timun Serut',29000,32000,1,13)
ON DUPLICATE KEY UPDATE
    cat = VALUES(cat),
    emoji = VALUES(emoji),
    name = VALUES(name),
    description = VALUES(description),
    price = VALUES(price),
    was = VALUES(was),
    is_active = VALUES(is_active),
    sort_order = VALUES(sort_order);
