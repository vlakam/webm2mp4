const {Deferred} = require("../utils");

const queues = {};

const notifyQueue = async (queue) => {
    if (!queue) {
        return;
    }

    for (let idx in queue.users) {
        let {message, ctx} = queue.users[idx];
        try {
            await ctx.telegram.editMessageText(
                message.chat.id,
                message.message_id,
                null,
                ctx.i18n.t('queue.in_queue', {position: idx - (-1), length: queue.users.length})
            );
        } catch (err) {
            console.timeStamp(`Couldn't notify queue idx ${idx}: ${err.message}`);
        }
    }
};

const generator = ({queueName}) => {
    queues[queueName] = queues[queueName] || {users: [], defer: new Deferred()};
    const queue = queues[queueName];

    return async (ctx, next) => {
        try {
            const queueMessage = await ctx.reply(ctx.i18n.t('queue.checking'));
            queue.users.push({
                ctx,
                message: queueMessage
            });

            await ctx.telegram.editMessageText(
                queueMessage.chat.id,
                queueMessage.message_id,
                null,
                ctx.i18n.t('queue.in_queue', {position: queue.users.length, length: queue.users.length})
            );
            while (queue.users[0].ctx !== ctx) {
                await queue.defer.getPromise();
            }

            await next();
        } catch (err) {
            console.log(`Queue stucked: ${err}`);
        } finally {
            let finishedUser = queue.users.shift();
            let oldDeferred = queue.defer;
            queue.defer = new Deferred();
            oldDeferred.resolve();
            await notifyQueue(queue);
            await ctx.telegram.deleteMessage(finishedUser.message.chat.id, finishedUser.message.message_id);
        }
    };
};

module.exports = generator;