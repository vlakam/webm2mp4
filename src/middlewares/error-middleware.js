const { processError } = require('../error');

module.exports = async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        processError(err, ctx);
    }
};