const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
// Configure CORS for Socket.IO if needed (allowing connections from your app's origin)
// Example: Allow all origins (use with caution in production)
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust this in production to your specific app origin
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Basic room management (can be enhanced)
const rooms = {}; // Store clients per room

app.get('/', (req, res) => {
  res.send('Signaling Server is running');
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  let currentRoom = null;

  // Handle joining a room
  socket.on('join_room', (roomName) => {
    console.log(`Client ${socket.id} joining room: ${roomName}`);
    socket.join(roomName);
    currentRoom = roomName;

    if (!rooms[roomName]) {
      rooms[roomName] = [];
    }
    rooms[roomName].push(socket.id);

    // Notify others in the room (excluding sender)
    socket.to(roomName).emit('user_joined', socket.id);

    // Send list of current users to the new user
    const otherUsers = rooms[roomName].filter(id => id !== socket.id);
    socket.emit('existing_users', otherUsers);

    console.log(`Users in room ${roomName}:`, rooms[roomName]);
  });

  // Forward WebRTC signaling messages
  socket.on('offer', (data) => {
    console.log(`Offer from ${socket.id} to ${data.target}`);
    // Send offer only to the target user
    io.to(data.target).emit('offer', { offer: data.offer, source: socket.id });
  });

  socket.on('answer', (data) => {
    console.log(`Answer from ${socket.id} to ${data.target}`);
    // Send answer only to the target user
    io.to(data.target).emit('answer', { answer: data.answer, source: socket.id });
  });

  socket.on('ice_candidate', (data) => {
    // console.log(`ICE Candidate from ${socket.id} to ${data.target}`); // Can be very verbose
    // Send candidate only to the target user
    io.to(data.target).emit('ice_candidate', { candidate: data.candidate, source: socket.id });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (currentRoom && rooms[currentRoom]) {
      // Remove user from room list
      rooms[currentRoom] = rooms[currentRoom].filter(id => id !== socket.id);
      console.log(`Users left in room ${currentRoom}:`, rooms[currentRoom]);
      // Notify others in the room
      socket.to(currentRoom).emit('user_left', socket.id);

      // Clean up empty room
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
        console.log(`Room ${currentRoom} deleted as it is empty.`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server listening on *:${PORT}`);
});

