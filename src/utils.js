const fs = require('fs');
const path = require('path');
const nf = require('node-fetch');
const { DownloadError, SizeError } = require('./error');

const TMP_DIR = process.env.TMP_DIR || './tmp';

const freeDirectory = (directory) => {
    return new Promise((rs, rj) => {
        fs.readdir(directory, (err, files) => {
            if (err) return rj(err);

            for (const file of files) {
                fs.unlink(path.join(directory, file), () => {});
            }

            rs();
        })
    });
};

const downloadFile = async (ctx) => {
    const limit = parseInt(process.env.LIMIT) || 100000000;
    let headResponse;

    try {
        headResponse = await nf(ctx.url, { method: 'HEAD' })
    } catch (e) {
        throw new DownloadError();
    }

    const contentLength = parseInt(headResponse.headers.get('content-length'));
    if (contentLength > limit) {
        throw new SizeError();
    }

    return new Promise(async (rs, rj) => {
        const response = await nf(ctx.url);
        const filename = ctx.fileName || generate(10)+'.webm';
        const filePath = path.join(TMP_DIR, filename);
        const fileStream = fs.createWriteStream(filePath);
        response.body.pipe(fileStream);
        response.body.on('error', (err) => {
            rj(err)
        });

        fileStream.on('finish', function () {
            rs(filename)
        });
    })
};

const generate = (count) => {
    const _sym = 'abcdefghijklmnopqrstuvwxyz1234567890';
    let str = '';

    for(var i = 0; i < count; i++) {
        str += _sym[parseInt(Math.random() * (_sym.length))];
    }

    return str;
};

class Deferred {
    constructor() {
        this.resolve = null;
        this.reject = null;
        this.promise = new Promise((rs, rj) => {
            this.resolve = rs;
            this.reject = rj;
        })
    }

    getPromise() {
        return this.promise;
    }
}

module.exports = {
    Deferred, generate, freeDirectory, TMP_DIR, downloadFile
};
