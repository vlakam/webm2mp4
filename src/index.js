require('dotenv').config();

const {freeDirectory, TMP_DIR} = require('./utils');
const { connect } = require('./db');
const MONGODB = process.env.MONGODB ||  'mongodb://mongo:27017/videos';
const bot = require('./bot').bot;

const init = async () => {
    try {
        await freeDirectory(TMP_DIR);
        console.log(`Cleaned ${TMP_DIR}`);
        await connect(MONGODB);
        await bot.launch();
        console.log(`Bot started`);
    } catch (e) {
        console.error(`Failed to init. Error: ${e}`);
        process.exit(1);
    }
};

init();
