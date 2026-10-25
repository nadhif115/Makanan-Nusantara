<?php
/*
 * Nusantara Bites: backend API (PHP + MySQL/MariaDB).
 * Letakkan satu folder dengan index.html. Jalankan database.sql lalu migration_001.sql.
 * Akun staf pertama dibuat lewat CLI: php create_user.php
 */

date_default_timezone_set('Asia/Jakarta');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
// Tanpa header CORS: cookie sesi staf hanya boleh dipakai dari origin yang sama.

/* Config */
$dbHost = '127.0.0.1';
$dbName = 'nusantara_bites';
$dbUser = 'root';
$dbPass = '';

const SESSION_IDLE_SECONDS = 8 * 3600;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_DIR = 'uploads/menu'; // relatif terhadap folder api.php (public/)
const MENU_CATEGORIES = ['Makanan' => 'm', 'Minuman' => 'd', 'Promo' => 'p'];

/* Hak akses per aksi. Aksi yang tidak tercantum bersifat publik (pelanggan). */
const ACCESS = [
    'get_orders'        => ['owner', 'kasir', 'dapur'],
    'advance_order'     => ['owner', 'dapur'],
    'set_payment'       => ['owner', 'kasir'],
    'admin_search'      => ['owner', 'kasir'],
    'cancel_order'      => ['owner', 'kasir'],
    'list_transactions' => ['owner', 'kasir'],
    'list_menu_admin'   => ['owner'],
    'save_menu'         => ['owner'],
    'set_stock'         => ['owner'],
    'stock_movements'   => ['owner'],
    'finance_summary'   => ['owner'],
];

class HttpError extends Exception {
    public function __construct(string $message, public int $status = 400) {
        parent::__construct($message);
    }
}

