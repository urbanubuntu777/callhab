import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// roomId -> { participants: Map<socketId, { name, role }>, adminId?: string }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { participants: new Map(), adminId: undefined });
  }
  return rooms.get(roomId);
}

function pruneRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.participants.size === 0) {
    rooms.delete(roomId);
  }
}

io.on('connection', (socket) => {
  let joinedRoomId = null;
  let role = null; // 'admin' | 'user'
  let name = null;

  socket.on('join-room', ({ roomId, userName, userRole }, ack) => {
    try {
      if (!roomId || !userName || !userRole) {
        ack && ack({ ok: false, error: 'Invalid join payload' });
        return;
      }
      const room = getRoom(roomId);
      if (userRole === 'admin') {
        if (room.adminId && room.adminId !== socket.id) {
          ack && ack({ ok: false, error: 'Admin already present' });
          return;
        }
        room.adminId = socket.id;
      }

      room.participants.set(socket.id, { name: userName, role: userRole });
      socket.join(roomId);
      joinedRoomId = roomId;
      role = userRole;
      name = userName;

      // notify others
      socket.to(roomId).emit('participant-joined', { socketId: socket.id, name, role });

      // send existing participants list
      const participants = Array.from(room.participants.entries()).map(([id, info]) => ({ socketId: id, ...info }));
      ack && ack({ ok: true, participants, adminId: room.adminId });
    } catch (e) {
      ack && ack({ ok: false, error: 'Join failed' });
    }
  });

  socket.on('leave-room', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (room) {
      room.participants.delete(socket.id);
      if (room.adminId === socket.id) {
        room.adminId = undefined;
      }
      socket.leave(joinedRoomId);
      socket.to(joinedRoomId).emit('participant-left', { socketId: socket.id });
      pruneRoomIfEmpty(joinedRoomId);
    }
    joinedRoomId = null;
  });

  socket.on('disconnect', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (room) {
      room.participants.delete(socket.id);
      if (room.adminId === socket.id) {
        room.adminId = undefined;
      }
      socket.to(joinedRoomId).emit('participant-left', { socketId: socket.id });
      pruneRoomIfEmpty(joinedRoomId);
    }
  });

  // Signaling channels
  // user -> admin audio signalling
  socket.on('audio-signal', ({ targetId, signal }) => {
    if (!joinedRoomId) return;
    io.to(targetId).emit('audio-signal', { from: socket.id, signal });
  });

  // admin -> user audio signalling
  socket.on('admin-audio-signal', ({ targetId, signal }) => {
    if (!joinedRoomId) return;
    io.to(targetId).emit('admin-audio-signal', { from: socket.id, signal });
  });

  // screen share signalling (admin only)
  socket.on('screen-share-signal', ({ targetId, signal }) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (room?.adminId !== socket.id) return;
    if (targetId) {
      io.to(targetId).emit('screen-share-signal', { from: socket.id, signal });
    } else {
      // broadcast to all except sender
      socket.to(joinedRoomId).emit('screen-share-signal', { from: socket.id, signal });
    }
  });

  // video signalling (optional camera from admin)
  socket.on('video-signal', ({ targetId, signal }) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (room?.adminId !== socket.id) return;
    if (targetId) {
      io.to(targetId).emit('video-signal', { from: socket.id, signal });
    } else {
      socket.to(joinedRoomId).emit('video-signal', { from: socket.id, signal });
    }
  });

  // chat
  socket.on('chat-message', ({ text }) => {
    if (!joinedRoomId || !text) return;
    io.to(joinedRoomId).emit('chat-message', { from: socket.id, name, text, ts: Date.now() });
  });

  // admin controls user mic state
  socket.on('admin-toggle-user-mic', ({ targetId, mute }) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (room?.adminId !== socket.id) return;
    io.to(targetId).emit('admin-toggle-user-mic', { mute: !!mute });
  });

  // request list of participants
  socket.on('get-participants', (ack) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    const participants = room ? Array.from(room.participants.entries()).map(([id, info]) => ({ socketId: id, ...info })) : [];
    ack && ack({ participants, adminId: room?.adminId });
  });
});

app.get('/', (req, res) => {
  res.send('CallHub signaling server running');
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${PORT}`);
});


