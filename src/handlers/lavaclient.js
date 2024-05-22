const { EmbedBuilder, GatewayDispatchEvents } = require("discord.js");
const { Cluster } = require("lavaclient");
const axios = require("axios");
const prettyMs = require("pretty-ms");
require("@lavaclient/plugin-queue/register");

/**
 * @param {import("@structures/BotClient")} client
 */
module.exports = (client) => {

  const lavaclient = new Cluster({
    nodes: client.config.MUSIC.LAVALINK_NODES.map(node => ({
      ...node,
      info: {
        host: node.host,
        port: node.port,
        auth: node.auth,
      },
      ws: {
        clientName: "Strange",
        resuming: true,
        reconnecting: {
          tries: Infinity,
          delay: (attempt) => attempt * 1000
        }
      }
    })),
    discord: {
      sendGatewayCommand: (id, payload) => client.guilds.cache.get(id)?.shard?.send(payload),
    },
  });

  client.ws.on(GatewayDispatchEvents.VoiceStateUpdate, (data) => lavaclient.players.handleVoiceUpdate(data));
  client.ws.on(GatewayDispatchEvents.VoiceServerUpdate, (data) => lavaclient.players.handleVoiceUpdate(data));

  lavaclient.on("nodeConnected", (node, event) => {
    client.logger.log(`Nodo "${node.identifier}" conectado`);
  });

  lavaclient.on("nodeDisconnected", (node, event) => {
    client.logger.log(`Nodo "${node.identifier}" desconectado`);
    const reconnectInterval = 30000; // Time in MS, change as needed.
    setTimeout(() => {
      node.connect();
    }, reconnectInterval);
  });

  lavaclient.on("nodeError", (node, error) => {
    client.logger.error(`Node "${node.identifier}" encountered an error: ${error.message}.`, error);
  });

  lavaclient.on("nodeTrackStart", async (_node, queue, track) => {
  ///lavaclient.on("nodeTrackStart", (_node, queue, song) => {
    const fields = [];

    const embed = new EmbedBuilder()
      .setAuthor({ name: "Now Playing" })
      .setColor(client.config.EMBED_COLORS.BOT_EMBED)
      .setDescription(`[${track.info.title}](${track.info.uri})`)
      .setFooter({ text: `Solicitado por: ${track.requesterId}` })
      .setThumbnail(track.info.artworkUrl);

    fields.push({
      name: "Duración de la canción",
      value: "`" + prettyMs(track.info.length, { colonNotation: true }) + "`",
      inline: true,
    });

    if (queue.tracks.length > 0) {
      fields.push({
        name: "Posición en cola",
        value: (queue.tracks.length + 1).toString(),
        inline: true,
      });
    }

    embed.setFields(fields);
    queue.data.channel.safeSend({ embeds: [embed] });

       // update voice channel status with 'Now Playing'
       await client.wait(1000) // waiting 1 sec, because channel id is null initially
       await updateVoiceStatus(queue.player.voice.channelId, `Playing **${track.info.title}**`)
  });

  lavaclient.on("nodeQueueFinish", async (_node, queue) => {
    queue.data.channel.safeSend("Lista de reproducción terminada.");
    await client.musicManager.players.destroy(queue.player.guildId).then(() => queue.player.voice.disconnect());
     // reset voice channel's status
     await updateVoiceStatus(queue.player.voice.channelId, '')
    });
  
    // for when player is paused, indicate 'paused' in the status
    lavaclient.on('playerPaused', async (player, track) => {  
      await updateVoiceStatus(player.voice.channelId, `Paused **${track.info.title}**`) 
    })
    // for when player is resumed, indicate 'playing' in the status
    lavaclient.on('playerResumed', async (player, track) => { 
      await updateVoiceStatus(player.voice.channelId, `Playing **${track.info.title}**`)     
    })
    // for when player is stopped, reset the status
    lavaclient.on('playerDestroy', async (player) => {
      await updateVoiceStatus(player.voice.channelId, '')     
    })

  return lavaclient;
};


async function updateVoiceStatus(channel, status) {
  const url = `https://discord.com/api/v10/channels/${channel}/voice-status`;
  const payload = {
    status: status
  };
  axios.put(url, payload, {
    headers: {
      Authorization: `Bot ${process.env.BOT_TOKEN}`
    }
  })
    .catch(error => {
      console.error('Error updating VC status:', error.response ? error.response.data : error.message);
    });
}
