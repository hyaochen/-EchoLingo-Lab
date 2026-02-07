# EchoLingo Lab

## 專案簡介（350字內）
EchoLingo Lab 是一個可在電腦與手機使用的語言學習工具，支援英文單字聽寫與日文句子情境學習。英文流程為「念單字、逐字母拼讀、繁中意涵」；日文流程為「念句子、繁中意涵、句子羅馬拼音」。系統提供分組播放、需加強清單、新聞匯入、語音引擎切換（Browser/OpenAI）、深色模式、多使用者管理與每日備份，適合做長期複習與行動測試。

## 功能總覽
- 英文學習：單字朗讀、逐字母拼讀、繁中意涵朗讀。
- 日文學習：句子朗讀、繁中意涵朗讀、句子羅馬拼音顯示。
- 播放控制：開始、暫停/續播、上一個、下一個、停止。
- 分類學習：標籤群組播放、需加強清單。
- 內容工作坊：RSS/News API/GNews 匯入、關鍵字搜尋、候選詞句加入。
- 聲音設定：語速/聲調分語言設定，且 Browser 與 OpenAI 音量可分開設定。
- 系統能力：深色模式、多使用者、管理後台、每日備份、匯入匯出。

## 技術架構
- 前端：TypeScript + Vite
- 後端：Node.js + Express + TypeScript
- 儲存：`data/app-db.json`（檔案型）
- 備份：`data/backups`（每日自動，可手動）

## 安全與公開規範
- `.env` 已在 `.gitignore`，不要提交任何真實 API key。
- `data/` 已在 `.gitignore`，不要提交你目前本機的資料庫與備份。
- 若金鑰曾外露，請立即到供應商平台撤銷並重發。
- 公開版預設帳號只保留：`admin / admin`。
- 若你已在本機改過密碼，系統會沿用現有資料庫，不會因程式更新強制覆蓋。

## 安裝與啟動
```bash
npm install
npm run dev:full
```

啟動後：
- 前端：`http://localhost:5173`
- 後端：`http://localhost:8787`

其他指令：
```bash
npm run dev:web
npm run dev:api
npm run build
npm run preview
```

## 環境變數設定
先複製範本：
```bash
cp .env.example .env
```

Windows PowerShell 可用：
```powershell
Copy-Item .env.example .env
```

`.env` 範例：
```env
API_PORT=8787
OPENAI_API_KEY=
OPENAI_TTS_MODEL=gpt-4o-mini-tts
NEWS_PROVIDER=auto
NEWSAPI_KEY=
GNEWS_API_KEY=
```

新聞來源建議：
- 使用 `newsapi.org`：填 `NEWSAPI_KEY`，可設 `NEWS_PROVIDER=newsapi`
- 使用 `gnews.io`：填 `GNEWS_API_KEY`，可設 `NEWS_PROVIDER=gnews`
- `NEWS_PROVIDER=auto`：後端自動嘗試可用來源

## 預設登入規則
- 新資料庫第一次啟動：`admin / admin`
- 已存在 `data/app-db.json`：使用你目前資料庫中的帳密

## 操作流程建議
1. 管理員先在「聲音設定」完成 Browser/OpenAI 引擎、語速、聲調、雙音量校正。
2. 在「英文 / 日文」建立標籤群組，先用群組播放測試。
3. 在「內容工作坊」用關鍵字匯入新聞，再把候選詞句加入學習庫並補標籤。
4. 對不熟內容標記「需加強」，用獨立群組重複複習。
5. 每天確認備份清單，必要時手動備份一次。

## Cloudflare 外網測試（第三子網域）
以下示範使用第三子網域：`lingo.hongjixuan-market-ledger.com`。

1. 安裝 `cloudflared`（Windows 可用 `winget install Cloudflare.cloudflared`）。
2. 登入 Cloudflare：
```bash
cloudflared tunnel login
```
3. 建立 Tunnel：
```bash
cloudflared tunnel create echolingo-lab
```
4. 綁定第三子網域 DNS：
```bash
cloudflared tunnel route dns echolingo-lab lingo.hongjixuan-market-ledger.com
```
5. 若同網域已有其他專案，請建立獨立設定檔 `%USERPROFILE%\\.cloudflared\\echolingo-config.yml`（不要覆蓋原本 `config.yml`）：
```yml
tunnel: <Echolingo_TUNNEL_ID>
credentials-file: C:\Users\<你的帳號>\.cloudflared\<Echolingo_TUNNEL_ID>.json
ingress:
  - hostname: lingo.hongjixuan-market-ledger.com
    service: http://localhost:5173
  - service: http_status:404
```
6. 本機啟動專案：
```bash
npm run dev:full
```
7. 啟動 Tunnel：
```bash
cloudflared --config %USERPROFILE%\.cloudflared\echolingo-config.yml tunnel run
```
或直接雙擊專案根目錄的 `start-echolingo-tunnel.bat`。

完成後即可從手機/平板透過 `https://lingo.hongjixuan-market-ledger.com` 連入測試。
