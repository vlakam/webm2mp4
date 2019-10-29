class NotAVideoError extends Error {
    constructor (message) {
        super(message);
        this.message = message;
        this.name = 'NotAVideoError';
        this.i18n = 'download_url.error.not_a_video';
    }
};

class TimeoutError extends Error {
    constructor (message) {
        super(message);
        this.message = message;
        this.name = 'TimeoutError';
        this.i18n = 'timeout'
    }
}

class DownloadError extends Error {
    constructor (message) {
        super(message);
        this.message = message;
        this.name = 'TimeoutError';
        this.i18n = 'download_url.error.download'
    }
}

class SizeError extends Error {
    constructor (message) {
        super(message);
        this.message = message;
        this.name = 'TimeoutError';
        this.i18n = 'download_url.error.size'
    }
}

class ConvertError extends Error {
    constructor (message) {
        super(message);
        this.message = message;
        this.name = 'ConvertError';
        this.i18n = 'convert.error'
    }
}

class BigOutputError extends Error {
    constructor (message) {
        super(message);
        this.message = message;
        this.name = 'BigOutputError';
        this.i18n = 'convert.big_output'
    }
}

const processError = async (err, ctx) => {
    console.log('Error ' + err);
    let replyText = ctx.i18n.t('error');
    let msg = ctx.messageToEdit;
    let url = ctx.url;

    switch (err.constructor) {
        case TimeoutError:
        case NotAVideoError:
        case DownloadError:
        case ConvertError:
        case BigOutputError:
        case SizeError:
            replyText = ctx.i18n.t(err.i18n, {url: url});
            break;
        default:
            replyText = ctx.i18n.t('error');
    }

    if (msg) {
        await ctx.telegram.editMessageText(
            msg.chat.id,
            msg.message_id,
            null,
            replyText,
            {parse_mode: 'HTML', disable_web_page_preview: true}
        );
    } else {
        await ctx.telegram.sendMessage(
            ctx.chat.id,
            replyText,
            {parse_mode: 'HTML', disable_web_page_preview: true}
        );
    }
};

module.exports = {
    processError,
    NotAVideoError,
    BigOutputError,
    ConvertError,
    SizeError,
    DownloadError,
    TimeoutError
}
