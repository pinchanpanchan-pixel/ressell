# ML Supply

PWA privada para gestionar el negocio de compraventa ML Supply: dinero, inventario, pedidos a proveedores, ventas, devoluciones, análisis de qué comprar y planificador de reinversión.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage) · Vercel.

## Principios de diseño de los datos

- **Dinero en céntimos enteros** (`bigint`). Nunca se calcula con decimales en coma flotante.
- **Historial inmutable.** El libro de caja, los lotes y los movimientos de stock no se pueden editar ni borrar desde la app. Las cancelaciones y devoluciones generan movimientos inversos.
- **Operaciones atómicas.** Pagar, recibir, vender, cancelar, devolver y dar de baja son funciones de PostgreSQL que se ejecutan en una sola transacción: o se aplica todo, o nada.
- **Sin duplicados.** Cada formulario envía un identificador de operación; reintentar (por un corte de red o una doble pulsación) devuelve la operación ya registrada. Un pedido solo puede recibirse una vez.
- **El stock entra al recibir**, no al pagar. El coste real de cada unidad incluye su parte proporcional de envío, empaquetado y otros costes, menos los descuentos, cuadrado al céntimo.
- **Coste de venta FIFO**: cada venta consume primero los lotes más antiguos, con su coste real.
- **Caja ≠ inventario.** El dinero disponible sale solo del libro de caja. El inventario se muestra aparte, a coste y a valor potencial.
- **Dinero reinvertido** = compras pagadas por encima del capital aportado (es decir, financiadas con ventas). No se cuenta como gasto.

## Seguridad

- Supabase Auth con email y contraseña, con el **registro público desactivado**.
- Tabla `authorized_users`: solo la cuenta autorizada ve datos. Lo aplican las **políticas RLS de todas las tablas** y las funciones de la base de datos, no solo la interfaz.
- Las tablas financieras son de solo lectura para el cliente: cualquier escritura pasa por funciones validadas.
- Control adicional en el servidor con `OWNER_EMAIL`.
- Solo se usa la clave pública (publishable/anon). La `service_role` **no** se usa en la app.
- Fotos y documentos en un bucket privado, separados por carpeta de usuario y protegidos con RLS.

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crea un proyecto en https://supabase.com/dashboard (plan Free; región UE, p. ej. Frankfurt).
2. **SQL Editor → New query**: pega todo el contenido de [`supabase/setup.sql`](supabase/setup.sql) y pulsa **Run**.
3. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**.
4. **Authentication → Users → Add user → Create new user**: tu email y una contraseña segura, con **Auto Confirm User** marcado.
5. En el SQL Editor ejecuta (con tu email):
   ```sql
   select private.authorize_owner('tu@email.com');
   ```
6. **Project Settings → API**: copia la **Project URL** y la clave **publishable** (o `anon public`).

### 2. Vercel
1. https://vercel.com/new → importa el repositorio de GitHub.
2. En **Environment Variables** añade:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = clave publishable/anon
   - `OWNER_EMAIL` = tu email
3. **Deploy**. Obtendrás una URL `https://<proyecto>.vercel.app` con HTTPS.
4. (Opcional) En Supabase, **Authentication → URL Configuration → Site URL**: pon esa URL.

### 3. Instalar en el móvil
- **iPhone (Safari):** abre la URL → Compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome):** abre la URL → menú ⋮ → **Instalar aplicación**.

### Dominio propio (más adelante)
Vercel → Project → Settings → Domains → añade el dominio y sigue las instrucciones DNS. Después actualiza la *Site URL* de Supabase.

## Copias de seguridad y recuperación

- **Desde la app:** Ajustes → *Copia completa (JSON)* descarga todos los datos (importes en céntimos). Hazlo, por ejemplo, cada semana y guárdalo fuera del móvil. También hay exportaciones CSV (separador `;`, se abren en Excel).
- **Copia completa de la base de datos:** con la cadena de conexión de Supabase (Project Settings → Database):
  ```bash
  pg_dump "postgresql://postgres:[CONTRASEÑA]@db.[REF].supabase.co:5432/postgres" -n public -n private -Fc -f mlsupply.dump
  ```
  Para restaurar en un proyecto nuevo: ejecuta primero `supabase/setup.sql`, crea tu usuario y autorízalo (pasos 2–5), y después carga los datos con `pg_restore --data-only -n public -d "<nueva conexión>" mlsupply.dump`. Si el ID de tu usuario cambia, la restauración debe hacerse con el mismo usuario (exporta también `auth.users` o pídeme un script de reasignación).
- El plan Free de Supabase **no** incluye copias diarias automáticas descargables (el plan Pro sí). Por eso conviene la exportación periódica.
- Un proyecto Free de Supabase se **pausa tras 7 días sin uso**; se reactiva desde el panel sin perder datos.

## Costes recurrentes previstos

| Servicio | Plan | Coste |
|---|---|---|
| Supabase | Free (500 MB de base de datos, 1 GB de almacenamiento) | 0 € |
| Vercel | Hobby (uso personal, no comercial según sus condiciones) | 0 € |
| Dominio propio | Opcional | ~10–15 €/año |

Si el negocio crece o quieres copias automáticas: Supabase Pro (~25 $/mes). Vercel Hobby está pensado para uso no comercial; para un uso comercial estricto, Vercel Pro cuesta ~20 $/mes.

## Desarrollo

```bash
npm install
cp .env.example .env.local    # rellena las variables
npm run dev
```

Comprobaciones:

```bash
npm run typecheck && npm run lint
npm test                      # tests unitarios (dinero, planificador, recomendación, serie de capital)
npm run test:db               # integración: Postgres + GoTrue + PostgREST locales (requiere Docker y PostgreSQL 16)
npm run test:e2e              # recorrido completo en el navegador (requiere `npm run build && npm start -p 3100`)
```

La pila de pruebas (`scripts/test-stack/`) es local y usa usuarios y datos de prueba que nunca tocan el proyecto real.

### Migraciones
Las migraciones versionadas están en `supabase/migrations/`. Tras añadir una, regenera el archivo único con `bash scripts/build-setup-sql.sh`. Para un proyecto ya instalado, ejecuta solo la migración nueva en el SQL Editor (o `supabase db push` con la CLI enlazada).

## Estructura

```
supabase/migrations/   esquema, RLS, operaciones transaccionales, vistas analíticas, storage
src/lib/               dinero, analítica, planificador, acceso a datos, server actions
src/app/(app)/         pantallas: inicio, stock, pedidos, ventas, finanzas, análisis, planificador, ajustes
src/proxy.ts           protección de rutas y refresco de sesión
public/sw.js           service worker (solo recursos estáticos; los datos nunca se guardan en caché)
tests/                 unitarios, integración de base de datos y E2E
```
