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

// 0. เช็กเวอร์ชันข้อมูลแบบความเร็วสูงพิเศษ (High-Speed Real-time Heartbeat แยกตามทีม)
router.get('/version', async (req, res) => {
    const team = req.query.team || 'team1';
    try {
        const result = await db.execute({
            sql: `
            SELECT 
                (SELECT COUNT(*) FROM products WHERE COALESCE(team, 'team1') = ?) as count, 
                (SELECT COALESCE(MAX(id), 0) FROM products WHERE COALESCE(team, 'team1') = ?) as max_id, 
                (SELECT COALESCE(SUM(quantity), 0) FROM products WHERE COALESCE(team, 'team1') = ?) as total_qty, 
                (SELECT COALESCE(MAX(id), 0) FROM logs WHERE COALESCE(team, 'team1') = ?) as log_id
            `,
            args: [team, team, team, team]
        });
        const row = result.rows[0];
        const v = `${row.count}_${row.max_id}_${row.total_qty}_${row.log_id}`;
        res.json({ v });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. ดึงรายการสินค้าทั้งหมด (แยกตามทีม เรียงลำดับตามพยัญชนะ ก-ฮ)
router.get('/products', async (req, res) => {
    const team = req.query.team || 'team1';
    try {
        const result = await db.execute({
            sql: "SELECT * FROM products WHERE COALESCE(team, 'team1') = ?",
            args: [team]
        });
        const rows = result.rows || [];
        rows.sort((a, b) => {
            const nameA = (a && a.name) ? String(a.name).trim() : '';
            const nameB = (b && b.name) ? String(b.name).trim() : '';
            if (!nameA && nameB) return 1;
            if (nameA && !nameB) return -1;
            const comp = nameA.localeCompare(nameB, 'th');
            if (comp !== 0) return comp;
            const sizeA = (a && (a.size || a.sku)) ? String(a.size || a.sku).trim() : '';
            const sizeB = (b && (b.size || b.sku)) ? String(b.size || b.sku).trim() : '';
            return sizeA.localeCompare(sizeB, 'th', { numeric: true });
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. ดึงประวัติ Logs (แยกตามทีม)
router.get('/logs', async (req, res) => {
    const team = req.query.team || 'team1';
    try {
        const result = await db.execute({
            sql: "SELECT * FROM logs WHERE COALESCE(team, 'team1') = ? ORDER BY id DESC LIMIT 50",
            args: [team]
        });
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. เพิ่มสินค้าใหม่ (บันทึกทีมลงไปด้วย)
router.post('/products', async (req, res) => {
    const { sku, name, category, size, price, quantity, minStock, image, team } = req.body;
    const targetTeam = team || 'team1';

    try {
        const now = new Date().toLocaleString('th-TH');
        // บันทึกสินค้าและประวัติพร้อมกันใน 1 Network Roundtrip ด้วย db.batch
        const results = await db.batch([
            {
                sql: `INSERT INTO products (sku, name, category, size, price, quantity, minStock, image, team) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    sku || '',
                    name || '',
                    category || '',
                    size || '',
                    parseFloat(price) || 0,
                    parseInt(quantity) || 0,
                    parseInt(minStock) || 0,
                    image || '',
                    targetTeam
                ]
            },
            {
                sql: `INSERT INTO logs (date, productName, type, amount, note, team) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [now, name, 'เพิ่มสินค้าใหม่', parseInt(quantity) || 0, `ขนาด: ${size || '-'}`, targetTeam]
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
    const { name, category, size, quantity, minStock, image, team } = req.body;

    try {
        const now = new Date().toLocaleString('th-TH');
        let currentTeam = team;
        if (!currentTeam) {
            const pRes = await db.execute({ sql: 'SELECT team FROM products WHERE id = ?', args: [id] });
            currentTeam = (pRes.rows[0] && pRes.rows[0].team) || 'team1';
        }

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
                sql: `INSERT INTO logs (date, productName, type, amount, note, team) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [now, name, 'แก้ไขข้อมูล', parseInt(quantity) || 0, `แก้ไขขนาด/สต็อก (${size || '-'})`, currentTeam]
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
            sql: 'SELECT name, quantity, team FROM products WHERE id = ?',
            args: [id]
        });
        const product = pResult.rows[0];
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const newQty = Number(product.quantity) + change;
        if (newQty < 0) return res.status(400).json({ error: 'Stock cannot be negative' });

        const now = new Date().toLocaleString('th-TH');
        const typeStr = change > 0 ? 'รับเข้า' : 'เบิกออก';
        const team = (product && product.team) || 'team1';

        // ส่ง UPDATE สินค้า และ INSERT logs พร้อมกันใน 1 Network Roundtrip
        await db.batch([
            {
                sql: 'UPDATE products SET quantity = ? WHERE id = ?',
                args: [newQty, id]
            },
            {
                sql: `INSERT INTO logs (date, productName, type, amount, note, team) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [now, product.name, typeStr, Math.abs(change), `ปรับสต๊อก ${change > 0 ? '+' : ''}${change}`, team]
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
