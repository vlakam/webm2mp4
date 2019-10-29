const mongoose = require('mongoose');
const { CachedVideoModel } = require('./models/cachedVideo');

const connect = async (db) => {
    const connect = async () => {
        await mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true });
        return console.info(`Successfully connected to ${db}`);
    };
    await connect();

    mongoose.connection.on('disconnected', async () => {
        console.error('Lost connection to mongo. Trying to reconnect');
        try {
            await connect();
        } catch (error) {
            console.error('Error connecting to database: ', error);
        }
    });
};

module.exports = {
    connect,
    CachedVideo: CachedVideoModel
};