<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// เชื่อมต่อฐานข้อมูล stock ของ XAMPP
$conn = new mysqli("localhost", "root", "", "stock");
$conn->set_charset("utf8mb4");

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "เชื่อมต่อฐานข้อมูลไม่สำเร็จ: " . $conn->connect_error]);
    exit;
}

$action = $_GET['action'] ?? '';

// 1. ดึงข้อมูลสินค้า
if ($action === 'get_products' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $res = $conn->query("SELECT * FROM products ORDER BY id DESC");
    $data = [];
    while ($row = $res->fetch_assoc()) {
        $row['id'] = (int)$row['id'];
        $row['price'] = (float)$row['price'];
        $row['quantity'] = (int)$row['quantity'];
        $row['minStock'] = (int)$row['minStock'];
        $data[] = $row;
    }
    echo json_encode($data);
}

// 2. เพิ่มสินค้าใหม่
elseif ($action === 'add_product' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    $stmt = $conn->prepare("INSERT INTO products (sku, name, category, price, quantity, minStock, image) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssdiis", $input['sku'], $input['name'], $input['category'], $input['price'], $input['quantity'], $input['minStock'], $input['image']);
    
    if ($stmt->execute()) {
        $date = date("d/m/Y H:i");
        $log = $conn->prepare("INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, 'รับเข้า', ?, 'สต๊อกเริ่มต้น')");
        $log->bind_param("ssi", $date, $input['name'], $input['quantity']);
        $log->execute();
        echo json_encode(["success" => true, "id" => $conn->insert_id]);
    } else {
        http_response_code(500);
        echo json_encode(["error" => $conn->error]);
    }
}

// 3. ปรับสต๊อก (+1 / -1)
elseif ($action === 'adjust_stock' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = (int)$_GET['id'];
    $input = json_decode(file_get_contents("php://input"), true);
    $change = (int)$input['changeAmount'];

    $p = $conn->query("SELECT * FROM products WHERE id = $id")->fetch_assoc();
    if ($p) {
        $newQty = $p['quantity'] + $change;
        if ($newQty >= 0) {
            $conn->query("UPDATE products SET quantity = $newQty WHERE id = $id");
            $date = date("d/m/Y H:i");
            $type = $change > 0 ? 'รับเข้า' : 'เบิกออก';
            $amt = abs($change);
            $log = $conn->prepare("INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, 'ปรับสต๊อกด่วน')");
            $log->bind_param("sssi", $date, $p['name'], $type, $amt);
            $log->execute();
            echo json_encode(["success" => true, "quantity" => $newQty]);
            exit;
        }
    }
    http_response_code(400);
    echo json_encode(["error" => "ไม่สามารถปรับสต๊อกได้"]);
}

// 4. ลบสินค้า
elseif ($action === 'delete_product' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = (int)$_GET['id'];
    $conn->query("DELETE FROM products WHERE id = $id");
    echo json_encode(["success" => true]);
}

// 5. ดึงประวัติ Logs
elseif ($action === 'get_logs' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $res = $conn->query("SELECT * FROM logs ORDER BY id DESC");
    $data = [];
    while ($row = $res->fetch_assoc()) {
        $data[] = $row;
    }
    echo json_encode($data);
}
?>