const i18n = require('./i18n');
const Telegraf = require('telegraf');
const FfmpegConverter = require('./ffmpeg-converter');
const { processError } = require('./error');
const { downloadFile } = require('./utils');

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: {
    apiRoot: process.env.TELEGRAM_API || 'https://api.telegram.org'
  }
});

bot.use(i18n);
bot.start(({reply, i18n}) => reply(i18n.t('common.start')));
bot.url(async (ctx) => {
    const urls = ctx.message.entities
      .filter(({type}) => type === 'url')
      .slice(0, 1)
      .map(({offset, length}) => ctx.message.text.substring(offset, offset + length));

    if (urls.length === 0) {
        return;
    }

    const url = urls[0];
    await ctx.telegram.sendChatAction(ctx.message.chat.id, 'record_video');

    try {
        ctx.messageToEdit = await ctx.reply(ctx.i18n.t('download_url.start', {url: url}), {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        ctx.url = url;
        ctx.fileName = `${ctx.message.chat.id}_${ctx.message.message_id}.webm`;
        await downloadFile(ctx);

        let ffmpegConverter = new FfmpegConverter(ctx);
        await ffmpegConverter.run();
    } catch (err) {
        processError(err, ctx);
    }
  }
);

bot.on('document', async (ctx) => {
    if (!ctx.message.document.mime_type ||
      !ctx.message.document.mime_type.startsWith('video')) {
      ctx.reply(ctx.i18n.t('download_document.error.not_a_video'), {
        reply_to_message_id: ctx.message.message_id,
        parse_mode: 'HTML'
      });
      return
    }

    try {
        ctx.messageToEdit = await ctx.reply(ctx.i18n.t('download_document.start'), {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_to_message_id: ctx.message.message_id
        });

        ctx.url = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        ctx.fileName = `${ctx.message.chat.id}_${ctx.message.message_id}.webm`;
        await downloadFile(ctx);

        let ffmpegConverter = new FfmpegConverter(ctx);
        await ffmpegConverter.run();
    } catch (err) {
      processError(err, ctx);
    }
  }
);

module.exports = {
    bot
};

