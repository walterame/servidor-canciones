const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

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

            // Asignar un ID único secuencial en la sala
            const jugador = {
                id: `jugador-${salas[sala].length + 1}`, 
                nombre,
                avatar: null
            };

            salas[sala].push(jugador);
            ws.sala = sala; // Guardamos la sala en el WebSocket
            ws.jugadorID = jugador.id; // Guardamos el ID del jugador
            jugadoresPorSocket.set(ws, sala);

            console.log(`✅ ${nombre} se unió a la sala ${sala}`);

            // Enviar datos SOLO al jugador que se conectó
            ws.send(JSON.stringify({ evento: "nuevo-jugador", data: jugador }));

            // Notificar a los demás jugadores en la misma sala
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client !== ws && client.sala === sala) {
                    client.send(JSON.stringify({ evento: "jugador-conectado", data: jugador }));
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
                        if (client.readyState === WebSocket.OPEN && client.sala === sala) {
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
            salas[sala] = salas[sala].filter(j => j.id !== ws.jugadorID);
            jugadoresPorSocket.delete(ws);
        }
    });
});

// Configuración de Express
app.use(cors());
app.use(express.json()); // Esta línea se asegura de que Express pueda manejar JSON

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
