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

const chinesePattern = /[\u4e00-\u9fff]+/;

async function deleteMessage(channelId, messageId) {
  try {
    await DiscordRequest(`channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
    console.log(`Successfully deleted message ${messageId} from channel ${channelId}`);
  } catch (err) {
    console.error('Error deleting message:', {
      channelId,
      messageId,
      error: err.message
    });
  }
}

async function monitorRegularChannels() {
  for (const channelId of MONITORED_CHANNELS) {
    try {
      const endpoint = `channels/${channelId}/messages`;
      const response = await DiscordRequest(endpoint, { method: 'GET' });
      const messages = await response.json();

      for (const message of messages) {
        if (chinesePattern.test(message.content)) {
          console.log(`Chinese content detected in regular channel message:`, {
            channelId,
            messageId: message.id,
            author: message.author.username,
            content: message.content
          });

          await deleteMessage(channelId, message.id);
        }
      }
    } catch (err) {
      console.error(`Error monitoring regular channel ${channelId}:`, {
        error: err.message,
        stack: err.stack
      });
    }
  }
}

function startMonitoring() {
  monitorRegularChannels();
  setInterval(monitorRegularChannels, 30000);
}

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  console.log('Bot invite link:', generateInviteLink(process.env.APP_ID));

  startMonitoring();
});