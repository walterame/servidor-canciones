const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const router = require("./router"); // Asegúrate de tener el archivo router.js

const app = express();
const server = http.createServer(app);

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

// Salas y jugadores
const salas = {};
const jugadoresPorSocket = new Map(); // Mapa para rastrear la sala de cada socket

wss.on("connection", (ws) => {
    console.log("⚡ Usuario conectado");

    ws.on("message", (message) => {
        console.log(`📩 Mensaje recibido: ${message}`);
        const data = JSON.parse(message);

        if (data.tipo === "unir") {
            const { sala, nombre } = data;
            if (!salas[sala]) {
                salas[sala] = [];
            }

            const jugador = {
                id: ws._socket.remoteAddress, // Usamos la IP como ID temporal
                nombre,
                avatar: null
            };

            salas[sala].push(jugador);
            jugadoresPorSocket.set(ws, sala); // Asignamos la sala al socket
            console.log(`✅ ${nombre} se unió a la sala ${sala}`);

            // Notificar a todos los jugadores de la sala
           wss.clients.forEach((client) => {
                const salaJugador = jugadoresPorSocket.get(client);
                if (client.readyState === WebSocket.OPEN && salaJugador === sala) {
                    client.send(JSON.stringify({ evento: "nuevo-jugador", data: jugador })); // 🔹 Formato corregido
                }
            });
        }

        if (data.tipo === "seleccionar-avatar") {
            const { id, avatar } = data;
            for (const sala in salas) {
                const jugador = salas[sala].find(j => j.id === id);
                if (jugador) {
                    jugador.avatar = avatar;
                   wss.clients.forEach((client) => {
                        const salaJugador = jugadoresPorSocket.get(client);
                        if (client.readyState === WebSocket.OPEN && salaJugador === sala) {
                            client.send(JSON.stringify({ evento: "avatar-actualizado", data: jugador }));
                        }
                    });
                    console.log(`🎭 ${jugador.nombre} seleccionó el avatar ${avatar}`);
                    break;
                }
            }
        }
    });

    ws.on("close", () => {
        console.log("❌ Usuario desconectado");
        const sala = jugadoresPorSocket.get(ws);
        if (sala) {
            salas[sala] = salas[sala].filter(j => j.id !== ws._socket.remoteAddress);
            jugadoresPorSocket.delete(ws);
        }
    });
});

// Configuración de Express
app.use(cors());
app.use(express.json());
app.use(router); // Usamos las rutas separadas en otro archivo (router.js)

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
