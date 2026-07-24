// Teste simples para verificar 2FA
try {
    const { authenticator } = require('otplib');
    const QRCode = require('qrcode');
    console.log('✅ 2FA Bibliotecas carregadas com sucesso!');
    console.log('   authenticator:', typeof authenticator);
    console.log('   QRCode:', typeof QRCode);
    
    // Testa geração de código
    const secret = authenticator.generateSecret();
    console.log('   Secret gerado:', secret.substring(0, 10) + '...');
    
    // Testa QR Code
    const otpauth = authenticator.keyuri('teste', 'Papalegua', secret);
    QRCode.toDataURL(otpauth, { width: 200 }, (err, qr) => {
        if (err) {
            console.log('❌ Erro ao gerar QR:', err.message);
            process.exit(1);
        } else {
            console.log('✅ QR Code gerado com sucesso!');
            console.log('   QR:', qr.substring(0, 80) + '...');
            process.exit(0);
        }
    });
} catch(e) {
    console.log('❌ Erro ao carregar bibliotecas:', e.message);
    console.log('   Stack:', e.stack);
    process.exit(1);
}
