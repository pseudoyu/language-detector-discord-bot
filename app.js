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

async function checkLinkPreview(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i) ||
                      html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:title"[^>]*>/i);
    if (titleMatch) {
      const nonEnglishPattern = /[^\x00-\x7F]+/;
      return nonEnglishPattern.test(titleMatch[1]);
    }
    return false;
  } catch (err) {
    console.error('Error checking link preview:', err);
    return false;
  }
}

async function monitorChannels() {
  console.log('Starting channel monitoring cycle...');
  for (const channelId of MONITORED_CHANNELS) {
    try {
      console.log(`Checking channel ${channelId}...`);
      const endpoint = `channels/${channelId}/messages`;
      const response = await DiscordRequest(endpoint, { method: 'GET' });
      const messages = await response.json();

      console.log(`Found ${messages.length} messages in channel ${channelId}`);

      for (const message of messages) {
        const nonEnglishPattern = /[^\x00-\x7F]+/;
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const urls = message.content.match(urlPattern);

        let shouldDelete = false;

        // Check for non-English content
        if (nonEnglishPattern.test(message.content)) {
          console.log(`Non-English content detected in message:`, {
            channelId,
            messageId: message.id,
            author: message.author.username,
            content: message.content
          });
          shouldDelete = true;
        }

        // Check URLs for non-English previews
        if (urls && !shouldDelete) {
          for (const url of urls) {
            const hasNonEnglishPreview = await checkLinkPreview(url);
            if (hasNonEnglishPreview) {
              console.log(`Non-English preview detected for URL:`, {
                channelId,
                messageId: message.id,
                url
              });
              shouldDelete = true;
              break;
            }
          }
        }

        if (shouldDelete) {
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
  console.log('Finished channel monitoring cycle');
}

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  console.log('Bot invite link:', generateInviteLink(process.env.APP_ID));

  monitorChannels();
  setInterval(monitorChannels, 30000);
});
