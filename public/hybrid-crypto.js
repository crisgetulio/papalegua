// ============================================
// CRIPTOGRAFIA HÍBRIDA (AES-256-GCM + RSA-OAEP)
// Resolve o limite de ~190 bytes do RSA puro:
// o conteúdo (texto, áudio, imagem) é cifrado com AES,
// e só a chave AES (32 bytes) é cifrada com RSA.
// ============================================

function pemToBuffer(pem) {
    const b64 = pem.replace(/-----BEGIN[^-]+-----/, '')
                   .replace(/-----END[^-]+-----/, '')
                   .replace(/\s/g, '');
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer;
}

function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToBuffer(b64) {
    const binary = atob(b64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return buf.buffer;
}

async function importRsaPublicKey(pem) {
    return crypto.subtle.importKey('spki', pemToBuffer(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

async function importRsaPrivateKey(pem) {
    return crypto.subtle.importKey('pkcs8', pemToBuffer(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}

async function generateAesKey() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportAesKeyRaw(key) {
    return crypto.subtle.exportKey('raw', key);
}

async function importAesKeyRaw(rawBuffer) {
    return crypto.subtle.importKey('raw', rawBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Cifra texto OU dados binários (base64) com uma chave AES já existente
async function aesEncrypt(aesKey, dataStringOrBase64, isBinary = false) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = isBinary ? base64ToBuffer(dataStringOrBase64) : new TextEncoder().encode(dataStringOrBase64);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, dataBuffer);
    return { iv: bufferToBase64(iv), ciphertext: bufferToBase64(ciphertext) };
}

async function aesDecrypt(aesKey, ivB64, ciphertextB64, isBinary = false) {
    const iv = new Uint8Array(base64ToBuffer(ivB64));
    const ciphertext = base64ToBuffer(ciphertextB64);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    return isBinary ? bufferToBase64(plainBuffer) : new TextDecoder().decode(plainBuffer);
}

// Cifra a CHAVE AES (32 bytes, cabe tranquilo no RSA-OAEP) com a chave pública do destinatário
async function wrapAesKey(aesKeyRaw, recipientPublicKeyPem) {
    const pubKey = await importRsaPublicKey(recipientPublicKeyPem);
    const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, aesKeyRaw);
    return bufferToBase64(wrapped);
}

async function unwrapAesKey(wrappedKeyB64, myPrivateKeyPem) {
    const privKey = await importRsaPrivateKey(myPrivateKeyPem);
    const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, base64ToBuffer(wrappedKeyB64));
    return rawKey;
}

// === API de alto nível: CHAT PRIVADO (1 destinatário) ===
async function encryptForRecipient(text, recipientPublicKeyPem) {
    const aesKey = await generateAesKey();
    const rawKey = await exportAesKeyRaw(aesKey);
    const { iv, ciphertext } = await aesEncrypt(aesKey, text);
    const wrappedKey = await wrapAesKey(rawKey, recipientPublicKeyPem);
    return JSON.stringify({ iv, ciphertext, wrappedKey });
}

async function decryptFromSender(payloadStr, myPrivateKeyPem) {
    const { iv, ciphertext, wrappedKey } = JSON.parse(payloadStr);
    const rawKey = await unwrapAesKey(wrappedKey, myPrivateKeyPem);
    const aesKey = await importAesKeyRaw(rawKey);
    return aesDecrypt(aesKey, iv, ciphertext);
}

// Mesma ideia, mas para ARQUIVOS/ÁUDIO (dado binário em base64)
async function encryptFileForRecipient(base64Data, recipientPublicKeyPem) {
    const aesKey = await generateAesKey();
    const rawKey = await exportAesKeyRaw(aesKey);
    const { iv, ciphertext } = await aesEncrypt(aesKey, base64Data, true);
    const wrappedKey = await wrapAesKey(rawKey, recipientPublicKeyPem);
    return { iv, ciphertext, wrappedKey };
}

async function decryptFileFromSender(iv, ciphertextB64, wrappedKey, myPrivateKeyPem) {
    const rawKey = await unwrapAesKey(wrappedKey, myPrivateKeyPem);
    const aesKey = await importAesKeyRaw(rawKey);
    return aesDecrypt(aesKey, iv, ciphertextB64, true);
}

// === API de alto nível: GRUPO/COMUNIDADE (chave simétrica compartilhada) ===
// A chave AES do grupo é gerada 1x (pelo criador) e distribuída cifrada
// individualmente para cada membro com a chave pública dele.
async function createGroupKey() {
    const aesKey = await generateAesKey();
    const rawKey = await exportAesKeyRaw(aesKey);
    return { aesKey, rawKeyB64: bufferToBase64(rawKey) };
}

async function wrapGroupKeyForMember(rawKeyB64, memberPublicKeyPem) {
    return wrapAesKey(base64ToBuffer(rawKeyB64), memberPublicKeyPem);
}

async function unwrapGroupKey(wrappedKeyB64, myPrivateKeyPem) {
    const rawKey = await unwrapAesKey(wrappedKeyB64, myPrivateKeyPem);
    return importAesKeyRaw(rawKey);
}

async function encryptGroupMessage(text, groupAesKey) {
    return aesEncrypt(groupAesKey, text);
}

async function decryptGroupMessage(ivB64, ciphertextB64, groupAesKey) {
    return aesDecrypt(groupAesKey, ivB64, ciphertextB64);
}

async function encryptGroupFile(base64Data, groupAesKey) {
    return aesEncrypt(groupAesKey, base64Data, true);
}

async function decryptGroupFile(ivB64, ciphertextB64, groupAesKey) {
    return aesDecrypt(groupAesKey, ivB64, ciphertextB64, true);
}
