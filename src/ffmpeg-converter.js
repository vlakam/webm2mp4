const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const {Deferred, TMP_DIR} = require("./utils");
const {BigOutputError, ConvertError, NotAVideoError, SizeError} = require("./error");

class FfmpegConverter {
    constructor(ctx) {
        this.ctx = ctx;


        ctx.resultFileName = `${ctx.fileName}.mp4`;
        this.output = path.join(TMP_DIR, ctx.resultFileName);
        this.input = path.join(TMP_DIR, ctx.fileName);
        this.ffmpeg = ffmpeg(this.input).output(this.output);
        this.deferred = new Deferred();

        this.setOutputOptions();
        this.ffmpeg
            .on('end', this.onEnd.bind(this))
            .on('progress', this.onProgress.bind(this))
            .on('error', this.onError.bind(this));
    }

    static generateProgress(currentProgress) {
        const progressTick = '🔸';
        const inProgressTick = '🔹';
        let bar = '';
        let ticksCount = Math.floor(currentProgress / 10);
        if (ticksCount > 10) {
            ticksCount = 10
        }
        for (let i = 0; i < ticksCount; i++) {
            bar += progressTick
        }
        for (let i = ticksCount; i < 10; i++) {
            bar += inProgressTick
        }
        return bar
    }

    setOutputOptions() {
        this.ffmpeg.videoCodec('libx264')
            .outputOption('-crf 25')
            .outputOption('-profile:v high')
            .outputOption('-level 4.2')
            .outputOption('-preset medium')
            .outputOption(`-threads ${process.env.THREADS || 2}`)
            .outputOption(`-map V:0?`)
            .outputOption(`-map 0:a?`)
            .outputOption(`-timelimit ${process.env.TIMELIMIT || 900}`)
            .outputOption('-movflags +faststart')
            .outputOptions('-strict', '-2')
            .outputOption('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
    }

    createThumb() {
        return new Promise((rs) => {
            ffmpeg(path.join(TMP_DIR, ctx.resultFileName)).screenshots({
                timestamps: ['50%'],
                filename: this.ctx.resultFileName + '.jpg',
                folder: TMP_DIR,
                scale: 'if(gt(iw,ih),90,trunc(oh*a/2)*2):if(gt(iw,ih),trunc(ow/a/2)*2,90)'
            }).on('end', () => {
                this.ctx.thumbName = this.ctx.resultFileName + '.jpg';
                rs()
            })
        });
    }

    cleanup() {
        var files = [this.ctx.resultFileName, this.ctx.fileName, this.ctx.thumbName];

        files.forEach((fileName) => {
            if (!fileName) {
                return;
            }

            const filePath = path.join(TMP_DIR, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
        })
    }

    onError(error) {
        let err_str = error.toString();
        console.error(error);
        this.cleanup();

        if (err_str.includes('Invalid data found when processing input')) {
            this.deferred.reject(new NotAVideoError());
        } else {
            this.deferred.reject(new ConvertError());
        }
    }

    async onEnd() {
        let videoStat = fs.statSync(this.output);
        let fileSizeInBytes = videoStat.size;
        let fileSizeInMegabytes = fileSizeInBytes / 1000000.0;

        this.ctx.extraVideo = {
            supports_streaming: true
        };

        if (fileSizeInMegabytes > 50) {
            this.cleanup();
            return this.deferred.reject(new BigOutputError());
        }

        if (fileSizeInMegabytes >= 10) {
            this.ctx.telegram.editMessageText(this.ctx.messageToEdit.chat.id,
                this.ctx.messageToEdit.message_id,
                null,
                this.ctx.i18n.t('convert.generating_thumbnail', {url: this.ctx.url}), {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });

            await this.createThumb(File);
            this.ctx.extraVideo = {
                thumb: {
                    source: path.join(TMP_DIR, this.ctx.thumbName)
                },
                ...extraVideo
            }
        }

        this.deferred.resolve();
    }

    async onProgress(progress) {
        this.notification = this.notification || 0;
        if (Math.floor(Date.now() / 1000) - this.notification >= 10) {
            this.ctx.telegram.editMessageText(
                this.ctx.messageToEdit.chat.id,
                this.ctx.messageToEdit.message_id,
                null,
                this.ctx.i18n.t('convert.processing', {
                    url: this.ctx.url,
                    progressBar: FfmpegConverter.generateProgress(progress.percent)
                }), {parse_mode: 'HTML', disable_web_page_preview: true});
            this.notification = Math.floor(Date.now() / 1000)
        }
    }

    run() {
        this.ffmpeg.run();
        return this.deferred.getPromise();
    }
}

module.exports = FfmpegConverter;
