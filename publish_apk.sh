#!/bin/bash

echo "📱 Publicando novo APK do Papalegua..."
echo ""

PROJECT_DIR="/opt/papalegua-android"
APK_SOURCE="$PROJECT_DIR/app/build/outputs/apk/release/app-release.apk"
APK_DEST_DIR="/opt/papalegua-backend/public/apk"
VERSION_FILE="/opt/papalegua-backend/data/version.json"

if [ ! -f "$APK_SOURCE" ]; then
    echo "❌ APK não encontrado em: $APK_SOURCE"
    echo "   Execute primeiro: cd /opt/papalegua-android && ./gradlew assembleRelease"
    exit 1
fi

mkdir -p "$APK_DEST_DIR"
mkdir -p /opt/papalegua-backend/data

# Gerar nome com versão 1.1.1
VERSION=$(date +"%Y%m%d_%H%M%S")
APK_NAME="papalegua_1.1.1_$VERSION.apk"
APK_DEST="$APK_DEST_DIR/$APK_NAME"

echo "📋 Copiando APK..."
cp "$APK_SOURCE" "$APK_DEST"

if [ $? -eq 0 ]; then
    echo "✅ APK copiado com sucesso!"
else
    echo "❌ Erro ao copiar APK"
    exit 1
fi

echo ""
echo "📝 Atualizando version.json..."

cat > "$VERSION_FILE" << EOF
{
  "version": "1.1.1",
  "versionCode": 3,
  "apkUrl": "/apk/$APK_NAME",
  "releaseNotes": "📱 Nova versão 1.1.1 disponível!\n\n✅ Correção: APK agora assinado corretamente\n✅ Persistência de login\n✅ Confirmação de leitura (✓ e ✓✓)\n✅ Chamadas de áudio e vídeo\n✅ Notificações com tela ligada\n✅ Atualização automática do APK",
  "forced": false,
  "updatedAt": "$(date -Iseconds)"
}
EOF

echo "✅ version.json atualizado!"
echo ""

echo "📊 Resumo:"
echo "═══════════════════════════════════════════════"
echo "📱 APK: $APK_NAME"
echo "📁 Local: /apk/$APK_NAME"
echo "📦 Tamanho: $(du -h "$APK_DEST" | cut -f1)"
echo "🔢 Versão: 1.1.1 (código 3)"
echo "📅 Publicado: $(date)"
echo "═══════════════════════════════════════════════"
echo ""
echo "🚀 APK disponível em:"
echo "   https://papalegua.duckdns.org/apk/$APK_NAME"
echo ""
echo "📢 Usuários serão notificados!"
echo ""

