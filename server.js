const express = require("express");
const { Server } = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(3000, () => console.log("🚀 Servidor en puerto 3000"));
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
    let playerId = null;
    let salaActual = null;

    // Configurar heartbeat para mantener la conexión activa
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
                console.log(`❌ Sala ${sala} no encontrada. Creándola.`);
                salas[sala] = { jugadores: [], juego: null, mensajesPendientes: [] };
            }

            // Buscar si el jugador ya está en otra sala
            for (let salaGuardada in salas) {
                let jugadorExistente = salas[salaGuardada].jugadores.find(j => j.nombre === nombre);
                if (jugadorExistente) {
                    // Si el WebSocket anterior sigue abierto, evitar eliminarlo
                    if (jugadorExistente.ws && jugadorExistente.ws.readyState === WebSocket.OPEN) {
                        console.log(`⚠️ Jugador ${nombre} ya tiene una conexión activa en la sala ${salaGuardada}.`);
                        return;
                    }
                    console.log(`🚨 Eliminando al jugador ${nombre} de la sala anterior ${salaGuardada}`);
                    salas[salaGuardada].jugadores = salas[salaGuardada].jugadores.filter(j => j.nombre !== nombre);
                }
            }

            // Asignar nuevo ID de jugador
            playerId = salas[sala].jugadores.length;
            salas[sala].jugadores.push({
                id: playerId,
                ws,
                nombre,
                avatar: null,
                activo: true
            });

            console.log(`✅ Jugador ${nombre} (${playerId}) unido a la sala ${sala}`);

            // Confirmar unión al jugador
            ws.send(JSON.stringify({
                tipo: "confirmacion-union",
                id: playerId,
                avatar: null
            }));

            // Notificar a Unity sobre el nuevo jugador (si está conectado)
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                salas[sala].juego.send(JSON.stringify({
                    tipo: "nuevo-jugador",
                    id: playerId,
                    nombre
                }));
            } else {
                salas[sala].mensajesPendientes.push({
                    tipo: "nuevo-jugador",
                    id: playerId,
                    nombre
                });
            }
        }
    });

    ws.on("close", (code, reason) => {
        console.log(`⚠️ Un WebSocket se ha desconectado. Código: ${code}, Razón: ${reason || "Sin razón"}`);
        clearInterval(interval);

        // Marcar jugador como inactivo en lugar de eliminarlo inmediatamente
        if (playerId !== null && salaActual && salas[salaActual]) {
            let jugador = salas[salaActual].jugadores.find(j => j.id === playerId);
            if (jugador) {
                console.log(`❌ Jugador ${playerId} marcado como inactivo en la sala ${salaActual}`);
                jugador.activo = false;
            }
        }
    });
});
