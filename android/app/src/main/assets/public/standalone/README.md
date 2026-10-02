# 📍 Rastreador GPS Mobile (Standalone Web App & PWA)

Aplicativo web completo, leve e autônomo (HTML5 + Vanilla JavaScript + Leaflet + PWA) para rastreamento GPS em tempo real, cálculo de velocidade, odômetro e histórico de rotas com armazenamento local offline (`localStorage`).

---

## 🚀 Como Publicar no GitHub Pages (Grátis)

1. Crie um novo repositório no seu GitHub (ex: `rastreador-gps`).
2. Faça o upload de **todos os arquivos desta pasta** na raiz (`main` ou `master`) do repositório:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `icon.png`
   - `icon-512.png`
   - `.nojekyll`
   - `README.md`
3. No GitHub, acesse a aba **Settings** (Configurações) do repositório.
4. No menu lateral esquerdo, clique em **Pages**.
5. Na seção **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: selecione `main` (ou `master`) e a pasta `/(root)`.
   - Clique em **Save**.
6. Aguarde cerca de 1 a 2 minutos. Seu aplicativo estará online no endereço:
   `https://seu-usuario.github.io/seu-repositorio/`

> ⚠️ **Importante (HTTPS):** O navegador exige conexão segura **HTTPS** para autorizar o acesso ao GPS do celular. O GitHub Pages fornece HTTPS automaticamente com certificado SSL gratuito!

---

## 💻 Como Rodar Localmente no Computador

Você pode testar localmente abrindo com qualquer servidor HTTP:

- **Via Python:**
  ```bash
  python -m http.server 8080
  ```
  Acesse no navegador: `http://localhost:8080`

- **Via Node.js / npx:**
  ```bash
  npx serve .
  ```

- **Via VS Code:**
  Instale a extensão **Live Server** e clique em "Go Live" no arquivo `index.html`.

---

## 📱 Instalação no Celular (PWA)

- **Android (Chrome / Edge / Samsung Internet):**
  Ao acessar o link no navegador do celular, toque nos 3 pontinhos do menu e selecione **"Adicionar à tela inicial"** ou **"Instalar aplicativo"**.
- **iPhone / iOS (Safari):**
  Abra no Safari, toque no botão de **Compartilhar** (ícone do quadrado com seta para cima) e selecione **"Adicionar à Tela de Início"**.

---

## ✨ Funcionalidades

- 🛰️ **Rastreamento em Tempo Real:** Captura contínua de latitude, longitude e velocidade instantânea via `navigator.geolocation.watchPosition`.
- 🗺️ **Mapa Interativo (Leaflet):** Traçado dinâmico da rota percorrida sobre mapa OpenStreetMap.
- ⏱️ **Cronômetro & Odômetro:** Cálculo automático da distância percorrida (Fórmula de Haversine) e tempo decorrido.
- 💾 **Histórico Offline:** Gravação dos trajetos no navegador com visualização e exclusão.
- 🔋 **Zero Dependências de Compilação:** 100% estático (sem Node.js ou bundler obrigatório).
