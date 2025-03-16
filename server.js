import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';

const app = express();
const server = createServer(app);
const io = new Server(server);

const rooms = {}; // Almacena las salas y sus jugadores

// Evento de conexión
io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado:', socket.id);

    // Crear una nueva sala
    socket.on('createRoom', () => {
        const roomCode = nanoid(4).toUpperCase(); // Código de 4 caracteres
        rooms[roomCode] = { players: [] };
        socket.emit('roomCreated', roomCode);
        console.log(`Sala creada: ${roomCode}`);
    });

    // Unirse a una sala existente
    socket.on('joinRoom', ({ playerName, roomCode }) => {
        if (!rooms[roomCode]) {
            socket.emit('error', 'Sala no encontrada');
            return;
        }

        if (rooms[roomCode].players.length >= 8) {
            socket.emit('error', 'La sala está llena');
            return;
        }

        const player = {
            id: socket.id,
            name: playerName,
            avatar: null,
            isReady: false,
        };

        rooms[roomCode].players.push(player);
        socket.join(roomCode);
        io.to(roomCode).emit('playerJoined', rooms[roomCode].players);
        console.log(`${playerName} se unió a la sala ${roomCode}`);
    });

    // Manejo de desconexión
    socket.on('disconnect', () => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(roomCode).emit('playerJoined', room.players);
            if (room.players.length === 0) {
                delete rooms[roomCode];
            }
        }
        console.log('Usuario desconectado:', socket.id);
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});