try {
    $pdo = new PDO(
        "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4",
        $dbUser,
        $dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Gagal konek database. Cek host, nama database, username, password, dan PDO MySQL.']);
    exit;
}

/* Helpers */

function jsonResponse($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400): never {
    throw new HttpError($message, $status);
}

function readJsonBody(): array {
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function inTransaction(PDO $pdo, callable $work) {
    $pdo->beginTransaction();
    try {
        $result = $work();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function nowMs(): float {
    return microtime(true) * 1000;
}

function mapOrderRow(?array $row): ?array {
    if (!$row) return null;
    return [
        'id'            => $row['id'],
        'queue'         => (int)$row['queue'],
        'table'         => $row['table_no'],
        'items'         => json_decode($row['items'], true) ?: [],
        'total'         => (int)$row['total'],
        'method'        => $row['method'],
        'paymentStatus' => $row['payment_status'],
        'status'        => $row['status'],
        'createdAt'     => (float)$row['created_at'],
        'cancelReason'  => $row['cancel_reason'] ?? null,
        'paidBy'        => $row['paid_by_name'] ?? null,
        'cancelledBy'   => $row['cancelled_by_name'] ?? null
    ];
}

function fetchOrder(PDO $pdo, string $id): ?array {
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ?");
    $stmt->execute([$id]);
    return mapOrderRow($stmt->fetch() ?: null);
}

function fetchOrderByKey(PDO $pdo, ?string $key): ?array {
    if (!$key) return null;
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE idem_key = ?");
    $stmt->execute([$key]);
    return mapOrderRow($stmt->fetch() ?: null);
}

function logMovement(PDO $pdo, string $menuId, int $delta, ?int $after, string $reason, ?string $orderId, ?int $userId, ?string $note = null): void {
    $pdo->prepare("
        INSERT INTO stock_movements (menu_id, delta, stock_after, reason, order_id, user_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([$menuId, $delta, $after, $reason, $orderId, $userId, $note, nowMs()]);
}

function audit(PDO $pdo, ?int $userId, string $action, ?string $orderId = null, array $detail = []): void {
    $pdo->prepare("INSERT INTO audit_log (user_id, action, order_id, detail, created_at) VALUES (?, ?, ?, ?, ?)")
        ->execute([$userId, $action, $orderId, json_encode($detail, JSON_UNESCAPED_UNICODE), nowMs()]);
}

/* Session and authorization */

function startSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('nb_staff');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Strict',
        'secure'   => !empty($_SERVER['HTTPS'])
    ]);
    session_start();
}

function currentUser(PDO $pdo): ?array {
    startSession();
    $user = $_SESSION['user'] ?? null;
    if (!$user) return null;

    $expired = time() - ($_SESSION['last'] ?? 0) > SESSION_IDLE_SECONDS;
    $stmt = $pdo->prepare("SELECT is_active FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $active = (bool)$stmt->fetchColumn();

    if ($expired || !$active) {
        $_SESSION = [];
        session_destroy();
        return null;
    }
    $_SESSION['last'] = time();
    return $user;
}

function requireRole(PDO $pdo, array $roles): array {
    $user = currentUser($pdo);
    if (!$user) fail('Sesi berakhir. Silakan masuk lagi.', 401);
    if (!in_array($user['role'], $roles, true)) fail('Anda tidak punya akses ke fitur ini.', 403);
    return $user;
}

function requireCsrf(): void {
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $sent)) {
        fail('Token keamanan tidak valid. Muat ulang halaman.', 403);
    }
}

/* Parameter rentang tanggal dari query string (YYYY-MM-DD), dalam milidetik. */
function dateRangeMs(?string $from, ?string $to): array {
    $valid = fn($v) => is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) !== false;
    $start = $valid($from) ? $from : null;
    $end = $valid($to) ? $to : null;
    return [
        $start ? strtotime("$start 00:00:00") * 1000 : null,
        $end ? strtotime("$end 23:59:59") * 1000 + 999 : null,
        $start,
        $end
    ];
}

/* Foto produk */

/* Memvalidasi dan menyimpan foto unggahan. Mengembalikan path relatif untuk kolom menu.photo. */
function storeMenuPhoto(array $file): string {
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        fail('Ukuran foto melebihi batas server. Maksimal 3 MB.', 413);
    }
    if ($error !== UPLOAD_ERR_OK) fail('Foto gagal diunggah. Coba lagi.');
    if (($file['size'] ?? 0) > MAX_PHOTO_BYTES) fail('Ukuran foto maksimal 3 MB.', 413);
    if (!is_uploaded_file($file['tmp_name'])) fail('Berkas unggahan tidak valid.');

    // Tipe ditentukan dari isi file, bukan dari nama atau tipe yang dikirim browser.
    $info = @getimagesize($file['tmp_name']);
    $extensions = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($extensions[$info[2]])) fail('Foto harus berformat JPG, PNG, atau WebP.', 415);
    if ($info[0] > 6000 || $info[1] > 6000) fail('Dimensi foto terlalu besar (maksimal 6000 piksel).');

    $dir = __DIR__ . '/' . PHOTO_DIR;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) fail('Folder foto tidak bisa dibuat.', 500);

    $name = 'menu_' . bin2hex(random_bytes(8)) . '.' . $extensions[$info[2]];
    if (!move_uploaded_file($file['tmp_name'], "$dir/$name")) fail('Foto tidak bisa disimpan di server.', 500);
    return PHOTO_DIR . '/' . $name;
}

/* Hanya menghapus file buatan aplikasi ini dan hanya jika tidak ada menu lain yang memakainya. */
function deleteMenuPhotoIfUnused(PDO $pdo, ?string $path): void {
    if (!$path || !preg_match('#^uploads/menu/menu_[a-f0-9]{16}\.(jpg|png|webp)$#', $path)) return;
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM menu WHERE photo = ?");
    $stmt->execute([$path]);
    if ((int)$stmt->fetchColumn() === 0) @unlink(__DIR__ . '/' . $path);
}

function textLength(string $text): int {
    return (int)preg_match_all('/./us', $text);
}

if (defined('NB_CLI')) return;

