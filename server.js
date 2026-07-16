const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }   // Permite conexão de qualquer origem (útil para testes)
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    socket.on('join_room', (data) => {
        const { room, deviceName, role } = data;
        socket.join(room);
        socket.room = room;
        socket.deviceName = deviceName;
        socket.role = role;

        console.log(`${deviceName} (${role}) entrou na sala: ${room}`);

        // Notifica quem já está na sala
        const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
        const otherUsers = clients.filter(id => id !== socket.id);

        socket.emit('other_users', otherUsers);
        socket.to(room).emit('user_joined', socket.id);
    });

    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('ice_candidate', (data) => {
        socket.to(data.target).emit('ice_candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('disconnect', () => {
        if (socket.room) {
            socket.to(socket.room).emit('user_left', socket.id);
            console.log(`Cliente desconectou: ${socket.deviceName}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Signaling rodando na porta ${PORT}`);
});
