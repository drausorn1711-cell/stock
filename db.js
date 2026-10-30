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
}

module.exports = { db, initDb };
