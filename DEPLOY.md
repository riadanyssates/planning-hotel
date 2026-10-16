# Déploiement sur Vercel

## Pourquoi Turso pour la base de données ?

SQLite utilise un fichier local, mais Vercel est **serverless** (pas de système de fichiers persistant).
La solution : **Turso** — une base SQLite hébergée, gratuite jusqu'à 500 Mo, 100% compatible SQLite.

---

## Étape 1 — Créer la base Turso (gratuit)

```bash
# Installer la CLI Turso
curl -sSfL https://get.tur.so/install.sh | bash

# Se connecter
turso auth login

# Créer une base de données
turso db create planning-hotel

# Récupérer l'URL
turso db show planning-hotel --url
# → libsql://planning-hotel-votre-org.turso.io

# Créer un token d'accès
turso db tokens create planning-hotel
# → eyJhbGc...  (copier ce token)
```

---

## Étape 2 — Déployer sur Vercel

### Option A — Via l'interface Vercel (recommandée)

1. Poussez le code sur GitHub :
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create planning-hotel --private --push
   ```

2. Allez sur [vercel.com](https://vercel.com) → **New Project** → importez votre repo

3. Dans les **Environment Variables**, ajoutez :
   | Variable | Valeur |
   |---|---|
   | `MANAGER_PASSWORD` | votre-mot-de-passe |
   | `JWT_SECRET` | une-chaine-aleatoire-longue |
   | `TURSO_DATABASE_URL` | `libsql://planning-hotel-xxx.turso.io` |
   | `TURSO_AUTH_TOKEN` | le token turso copié ci-dessus |

4. Cliquez **Deploy** → l'app est en ligne !

### Option B — Via la CLI Vercel

```bash
npm i -g vercel
vercel

# Puis configurer les variables :
vercel env add MANAGER_PASSWORD
vercel env add JWT_SECRET
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN

# Re-déployer avec les variables
vercel --prod
```

---

## Développement local

```bash
# Copier les variables d'env
cp .env.example .env.local
# Éditer .env.local avec votre mot de passe

# Lancer le serveur
npm run dev
```

Accès : http://localhost:3000
- Gérante : http://localhost:3000/manager (mot de passe : celui dans .env.local)
- Employé : http://localhost:3000/planning/[token] (token visible dans la page Employés)

---

## Utilisation

### Première utilisation

1. Connectez-vous en tant que gérante
2. Allez dans **Employés** → ajoutez chaque employé
3. Cliquez sur l'icône calendrier d'un employé pour définir son planning type
4. Copiez le lien unique de chaque employé (icône copier) et envoyez-le par SMS/email

### Modifier un planning

- Dans le calendrier semaine, cliquez sur n'importe quelle case
- Choisissez **"Ce jour uniquement"** pour une exception ponctuelle
- Choisissez **"Tous les lundis"** pour modifier le planning récurrent

### Voir les heures

- Colonne "Total" dans le calendrier = heures de la semaine
- Bouton "Stats du mois" = total mensuel par employé