/* Router */

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $user = null;
    if (isset(ACCESS[$action])) {
        $user = requireRole($pdo, ACCESS[$action]);
        if ($method !== 'GET') requireCsrf();
    }

    switch ($action) {

        case 'login': {
            $d = readJsonBody();
            $username = trim((string)($d['username'] ?? ''));
            $password = (string)($d['password'] ?? '');

            $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? AND is_active = 1");
            $stmt->execute([$username]);
            $row = $stmt->fetch();

            // Akun tidak ada tetap menjalankan satu operasi hash, agar waktu respons tidak membocorkan nama pengguna.
            $hash = $row['password_hash'] ?? password_hash('dummy', PASSWORD_DEFAULT);
            if (!password_verify($password, $hash) || !$row) {
                usleep(500000);
                audit($pdo, null, 'login_gagal', null, ['username' => substr($username, 0, 50)]);
                fail('Nama pengguna atau kata sandi salah.', 401);
            }

            startSession();
            session_regenerate_id(true);
            $_SESSION['user'] = ['id' => (int)$row['id'], 'username' => $row['username'], 'role' => $row['role']];
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
            $_SESSION['last'] = time();
            audit($pdo, (int)$row['id'], 'login');

            jsonResponse(['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
        }

        case 'me': {
            $user = currentUser($pdo);
            if (!$user) fail('Belum masuk.', 401);
            jsonResponse(['user' => $user, 'csrf' => $_SESSION['csrf']]);
        }

        case 'logout': {
            startSession();
            requireCsrf();
            $_SESSION = [];
            session_destroy();
            jsonResponse(['ok' => true]);
        }

        /* Diagnosa pemasangan. Hanya dari komputer yang sama dengan server; hanya melaporkan nama tabel dan kolom yang kurang. */
        case 'health': {
            if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) fail('Tidak tersedia.', 404);

            $required = [
                'menu' => ['id', 'cat', 'name', 'description', 'price', 'was', 'stock', 'photo', 'is_active', 'sort_order'],
                'orders' => ['id', 'queue', 'table_no', 'items', 'total', 'method', 'payment_status', 'status', 'created_at',
                             'idem_key', 'paid_by', 'paid_at', 'cancelled_by', 'cancelled_at', 'cancel_reason'],
                'counters' => ['name', 'value'],
                'users' => ['id', 'username', 'password_hash', 'role', 'is_active', 'created_at'],
                'stock_movements' => ['menu_id', 'delta', 'stock_after', 'reason', 'order_id', 'user_id', 'note', 'created_at'],
                'audit_log' => ['user_id', 'action', 'order_id', 'detail', 'created_at'],
            ];
            $found = [];
            foreach ($pdo->query("
                SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
            ")->fetchAll() as $row) {
                $found[$row['t']][] = $row['c'];
            }

            $missing = [];
            foreach ($required as $table => $columns) {
                if (!isset($found[$table])) { $missing[] = "tabel $table"; continue; }
                foreach (array_diff($columns, $found[$table]) as $column) $missing[] = "kolom $table.$column";
            }

            $sessionPath = session_save_path() ?: sys_get_temp_dir();
            $staffCount = isset($found['users']) && in_array('username', $found['users'], true)
                ? (int)$pdo->query("SELECT COUNT(*) FROM users WHERE is_active = 1")->fetchColumn() : null;

            jsonResponse([
                'ok' => !$missing && is_writable($sessionPath),
                'missing' => $missing,
                'hint' => $missing ? 'Jalankan database/sql/database.sql, migration_001.sql, lalu migration_002.sql secara berurutan; lewati yang sudah pernah sukses.' : null,
                'sessionFolderWritable' => is_writable($sessionPath),
                'activeStaffAccounts' => $staffCount,
            ]);
        }

        case 'get_menu': {
            $rows = $pdo->query("
                SELECT id, cat, emoji, name, description AS `desc`, price, was, stock, photo
                FROM menu
                WHERE is_active = 1
                ORDER BY sort_order ASC, id ASC
            ")->fetchAll();

            foreach ($rows as &$r) {
                $r['price'] = (int)$r['price'];
                $r['was'] = $r['was'] !== null ? (int)$r['was'] : null;
                $r['stock'] = $r['stock'] !== null ? (int)$r['stock'] : null;
            }
            jsonResponse($rows);
        }

        /*
         * Aturan stok: stok produk yang dilacak dikurangi saat pesanan dibuat (pesanan tunai
         * yang belum dibayar tetap menahan stok), dikembalikan saat pesanan dibatalkan.
         * Semua baris menu dikunci FOR UPDATE dalam satu transaksi, sehingga dua pesanan
         * bersamaan tidak bisa menjual stok yang sama. idempotencyKey mencegah pesanan ganda
         * ketika request diulang.
         */
        case 'create_order': {
            $d = readJsonBody();
            $items = $d['items'] ?? [];
            $table = trim((string)($d['table'] ?? '-'));
            $payMethod = $d['method'] ?? 'cash';
            $key = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($d['idempotencyKey'] ?? ''));
            $key = $key !== '' ? substr($key, 0, 64) : null;

            if (!is_array($items) || !$items) fail('Keranjang kosong');
            if (!in_array($payMethod, ['cash', 'dana'], true)) fail('Metode pembayaran tidak valid');
            if ($payMethod === 'dana') fail('Pembayaran digital belum tersedia');

            if ($existing = fetchOrderByKey($pdo, $key)) jsonResponse($existing);

            $wanted = [];
            foreach ($items as $item) {
                $menuId = (string)($item['id'] ?? '');
                $qty = (int)($item['qty'] ?? 0);
                if ($menuId === '' || $qty < 1 || $qty > 99) fail('Item pesanan tidak valid');
                $wanted[$menuId] = ($wanted[$menuId] ?? 0) + $qty;
                if ($wanted[$menuId] > 99) fail('Item pesanan tidak valid');
            }
            ksort($wanted); // urutan kunci tetap, mencegah deadlock antar pesanan bersamaan

            $id = 'o' . date('YmdHis') . sprintf('%06d', random_int(0, 999999));

            try {
                inTransaction($pdo, function () use ($pdo, $wanted, $id, $table, $payMethod, $key) {
                    $lock = $pdo->prepare("SELECT id, name, price, stock FROM menu WHERE id = ? AND is_active = 1 FOR UPDATE");
                    $lines = [];
                    $total = 0;

                    foreach ($wanted as $menuId => $qty) {
                        $lock->execute([(string)$menuId]);
                        $menu = $lock->fetch();
                        if (!$menu) fail("Menu {$menuId} tidak ditemukan");
                        if ($menu['stock'] !== null && (int)$menu['stock'] < $qty) {
                            fail("Stok {$menu['name']} tidak cukup (sisa " . (int)$menu['stock'] . ")", 409);
                        }
                        $total += (int)$menu['price'] * $qty;
                        $lines[] = ['menu' => $menu, 'qty' => $qty];
                    }

                    $row = $pdo->query("SELECT value FROM counters WHERE name = 'queue' FOR UPDATE")->fetch();
                    $queue = (((int)($row['value'] ?? 0)) % 999) + 1;
                    $pdo->prepare("
                        INSERT INTO counters (name, value) VALUES ('queue', ?)
                        ON DUPLICATE KEY UPDATE value = VALUES(value)
                    ")->execute([$queue]);

                    $clean = array_map(fn($l) => [
                        'id' => $l['menu']['id'], 'name' => $l['menu']['name'],
                        'qty' => $l['qty'], 'price' => (int)$l['menu']['price']
                    ], $lines);

                    $pdo->prepare("
                        INSERT INTO orders
                        (id, queue, table_no, items, total, method, payment_status, status, created_at, idem_key)
                        VALUES (?, ?, ?, ?, ?, ?, 'pending', 'menunggu_bayar', ?, ?)
                    ")->execute([
                        $id, $queue, $table !== '' ? $table : '-',
                        json_encode($clean, JSON_UNESCAPED_UNICODE), $total, $payMethod, nowMs(), $key
                    ]);

                    foreach ($lines as $l) {
                        if ($l['menu']['stock'] === null) continue;
                        $after = (int)$l['menu']['stock'] - $l['qty'];
                        $pdo->prepare("UPDATE menu SET stock = ? WHERE id = ?")->execute([$after, $l['menu']['id']]);
                        logMovement($pdo, $l['menu']['id'], -$l['qty'], $after, 'pesanan', $id, null);
                    }
                });
            } catch (PDOException $e) {
                // Request ganda dengan kunci sama yang berbalapan: kembalikan pesanan pemenang.
                if (($e->errorInfo[1] ?? 0) == 1062 && ($existing = fetchOrderByKey($pdo, $key))) {
                    jsonResponse($existing);
                }
                throw $e;
            }

            jsonResponse(fetchOrder($pdo, $id));
        }

        case 'list_menu_admin': {
            $rows = $pdo->query("
                SELECT id, cat, name, description AS `desc`, price, was, stock, is_active, photo
                FROM menu ORDER BY sort_order ASC, id ASC
            ")->fetchAll();
            foreach ($rows as &$r) {
                $r['price'] = (int)$r['price'];
                $r['was'] = $r['was'] !== null ? (int)$r['was'] : null;
                $r['stock'] = $r['stock'] !== null ? (int)$r['stock'] : null;
                $r['is_active'] = (bool)$r['is_active'];
            }
            jsonResponse($rows);
        }

        /*
         * Tambah atau ubah produk (multipart/form-data). Produk tidak pernah dihapus permanen
         * karena pesanan dan riwayat stok merujuk ke id menu; gunakan is_active untuk menyembunyikan.
         * Foto baru disimpan dulu, file lama dihapus hanya setelah database berhasil diperbarui.
         */
        case 'save_menu': {
            if (!$_POST && !$_FILES && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
                fail('Ukuran unggahan melebihi batas server. Perkecil foto.', 413);
            }

            $id = trim((string)($_POST['id'] ?? ''));
            $cat = (string)($_POST['cat'] ?? '');
            $name = trim((string)($_POST['name'] ?? ''));
            $desc = trim((string)($_POST['desc'] ?? ''));
            $priceRaw = trim((string)($_POST['price'] ?? ''));
            $wasRaw = trim((string)($_POST['was'] ?? ''));
            $active = !empty($_POST['is_active']) ? 1 : 0;
            $removePhoto = !empty($_POST['remove_photo']);

            if (!isset(MENU_CATEGORIES[$cat])) fail('Kategori tidak valid.');
            if ($name === '' || textLength($name) > 150) fail('Nama produk wajib diisi (maksimal 150 karakter).');
            if (textLength($desc) > 255) fail('Deskripsi maksimal 255 karakter.');
            if (!ctype_digit($priceRaw) || (int)$priceRaw < 1 || (int)$priceRaw > 10000000) {
                fail('Harga harus bilangan bulat antara 1 dan 10.000.000.');
            }
            $price = (int)$priceRaw;
            $was = null;
            if ($wasRaw !== '') {
                if (!ctype_digit($wasRaw) || (int)$wasRaw <= $price) fail('Harga coret harus lebih besar dari harga jual.');
                $was = (int)$wasRaw;
            }

            $hasFile = isset($_FILES['photo']) && ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
            $newPhoto = $hasFile ? storeMenuPhoto($_FILES['photo']) : null;
            $oldPhoto = null;

            try {
                $savedId = inTransaction($pdo, function () use ($pdo, $id, $cat, $name, $desc, $price, $was, $active, $removePhoto, $newPhoto, &$oldPhoto, $user) {
                    if ($id === '') {
                        $prefix = MENU_CATEGORIES[$cat];
                        $stmt = $pdo->prepare("SELECT id FROM menu WHERE id REGEXP ? FOR UPDATE");
                        $stmt->execute(['^' . $prefix . '[0-9]+$']);
                        $max = 0;
                        foreach ($stmt->fetchAll() as $row) $max = max($max, (int)substr($row['id'], 1));
                        $newId = $prefix . ($max + 1);
                        $order = (int)$pdo->query("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM menu")->fetchColumn();

                        $pdo->prepare("
                            INSERT INTO menu (id, cat, emoji, name, description, price, was, is_active, sort_order, photo)
                            VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)
                        ")->execute([$newId, $cat, $name, $desc, $price, $was, $active, $order, $newPhoto]);
                        audit($pdo, $user['id'], 'menu_dibuat', null, ['menu' => $newId, 'foto' => (bool)$newPhoto]);
                        return $newId;
                    }

                    $stmt = $pdo->prepare("SELECT photo FROM menu WHERE id = ? FOR UPDATE");
                    $stmt->execute([$id]);
                    $row = $stmt->fetch() ?: fail('Produk tidak ditemukan', 404);
                    $oldPhoto = $row['photo'];

                    $photo = $newPhoto ?? ($removePhoto ? null : $oldPhoto);
                    $pdo->prepare("
                        UPDATE menu SET cat = ?, name = ?, description = ?, price = ?, was = ?, is_active = ?, photo = ?
                        WHERE id = ?
                    ")->execute([$cat, $name, $desc, $price, $was, $active, $photo, $id]);
                    audit($pdo, $user['id'], 'menu_diubah', null, ['menu' => $id, 'foto_diganti' => $photo !== $oldPhoto]);
                    return $id;
                });
            } catch (Throwable $e) {
                if ($newPhoto) @unlink(__DIR__ . '/' . $newPhoto); // transaksi gagal: jangan tinggalkan file yatim
                throw $e;
            }

            if ($oldPhoto && ($newPhoto || $removePhoto)) deleteMenuPhotoIfUnused($pdo, $oldPhoto);

            $stmt = $pdo->prepare("SELECT id, cat, name, description AS `desc`, price, was, is_active, photo FROM menu WHERE id = ?");
            $stmt->execute([$savedId]);
            $saved = $stmt->fetch();
            $saved['is_active'] = (bool)$saved['is_active'];
            jsonResponse($saved);
        }

        case 'get_order': {
            $id = trim((string)($_GET['id'] ?? ''));
            jsonResponse($id === '' ? null : fetchOrder($pdo, $id));
        }

        /* Hanya nomor antrean pesanan siap, tanpa data lain: untuk layar ruang tunggu. */
        case 'get_ready_queue': {
            $rows = $pdo->query("SELECT queue FROM orders WHERE status = 'siap' ORDER BY created_at ASC")->fetchAll();
            jsonResponse(array_map(fn($r) => ['queue' => (int)$r['queue']], $rows));
        }

        case 'get_orders': {
            $rows = $pdo->query("SELECT * FROM orders WHERE status <> 'dibatalkan' ORDER BY created_at ASC")->fetchAll();
            jsonResponse(array_map('mapOrderRow', $rows));
        }

        case 'advance_order': {
            $id = trim((string)(readJsonBody()['id'] ?? ''));
            if ($id === '') fail('ID pesanan kosong');

            $existing = fetchOrder($pdo, $id) ?? fail('Pesanan tidak ditemukan', 404);
            $flow = ['diterima', 'diproses', 'siap', 'selesai'];
            $idx = array_search($existing['status'], $flow, true);

            if ($idx !== false && $idx < count($flow) - 1) {
                // Update bersyarat: klik ganda tidak melompati dua status.
                $pdo->prepare("UPDATE orders SET status = ? WHERE id = ? AND status = ?")
                    ->execute([$flow[$idx + 1], $id, $existing['status']]);
            }
            jsonResponse(fetchOrder($pdo, $id));
        }

        case 'set_payment': {
            $d = readJsonBody();
            $id = trim((string)($d['id'] ?? ''));
            $paid = !empty($d['paid']);
            if ($id === '') fail('ID pesanan kosong');

            $result = inTransaction($pdo, function () use ($pdo, $id, $paid, $user) {
                $stmt = $pdo->prepare("SELECT status, payment_status FROM orders WHERE id = ? FOR UPDATE");
                $stmt->execute([$id]);
                $order = $stmt->fetch() ?: fail('Pesanan tidak ditemukan', 404);
                if ($order['status'] === 'dibatalkan') fail('Pesanan sudah dibatalkan', 409);

                $status = $order['status'];
                if ($paid && $status === 'menunggu_bayar') $status = 'diterima';
                if (!$paid && $status !== 'selesai') $status = 'menunggu_bayar';

                $pdo->prepare("
                    UPDATE orders SET payment_status = ?, status = ?,
                        paid_by = IF(? = 1 AND payment_status <> 'paid', ?, paid_by),
                        paid_at = IF(? = 1 AND payment_status <> 'paid', ?, paid_at)
                    WHERE id = ?
                ")->execute([$paid ? 'paid' : 'pending', $status, (int)$paid, $user['id'], (int)$paid, nowMs(), $id]);

                if ($order['payment_status'] !== ($paid ? 'paid' : 'pending')) {
                    audit($pdo, $user['id'], $paid ? 'bayar_lunas' : 'bayar_dibatalkan', $id);
                }
                return true;
            });
            jsonResponse(fetchOrder($pdo, $id));
        }

        /* Pembatalan tidak menghapus pesanan: status berubah, stok kembali, alasan tercatat. */
        case 'cancel_order': {
            $d = readJsonBody();
            $id = trim((string)($d['id'] ?? ''));
            $reason = trim((string)($d['reason'] ?? ''));
            if ($id === '') fail('ID pesanan kosong');
            $len = preg_match_all('/./us', $reason);
            if ($len < 3 || $len > 255) fail('Alasan pembatalan wajib diisi (3 sampai 255 karakter)');

            inTransaction($pdo, function () use ($pdo, $id, $reason, $user) {
                $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? FOR UPDATE");
                $stmt->execute([$id]);
                $order = $stmt->fetch() ?: fail('Pesanan tidak ditemukan', 404);
                if (in_array($order['status'], ['selesai', 'dibatalkan'], true)) {
                    fail('Pesanan dengan status ini tidak bisa dibatalkan', 409);
                }

                $items = json_decode($order['items'], true) ?: [];
                usort($items, fn($a, $b) => strcmp($a['id'], $b['id']));
                foreach ($items as $item) {
                    $stmt = $pdo->prepare("SELECT stock FROM menu WHERE id = ? FOR UPDATE");
                    $stmt->execute([$item['id']]);
                    $stock = $stmt->fetchColumn();
                    if ($stock === false || $stock === null) continue;
                    $after = (int)$stock + (int)$item['qty'];
                    $pdo->prepare("UPDATE menu SET stock = ? WHERE id = ?")->execute([$after, $item['id']]);
                    logMovement($pdo, $item['id'], (int)$item['qty'], $after, 'batal', $id, $user['id'], $reason);
                }

                $pdo->prepare("
                    UPDATE orders SET status = 'dibatalkan',
                        payment_status = IF(payment_status = 'paid', 'refunded', payment_status),
                        cancelled_by = ?, cancelled_at = ?, cancel_reason = ?
                    WHERE id = ?
                ")->execute([$user['id'], nowMs(), $reason, $id]);
                audit($pdo, $user['id'], 'batal', $id, ['reason' => $reason, 'was_paid' => $order['payment_status'] === 'paid']);
            });
            jsonResponse(fetchOrder($pdo, $id));
        }

        case 'admin_search': {
            $q = trim((string)($_GET['q'] ?? ''));
            if ($q === '') jsonResponse(null);

            $digits = ltrim(preg_replace('/^#/', '', $q), '0');
            $queueNumber = ctype_digit($digits === '' ? '0' : $digits) ? (int)($digits === '' ? 0 : $digits) : -1;

            // Nomor antrean berulang (1 sampai 999): ambil yang terbaru.
            $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? OR queue = ? ORDER BY created_at DESC LIMIT 1");
            $stmt->execute([$q, $queueNumber]);
            jsonResponse(mapOrderRow($stmt->fetch() ?: null));
        }

        case 'list_transactions': {
            $perPage = 25;
            $page = max(1, (int)($_GET['page'] ?? 1));
            [$fromMs, $toMs] = dateRangeMs($_GET['from'] ?? null, $_GET['to'] ?? null);
            $q = trim((string)($_GET['q'] ?? ''));
            $status = (string)($_GET['status'] ?? '');

            $where = ['1=1'];
            $args = [];
            if ($q !== '') {
                $where[] = '(o.id = ? OR o.queue = ? OR o.table_no = ?)';
                array_push($args, $q, ctype_digit(ltrim($q, '#')) ? (int)ltrim($q, '#') : -1, $q);
            }
            if (in_array($status, ['menunggu_bayar', 'diterima', 'diproses', 'siap', 'selesai', 'dibatalkan'], true)) {
                $where[] = 'o.status = ?';
                $args[] = $status;
            }
            if ($fromMs !== null) { $where[] = 'o.created_at >= ?'; $args[] = $fromMs; }
            if ($toMs !== null) { $where[] = 'o.created_at <= ?'; $args[] = $toMs; }
            $cond = implode(' AND ', $where);

            $count = $pdo->prepare("SELECT COUNT(*) FROM orders o WHERE $cond");
            $count->execute($args);
            $total = (int)$count->fetchColumn();

            $stmt = $pdo->prepare("
                SELECT o.*, pu.username AS paid_by_name, cu.username AS cancelled_by_name
                FROM orders o
                LEFT JOIN users pu ON pu.id = o.paid_by
                LEFT JOIN users cu ON cu.id = o.cancelled_by
                WHERE $cond ORDER BY o.created_at DESC LIMIT ? OFFSET ?
            ");
            foreach ($args as $i => $value) $stmt->bindValue($i + 1, $value);
            $stmt->bindValue(count($args) + 1, $perPage, PDO::PARAM_INT);
            $stmt->bindValue(count($args) + 2, ($page - 1) * $perPage, PDO::PARAM_INT);
            $stmt->execute();

            jsonResponse([
                'rows'  => array_map('mapOrderRow', $stmt->fetchAll()),
                'total' => $total,
                'page'  => $page,
                'pages' => max(1, (int)ceil($total / $perPage))
            ]);
        }

        /* Stok awal hari atau koreksi. stock null = berhenti melacak. */
        case 'set_stock': {
            $d = readJsonBody();
            $menuId = (string)($d['menuId'] ?? '');
            $reason = $d['reason'] ?? 'koreksi';
            $new = $d['stock'] ?? null;
            if (!in_array($reason, ['buka_hari', 'koreksi'], true)) fail('Alasan tidak valid');
            if ($new !== null && (!is_numeric($new) || $new < 0 || $new > 100000 || (int)$new != $new)) {
                fail('Stok harus bilangan bulat 0 atau lebih');
            }
            $new = $new === null ? null : (int)$new;

            inTransaction($pdo, function () use ($pdo, $menuId, $new, $reason, $user) {
                $stmt = $pdo->prepare("SELECT stock FROM menu WHERE id = ? FOR UPDATE");
                $stmt->execute([$menuId]);
                $row = $stmt->fetch() ?: fail('Menu tidak ditemukan', 404);
                $old = $row['stock'] !== null ? (int)$row['stock'] : null;

                $pdo->prepare("UPDATE menu SET stock = ? WHERE id = ?")->execute([$new, $menuId]);
                $delta = $new === null ? 0 : $new - ($old ?? 0);
                $note = $new === null ? 'stok tidak dilacak' : ($old === null ? 'mulai dilacak' : null);
                logMovement($pdo, $menuId, $delta, $new, $reason, null, $user['id'], $note);
                audit($pdo, $user['id'], 'set_stock', null, ['menu' => $menuId, 'from' => $old, 'to' => $new]);
            });
            jsonResponse(['ok' => true]);
        }

        case 'stock_movements': {
            $rows = $pdo->query("
                SELECT s.created_at, m.name, s.delta, s.stock_after, s.reason, s.order_id, s.note, u.username
                FROM stock_movements s
                JOIN menu m ON m.id = s.menu_id
                LEFT JOIN users u ON u.id = s.user_id
                ORDER BY s.id DESC LIMIT 40
            ")->fetchAll();
            jsonResponse($rows);
        }

        /*
         * Hanya omzet berdasarkan transaksi yang tercatat. Tidak ada data biaya bahan atau
         * pengeluaran di sistem, jadi laba sengaja tidak dihitung.
         */
        case 'finance_summary': {
            $from = $_GET['from'] ?? date('Y-m-01');
            $to = $_GET['to'] ?? date('Y-m-d');
            [$fromMs, $toMs, $fromDate, $toDate] = dateRangeMs($from, $to);
            if ($fromMs === null || $toMs === null) fail('Format tanggal harus YYYY-MM-DD');

            $stmt = $pdo->prepare("
                SELECT method,
                    CASE WHEN status = 'dibatalkan' AND payment_status = 'refunded' THEN 'dikembalikan'
                         WHEN status = 'dibatalkan' THEN 'batal_belum_bayar'
                         WHEN payment_status = 'paid' THEN 'dibayar'
                         ELSE 'belum_dibayar' END AS bucket,
                    COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
                FROM orders WHERE created_at BETWEEN ? AND ? GROUP BY method, bucket
            ");
            $stmt->execute([$fromMs, $toMs]);
            $breakdown = $stmt->fetchAll();

            $paidCount = 0;
            $paidTotal = 0;
            foreach ($breakdown as &$b) {
                $b['n'] = (int)$b['n'];
                $b['total'] = (int)$b['total'];
                if ($b['bucket'] === 'dibayar') { $paidCount += $b['n']; $paidTotal += $b['total']; }
            }

            $stmt = $pdo->prepare("
                SELECT created_at, total FROM orders
                WHERE payment_status = 'paid' AND status <> 'dibatalkan' AND created_at BETWEEN ? AND ?
            ");
            $stmt->execute([$fromMs, $toMs]);
            $daily = [];
            foreach ($stmt->fetchAll() as $o) {
                $day = date('Y-m-d', (int)($o['created_at'] / 1000));
                $daily[$day]['date'] = $day;
                $daily[$day]['count'] = ($daily[$day]['count'] ?? 0) + 1;
                $daily[$day]['total'] = ($daily[$day]['total'] ?? 0) + (int)$o['total'];
            }
            ksort($daily);

            jsonResponse([
                'from' => $fromDate, 'to' => $toDate,
                'paidCount' => $paidCount, 'paidTotal' => $paidTotal,
                'average' => $paidCount ? (int)round($paidTotal / $paidCount) : 0,
                'breakdown' => $breakdown,
                'daily' => array_values($daily)
            ]);
        }

        default:
            fail('Aksi tidak dikenal: ' . $action);
    }

} catch (HttpError $e) {
    jsonResponse(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[nusantara-bites] ' . $e);
    jsonResponse(['error' => 'Terjadi kesalahan server. Cek konfigurasi database dan log PHP.'], 500);
}
