const { createClient } = require('@libsql/client');
const path = require('path');
const os = require('os');

// ตรวจสอบว่ารันบน Cloud/Serverless (Vercel, Netlify) หรือไม่
const isServerless = process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;

// หากรันบน Cloud จะใช้ /tmp ซึ่งเป็นโฟลเดอร์เดียวที่อนุญาตให้เขียนไฟล์ได้
const defaultDbPath = isServerless ? path.join(os.tmpdir(), 'inventory.db') : path.join(__dirname, 'inventory.db');

// หากมีการตั้งค่า TURSO_DATABASE_URL จะต่อ Cloud SQLite อัตโนมัติ
const dbUrl = process.env.TURSO_DATABASE_URL || `file:${defaultDbPath}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const db = createClient({
    url: dbUrl,
    authToken: authToken
});

async function initDb() {
    await db.execute(`
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

    try {
        await db.execute("ALTER TABLE products ADD COLUMN size TEXT");
    } catch (e) {
        // column already exists
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            productName TEXT NOT NULL,
            type TEXT NOT NULL,
            amount INTEGER NOT NULL,
            note TEXT
        )
    `);

    try {
        const countRes = await db.execute("SELECT COUNT(*) AS count FROM products");
        const count = Number(countRes.rows[0].count);
        if (count === 0) {
            const sampleProducts = [
                ['NP-01', 'น้ำพริกหนุ่มสูตรดั้งเดิม', 'น้ำพริก', 'กระปุก 200g', 85, 25, 10, "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23fee2e2'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='42'>🌶️</text></svg>"],
                ['SH-02', 'ชาเก๊กฮวยสมุนไพรแท้', 'สมุนไพร', 'ซอง 100g', 120, 4, 8, "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23fef3c7'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='42'>🌼</text></svg>"],
                ['FD-03', 'เนื้อปลาแซลมอนสดนำเข้า', 'ของสด', 'แพ็ค 500g', 290, 15, 5, "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23e0f2fe'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='42'>🐟</text></svg>"]
            ];

            for (const item of sampleProducts) {
                await db.execute({
                    sql: "INSERT INTO products (sku, name, category, size, price, quantity, minStock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    args: item
                });
            }

            const now = new Date().toLocaleString('th-TH');
            await db.execute({
                sql: "INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)",
                args: [now, 'น้ำพริกหนุ่มสูตรดั้งเดิม', 'เพิ่มสินค้าใหม่', 25, 'สต็อกเริ่มต้น']
            });
            await db.execute({
                sql: "INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)",
                args: [now, 'ชาเก๊กฮวยสมุนไพรแท้', 'เพิ่มสินค้าใหม่', 4, 'สต็อกเริ่มต้น (เตือนสต็อกต่ำ)']
            });
            await db.execute({
                sql: "INSERT INTO logs (date, productName, type, amount, note) VALUES (?, ?, ?, ?, ?)",
                args: [now, 'เนื้อปลาแซลมอนสดนำเข้า', 'เพิ่มสินค้าใหม่', 15, 'สต็อกเริ่มต้น']
            });
            console.log('Sample data initialized.');
        }
    } catch (e) {
        console.error("Count check error:", e);
    }
}

module.exports = { db, initDb };
