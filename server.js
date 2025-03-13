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
    let playerId = null;
    let salaActual = null;

    // Setup heartbeat
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

            // Si el jugador ya está en otra sala, eliminarlo antes de asignarlo a la nueva
            for (let salaGuardada in salas) {
                let index = salas[salaGuardada].jugadores.findIndex(j => j.nombre === nombre);
                if (index !== -1) {
                    console.log(`🚨 Eliminando al jugador ${nombre} de la sala anterior ${salaGuardada}`);
                    salas[salaGuardada].jugadores.splice(index, 1); // Remover jugador de la sala anterior
                }
            }

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            // Recuperar el avatar si existía en otra sala
            let avatarExistente = null;
            for (let otraSala in salas) {
                if (otraSala !== sala) {
                    let jugadorEnOtraSala = salas[otraSala].jugadores.find(j => j.nombre === nombre);
                    if (jugadorEnOtraSala && jugadorEnOtraSala.avatar) {
                        avatarExistente = jugadorEnOtraSala.avatar;
                        console.log(`ℹ️ Recuperado avatar ${avatarExistente} de jugador ${nombre} desde sala ${otraSala}`);
                        break;
                    }
                }
            }

            // Asignar nuevo ID de jugador
            playerId = salas[sala].jugadores.length;
            salas[sala].jugadores.push({
                id: playerId,
                ws,
                nombre,
                avatar: avatarExistente, // Usar avatar recuperado o null
                activo: true
            });

            console.log(`✅ Jugador ${nombre} (${playerId}) unido a la sala ${sala}`);

            // Confirmar unión al jugador e incluir el avatar si existe
            ws.send(JSON.stringify({
                tipo: "confirmacion-union",
                id: playerId,
                avatar: avatarExistente // Incluir el avatar si existe
            }));

            // Notificar a Unity sobre el nuevo jugador (si está conectado)
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                try {
                    salas[sala].juego.send(JSON.stringify({
                        tipo: "nuevo-jugador",
                        id: playerId,
                        nombre
                    }));
                    console.log("✅ Mensaje enviado a Unity.");

                    if (avatarExistente) {
                        salas[sala].juego.send(JSON.stringify({
                            tipo: "avatar-seleccionado",
                            id: playerId,
                            avatar: avatarExistente
                        }));
                        console.log(`✅ Enviado avatar existente ${avatarExistente} para jugador ${nombre}`);
                    }
                } catch (error) {
                    console.log("❌ Error enviando mensaje a Unity:", error);
                    salas[sala].mensajesPendientes.push({
                        tipo: "nuevo-jugador",
                        id: playerId,
                        nombre
                    });

                    if (avatarExistente) {
                        salas[sala].mensajesPendientes.push({
                            tipo: "avatar-seleccionado",
                            id: playerId,
                            avatar: avatarExistente
                        });
                    }
                }
            } else {
                salas[sala].mensajesPendientes.push({ tipo: "nuevo-jugador", id: playerId, nombre });
                if (avatarExistente) {
                    salas[sala].mensajesPendientes.push({ tipo: "avatar-seleccionado", id: playerId, avatar: avatarExistente });
                }
            }
        }
    });

    ws.on("close", () => {
        console.log("⚠️ Un WebSocket se ha desconectado.");
        clearInterval(interval);

        // Si es un jugador, marcarlo como inactivo pero no eliminarlo
        if (playerId !== null && salaActual && salas[salaActual]) {
            const jugador = salas[salaActual].jugadores.find(j => j.id === playerId);
            if (jugador) {
                console.log(`❌ Jugador ${playerId} desconectado de la sala ${salaActual}`);
                jugador.activo = false;

                if (salas[salaActual].juego && salas[salaActual].juego.readyState === 1) {
                    salas[salaActual].juego.send(JSON.stringify({ tipo: "jugador-desconectado", id: playerId }));
                } else {
                    salas[salaActual].mensajesPendientes.push({ tipo: "jugador-desconectado", id: playerId });
                }
            }
        }

        if (salaActual && salas[salaActual] && salas[salaActual].juego === ws) {
            console.log(`⚠️ Unity desconectado de la sala ${salaActual}`);
            salas[salaActual].juego = null;
        }
    });
});
