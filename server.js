const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// รองรับการรับส่งข้อมูล JSON ขนาดใหญ่ (สำหรับรูปภาพ Base64)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ชี้ตำแหน่งไฟล์หน้าเว็บ
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'templates')));
app.use(express.static(__dirname));

// เชื่อมต่อฐานข้อมูล SQLite
const db = new sqlite3.Database('./inventory.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDb();
    }
});

// สร้างตารางฐานข้อมูล
function initDb() {
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            size TEXT,
            price REAL DEFAULT 0,
            quantity INTEGER NOT NULL,
            minStock INTEGER NOT NULL,
            image TEXT
        )
    `);

    // ตรวจสอบเพิ่มคอลัมน์ size ป้องกัน Error กรณีฐานข้อมูลเก่า
    db.run("ALTER TABLE products ADD COLUMN size TEXT", (err) => {});

    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            productName TEXT NOT NULL,
            type TEXT NOT NULL,
            amount INTEGER NOT NULL,
            note TEXT
        )
    `);
}

// ---------------- API ROUTES ---------------- //

// 1. ดึงรายการสินค้าทั้งหมด
app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. ดึงประวัติ Logs
app.get('/api/logs', (req, res) => {
    db.all('SELECT * FROM logs ORDER BY id DESC LIMIT 50', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. เพิ่มสินค้าใหม่
app.post('/api/products', (req, res) => {
    const { sku, name, category, size, price, quantity, minStock, image } = req.body;

    const sql = `
        INSERT INTO products (sku, name, category, size, price, quantity, minStock, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        sku || '',
        name || '',
        category || '',
        size || '',
        parseFloat(price) || 0,
        parseInt(quantity) || 0,
        parseInt(minStock) || 0,
        image || ''
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const now = new Date().toLocaleString('th-TH');
        db.run(
            `INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
            [now, name, 'เพิ่มสินค้าใหม่', parseInt(quantity) || 0, `ขนาด: ${size || '-'}`]
        );

        res.json({ success: true, id: this.lastID });
    });
});

// 4. แก้ไขข้อมูลสินค้า (สำคัญ: สำหรับรองรับปุ่มแก้ไข)
app.put('/api/products/:id', (req, res) => {
    const id = req.params.id;
    const { name, category, size, quantity, minStock, image } = req.body;

    const sql = `
        UPDATE products 
        SET name = ?, category = ?, size = ?, quantity = ?, minStock = ?, image = ?
        WHERE id = ?
    `;
    const params = [
        name || '',
        category || '',
        size || '',
        parseInt(quantity) || 0,
        parseInt(minStock) || 0,
        image || '',
        id
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const now = new Date().toLocaleString('th-TH');
        db.run(
            `INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
            [now, name, 'แก้ไขข้อมูล', parseInt(quantity) || 0, `แก้ไขขนาด/สต็อก (${size || '-'})`]
        );

        res.json({ success: true, updated: this.changes });
    });
});

// 5. ปรับสต๊อกสินค้า (+1 / -1)
app.patch('/api/products/:id/stock', (req, res) => {
    const id = req.params.id;
    const { changeAmount } = req.body;
    const change = parseInt(changeAmount);

    db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
        if (err || !product) return res.status(404).json({ error: 'Product not found' });

        const newQty = product.quantity + change;
        if (newQty < 0) return res.status(400).json({ error: 'Stock cannot be negative' });

        db.run('UPDATE products SET quantity = ? WHERE id = ?', [newQty, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            const now = new Date().toLocaleString('th-TH');
            const typeStr = change > 0 ? 'รับเข้า' : 'เบิกออก';
            db.run(
                `INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
                [now, product.name, typeStr, Math.abs(change), `ปรับสต๊อก ${change > 0 ? '+' : ''}${change}`]
            );

            res.json({ success: true, quantity: newQty });
        });
    });
});

// 6. ลบสินค้า
app.delete('/api/products/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

// เสิร์ฟหน้าเว็บหลัก
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'templates', 'index.html'));
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});