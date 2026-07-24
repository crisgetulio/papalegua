module.exports = function (app, db, requireAuth) {
    const crypto = require('crypto');
    const QRCode = require('qrcode');

    try { db.exec("ALTER TABLE users ADD COLUMN recovery_token_hash TEXT"); } catch (e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN recovery_token_created_at INTEGER"); } catch (e) {}

    // Gera QR de recuperação (precisa estar logado)
    app.post('/api/account/recovery/generate', requireAuth, async (req, res) => {
        try {
            const secret = crypto.randomBytes(32).toString('base64url');
            const hash = crypto.createHash('sha256').update(secret).digest('hex');

            db.prepare(`UPDATE users SET recovery_token_hash = ?, recovery_token_created_at = ? WHERE id = ?`)
                .run(hash, Date.now(), req.session.userId);

            const payload = JSON.stringify({ uid: req.session.userId, secret });
            const qrDataUrl = await QRCode.toDataURL(payload);

            res.json({ qr: qrDataUrl });
        } catch (err) {
            console.error('Erro ao gerar QR de recuperação:', err);
            res.status(500).json({ error: 'Erro ao gerar QR' });
        }
    });

    // Resgata conta usando o QR (sem precisar estar logado)
    app.post('/api/account/recovery/redeem', (req, res) => {
        try {
            const { uid, secret } = req.body;
            if (!uid || !secret) return res.status(400).json({ error: 'Dados incompletos' });

            const hash = crypto.createHash('sha256').update(secret).digest('hex');
            const user = db.prepare(`SELECT * FROM users WHERE id = ? AND recovery_token_hash = ?`)
                .get(uid, hash);

            if (!user) return res.status(401).json({ error: 'QR inválido ou já utilizado' });

            db.prepare(`UPDATE users SET recovery_token_hash = NULL WHERE id = ?`).run(uid);

            req.session.userId = user.id;
            res.json({ message: 'Conta recuperada. Gere um novo QR de recuperação nas configurações.' });
        } catch (err) {
            console.error('Erro ao resgatar QR:', err);
            res.status(500).json({ error: 'Erro ao processar recuperação' });
        }
    });
};
