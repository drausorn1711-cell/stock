const express = require('express');
const cors = require('cors');
const { db, initDb } = require('./db');

const app = express();

app.use(cors());
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const router = express.Router();

// 1. ดึงรายการสินค้าทั้งหมด
router.get('/products', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM products ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. ดึงประวัติ Logs
router.get('/logs', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM logs ORDER BY id DESC LIMIT 50');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. เพิ่มสินค้าใหม่
router.post('/products', async (req, res) => {
    const { sku, name, category, size, price, quantity, minStock, image } = req.body;

    try {
        const now = new Date().toLocaleString('th-TH');
        // บันทึกสินค้าและประวัติพร้อมกันใน 1 Network Roundtrip ด้วย db.batch
        const results = await db.batch([
            {
                sql: `INSERT INTO products (sku, name, category, size, price, quantity, minStock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    sku || '',
                    name || '',
                    category || '',
                    size || '',
                    parseFloat(price) || 0,
                    parseInt(quantity) || 0,
                    parseInt(minStock) || 0,
                    image || ''
                ]
            },
            {
                sql: `INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
                args: [now, name, 'เพิ่มสินค้าใหม่', parseInt(quantity) || 0, `ขนาด: ${size || '-'}`]
            }
        ], "write");

        const newId = Number(results[0].lastInsertRowid);
        res.json({ success: true, id: newId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. แก้ไขข้อมูลสินค้า
router.put('/products/:id', async (req, res) => {
    const id = req.params.id;
    const { name, category, size, quantity, minStock, image } = req.body;

    try {
        const now = new Date().toLocaleString('th-TH');
        await db.batch([
            {
                sql: `UPDATE products SET name = ?, category = ?, size = ?, quantity = ?, minStock = ?, image = ? WHERE id = ?`,
                args: [
                    name || '',
                    category || '',
                    size || '',
                    parseInt(quantity) || 0,
                    parseInt(minStock) || 0,
                    image || '',
                    id
                ]
            },
            {
                sql: `INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
                args: [now, name, 'แก้ไขข้อมูล', parseInt(quantity) || 0, `แก้ไขขนาด/สต็อก (${size || '-'})`]
            }
        ], "write");

        res.json({ success: true, updated: 1 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. ปรับสต๊อกสินค้า (+1 / -1)
router.patch('/products/:id/stock', async (req, res) => {
    const id = req.params.id;
    const { changeAmount } = req.body;
    const change = parseInt(changeAmount);

    try {
        // ดึงเฉพาะชื่อและจำนวน ไม่ดึงรูปภาพ Base64 เพื่อความเร็วสูงสุด
        const pResult = await db.execute({
            sql: 'SELECT name, quantity FROM products WHERE id = ?',
            args: [id]
        });
        const product = pResult.rows[0];
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const newQty = Number(product.quantity) + change;
        if (newQty < 0) return res.status(400).json({ error: 'Stock cannot be negative' });

        const now = new Date().toLocaleString('th-TH');
        const typeStr = change > 0 ? 'รับเข้า' : 'เบิกออก';

        // ส่ง UPDATE สินค้า และ INSERT logs พร้อมกันใน 1 Network Roundtrip
        await db.batch([
            {
                sql: 'UPDATE products SET quantity = ? WHERE id = ?',
                args: [newQty, id]
            },
            {
                sql: `INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)`,
                args: [now, product.name, typeStr, Math.abs(change), `ปรับสต๊อก ${change > 0 ? '+' : ''}${change}`]
            }
        ], "write");

        res.json({ success: true, quantity: newQty });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. ลบสินค้า
router.delete('/products/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await db.execute({
            sql: 'DELETE FROM products WHERE id = ?',
            args: [id]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const path = require('path');

// Mount routes across all path variations
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// เสิร์ฟหน้าเว็บและ Static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = { app, initDb };
