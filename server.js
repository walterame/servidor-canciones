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

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            // Verificar si el jugador ya existe por nombre
            let jugadorExistente = salas[sala].jugadores.find(j => j.nombre === nombre);
            if (jugadorExistente) {
                console.log(`⚠️ El jugador ${nombre} ya estaba en la sala, actualizando WebSocket.`);
                jugadorExistente.ws = ws;
                jugadorExistente.activo = true; // Marcar como activo nuevamente
                playerId = jugadorExistente.id;

                // Notificar a Unity sobre la reconexión del jugador
                if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                    salas[sala].juego.send(JSON.stringify({
                        tipo: "jugador-reconectado",
                        id: playerId,
                        nombre: nombre
                    }));
                    
                    // Si el jugador ya tenía un avatar, reenviar esta información
                    if (jugadorExistente.avatar) {
                        salas[sala].juego.send(JSON.stringify({
                            tipo: "avatar-seleccionado",
                            id: playerId,
                            avatar: jugadorExistente.avatar
                        }));
                    }
                } else {
                    // Guardar mensajes para cuando Unity se conecte
                    salas[sala].mensajesPendientes.push({
                        tipo: "jugador-reconectado",
                        id: playerId,
                        nombre: nombre
                    });
                    
                    if (jugadorExistente.avatar) {
                        salas[sala].mensajesPendientes.push({
                            tipo: "avatar-seleccionado",
                            id: playerId,
                            avatar: jugadorExistente.avatar
                        });
                    }
                }

                // Notificar al jugador que se ha reconectado
                ws.send(JSON.stringify({
                    tipo: "confirmacion-union",
                    id: playerId,
                    reconectado: true,
                    avatar: jugadorExistente.avatar // Devolver el avatar actual si existe
                }));
                return;
            }

            // Buscar si el jugador existe en otras salas para preservar su avatar
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

            // Notificar a Unity sobre el nuevo jugador (si está conectado)
            if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                try {
                    salas[sala].juego.send(JSON.stringify({
                        tipo: "nuevo-jugador",
                        id: playerId,
                        nombre
                    }));
                    console.log("✅ Mensaje enviado a Unity.");

                    // Si el jugador ya tenía un avatar, enviar esta información también
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
                    // Guardar los mensajes para enviarlos cuando Unity se reconecte
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
                console.log("⚠️ WebSocket de Unity no está conectado. Guardando mensaje para envío posterior.");
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

            // Confirmar unión al jugador e incluir el avatar si existe
            ws.send(JSON.stringify({
                tipo: "confirmacion-union",
                id: playerId,
                avatar: avatarExistente // Incluir el avatar si existe
            }));

        } else if (data.tipo === "seleccionar-avatar") {
            // Nuevo manejo directo de selección de avatar vía WebSocket
            const { id, avatar } = data;
            if (!id || !avatar) return;
            
            for (let sala in salas) {
                let jugador = salas[sala].jugadores.find(j => j.id == id);
                if (jugador) {
                    jugador.avatar = avatar;
                    console.log(`✅ Avatar ${avatar} seleccionado para jugador ${id} vía WebSocket`);
                    
                    const mensaje = { tipo: "avatar-seleccionado", id, avatar };
                    if (salas[sala].juego && salas[sala].juego.readyState === 1) {
                        salas[sala].juego.send(JSON.stringify(mensaje));
                    } else {
                        salas[sala].mensajesPendientes.push(mensaje);
                    }
                    
                    // Confirmar al cliente
                    ws.send(JSON.stringify({ 
                        tipo: "avatar-confirmado", 
                        mensaje: "Avatar seleccionado con éxito" 
                    }));
                    return;
                }
            }
        } else if (data.tipo === "juego") {
            let { sala } = data;
            salaActual = sala;

            if (!salas[sala]) {
                ws.send(JSON.stringify({ tipo: "error", mensaje: "Sala no encontrada" }));
                return;
            }

            // Registrar la conexión de Unity
            salas[sala].juego = ws;
            console.log(`🎮 Unity conectado a la sala ${sala}`);

            // Enviar mensajes pendientes a Unity
            if (salas[sala].mensajesPendientes.length > 0) {
                console.log(`📤 Enviando ${salas[sala].mensajesPendientes.length} mensajes pendientes a Unity`);
                salas[sala].mensajesPendientes.forEach(mensaje => {
                    ws.send(JSON.stringify(mensaje));
                });
                salas[sala].mensajesPendientes = [];
            }

            // Enviar información de todos los jugadores conectados a Unity
            salas[sala].jugadores.forEach(jugador => {
                if (jugador.activo) {
                    ws.send(JSON.stringify({
                        tipo: "nuevo-jugador",
                        id: jugador.id,
                        nombre: jugador.nombre
                    }));

                    // Si el jugador ya seleccionó un avatar, enviarlo también
                    if (jugador.avatar) {
                        ws.send(JSON.stringify({
                            tipo: "avatar-seleccionado",
                            id: jugador.id,
                            avatar: jugador.avatar
                        }));
                    }
                }
            });
        }
    });

    ws.on("close", (code, reason) => {
        console.log(`⚠️ Un WebSocket se ha desconectado. Código: ${code}, Razón: ${reason || "No especificada"}`);
        clearInterval(interval);
        
        // Registrar detalles adicionales de la desconexión
        if (code === 1001) {
            console.log("🔴 El cliente cerró la conexión WebSocket.");
        }

        // Si es un jugador, marcarlo como inactivo pero no eliminarlo
        if (playerId !== null && salaActual && salas[salaActual]) {
            const jugador = salas[salaActual].jugadores.find(j => j.id === playerId);
            if (jugador) {
                console.log(`❌ Jugador ${playerId} marcado como inactivo en la sala ${salaActual}`);
                jugador.activo = false;

                // Notificar a Unity sobre la desconexión del jugador
                if (salas[salaActual].juego && salas[salaActual].juego.readyState === 1) {
                    salas[salaActual].juego.send(JSON.stringify({
                        tipo: "jugador-desconectado",
                        id: playerId
                    }));
                } else {
                    salas[salaActual].mensajesPendientes.push({
                        tipo: "jugador-desconectado",
                        id: playerId
                    });
                }
            }
        }

        // Si es Unity, marcar el juego como desconectado
        if (salaActual && salas[salaActual] && salas[salaActual].juego === ws) {
            console.log(`⚠️ Unity desconectado de la sala ${salaActual}`);
            salas[salaActual].juego = null;
        }
    });
});

// Limpieza periódica de salas vacías (cada 1 hora)
setInterval(() => {
    const ahora = Date.now();
    for (let codigo in salas) {
        const sala = salas[codigo];
        // Contar jugadores activos
        const jugadoresActivos = sala.jugadores.filter(j => j.activo).length;
        
        // Si no hay jugadores activos y no hay conexión de Unity, eliminar la sala
        if (jugadoresActivos === 0 && !sala.juego) {
            console.log(`🧹 Eliminando sala vacía: ${codigo}`);
            delete salas[codigo];
        }
    }
}, 3600000); // 1 hora
