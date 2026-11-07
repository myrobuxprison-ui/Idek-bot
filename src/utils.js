const { AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const NAMED_COLORS = {
  cyan: '#00D4FF',
  blue: '#3498DB',
  red: '#ED4245',
  green: '#57F287',
  purple: '#9B59B6',
  pink: '#EB459E',
  orange: '#E67E22',
  yellow: '#FEE75C',
  white: '#FFFFFF',
  black: '#010101',
  gray: '#95A5A6',
};

/** "#00D4FF", "00d4ff", "0x00D4FF" ou "cyan" -> nombre. null si invalide. */
function parseColor(input) {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (NAMED_COLORS[value]) value = NAMED_COLORS[value];
  value = value.replace(/^(#|0x)/, '');
  if (!/^[0-9a-f]{6}$/.test(value)) return null;
  return parseInt(value, 16);
}

/** Les options texte des slash commands ne gèrent pas les retours à la ligne : on accepte "\n". */
function unescapeNewlines(text) {
  return text ? text.replace(/\\n/g, '\n') : text;
}

function guessExtension(name, contentType) {
  const match = /\.(png|jpe?g|gif|webp)(?:\?|$)/i.exec(name || '');
  if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  if (contentType?.includes('gif')) return 'gif';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('jpeg')) return 'jpg';
  return 'png';
}

/**
 * Télécharge une image et la prépare pour être ré-uploadée avec le message.
 * Les liens d'images Discord expirent : en ré-uploadant le fichier dans le message du bot,
 * l'image de l'embed reste affichée pour toujours.
 */
async function imageFromUrl(url, baseName, originalName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const name = `${baseName}.${guessExtension(originalName || new URL(url).pathname, res.headers.get('content-type'))}`;
  return { file: new AttachmentBuilder(buffer, { name }), ref: `attachment://${name}` };
}

function isImage(attachment) {
  return Boolean(attachment?.contentType?.startsWith('image/'));
}

/** Staff = possède le rôle staff du ticket OU la permission "Gérer les salons". */
function isStaff(member, staffRoleId) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  return Boolean(staffRoleId && member.roles.cache.has(staffRoleId));
}

/** Répond en message privé (éphémère) sans planter si l'interaction a déjà reçu une réponse. */
async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

module.exports = {
  parseColor,
  unescapeNewlines,
  imageFromUrl,
  isImage,
  isStaff,
  replyEphemeral,
  truncate,
};
