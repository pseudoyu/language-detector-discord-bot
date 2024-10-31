import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { DiscordRequest } from './utils.js';

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_PERMISSIONS = {
  permissions: [
    'VIEW_CHANNEL',
    'READ_MESSAGE_HISTORY',
    'SEND_MESSAGES',
    'MANAGE_MESSAGES',
    'EMBED_LINKS'
  ],
  permissionsBitfield: BigInt(0x4000 | 0x10000 | 0x4000000 | 0x2000 | 0x8000)
};

const generateInviteLink = (clientId) => {
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS.permissionsBitfield}&scope=bot%20applications.commands`;
};

const MONITORED_CHANNELS = process.env.MONITORED_CHANNELS ? process.env.MONITORED_CHANNELS.split(',') : [];

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  return res.status(400).json({ error: 'unknown interaction type' });
});

async function monitorChannels() {
  for (const channelId of MONITORED_CHANNELS) {
    try {
      const endpoint = `channels/${channelId}/messages`;
      const response = await DiscordRequest(endpoint, { method: 'GET' });
      const messages = await response.json();

      for (const message of messages) {
        const chinesePattern = /[\u4e00-\u9fff]+/;

        // Check for Chinese content
        if (chinesePattern.test(message.content)) {
          console.log(`Chinese content detected in message:`, {
            channelId,
            messageId: message.id,
            author: message.author.username,
            content: message.content
          });

          try {
            await DiscordRequest(`channels/${channelId}/messages/${message.id}`, { method: 'DELETE' });
            console.log(`Successfully deleted message ${message.id} from channel ${channelId}`);
          } catch (err) {
            console.error('Error deleting message:', {
              channelId,
              messageId: message.id,
              error: err.message
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error monitoring channel ${channelId}:`, {
        error: err.message,
        stack: err.stack
      });
    }
  }
}

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  console.log('Bot invite link:', generateInviteLink(process.env.APP_ID));

  monitorChannels();
  setInterval(monitorChannels, 30000);
});
