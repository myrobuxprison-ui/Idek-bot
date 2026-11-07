const { AttachmentBuilder } = require('discord.js');

const MAX_MESSAGES = 2000;

function formatDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Récupère tous les messages du ticket et en fait un fichier .txt lisible. */
async function buildTranscript(channel, info) {
  const messages = [];
  let before;
  while (messages.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.reverse();

  const lines = [
    `Transcript of ticket #${channel.name}`,
    `Server: ${channel.guild.name}`,
    `Opened by: ${info.ownerTag ?? info.owner} (${info.owner})`,
    `Type: ${info.type}`,
    `Opened on: ${formatDate(channel.createdAt)}`,
    `Messages: ${messages.length}`,
    '='.repeat(60),
    '',
  ];

  for (const msg of messages) {
    lines.push(`[${formatDate(msg.createdAt)}] ${msg.author.tag}${msg.author.bot ? ' [BOT]' : ''}`);
    if (msg.content) lines.push(msg.content);
    for (const embed of msg.embeds) {
      if (embed.title) lines.push(`  [Embed] ${embed.title}`);
      if (embed.description) lines.push(`  ${embed.description.replace(/\n/g, '\n  ')}`);
      for (const field of embed.fields) lines.push(`  • ${field.name}: ${field.value}`);
    }
    for (const attachment of msg.attachments.values()) lines.push(`  [File] ${attachment.name} - ${attachment.url}`);
    lines.push('');
  }

  const safeName = channel.name.replace(/[^a-z0-9_-]/gi, '').replace(/^-+/, '') || channel.id;
  return {
    count: messages.length,
    file: new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `transcript-${safeName}.txt` }),
  };
}

module.exports = { buildTranscript };
