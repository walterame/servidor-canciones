const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const router = require("./router");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(router); // Usamos las rutas separadas en otro archivo

const salas = {}; // Almacenará las salas y jugadores

io.on("connection", (socket) => {
    console.log(`⚡ Usuario conectado: ${socket.id}`);

    socket.on("unir", ({ sala, nombre }) => {
        if (!salas[sala]) {
            salas[sala] = [];
        }

        const jugador = {
            id: socket.id,
            nombre,
            avatar: null
        };

        salas[sala].push(jugador);
        socket.join(sala);

        io.to(sala).emit("nuevo-jugador", jugador);
        console.log(`✅ ${nombre} se unió a la sala ${sala}`);
    });

    socket.on("seleccionar-avatar", ({ id, avatar }) => {
        for (const sala in salas) {
            const jugador = salas[sala].find(j => j.id === id);
            if (jugador) {
                jugador.avatar = avatar;
                io.to(sala).emit("avatar-actualizado", jugador);
                console.log(`🎭 ${jugador.nombre} seleccionó el avatar ${avatar}`);
                break;
            }
        }
    });

    socket.on("disconnect", () => {
        console.log(`❌ Usuario desconectado: ${socket.id}`);
        for (const sala in salas) {
            salas[sala] = salas[sala].filter(j => j.id !== socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));