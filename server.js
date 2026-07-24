require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const Database = require('better-sqlite3');
const admin = require('firebase-admin');
const { OAuth2Client } = require('google-auth-library');
const SqliteStore = require('better-sqlite3-session-store')(session);
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bip39 = require('bip39');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { pingTimeout: 120000, pingInterval: 25000 });

app.set('trust proxy', 1);

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const GROUP_AVATAR_DIR = path.join(UPLOAD_DIR, 'group_avatars');
const COMMUNITY_AVATAR_DIR = path.join(UPLOAD_DIR, 'community_avatars');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const DB_PATH = path.join(DATA_DIR, 'papalegua.db');

// ===============================================
// BANCO DE DADOS
// ===============================================
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(AVATAR_DIR);
fs.ensureDirSync(GROUP_AVATAR_DIR);
fs.ensureDirSync(COMMUNITY_AVATAR_DIR);

const db = new Database(DB_PATH);

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        username TEXT,
        avatar_url TEXT DEFAULT '/uploads/avatars/default.svg',
        seed_phrase_hash TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '/uploads/group_avatars/default.svg',
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS communities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT DEFAULT '/uploads/community_avatars/default.svg',
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS community_members (
        community_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (community_id, user_id)
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS push_tokens (
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        platform TEXT DEFAULT 'android',
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, token)
    );
`);

try { db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT NULL`); } catch(e) {}
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`); } catch(e) {}

const GOOGLE_WEB_CLIENT_ID = '766951284173-kuiqten73rt9nj38paeah2t7djnatfiq.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);

let firebaseReady = false;
try {
    admin.initializeApp({
        credential: admin.credential.cert(require('/opt/papalegua-backend/firebase-service-account.json'))
    });
    firebaseReady = true;
    console.log('Firebase Admin inicializado com sucesso');
} catch (e) {
    console.error('Falha ao inicializar Firebase Admin:', e.message);
}

console.log('✅ Banco de dados inicializado');

// ===============================================
// AVATARES PADRÃO (Criados via JavaScript)
// ===============================================
const defaultAvatarUser = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e6d5c0" rx="50"/><circle cx="50" cy="38" r="18" fill="#d4af37" opacity="0.8"/><ellipse cx="50" cy="80" rx="28" ry="20" fill="#d4af37" opacity="0.8"/></svg>`;
const defaultAvatarGroup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f5ede2" rx="50"/><text x="50" y="55" text-anchor="middle" font-size="40" font-family="Arial">👥</text></svg>`;
const defaultAvatarCommunity = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f5ede2" rx="50"/><text x="50" y="55" text-anchor="middle" font-size="40" font-family="Arial">🌐</text></svg>`;

fs.writeFileSync(path.join(AVATAR_DIR, 'default.svg'), defaultAvatarUser);
fs.writeFileSync(path.join(GROUP_AVATAR_DIR, 'default.svg'), defaultAvatarGroup);
fs.writeFileSync(path.join(COMMUNITY_AVATAR_DIR, 'default.svg'), defaultAvatarCommunity);

// ===============================================
// SESSÃO
// ===============================================
const sessionStore = new SqliteStore({
    client: db,
    expired: { clear: true, intervalMs: 900000 }
});

const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
    }
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    next();
}

// ===============================================
require("./recovery")(app, db, requireAuth);

app.post('/api/register-push-token', requireAuth, (req, res) => {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token obrigatório' });
    try {
        db.prepare(`
            INSERT INTO push_tokens (user_id, token, platform, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, token) DO UPDATE SET updated_at = datetime('now')
        `).run(req.session.userId, token, platform || 'android');
        res.json({ success: true });
    } catch (e) {
        console.error('Erro ao registrar push token:', e.message);
        res.status(500).json({ error: 'Erro interno' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken obrigatório' });
    try {
        const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_WEB_CLIENT_ID });
        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const googleName = payload.name || 'Usuário';

        const existing = db.prepare(`SELECT id, username, avatar_url FROM users WHERE google_id = ?`).get(googleId);
        if (existing) {
            req.session.userId = existing.id;
            return req.session.save((err) => {
                if (err) return res.status(500).json({ error: 'Erro ao criar sessão' });
                res.json({ success: true, user: existing });
            });
        }

        const userId = crypto.randomBytes(16).toString('hex');
        const seedPhrase = generateSeedPhrase();
        const keyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        const seedHash = crypto.createHash('sha256').update(seedPhrase).digest('hex');
        db.prepare(`INSERT INTO users (id, public_key, username, seed_phrase_hash, google_id) VALUES (?, ?, ?, ?, ?)`)
            .run(userId, keyPair.publicKey, googleName, seedHash, googleId);

        req.session.userId = userId;
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Erro ao criar sessão' });
            const newUser = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(userId);
            res.json({
                success: true,
                user: newUser,
                privateKey: keyPair.privateKey,
                seedPhrase: seedPhrase
            });
        });
    } catch (err) {
        console.error('Erro no login com Google:', err.message);
        res.status(401).json({ error: 'Token do Google inválido' });
    }
});
// FUNÇÕES AUXILIARES
// ===============================================
function generateSeedPhrase() { return bip39.generateMnemonic(128); }
function verifySeedPhrase(phrase) { return bip39.validateMnemonic(phrase); }

