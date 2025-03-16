import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Almacena las salas y sus jugadores

// Crear una nueva sala
io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado:', socket.id);

    socket.on('createRoom', () => {
        const roomCode = nanoid(4).toUpperCase(); // Código de 4 caracteres
        rooms[roomCode] = { players: [] };
        socket.emit('roomCreated', roomCode);
        console.log(`Sala creada: ${roomCode}`);
    });

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

server.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000');
});
