# Apolo GYM — frontend y backend separados

El frontend se publica en **Vercel**, la API en **Railway** y la base de datos es **MySQL**. El dominio del frontend ya configurado es `https://proyectogym-zeta.vercel.app`.

> Importante: el backend usa `mysql2` y consultas SQL de MySQL (`?`, `CURDATE()`, `TIME_FORMAT()`, etc.). El `.env.local` del ZIP original conservaba valores antiguos de Supabase/PostgreSQL (`5432`), pero no corresponden al motor que usa la aplicación. No copies esas variables PostgreSQL a Railway. Usa un servicio MySQL.

## Estructura

```text
Apolo_GYM_Deploy/
├── frontend/                  # Sitio multipágina con Vite
│   ├── index.html
│   ├── admin.html
│   ├── entrada.html
│   ├── mi-acceso.html
│   ├── pago.html
│   ├── css/ js/ img/ fonts/
│   └── package.json
├── backend/                   # API Express + MySQL + Stripe
│   ├── server/
│   ├── database/
│   ├── package.json
│   └── railway.json
└── vercel.json                # Permite desplegar desde la raíz del repositorio
```

## 1. Base de datos MySQL en Railway

1. En el mismo proyecto de Railway, pulsa **New → Database → MySQL**.
2. Espera a que MySQL termine de desplegarse.
3. Importa el esquema de `backend/database/proyecto_GYM.sql` en la instancia MySQL. Ese script crea la base `Proyecto_GYM`.
4. Después ejecuta los scripts adicionales que correspondan, siguiendo el orden de `backend/database/README.md`. No vuelvas a ejecutar migraciones ya aplicadas sobre una base con datos.
5. Conserva un respaldo de la base anterior antes de migrar los datos.

## 2. Backend en Railway

En Railway, crea el servicio Node desde este mismo repositorio y configura:

- **Root Directory:** `/backend`
- **Config as Code:** `/backend/railway.json`
- **Start Command:** `npm start` (lo define también `railway.json`)

En las variables del servicio backend agrega estas referencias. Si tu servicio de base de datos no se llama `MySQL`, reemplaza `MySQL` por su nombre exacto (el selector de Railway puede insertarlas automáticamente):

```env
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=Proyecto_GYM
APP_URL=https://proyectogym-zeta.vercel.app
CORS_ORIGINS=https://proyectogym-zeta.vercel.app
ADMIN_TOKEN=REEMPLAZA_POR_UN_TOKEN_ALEATORIO_LARGO
PIN_SECRET=REEMPLAZA_POR_UN_SECRETO_ALEATORIO_LARGO
```

**No pongas `DB_HOST=localhost`, `127.0.0.1` ni `::1` en Railway.** `localhost` significa el mismo contenedor del backend, no el servicio de MySQL. La configuración del código da prioridad a `MYSQLHOST` y ahora mostrará un error explícito si detecta un host local en Railway.

`PIN_SECRET` debe conservar exactamente el secreto usado para generar los PIN existentes. En la versión anterior, si no se había definido `PIN_SECRET`, se utilizaba `ADMIN_TOKEN` como respaldo. Cambiarlo invalida esos PIN. No publiques estos secretos ni los subas a Git.

Variables opcionales de Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAGO_TRANSFERENCIA` y `TRANSFERENCIA_DATOS`. Al configurar Stripe, el webhook será `https://TU-API.up.railway.app/api/pagos/webhook`.

Cuando Railway genere un dominio público para el backend, verifica:

```text
https://TU-API.up.railway.app/api/health
```

Debe responder `{"ok":true,"service":"apolo-gym-api"}`. Si el backend sigue sin iniciar, revisa el log: ya no debería intentar conectarse a `::1:3306`.

## 3. Frontend en Vercel

Hay dos formas válidas de configurar Vercel. Para evitar errores de carpeta raíz, recomiendo la primera:

### Opción recomendada: desplegar desde la raíz del repositorio

- **Root Directory:** `.` (raíz del repositorio; no selecciones `backend` ni `frontend`).
- Vercel usará el `vercel.json` de la raíz: instala dependencias dentro de `frontend`, ejecuta Vite y publica `frontend/dist`.
- En **Environment Variables** agrega `VITE_API_URL` con el dominio público de Railway, sin `/api` al final. Ejemplo: `https://TU-API.up.railway.app`.
- Aplica la variable a Production (y Preview si también publicarás previews) y vuelve a desplegar.

### Opción alternativa: usar `frontend` como Root Directory

- **Root Directory:** `frontend`.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Install Command: `npm ci`.
- Agrega la misma variable `VITE_API_URL`. En esa carpeta está incluido su propio `vercel.json`.

Dominio de producción: `https://proyectogym-zeta.vercel.app`. El panel administrativo queda en `/admin.html` y el control de acceso en `/entrada.html`.

La compilación ya no se aborta si aún no existe `VITE_API_URL`, pero las llamadas a la API no funcionarán hasta que agregues la URL de Railway y vuelvas a desplegar.

## 4. Desarrollo local

Necesitas Node.js 22.12 o superior y MySQL.

Terminal 1 — backend:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Edita .env con los datos reales de MySQL y los secretos.
npm run dev
```

Terminal 2 — frontend:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Vite sirve el sitio en `http://localhost:5173` y reenvía `/api` a `http://localhost:3000`.

## Seguridad

- No subas `.env`, `.env.local`, credenciales MySQL, claves Stripe ni tokens al repositorio.
- `ADMIN_TOKEN` protege el panel `/admin.html`.
- `PIN_SECRET` debe mantenerse estable mientras existan PIN que deban seguir funcionando.
- `APP_URL` y `CORS_ORIGINS` deben contener el dominio actual de Vercel. Si lo cambias, actualízalos en Railway y redepliega la API.
