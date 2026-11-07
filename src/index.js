const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const config = require('./config');
const tickets = require('./tickets/handlers');
const { replyEphemeral } = require('./utils');

const commands = new Map(
  [require('./commands/embed'), require('./commands/ticket-panel'), require('./commands/ticket'), require('./commands/help')].map(
    (cmd) => [cmd.data.name, cmd],
  ),
);

if (!config.token) {
  console.error('❌ DISCORD_TOKEN is missing. Add it in the Railway variables (or in .env locally).');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // nécessaire pour les transcripts des tickets
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag} on ${c.guilds.cache.size} server(s)`);
  c.user.setActivity(config.status, { type: ActivityType.Watching });

  const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
  try {
    if (config.guildId) {
      // Commandes du serveur : visibles instantanément
      await c.application.commands.set(body, config.guildId);
      await c.application.commands.set([]); // évite les doublons avec d'anciennes commandes globales
      console.log(`✅ ${body.length} commands registered on server ${config.guildId}`);
    } else {
      // Commandes globales : peuvent mettre jusqu'à 1h à apparaître
      await c.application.commands.set(body);
      console.log(`✅ ${body.length} global commands registered (set GUILD_ID to make them appear instantly)`);
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }
    if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('tk:')) {
      await tickets.handle(interaction);
    }
  } catch (err) {
    console.error(`[interaction] ${interaction.customId ?? interaction.commandName}:`, err);
    if (interaction.isRepliable()) {
      await replyEphemeral(interaction, `❌ Something went wrong: ${err.message}`).catch(() => {});
    }
  }
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(config.token).catch((err) => {
  if (/disallowed intents/i.test(err.message)) {
    console.error(
      '❌ Enable "MESSAGE CONTENT INTENT" in the Discord Developer Portal > your application > Bot > Privileged Gateway Intents.',
    );
  } else if (/invalid token|TokenInvalid/i.test(`${err.code} ${err.message}`)) {
    console.error('❌ Invalid token. Reset it in the Developer Portal and put it in DISCORD_TOKEN.');
  } else {
    console.error('❌ Login failed:', err);
  }
  process.exit(1);
});
