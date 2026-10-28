const { app, initDb } = require('../app');

let initialized = false;

module.exports = async (req, res) => {
    if (!initialized) {
        try {
            await initDb();
            initialized = true;
        } catch (err) {
            console.error('Database initialization error:', err);
        }
    }
    return app(req, res);
};
