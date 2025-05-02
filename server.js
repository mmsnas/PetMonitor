const http = require('http');
const { Server } = require("socket.io");

const server = http.createServer();
const io = new Server(server, {
    cors: { // Allow connections from any origin for development/testing
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = {}; // Store room information { roomId: { users: { userId: {deviceName, role, socketId} }, cameras: Set<deviceName>, viewers: Set<deviceName> } }

console.log('Signaling server starting...');

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    let currentRoom = null;
    let currentUserId = null; // This will be the deviceName
    let currentUserRole = null;

    socket.on('join_room', (data) => {
        const { room, deviceName, role } = data;
        if (!room || !deviceName || !role) {
            console.error('Invalid join_room data:', data);
            socket.emit('error', 'Invalid join data. Missing room, deviceName, or role.');
            return;
        }

        currentRoom = room;
        currentUserId = deviceName; // Use deviceName as the unique ID
        currentUserRole = role;

        // Initialize room if it doesn't exist
        if (!rooms[currentRoom]) {
            rooms[currentRoom] = { users: {}, cameras: new Set(), viewers: new Set() };
        }

        // Check for uniqueness: deviceName should only be registered once per room
        if (rooms[currentRoom].cameras.has(deviceName) || rooms[currentRoom].viewers.has(deviceName)) {
            console.warn(`Device ${deviceName} already registered in room ${currentRoom}. Disconnecting old connection if possible.`);
            // Find the old socket and disconnect it (more robust implementation needed for production)
            for (const userId in rooms[currentRoom].users) {
                if (rooms[currentRoom].users[userId].deviceName === deviceName) {
                    const oldSocketId = rooms[currentRoom].users[userId].socketId;
                    const oldSocket = io.sockets.sockets.get(oldSocketId);
                    if (oldSocket && oldSocket.id !== socket.id) {
                        oldSocket.emit('error', 'New connection established for this device. Disconnecting.');
                        oldSocket.disconnect(true);
                        console.log(`Disconnected old socket ${oldSocketId} for device ${deviceName}`);
                    }
                    // Remove old user entry
                    delete rooms[currentRoom].users[userId];
                    rooms[currentRoom].cameras.delete(deviceName);
                    rooms[currentRoom].viewers.delete(deviceName);
                    break;
                }
            }
        }

        // Add user to the room
        socket.join(currentRoom);
        rooms[currentRoom].users[currentUserId] = { deviceName, role, socketId: socket.id };
        if (role === 'camera') {
            rooms[currentRoom].cameras.add(deviceName);
        } else if (role === 'viewer') {
            rooms[currentRoom].viewers.add(deviceName);
        }

        console.log(`Device ${currentUserId} (${currentUserRole}) joined room ${currentRoom}`);

        // Notify the user about other users in the room
        const otherUsers = Object.keys(rooms[currentRoom].users).filter(id => id !== currentUserId);
        socket.emit('other_users', otherUsers);
        console.log(`Sent other_users [${otherUsers.join(', ')}] to ${currentUserId}`);

        // Notify other users about the new user
        socket.to(currentRoom).emit('user_joined', currentUserId);
        console.log(`Broadcast user_joined: ${currentUserId} to room ${currentRoom}`);
    });

    socket.on('offer', (data) => {
        const { target, sdp } = data;
        console.log(`Relaying offer from ${currentUserId} to ${target}`);
        const targetUser = rooms[currentRoom]?.users[target];
        if (targetUser) {
            io.to(targetUser.socketId).emit('offer', { sdp, sender: currentUserId });
        } else {
            console.warn(`Target user ${target} not found for offer from ${currentUserId}`);
        }
    });

    socket.on('answer', (data) => {
        const { target, sdp } = data;
        console.log(`Relaying answer from ${currentUserId} to ${target}`);
        const targetUser = rooms[currentRoom]?.users[target];
        if (targetUser) {
            io.to(targetUser.socketId).emit('answer', { sdp, sender: currentUserId });
        } else {
            console.warn(`Target user ${target} not found for answer from ${currentUserId}`);
        }
    });

    socket.on('ice_candidate', (data) => {
        const { target, candidate } = data;
        // console.log(`Relaying ICE candidate from ${currentUserId} to ${target}`); // Can be verbose
        const targetUser = rooms[currentRoom]?.users[target];
        if (targetUser) {
            io.to(targetUser.socketId).emit('ice_candidate', { candidate, sender: currentUserId });
        } else {
            // console.warn(`Target user ${target} not found for ICE candidate from ${currentUserId}`); // Can be verbose
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}, Device: ${currentUserId}`);
        if (currentRoom && currentUserId && rooms[currentRoom]?.users[currentUserId]) {
            console.log(`Device ${currentUserId} (${currentUserRole}) left room ${currentRoom}`);
            // Remove user from room data
            delete rooms[currentRoom].users[currentUserId];
            if (currentUserRole === 'camera') {
                rooms[currentRoom].cameras.delete(currentUserId);
            } else if (currentUserRole === 'viewer') {
                rooms[currentRoom].viewers.delete(currentUserId);
            }

            // Notify other users
            socket.to(currentRoom).emit('user_left', currentUserId);

            // Clean up room if empty
            if (Object.keys(rooms[currentRoom].users).length === 0) {
                console.log(`Room ${currentRoom} is empty, deleting.`);
                delete rooms[currentRoom];
            }
        } else {
             console.log(`User ${socket.id} disconnected before joining a room or was already removed.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server listening on port ${PORT}`);
});

