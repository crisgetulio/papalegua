module.exports = function (db) {
    db.exec(`CREATE TABLE IF NOT EXISTS private_messages (
        id TEXT PRIMARY KEY,
        conv_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        encrypted_content TEXT,
        is_audio INTEGER DEFAULT 0,
        ttl INTEGER DEFAULT 0,
        reply_to TEXT,
        timestamp TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_priv_conv ON private_messages(conv_id)`);

    return {
        insertMessage: (msg) => {
            db.prepare(`INSERT INTO private_messages
                (id, conv_id, from_user_id, to_user_id, encrypted_content, is_audio, ttl, reply_to, timestamp)
                VALUES (@id, @convId, @fromUserId, @toUserId, @encryptedContent, @isAudio, @ttl, @replyTo, @timestamp)`
            ).run(msg);
        },
        getMessages: (convId) => {
            return db.prepare(`SELECT * FROM private_messages WHERE conv_id = ? ORDER BY timestamp ASC`).all(convId);
        },
        deleteMessage: (id) => {
            db.prepare(`DELETE FROM private_messages WHERE id = ?`).run(id);
        }
    };
};
