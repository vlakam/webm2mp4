const path = require('path');
const fs = require('fs');
const Telegraf = require('telegraf');
const FfmpegConverter = require('./ffmpeg-converter');
const { errorMiddleware, queueMiddlewareGenerator, i18n } = require('./middlewares');
const { downloadFile, fileHash, TMP_DIR } = require('./utils');
const { CachedVideo } = require('./db');

const VIDEO_PREFIX = '#video#!';
const DOC_PREFIX = '#document#!';

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: {
    apiRoot: process.env.TELEGRAM_API || 'https://api.telegram.org'
  }
});

bot.use(errorMiddleware);
bot.use(i18n);
bot.start(({reply, i18n}) => reply(i18n.t('common.start')));

const processConvert = async (ctx) => {
    await ctx.telegram.sendChatAction(ctx.message.chat.id, 'record_video');
    ctx.messageToEdit = await ctx.reply(ctx.i18n.t('download_start'), {
        reply_to_message_id: ctx.message.message_id
    });

    ctx.fileName = `${ctx.message.chat.id}_${ctx.message.message_id}.webm`;
    const filePath = await downloadFile(ctx);
    let hash = await fileHash(filePath);
    let cachedVideo = await CachedVideo.findOne({ hash });
    if (cachedVideo) {
        fs.unlink(filePath, () => {});

        const { videoFileId, thumbFileId } = cachedVideo;
        await ctx.telegram.sendChatAction(ctx.chat.id, 'upload_video');
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.messageToEdit.message_id);
        if (videoFileId.startsWith(VIDEO_PREFIX)) {
            const fileId = videoFileId.substring(VIDEO_PREFIX.length);
            await ctx.telegram.sendVideo(ctx.chat.id, fileId, { thumb: thumbFileId });
        } else if (videoFileId.startsWith(DOC_PREFIX)) {
            const fileId = videoFileId.substring(DOC_PREFIX.length);
            await ctx.telegram.sendDocument(ctx.chat.id, fileId, { thumb: thumbFileId });
        }
        return;
    }

    let ffmpegConverter = new FfmpegConverter(ctx);
    await ffmpegConverter.run();
    ctx.telegram.editMessageText(ctx.messageToEdit.chat.id,
        ctx.messageToEdit.message_id,
        null,
        ctx.i18n.t('convert.sending', {url: ctx.url}), {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

    try {
        await ctx.telegram.sendChatAction(ctx.chat.id, 'upload_video');
        const contentMessage = await ctx.telegram.sendVideo(ctx.chat.id, {source: path.join(TMP_DIR, ctx.resultFileName)}, ctx.extraVideo);
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.messageToEdit.message_id);

        const content = contentMessage.video || contentMessage.document;
        if (content) {
            const prefix = !!contentMessage.video ? VIDEO_PREFIX : DOC_PREFIX;
            const videoFileId = content.file_id;
            const thumbFileId = content.thumb ? content.thumb.file_id : null;

            const cache = new CachedVideo({ hash, videoFileId: `${prefix}${videoFileId}`, thumbFileId });
            cache.save();
        }
    } catch (e) {
        console.err(e.message);
    } finally {
        ffmpegConverter.cleanup();
    }
};

bot.url(/.+/, queueMiddlewareGenerator({ queueName: 'converter'}), async (ctx) => {
    const urls = ctx.message.entities
      .filter(({type}) => type === 'url')
      .slice(0, 1)
      .map(({offset, length}) => ctx.message.text.substring(offset, offset + length));

    ctx.url = urls[0];
    await processConvert(ctx);
  }
);

bot.on('document', queueMiddlewareGenerator({ queueName: 'converter'}), async (ctx) => {
    if (!ctx.message.document.mime_type ||
      !ctx.message.document.mime_type.startsWith('video')) {
      return ctx.reply(ctx.i18n.t('download_document.error.not_a_video'), {
        reply_to_message_id: ctx.message.message_id,
        parse_mode: 'HTML'
      });
    }

    ctx.url = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    await processConvert(ctx);
  }
);

bot.on('video', queueMiddlewareGenerator({ queueName: 'converter'}), async (ctx) => {
    ctx.url = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await processConvert(ctx);
});

module.exports = {
    bot
};