// ===============================================
// REGISTRO
// ===============================================
app.post('/api/register-anon', (req, res) => {
    const { username } = req.body;
    const userId = crypto.randomBytes(16).toString('hex');
    const seedPhrase = generateSeedPhrase();
    
    try {
        const keyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        const hash = crypto.createHash('sha256').update(seedPhrase).digest('hex');
        db.prepare(`INSERT INTO users (id, public_key, username, seed_phrase_hash) VALUES (?, ?, ?, ?)`)
            .run(userId, keyPair.publicKey, username || null, hash);
        
        req.session.userId = userId;
        req.session.save(() => {
            res.json({ success: true, userId, publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, seedPhrase });
        });
    } catch (error) {
        console.error('❌ Erro registro:', error.message);
        res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});

// ===============================================
// LOGIN (CRIA SESSÃO PARA USUÁRIO EXISTENTE)
// ===============================================
app.post('/api/login', (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId obrigatório' });
        }
        
        const user = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        req.session.userId = user.id;
        req.session.save((err) => {
            if (err) {
                console.error('❌ Erro ao salvar sessão:', err);
                return res.status(500).json({ error: 'Erro ao criar sessão' });
            }
            console.log('✅ Sessão criada para:', user.id);
            res.json({ success: true, user });
        });
    } catch (error) {
        console.error('❌ Erro no login:', error.message);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// ===============================================
// VERIFICAR FRASE SECRETA
// ===============================================
app.post('/api/verify-seed', (req, res) => {
    try {
        const { userId, seedPhrase } = req.body;
        if (!verifySeedPhrase(seedPhrase)) {
            return res.status(400).json({ error: 'Frase secreta inválida' });
        }
        const user = db.prepare(`SELECT seed_phrase_hash FROM users WHERE id = ?`).get(userId);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        const hash = crypto.createHash('sha256').update(seedPhrase).digest('hex');
        if (hash !== user.seed_phrase_hash) {
            return res.status(401).json({ error: 'Frase secreta incorreta' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar frase secreta' });
    }
});

// ===============================================
// USUÁRIOS
// ===============================================
app.get('/api/public-key/:userId', (req, res) => {
    try {
        const user = db.prepare(`SELECT public_key, username FROM users WHERE id = ?`).get(req.params.userId);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({ publicKey: user.public_key });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao buscar chave' });
    }
});

app.get('/api/users', requireAuth, (req, res) => {
    try {
        const users = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id != ? ORDER BY username ASC`).all(req.session.userId);
        res.json(users);
    } catch(e) {
        res.status(500).json({ error: 'Erro ao listar usuários' });
    }
});

app.get('/api/me', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        const user = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({
            id: user.id,
            username: user.username || null,
            avatar_url: user.avatar_url || '/uploads/avatars/default.svg'
        });
    } catch(e) {
        res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
});

app.get('/api/users/status', requireAuth, (req, res) => {
    const ids = req.query.ids ? req.query.ids.split(',').map(String) : [];
    const status = {};
    ids.forEach(id => { status[id] = onlineUsers.has(id); });
    res.json(status);
});

// ===============================================
// PERFIL DO USUÁRIO
// ===============================================
const avatarUpload = multer({ dest: AVATAR_DIR, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/user/update', requireAuth, (req, res) => {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        
        try {
            const userId = req.session.userId;
            const { username } = req.body;
            
            if (username !== undefined) {
                const cleanUsername = username.trim() || null;
                db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(cleanUsername, userId);
                console.log('📝 Username atualizado:', cleanUsername);
            }
            
            if (req.file) {
                const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                const finalName = `avatar_${userId}_${Date.now()}.${ext}`;
                const finalPath = path.join(AVATAR_DIR, finalName);
                fs.moveSync(req.file.path, finalPath, { overwrite: true });
                db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`).run(`/uploads/avatars/${finalName}`, userId);
                console.log('📝 Avatar atualizado');
            }
            
            const updated = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(userId);
            res.json({ success: true, user: updated });
        } catch(error) {
            console.error('❌ Erro perfil:', error.message);
            res.status(500).json({ error: 'Erro ao atualizar perfil: ' + error.message });
        }
    });
});

// ===============================================
// EXCLUIR CONTA
// ===============================================
app.delete('/api/user/delete', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao excluir conta' });
    }
});

