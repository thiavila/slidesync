# Slide Sync — Checklist de Lancamento

## Claude faz (codigo)

- [x] Fase 1: Remover campos de servidor do drawer, hardcodar URLs, restringir permissoes
- [x] Fase 2: Atualizar footer com creditos Henry Lim + GitHub Sponsors
- [x] Fase 3A: i18n da Chrome Extension (pt_BR + en)
- [x] Fase 3B: i18n do Web App (pt_BR + en)
- [x] Fase 4: Migrar web app para static export (Cloudflare Pages ready)
- [x] Fase 4: Refatorar rota dinamica /session/[roomCode]
- [x] Fase 4: Criar pagina de Privacy Policy
- [x] Fase 5A: Criar LICENSE (MIT)
- [x] Fase 5A: Criar .github/SECURITY.md
- [x] Fase 5A: Criar .github/CONTRIBUTING.md
- [x] Fase 5B: Criar landing page completa
- [x] Fase 5B: Atualizar README.md
- [x] Fase 6: Version bump para 2.1.0
- [x] Fase 6: Escrever store description (PT + EN)

## Voce faz (manual)

- [ ] Comprar dominio `slidesync.live`
- [ ] Criar conta Cloudflare (se nao tem)
- [ ] Conectar repo GitHub no Cloudflare Pages
  - Build command: `cd web-app && npm run build`
  - Output directory: `web-app/out`
  - Env var: `NEXT_PUBLIC_PARTYKIT_HOST=slide-sync.thiavila.partykit.dev`
- [ ] Configurar dominio `slidesync.live` no Cloudflare DNS
- [ ] Configurar GitHub Sponsors no seu perfil
- [ ] Capturar screenshots da extensao em acao (1280x800 ou 640x400, min 1, ideal 3-5)
  - Screenshot 1: Google Slides edit mode com botao "Present w/ Slide Sync"
  - Screenshot 2: Present mode com drawer aberto, QR code e room code
  - Screenshot 3: Visao do aluno no celular
- [ ] Criar promotional tile para a Chrome Web Store (440x280 px)
- [ ] Submeter extensao na Chrome Web Store ($5 USD ja pago)
  - ZIP do diretorio `chrome-extension/`
  - Preencher store listing com description que eu vou preparar
  - Adicionar URL da privacy policy: `https://slidesync.live/privacy/`
  - Categoria: Education
- [ ] Tornar repo publico no GitHub
- [ ] (Opcional) Criar icones novos para a extensao (16, 48, 128px)
