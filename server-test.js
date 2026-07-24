const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Servidor Papalegua está funcionando! 🚀');
});

app.post('/api/register-anon', (req, res) => {
    res.json({
        userId: 'test-' + Date.now(),
        publicKey: 'chave-publica-teste',
        privateKey: 'chave-privada-teste'
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando em http://0.0.0.0:${port}`);
    console.log(`✅ Acesse: http://localhost:${port}`);
});