// ===============================================
// GRUPOS
// ===============================================
const groupAvatarUpload = multer({ dest: GROUP_AVATAR_DIR, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/groups', requireAuth, (req, res) => {
    try {
        const { name, description, members } = req.body;
        const groupId = crypto.randomBytes(16).toString('hex');
        const userId = req.session.userId;
        
        db.prepare(`INSERT INTO groups (id, name, description, created_by) VALUES (?, ?, ?, ?)`)
            .run(groupId, name, description || '', userId);
        db.prepare(`INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)`)
            .run(groupId, userId, 'admin');
        
        if (members && members.length > 0) {
            const addStmt = db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`);
            members.forEach(m => addStmt.run(groupId, m));
        }
        
        res.json({ success: true, groupId });
    } catch(error) {
        console.error('❌ Erro criar grupo:', error.message);
        res.status(500).json({ error: 'Erro ao criar grupo: ' + error.message });
    }
});

app.get('/api/groups', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        const groups = db.prepare(`
            SELECT g.id, g.name, g.description, g.avatar_url, g.created_at,
                   (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
            FROM groups g 
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ?
        `).all(userId);
        res.json(groups);
    } catch(error) {
        console.error('❌ Erro listar grupos:', error.message);
        res.status(500).json({ error: 'Erro ao listar grupos' });
    }
});

app.get('/api/groups/:groupId', requireAuth, (req, res) => {
    try {
        const { groupId } = req.params;
        const group = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Grupo não encontrado' });
        }
        const members = db.prepare(`
            SELECT u.id, u.username, u.avatar_url, gm.role, gm.joined_at
            FROM group_members gm JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ?
        `).all(groupId);
        res.json({ ...group, members, member_count: members.length });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao buscar grupo' });
    }
});

app.put('/api/groups/:groupId', requireAuth, (req, res) => {
    try {
        const { groupId } = req.params;
        const { name, description } = req.body;
        const userId = req.session.userId;
        
        const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId);
        if (!member || member.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem editar' });
        }
        
        if (name && name.trim()) {
            db.prepare(`UPDATE groups SET name = ? WHERE id = ?`).run(name.trim(), groupId);
        }
        if (description !== undefined) {
            db.prepare(`UPDATE groups SET description = ? WHERE id = ?`).run(description || '', groupId);
        }
        
        const updated = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
        res.json({ success: true, group: updated });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao atualizar grupo' });
    }
});

app.post('/api/groups/:groupId/avatar', requireAuth, groupAvatarUpload.single('avatar'), (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.session.userId;
        
        const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId);
        if (!member || member.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem alterar o avatar' });
        }
        
        if (req.file) {
            const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
            const finalName = `group_${groupId}_${Date.now()}.${ext}`;
            const finalPath = path.join(GROUP_AVATAR_DIR, finalName);
            fs.moveSync(req.file.path, finalPath, { overwrite: true });
            db.prepare(`UPDATE groups SET avatar_url = ? WHERE id = ?`).run(`/uploads/group_avatars/${finalName}`, groupId);
        }
        
        const updated = db.prepare(`SELECT id, name, description, avatar_url FROM groups WHERE id = ?`).get(groupId);
        res.json({ success: true, group: updated });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao atualizar avatar' });
    }
});

app.post('/api/groups/:groupId/members', requireAuth, (req, res) => {
    try {
        const { groupId } = req.params;
        const { userId } = req.body;
        const requestingUserId = req.session.userId;
        
        const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, requestingUserId);
        if (!member || member.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem adicionar membros' });
        }
        
        const userExists = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
        if (!userExists) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(groupId, userId);
        res.json({ success: true });
    } catch(error) {
        console.error('❌ Erro adicionar membro:', error.message);
        res.status(500).json({ error: 'Erro ao adicionar membro: ' + error.message });
    }
});

// ===============================================
// COMUNIDADES
// ===============================================
const communityAvatarUpload = multer({ dest: COMMUNITY_AVATAR_DIR, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/communities', requireAuth, (req, res) => {
    try {
        const { name, description } = req.body;
        const communityId = crypto.randomBytes(16).toString('hex');
        const userId = req.session.userId;
        
        db.prepare(`INSERT INTO communities (id, name, description, created_by) VALUES (?, ?, ?, ?)`)
            .run(communityId, name, description || '', userId);
        db.prepare(`INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)`)
            .run(communityId, userId, 'admin');
        
        res.json({ success: true, communityId });
    } catch(error) {
        console.error('❌ Erro criar comunidade:', error.message);
        res.status(500).json({ error: 'Erro ao criar comunidade' });
    }
});

app.get('/api/communities', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        const communities = db.prepare(`
            SELECT c.id, c.name, c.description, c.avatar_url, c.created_at,
                   (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
            FROM communities c 
            JOIN community_members cm ON c.id = cm.community_id
            WHERE cm.user_id = ?
        `).all(userId);
        res.json(communities);
    } catch(error) {
        res.status(500).json({ error: 'Erro ao listar comunidades' });
    }
});

app.get('/api/communities/public', requireAuth, (req, res) => {
    try {
        const communities = db.prepare(`SELECT * FROM communities LIMIT 50`).all();
        res.json(communities);
    } catch(error) {
        res.status(500).json({ error: 'Erro ao buscar comunidades' });
    }
});

app.get('/api/communities/:communityId', requireAuth, (req, res) => {
    try {
        const { communityId } = req.params;
        const community = db.prepare(`SELECT * FROM communities WHERE id = ?`).get(communityId);
        if (!community) {
            return res.status(404).json({ error: 'Comunidade não encontrada' });
        }
        const members = db.prepare(`
            SELECT u.id, u.username, u.avatar_url, cm.role, cm.joined_at
            FROM community_members cm JOIN users u ON cm.user_id = u.id
            WHERE cm.community_id = ?
        `).all(communityId);
        res.json({ ...community, members, member_count: members.length });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao buscar comunidade' });
    }
});

app.put('/api/communities/:communityId', requireAuth, (req, res) => {
    try {
        const { communityId } = req.params;
        const { name, description } = req.body;
        const userId = req.session.userId;
        
        const member = db.prepare(`SELECT role FROM community_members WHERE community_id = ? AND user_id = ?`).get(communityId, userId);
        if (!member || member.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem editar' });
        }
        
        if (name && name.trim()) {
            db.prepare(`UPDATE communities SET name = ? WHERE id = ?`).run(name.trim(), communityId);
        }
        if (description !== undefined) {
            db.prepare(`UPDATE communities SET description = ? WHERE id = ?`).run(description || '', communityId);
        }
        
        const updated = db.prepare(`SELECT * FROM communities WHERE id = ?`).get(communityId);
        res.json({ success: true, community: updated });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao atualizar comunidade' });
    }
});

app.post('/api/communities/:communityId/avatar', requireAuth, communityAvatarUpload.single('avatar'), (req, res) => {
    try {
        const { communityId } = req.params;
        const userId = req.session.userId;
        
        const member = db.prepare(`SELECT role FROM community_members WHERE community_id = ? AND user_id = ?`).get(communityId, userId);
        if (!member || member.role !== 'admin') {
            return res.status(403).json({ error: 'Apenas administradores podem alterar o avatar' });
        }
        
        if (req.file) {
            const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
            const finalName = `community_${communityId}_${Date.now()}.${ext}`;
            const finalPath = path.join(COMMUNITY_AVATAR_DIR, finalName);
            fs.moveSync(req.file.path, finalPath, { overwrite: true });
            db.prepare(`UPDATE communities SET avatar_url = ? WHERE id = ?`).run(`/uploads/community_avatars/${finalName}`, communityId);
        }
        
        const updated = db.prepare(`SELECT id, name, description, avatar_url FROM communities WHERE id = ?`).get(communityId);
        res.json({ success: true, community: updated });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao atualizar avatar' });
    }
});

app.post('/api/communities/:communityId/join', requireAuth, (req, res) => {
    try {
        const userId = req.session.userId;
        db.prepare(`INSERT OR IGNORE INTO community_members (community_id, user_id) VALUES (?, ?)`)
            .run(req.params.communityId, userId);
        res.json({ success: true });
    } catch(error) {
        res.status(500).json({ error: 'Erro ao entrar na comunidade' });
    }
});

// ===============================================
// MENSAGENS EM RAM
// ===============================================
const privateMessages = {};
const messagesDb = require('./messages-db')(db);

async function sendPushToUser(userId, title, body, dataExtra) {
    if (!firebaseReady) return;
    const rows = db.prepare(`SELECT token FROM push_tokens WHERE user_id = ?`).all(userId);
    if (!rows.length) return;
    for (const row of rows) {
        try {
            await admin.messaging().send({
                token: row.token,
                notification: { title, body },
                data: Object.assign({}, dataExtra || {}),
                android: { priority: 'high' }
            });
        } catch (e) {
            const code = e.errorInfo?.code || e.code || '';
            if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
                db.prepare(`DELETE FROM push_tokens WHERE user_id = ? AND token = ?`).run(userId, row.token);
            } else {
                console.error('Erro ao enviar push para', userId, ':', e.message);
            }
        }
    }
}
const groupMessages = {};
const communityMessages = {};

app.get('/api/private-messages', requireAuth, (req, res) => {
    const { withUserId } = req.query;
    if (!withUserId) return res.status(400).json({ error: 'withUserId obrigatório' });
    const userId = req.session.userId;
    const convId = [userId, withUserId].sort().join('_');
    const msgs = messagesDb.getMessages(convId).map(m => ({
        id: m.id,
        fromUserId: m.from_user_id,
        toUserId: m.to_user_id,
        encryptedContent: m.encrypted_content,
        isAudio: !!m.is_audio,
        ttl: m.ttl,
        replyTo: m.reply_to,
        timestamp: m.timestamp
    }));
    res.json(msgs);
});
app.get('/api/group-messages/:groupId', requireAuth, (req, res) => {
    res.json(groupMessages[req.params.groupId] || []);
});

app.get('/api/community-messages/:communityId', requireAuth, (req, res) => {
    res.json(communityMessages[req.params.communityId] || []);
});

// ===============================================
// WEBSOCKET
// ===============================================
let onlineUsers = new Map();

io.use((socket, next) => sessionMiddleware(socket.request, socket.request.res || {}, next));

io.on('connection', (socket) => {
    const userId = socket.request.session?.userId;
    if (!userId) {
        socket.emit('auth error', 'Não autenticado');
        socket.disconnect();
        return;
    }
    
    const user = db.prepare(`SELECT id, username, avatar_url FROM users WHERE id = ?`).get(userId);
    if (!user) return socket.disconnect();

    socket.join(`user_${userId}`);
    onlineUsers.set(userId, socket.id);
    io.emit('user online', { userId });

    socket.on('private message', (data) => {
        const { toUserId, encryptedContent, isAudio, ttl, replyTo } = data;
        if (!toUserId || !encryptedContent) return;
        const convId = [userId, toUserId].sort().join('_');
        const msg = {
            id: Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            fromUserId: userId,
            toUserId: toUserId,
            convId: convId,
            encryptedContent: encryptedContent,
            isAudio: isAudio ? 1 : 0,
            ttl: ttl || 0,
            replyTo: replyTo || null,
            timestamp: new Date().toISOString()
        };
        messagesDb.insertMessage(msg);
        if (ttl > 0) {
            setTimeout(() => {
                messagesDb.deleteMessage(msg.id);
                io.to(`user_${toUserId}`).emit('message expired', { messageId: msg.id });
                io.to(`user_${userId}`).emit('message expired', { messageId: msg.id });
            }, ttl * 1000);
        }
        io.to(`user_${toUserId}`).emit('private message', { ...msg, isAudio: !!msg.isAudio });
        if (!onlineUsers.has(toUserId)) {
            sendPushToUser(
                toUserId,
                user.username || 'Papalegua',
                msg.isAudio ? 'Mensagem de voz' : 'Nova mensagem',
                { fromUserId: String(userId) }
            );
        }
    });
    socket.on('group message', (data) => {
        const { groupId, text, audioData, ttl, replyTo, msgId } = data;
        if (!groupId) return;
        
        const msg = {
            id: msgId || Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            fromUserId: userId,
            fromUsername: user.username || 'Anônimo',
            groupId: groupId,
            text: text || '',
            audioData: audioData || null,
            timestamp: new Date().toISOString(),
            ttl: ttl || 0,
            replyTo: replyTo || null,
            reactions: {}
        };
        
        if (!groupMessages[groupId]) groupMessages[groupId] = [];
        groupMessages[groupId].push(msg);
        
        if (ttl > 0) {
            setTimeout(() => {
                groupMessages[groupId] = groupMessages[groupId].filter(m => m.id !== msg.id);
                io.to(`group_${groupId}`).emit('message expired', { messageId: msg.id });
            }, ttl * 1000);
        }
        
        io.to(`group_${groupId}`).emit('group message', msg);
    });

    socket.on('community message', (data) => {
        const { communityId, text, audioData, ttl, replyTo, msgId } = data;
        if (!communityId) return;
        
        const msg = {
            id: msgId || Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            fromUserId: userId,
            fromUsername: user.username || 'Anônimo',
            communityId: communityId,
            text: text || '',
            audioData: audioData || null,
            timestamp: new Date().toISOString(),
            ttl: ttl || 0,
            replyTo: replyTo || null,
            reactions: {}
        };
        
        if (!communityMessages[communityId]) communityMessages[communityId] = [];
        communityMessages[communityId].push(msg);
        
        if (ttl > 0) {
            setTimeout(() => {
                communityMessages[communityId] = communityMessages[communityId].filter(m => m.id !== msg.id);
                io.to(`community_${communityId}`).emit('message expired', { messageId: msg.id });
            }, ttl * 1000);
        }
        
        io.to(`community_${communityId}`).emit('community message', msg);
    });

    socket.on('toggle reaction', (data) => {
        const { messageId, emoji, chatType, chatId } = data;
        if (!messageId || !emoji || !chatType || !chatId) return;
        
        let messages = null;
        let room = '';
        
        if (chatType === 'private') {
            const convId = [userId, chatId].sort().join('_');
            messages = privateMessages[convId];
            room = `user_${chatId}`;
        } else if (chatType === 'group') {
            messages = groupMessages[chatId];
            room = `group_${chatId}`;
        } else if (chatType === 'community') {
            messages = communityMessages[chatId];
            room = `community_${chatId}`;
        }
        
        if (!messages) return;
        
        const msg = messages.find(m => m.id === messageId);
        if (!msg) return;
        
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        
        const index = msg.reactions[emoji].indexOf(userId);
        if (index === -1) {
            msg.reactions[emoji].push(userId);
        } else {
            msg.reactions[emoji].splice(index, 1);
            if (msg.reactions[emoji].length === 0) {
                delete msg.reactions[emoji];
            }
        }
        
        io.to(room).emit('reaction update', {
            messageId: messageId,
            reactions: msg.reactions,
            chatType: chatType,
            chatId: chatId
        });
        socket.emit('reaction update', {
            messageId: messageId,
            reactions: msg.reactions,
            chatType: chatType,
            chatId: chatId
        });
    });

    socket.on('private typing', ({ toUserId }) => {
        io.to(`user_${toUserId}`).emit('private typing', { fromUserId: userId });
    });
    socket.on('private stop typing', ({ toUserId }) => {
        io.to(`user_${toUserId}`).emit('private stop typing', { fromUserId: userId });
    });
    socket.on('group typing', ({ groupId }) => {
        io.to(`group_${groupId}`).emit('group typing', { fromUserId: userId, fromUsername: user.username });
    });
    socket.on('group stop typing', ({ groupId }) => {
        io.to(`group_${groupId}`).emit('group stop typing', { fromUserId: userId });
    });

    socket.on('disconnect', () => {
        if (onlineUsers.get(userId) === socket.id) {
            onlineUsers.delete(userId);
            io.emit('user offline', { userId });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Papalegua rodando na porta ${PORT}`);
});
