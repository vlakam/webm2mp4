const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const nf = require('node-fetch');
const { DownloadError, SizeError } = require('./error');

const TMP_DIR = process.env.TMP_DIR || './tmp';
const MODE = process.env.MODE && process.env.MODE === 'develop' ? 'develop' : 'production';

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
        const response = await nf(ctx.url, { headers: { cookie: ctx.session.cookie || '' }});
        const filename = ctx.fileName || generate(10)+'.webm';
        const filePath = path.join(TMP_DIR, filename);
        const fileStream = fs.createWriteStream(filePath);
        response.body.pipe(fileStream);
        response.body.on('error', (err) => {
            rj(err)
        });

        fileStream.on('finish', function () {
            rs(filePath)
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

const fileHash = async (filename, algorithm = 'sha256') => {
    return new Promise((resolve, reject) => {
        let shasum = crypto.createHash(algorithm);
        try {
            let s = fs.ReadStream(filename);
            s.on('data', function (data) {
                shasum.update(data)
            });

            s.on('end', function () {
                const hash = shasum.digest('hex');
                return resolve(hash);
            })
        } catch (error) {
            return reject('calc fail');
        }
    });
};

module.exports = {
    Deferred, generate, freeDirectory, TMP_DIR, downloadFile, fileHash, MODE
};
