const Database = require('better-sqlite3');
const crypto = require('crypto-js');
const path = require('path');

const db = new Database('./data/users.db');

function generateKeyPair() {
    const privateKey = crypto.lib.WordArray.random(32).toString();
    const publicKey = crypto.SHA256(privateKey).toString();
    return { publicKey, privateKey };
}

function generateOnionId() {
    return crypto.lib.WordArray.random(16).toString();
}

const users = db.prepare('SELECT id FROM users WHERE public_key IS NULL OR public_key = ""').all();
console.log(`🔑 Gerando chaves para ${users.length} usuários...`);

const update = db.prepare('UPDATE users SET public_key = ?, private_key = ?, onion_id = ? WHERE id = ?');

users.forEach(user => {
    const keys = generateKeyPair();
    const onionId = generateOnionId();
    update.run(keys.publicKey, keys.privateKey, onionId, user.id);
    console.log(`✅ Usuário ${user.id} atualizado`);
});

console.log('✅ Todas as chaves geradas!');
