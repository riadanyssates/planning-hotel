---
name: project-planning-hotel
description: Application Next.js 15 planning hôtel — stack, structure, et instructions de déploiement
metadata:
  type: project
---

Application de planning hôtel créée avec Next.js 15 + React 19 + @libsql/client (SQLite).

**Why:** Gestion des plannings de ~10 employés avec vue calendrier pour la gérante, accès par lien unique pour les employés.

**How to apply:** Toujours utiliser `@libsql/client` pour la base de données. Next.js 15 impose `await cookies()` et `await params`.

## Stack
- Next.js 15.5, React 19, TypeScript
- @libsql/client (SQLite local en dev, Turso en prod)
- Tailwind CSS
- jose (JWT), bcryptjs, date-fns, uuid

## Structure clé
- `/app/manager` — login gérante
- `/app/manager/dashboard` — calendrier semaine (protégé par middleware JWT)
- `/app/manager/dashboard/employes` — CRUD employés + planning type
- `/app/planning/[token]` — vue employé (accès par token unique, sans password)
- `/lib/db.ts` — singleton libsql
- `/lib/schedule.ts` — calcul heures (templates + exceptions)

## Déploiement
Production : Turso (SQLite compatible) + Vercel
Variables d'env requises : MANAGER_PASSWORD, JWT_SECRET, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
