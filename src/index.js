require('dotenv').config();

const {freeDirectory, TMP_DIR} = require('./utils');
const bot = require('./bot').bot;

const init = async () => {
    try {
        await freeDirectory(TMP_DIR);
        console.log(`Cleaned ${TMP_DIR}`);
        await bot.launch();
        console.log(`Bot started`);
    } catch (e) {
        console.error(`Failed to init. Error: ${e}`);
    }
};

init();
