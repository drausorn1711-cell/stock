const { app, initDb } = require('./app');

const PORT = process.env.PORT || 3000;

// หากรันในเครื่อง (Local) จะเริ่มเซิร์ฟเวอร์
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    initDb().then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
        });
    }).catch((err) => {
        console.error('Failed to initialize database:', err);
    });
}

module.exports = app;
