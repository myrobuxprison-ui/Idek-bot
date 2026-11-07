# 🤖 Bot Discord — Prix & Tickets

Bot Discord (discord.js v14), **entièrement en anglais** côté Discord, avec :

- 🖼️ **Embeds avec image** pour afficher tes prix (titre, texte en gras, grande image, miniature, couleur), modifiables à tout moment.
- 🎫 **Système de tickets** : panneau avec boutons, formulaire, salon privé, prise en charge par le staff, fermeture avec transcript envoyé dans les logs et en MP.

Aucune base de données nécessaire : parfait pour Railway.

---

## 1. Créer le bot sur Discord

1. Va sur <https://discord.com/developers/applications> → **New Application** → donne un nom.
2. Onglet **Bot** :
   - Clique **Reset Token** → copie le token (garde-le secret, ne le mets **jamais** sur GitHub).
   - Dans **Privileged Gateway Intents**, active **MESSAGE CONTENT INTENT** (pour les transcripts des tickets) → **Save**.
3. Invite le bot sur ton serveur avec ce lien (remplace `TON_CLIENT_ID` par l'**Application ID** de l'onglet *General Information*) :

```
https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&permissions=268561424&scope=bot%20applications.commands
```

Permissions incluses : voir les salons, envoyer des messages, intégrer des liens, joindre des fichiers, lire l'historique, gérer les messages, **gérer les salons**, **gérer les rôles**.

> ⚠️ Dans *Paramètres du serveur > Rôles*, place le rôle du bot **au-dessus** du rôle staff.

### Récupérer les ID (serveur, rôle, salon)
Paramètres Discord → *Avancés* → active le **Mode développeur**. Ensuite clic droit sur le serveur / un rôle / un salon → **Copier l'identifiant**.

---

## 2. Mettre le code sur GitHub

**Sans rien installer (site GitHub) :**
1. Va sur <https://github.com/new>, nomme le dépôt (ex : `mon-bot-discord`), mets-le en **Private**, clique **Create repository**.
2. Clique **uploading an existing file**, puis glisse **tout le contenu** du dossier du bot (`src`, `package.json`, `railway.json`, `README.md`, `.gitignore`, `.env.example`).
3. Clique **Commit changes**.

> Ne mets **jamais** de fichier `.env` avec ton token sur GitHub.

**Avec git (si installé) :**
```bash
git init
git add .
git commit -m "Bot Discord prix + tickets"
git branch -M main
git remote add origin https://github.com/TON_PSEUDO/mon-bot-discord.git
git push -u origin main
```

---

## 3. Héberger sur Railway

1. Va sur <https://railway.com> → connecte-toi avec GitHub.
2. **New Project** → **Deploy from GitHub repo** → choisis ton dépôt.
3. Ouvre le service → onglet **Variables** → ajoute :

| Variable | Obligatoire | Valeur |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | le token du bot |
| `GUILD_ID` | conseillé | l'ID de ton serveur (commandes visibles instantanément) |
| `STAFF_ROLE_ID` | non | rôle staff par défaut pour `/ticket-panel` |
| `TICKET_CATEGORY_ID` | non | catégorie par défaut des tickets |
| `TICKET_LOG_CHANNEL_ID` | non | salon de logs par défaut |
| `EMBED_COLOR` | non | couleur par défaut, ex `#00D4FF` |
| `BOT_STATUS` | non | texte du statut du bot |

4. Railway redéploie tout seul. Dans **Deployments → View logs**, tu dois voir :
   `✅ Logged in as TonBot` puis `✅ 4 commands registered`.

À chaque fois que tu modifies le code sur GitHub, Railway redéploie automatiquement.

> Railway n'a pas besoin de domaine ni de port : c'est un bot, pas un site web.

---

## 4. Utilisation

### 🖼️ Créer ton embed de prix

1. Tape `/embed create` et remplis les options :
   - `channel` : où envoyer (ex : #prices)
   - `image` : la grande image en bas
   - `thumbnail` : la petite image en haut à droite
   - `color` : `#00D4FF` ou un nom anglais : `cyan`, `blue`, `red`, `green`, `purple`, `pink`, `orange`, `yellow`, `white`, `black`, `gray`
2. Un formulaire s'ouvre : écris le **titre** et la **description** (retours à la ligne autorisés).

Exemple de description :

```
**RBX**
**6k Tax Included**
+
**USD**
**$35 Payment is only through PayPal**
-

**50% Upfront Payment is required**

Make sure you know what you want before commissioning
Do keep in mind your requested logo **Style** should be aligned with my work.
```

Pour changer un prix plus tard : clic droit sur le message → **Copier le lien du message** → `/embed edit message:<lien>`. Le formulaire s'ouvre déjà rempli. Tu peux aussi changer l'`image`, la `thumbnail` ou la `color`, ou les retirer avec `remove_image` / `remove_thumbnail`.

> Les images sont ré-uploadées par le bot : elles n'expirent jamais.

### 🎫 Mettre en place les tickets

`/ticket-panel staff_role:@Staff log_channel:#ticket-logs channel:#order`

Options :
- `category` : si vide, le bot crée une catégorie **🎫 Tickets**
- `title`, `description` (utilise `\n` pour aller à la ligne), `image`, `color`
- `types` : boutons à afficher, ex : `logo,question` (par défaut : `logo,question,support`)

Côté membre : clic sur un bouton (**🎨 Order a logo**, **❓ Question**, **🛠️ Support**) → formulaire → salon privé créé (visible seulement par lui, le staff et le bot). Une seule demande ouverte à la fois par membre.

Dans un ticket :
- **🙋 Claim** (staff) / **🔒 Close** (staff ou créateur)
- `/ticket add @member` · `/ticket remove @member` · `/ticket rename` · `/ticket close [reason]`
- `/help` affiche toutes les commandes.

À la fermeture : transcript `.txt` envoyé dans le salon de logs et en MP au membre, puis le salon est supprimé.

### ✏️ Personnaliser les types de tickets
Tout est dans [`src/config.js`](src/config.js) (`ticketTypes`) : texte des boutons, emojis, couleurs et questions du formulaire (5 max). Après modification, renvoie le panneau avec `/ticket-panel`.

---

## 5. Tester en local (optionnel)

Il faut [Node.js 20+](https://nodejs.org).

```bash
npm install
```

Copie `.env.example` en `.env`, mets ton token, puis :

```bash
npm start
```

---

## Structure

```
src/
├── index.js              # démarrage, enregistrement des commandes, routeur
├── config.js             # variables + types de tickets
├── utils.js              # couleurs, images, permissions
├── commands/
│   ├── embed.js          # /embed create | edit
│   ├── ticket-panel.js   # /ticket-panel
│   ├── ticket.js         # /ticket add | remove | rename | close
│   └── help.js           # /help
└── tickets/
    ├── handlers.js       # boutons + formulaires des tickets
    └── transcript.js     # génération du transcript
```

## Problèmes fréquents

| Problème | Solution |
|---|---|
| `Used disallowed intents` dans les logs | Active **MESSAGE CONTENT INTENT** (étape 1.2) |
| Les commandes n'apparaissent pas | Ajoute `GUILD_ID`, redémarre, puis `Ctrl+R` dans Discord |
| Commandes en double | Garde `GUILD_ID` défini : le bot supprime les anciennes commandes globales |
| « Impossible de créer le ticket » | Donne **Gérer les salons** + **Gérer les rôles** au bot et monte son rôle |
| `/embed` invisible pour le staff | Réservé à « Gérer le serveur ». Modifiable dans *Paramètres du serveur > Intégrations > ton bot* |
