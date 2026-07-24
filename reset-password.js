const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

const db = new Database(path.join(__dirname, 'data', 'users.db'));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Nome de usuário: ', (username) => {
    rl.question('Nova senha: ', (newPassword) => {
        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) { console.error('Erro:', err); process.exit(1); }
            const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?');
            const info = stmt.run(hash, username.trim());
            if (info.changes > 0) {
                console.log(`✅ Senha atualizada para "${username}"`);
            } else {
                console.log(`❌ Usuário "${username}" não encontrado`);
            }
            db.close();
            rl.close();
        });
    });
});
