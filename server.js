import express from "express";
import { WebSocketServer as Server } from "ws";
import cors from "cors";
import { createServer } from "http";

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
server.listen(3000, () => console.log("Servidor en puerto 3000"));

const wss = new Server({ server });

let salas = {}; // { "ABCD": { jugadores: [], juego: ws, mensajesPendientes: [], creadoPorUnity: ws } }

function generarCodigo() {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let codigo;
    do {
        codigo = Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join("");
    } while (salas[codigo]);
    return codigo;
}

app.post("/crear-sala", (req, res) => {
    let codigo = generarCodigo();
    salas[codigo] = { jugadores: [], juego: null, mensajesPendientes: [], creadoPorUnity: null };
    res.json({ codigo });
});

app.post("/seleccionar-avatar", (req, res) => {
    const { id, avatar } = req.body;
    if (!id || !avatar) return res.status(400).json({ error: "ID de jugador y avatar son requeridos" });
    for (let sala in salas) {
        let jugador = salas[sala].jugadores.find(j => j.id == id);
        if (jugador) {
            jugador.avatar = avatar;
            const mensaje = { tipo: "avatar-seleccionado", id, avatar };
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                salas[sala].juego.send(JSON.stringify(mensaje));
            } else {
                salas[sala].mensajesPendientes.push(mensaje);
            }
            return res.json({ mensaje: "Avatar seleccionado con éxito" });
        }
    }
    res.status(404).json({ error: "Jugador no encontrado" });
});

wss.on("connection", (ws) => {
    console.log("✅ Nuevo WebSocket conectado.");
    let playerId = null;
    let salaActual = null;

    const interval = setInterval(() => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ tipo: "ping" }));
        } else {
            clearInterval(interval);
        }
    }, 15000);

    ws.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg.toString());
        } catch (error) {
            console.log("❌ Error al parsear mensaje JSON:", error);
            return;
        }

        if (data.tipo === "unir") {
            let { sala, nombre } = data;
            salaActual = sala;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            let jugadorExistente = salas[sala].jugadores.find(j => j.nombre === nombre);
            if (jugadorExistente) {
                jugadorExistente.ws = ws;
                playerId = jugadorExistente.id;
                ws.send(JSON.stringify({ tipo: "confirmacion-union", id: playerId, reconectado: true, avatar: jugadorExistente.avatar }));
                return;
            }

            playerId = salas[sala].jugadores.length;
            salas[sala].jugadores.push({ id: playerId, ws, nombre, avatar: null, activo: true });
            console.log(`✅ Jugador ${nombre} (${playerId}) unido a la sala ${sala}`);
            ws.send(JSON.stringify({ tipo: "confirmacion-union", id: playerId }));
        } else if (data.tipo === "juego") {
            let { sala } = data;
            salaActual = sala;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            salas[sala].juego = ws;
            salas[sala].creadoPorUnity = ws;
            console.log(`🎮 Unity conectado a la sala ${sala}`);
        }
    });

    ws.on("close", () => {
        if (salaActual && salas[salaActual]) {
            if (salas[salaActual].creadoPorUnity === ws) {
                console.log(`❌ Sala ${salaActual} eliminada porque su instancia de Unity se desconectó.`);
                delete salas[salaActual];
            } else {
                const jugadorIndex = salas[salaActual].jugadores.findIndex(j => j.id === playerId);
                if (jugadorIndex !== -1) {
                    salas[salaActual].jugadores[jugadorIndex].activo = false;
                    console.log(`❌ Jugador ${playerId} desconectado de la sala ${salaActual}`);
                }
            }
        }
        clearInterval(interval);
    });
});