# CallHub

Минимальный Zoom‑подобный веб‑клиент и signaling‑сервер на Socket.io. Админ слышит пользователей, может включать/выключать свой микрофон/камеру и делиться экраном. Пользователи слышны админу, но не слышат друг друга.

## Стек
- Backend: Node.js, Express, Socket.io
- Frontend: React, Vite, Simple-Peer, Socket.io-client

## Запуск локально
1. Установить Node.js LTS (nvm):
```bash
. "$HOME/.nvm/nvm.sh" && nvm install --lts && nvm use --lts
```
2. Установка зависимостей:
```bash
npm install
```
3. Запуск сервера:
```bash
npm run dev:server
```
4. В другом терминале запустить клиент:
```bash
npm run dev:client
```
5. Открыть http://localhost:5173

Переменные окружения клиента:
- `VITE_SERVER_URL` — адрес сервера (по умолчанию `http://localhost:5000`).

## Деплой на Render
- Создайте два сервиса: web (server) и static/web (client) или один монорепозиторий с билдом клиента и сервером. Укажите PORT = 5000 для сервера. Клиент собирается `npm run build:client`.

## События Socket.io
- `join-room` { roomId, userName, userRole } → ack { ok, participants, adminId }
- `participant-joined/left`
- `audio-signal`, `admin-audio-signal`
- `screen-share-signal`, `video-signal`
- `chat-message` { text }
- `admin-toggle-user-mic` { targetId, mute }

## Замечания
- Браузер запросит разрешение на микрофон/камеру/экран при первом обращении.
- Пользовательский микрофон включён при входе; у админа — выключен по умолчанию.
- Экран и камера доступны только админу.


