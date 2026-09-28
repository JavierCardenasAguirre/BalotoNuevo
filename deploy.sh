#!/bin/bash

# 🚀 Script para actualizar GitHub y redeploy en Vercel
# Uso: ./deploy.sh "mensaje del commit"

set -e

echo "🔍 Verificando estado del repositorio..."
cd "$(dirname "$0")"

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

# Verificar si hay remote configurado
if ! git remote get-url origin &>/dev/null; then
    echo -e "${RED}❌ No hay remote 'origin' configurado${NC}"
    echo ""
    echo "Por favor, configura primero tu repositorio remoto:"
    echo "  git remote add origin https://github.com/TU_USUARIO/TU_REPO.git"
    echo ""
    echo "O edita este script y descomenta las líneas de configuración."
    exit 1
fi

echo -e "${GREEN}✅ Remote configurado: $(git remote get-url origin)${NC}"

# Mensaje del commit (argumento o default)
COMMIT_MSG="${1:-update: nueva version con mejoras}"

echo ""
echo "📝 Preparando commit..."
git status --short

# Agregar todos los cambios
git add .

# Hacer commit
if git diff --cached --quiet; then
    echo -e "${YELLOW}⚠️  No hay cambios para commitear${NC}"
else
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}✅ Commit creado: $COMMIT_MSG${NC}"
fi

# Obtener la rama actual
BRANCH=$(git branch --show-current)
echo ""
echo "🌿 Rama actual: $BRANCH"

# Intentar push
echo ""
echo "📤 Subiendo a GitHub..."
if git push origin "$BRANCH"; then
    echo -e "${GREEN}✅ Push exitoso a GitHub${NC}"
    echo ""
    echo -e "${GREEN}🎉 ¡Listo! Vercel detectará los cambios y hará el redeploy automáticamente.${NC}"
    echo ""
    echo "🔗 Verifica el estado en: https://vercel.com/dashboard"
    echo "⏱️  El redeploy suele tomar 1-2 minutos."
else
    echo -e "${RED}❌ Error al hacer push${NC}"
    echo ""
    echo "Posibles soluciones:"
    echo "1. Si hay cambios remotos, sincroniza primero:"
    echo "   git pull origin $BRANCH --rebase"
    echo "   git push origin $BRANCH"
    echo ""
    echo "2. Si es tu primer push:"
    echo "   git push -u origin $BRANCH"
    echo ""
    echo "3. Si hay conflictos de autenticación, usa un token:"
    echo "   https://github.com/settings/tokens"
    exit 1
fi
