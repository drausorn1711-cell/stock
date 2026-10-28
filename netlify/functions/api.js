const serverless = require('serverless-http');
const { app, initDb } = require('../../app');

let initialized = false;
const serverlessHandler = serverless(app);

module.exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;

    if (!initialized) {
        try {
            await initDb();
            initialized = true;
        } catch (err) {
            console.error('Database initialization error:', err);
        }
    }

    return await serverlessHandler(event, context);
};
