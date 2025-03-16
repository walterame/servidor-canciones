import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';  // Importamos WebSocketServer de 'ws'

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const rooms = {}; // Almacena las salas y sus jugadores

// Evento de conexión para WebSocket
wss.on('connection', (ws) => {
    console.log('Un usuario se ha conectado');

    // Crear una nueva sala
    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        
        if (parsedMessage.type === 'createRoom') {
            const roomCode = nanoid(4).toUpperCase(); // Código de 4 caracteres
            rooms[roomCode] = { players: [] };
            ws.send(JSON.stringify({ type: 'roomCreated', roomCode }));
            console.log(`Sala creada: ${roomCode}`);
        }

        if (parsedMessage.type === 'unirse_a_sala') {
            const { nombre, codigo } = parsedMessage;
            
            if (!rooms[codigo]) {
                ws.send(JSON.stringify({ type: 'error_sala', message: 'Sala no encontrada' }));
                return;
            }

            if (rooms[codigo].players.length >= 8) {
                ws.send(JSON.stringify({ type: 'error_sala', message: 'La sala está llena' }));
                return;
            }

            const player = {
                id: ws._socket.remoteAddress,
                name: nombre,
                avatar: null, // Lo manejamos después
                isReady: false,
            };

            rooms[codigo].players.push(player);
            ws.send(JSON.stringify({ type: 'sala_unida', players: rooms[codigo].players }));
            console.log(`${nombre} se unió a la sala ${codigo}`);
        }
    });

    // Manejo de desconexión
    ws.on('close', () => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            room.players = room.players.filter(p => p.id !== ws._socket.remoteAddress);
            if (room.players.length === 0) {
                delete rooms[roomCode];
            }
        }
        console.log('Usuario desconectado');
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});