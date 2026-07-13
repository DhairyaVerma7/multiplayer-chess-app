const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the static files from the 'public' directory (HTML, MP3s, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Store active game rooms
const rooms = {};

// Generate a random 5-character room code
function generateCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Host creates a room
    socket.on('create-room', (data) => {
        const code = generateCode();
        
        rooms[code] = {
            players: { [socket.id]: 'w' }, // Creator is always White
            minutes: data.minutes || 10,
            code: code
        };
        
        socket.join(code);
        socket.emit('room-created', { code, color: 'w' });
        console.log(`Room ${code} created by ${socket.id}`);
    });

    // Player attempts to join a room
    socket.on('join-room', (code) => {
        code = code.trim().toUpperCase();
        const room = rooms[code];
        
        if (!room) {
            return socket.emit('join-error', 'Room not found. Check the code and try again.');
        }
        if (Object.keys(room.players).length >= 2) {
            return socket.emit('join-error', 'Room is already full.');
        }

        // Join successful; assign Black to the joiner
        room.players[socket.id] = 'b';
        socket.join(code);
        
        // Notify the joiner
        socket.emit('room-joined', { code, color: 'b' });
        
        // Notify both players in the room to start the game
        io.to(code).emit('game-start', { minutes: room.minutes });
        console.log(`User ${socket.id} joined room ${code}`);
    });

    // Handle a chess move
    socket.on('attempt-move', (move) => {
        // Find which room this socket belongs to
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        
        if (roomCode) {
            // Broadcast the move to BOTH players in the room so their boards update
            io.to(roomCode).emit('move-applied', move);
        }
    });

    // Handle disconnections (closing the tab, losing internet)
    socket.on('disconnecting', () => {
        for (const roomCode of socket.rooms) {
            if (roomCode !== socket.id) {
                // Tell the remaining player their opponent left
                socket.to(roomCode).emit('opponent-left');
                // Clean up the room from memory
                delete rooms[roomCode];
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Chess server running on http://localhost:${PORT}`);
});