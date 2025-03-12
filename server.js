const express = require("express");
const { Server } = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(3000, () => console.log("Servidor en puerto 3000"));
const wss = new Server({ server });

let salas = {}; // { "ABCD": { jugadores: [], juego: ws, mensajesPendientes: [] } }

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
    salas[codigo] = { jugadores: [], juego: null, mensajesPendientes: [] };
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
            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            let jugadorExistente = salas[sala].jugadores.find(j => j.nombre === nombre);
            if (jugadorExistente) {
                console.log(`⚠️ El jugador ${nombre} ya estaba en la sala, reestableciendo WebSocket.`);
                jugadorExistente.ws = ws;
                return;
            }

            let playerId = salas[sala].jugadores.length;
            salas[sala].jugadores.push({ id: playerId, ws, nombre, avatar: null });

            console.log(`✅ Jugador ${nombre} (${playerId}) unido a la sala ${sala}`);

            ws.on("close", () => {
                console.log(`❌ Jugador ${playerId} desconectado de la sala ${sala}`);
                salas[sala].jugadores = salas[sala].jugadores.filter(j => j.ws !== ws);
            });

            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                try {
                    salas[sala].juego.send(JSON.stringify({ tipo: "nuevo-jugador", id: playerId, nombre }));
                    console.log("✅ Mensaje enviado a Unity.");
                } catch (error) {
                    console.log("❌ Error enviando mensaje a Unity:", error);
                }
            } else {
                console.log("⚠️ WebSocket de Unity no está en estado abierto o no está conectado.");
            }
            ws.send(JSON.stringify({ tipo: "confirmacion-union", id: playerId }));
        } else if (data.tipo === "juego") {
            let { sala } = data;
            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }
            salas[sala].juego = ws;
            console.log(`🎮 Unity conectado a la sala ${sala}`);
            salas[sala].mensajesPendientes.forEach(mensaje => {
                ws.send(JSON.stringify(mensaje));
            });
            salas[sala].mensajesPendientes = [];
            ws.on("close", () => {
                console.log(`⚠️ Unity desconectado de la sala ${sala}`);
                salas[sala].juego = null;
            });
        }
    });

    ws.on("close", () => {
        console.log("⚠️ Un WebSocket se ha desconectado.");
        clearInterval(interval);
    });

    ws.on("error", (err) => {
        console.log(`⚠️ Error en WebSocket: ${err.message}`);
    });
});
