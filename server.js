const { app, initDb } = require('./app');
const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3000;

// เสิร์ฟหน้าเว็บหลักสำหรับ Local development
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
});
