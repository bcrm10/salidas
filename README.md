# Salidas · Mario & Danna

PWA para controlar el ítem "Salidas - Recreación". Se aloja en GitHub Pages igual que `entel-jobs` y `bci-jobs`. Los datos compartidos van en Supabase y las ideas de panoramas se renuevan con un GitHub Action semanal.

## Reglas que aplica la app

- Semana de lunes a domingo. Cada día hábil suma $10.000.
- Miércoles a domingo son fijos. Lunes y martes suman solo si se activan (ambos pueden salir) o si son feriado.
- Cada día pertenece a su mes: una semana que cruza de mes se divide en dos períodos independientes.
- Si se pasan, el exceso se descuenta del período siguiente, aunque sea del otro mes.
- Lo que sobra de un período cerrado queda como pendiente de transferir a la cuenta de ahorro. También se puede transferir antes, durante la semana.
- Aniversario, Navidad, Año Nuevo y cumpleaños no se registran aquí.

## Montaje

### 1. Supabase

1. Crea un proyecto gratuito en supabase.com.
2. En **SQL Editor**, pega y ejecuta `supabase/schema.sql`.
3. En **Authentication → Sign In / Providers**, desactiva el registro de nuevos usuarios.
4. En **Authentication → Users**, crea los dos usuarios (tu correo y el de Danna) con contraseña.
5. En **Project Settings → API**, copia la Project URL y la anon key en `config.js`.

La anon key es pública por diseño: lo que protege los datos son las políticas del esquema, que solo dejan leer y escribir a usuarios con sesión.

### 2. GitHub Pages

1. Crea el repo `salidas` en la cuenta `bcrm10` y sube todos los archivos.
2. En **Settings → Pages**, publica desde la rama `main`, carpeta raíz.
3. Abre `https://bcrm10.github.io/salidas/` en el celular y usa "Agregar a pantalla de inicio".

### 3. Panoramas con IA

1. En **Settings → Secrets and variables → Actions**, crea el secret `ANTHROPIC_API_KEY`.
2. Opcional: crea la variable `ANTHROPIC_MODEL` si quieres cambiar el modelo. Si lo haces, agrega `ANTHROPIC_MODEL: ${{ vars.ANTHROPIC_MODEL }}` en el `env` del workflow.
3. En **Actions → Renovar panoramas**, ejecútalo una vez a mano con "Run workflow".

El workflow corre cada lunes, escribe `data/panoramas.json` y hace commit. La clave nunca llega al sitio.

## Mantención

- **Feriados:** están en `feriados.js`. Solo influyen cuando caen lunes o martes. Revisa la lista de 2027 cuando salga el calendario oficial.
- **Fecha de inicio:** `INICIO` en `config.js` define desde qué día se cuenta. El exceso arrastra desde ahí.
- **Tarjetas:** están en la tabla `tarjetas`. Para agregar una, inserta una fila nueva.
- **Actualizar la app:** al cambiar archivos, sube el número de `CACHE` en `sw.js` para que los celulares descarguen la versión nueva.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Estructura y estilos: barra inferior en celular y panel lateral en pantallas anchas |
| `app.js` | Pantallas, formularios y conexión a Supabase |
| `logic.js` | Cálculo de períodos, arrastre de exceso y ahorro |
| `feriados.js` | Feriados nacionales de Chile |
| `config.js` | URL y anon key de Supabase, fecha de inicio |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalación como app |
| `supabase/schema.sql` | Tablas, seguridad y tiempo real |
| `scripts/generar_panoramas.py`, `.github/workflows/panoramas.yml` | Ideas semanales con IA |
| `data/panoramas.json` | Ideas actuales (trae unas iniciales) |
