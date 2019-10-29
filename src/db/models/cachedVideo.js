const { Schema, model } = require('mongoose');
const cachedVideoSchema = new Schema({
    hash: {type: String, index: {unique: true}},
    videoFileId: String,
    thumbFileId: String
});

const CachedVideoModel = model('cachedVideo', cachedVideoSchema);

module.exports = {
    CachedVideoModel: CachedVideoModel
};