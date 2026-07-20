# Jira Time Tracker

Applicazione web full-stack per **catalogare le issue Jira assegnate** all'utente e **consuntivare le tempistiche** (worklog) nel modo più semplice possibile, con storage locale **SQLite**.

![Stack](https://img.shields.io/badge/stack-React%2019%20%C2%B7%20tRPC%20%C2%B7%20Hono%20%C2%B7%20Drizzle%20%C2%B7%20SQLite-blue)

## Funzionalità

- **Login con credenziali Jira Cloud** (sito, email, API token) — il token è cifrato (AES-256-GCM) e salvato solo nel database locale
- **Catalogo issue assegnate**: sync da Jira (`assignee = currentUser()`), ricerca full-text, filtri per stato e progetto, link diretto a Jira
- **Consuntivazione one-click**: registra tempo con sintassi Jira (`2h 30m`, `1d`, `45m`), modifica ed elimina worklog — tutto sincronizzato su Jira e archiviato in locale
- **Dashboard**: ore oggi / settimana / mese, grafico ore ultimi 14 giorni, ripartizione per progetto, issue aperte
- **Timesheet settimanale**: vista per giorno con totali e avanzamento verso le 8h
- **Storage SQLite** zero-config: il database si auto-inizializza al primo avvio

## Avvio rapido

```bash
npm install
npm run dev        # http://localhost:3000
```

Al primo avvio viene creato `./data/app.db` con lo schema completo.

### Login

**Jira Server / Data Center 8.x** (es. 8.21):
1. Seleziona "Jira Server / DC" nella pagina di login
2. Inserisci l'URL (es. `https://jira.azienda.it`), il tuo username e la password
3. Se hai Jira **Data Center 8.14+**, consigliato il Personal Access Token (Profilo → Personal Access Tokens) selezionando il metodo "Personal Access Token"

**Jira Cloud**:
1. Vai su [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) e crea un API token
2. Seleziona "Jira Cloud" e inserisci URL del sito (es. `https://azienda.atlassian.net`), email Atlassian e token

## Comandi

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | Dev server con HMR (porta 3000) |
| `npm run build` | Build produzione (frontend + server in `dist/`) |
| `npm start` | Server produzione |
| `npm run test` | Test con Vitest (unit + integrazione tRPC/SQLite) |
| `npm run check` | Type-check TypeScript |
| `npm run db:generate` | Genera migrazioni SQL dallo schema Drizzle |

## Docker

```bash
docker build -t jira-time-tracker .
docker run -p 3000:3000 -v jtt-data:/app/data jira-time-tracker
```

## Configurazione (`.env`)

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `DATABASE_URL` | `./data/app.db` | Path del file SQLite (`:memory:` per i test) |
| `SESSION_SECRET` | generato | Chiave per cifrare i token Jira a riposo |
| `SESSION_DAYS` | `30` | Durata della sessione |

## Struttura

```
api/            Hono + tRPC (routers: auth, issues, worklogs, stats)
  jira/         Client tipizzato per Jira REST API v3
  lib/          crypto (AES-256-GCM), env
  queries/      Connessione SQLite (better-sqlite3 + bootstrap schema)
contracts/      Tipi e utility condivise frontend/backend (parsing durate)
db/             Schema Drizzle (users, sessions, issues, worklogs)
src/            React: Login, Dashboard, Issues, IssueDetail, Timesheet
```

## Test

33 test: parsing/formatting durate, crypto, client Jira (fetch mockato, paginazione JQL, errori) e integrazione end-to-end dei router tRPC su SQLite in-memory (login, sync issue, worklog CRUD, statistiche, logout).

## Note di sicurezza

- L'API token Jira non lascia mai il server: è cifrato nel DB locale e usato solo per chiamate server-to-Jira
- Sessioni con cookie `HttpOnly`, `SameSite=Lax` (`Secure` in produzione)
- Nessuna telemetria, nessun servizio esterno oltre Jira
