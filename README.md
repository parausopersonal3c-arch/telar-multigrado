# Telar Multigrado (versión independiente)

Generador de actividades multigrado (1°, 2° y 3° de Telesecundaria, campo formativo Lenguajes) con IA en tiempo real. Esta es la versión que puedes hospedar tú mismo, para compartirla con todos tus docentes sin restricciones de cuenta.

## Qué trae esta carpeta

- `public/index.html` — la aplicación completa (interfaz + los 15 contenidos integrados de las tres dosificaciones ya incluidos).
- `server.js` — un servidor pequeño en Node.js, sin dependencias externas, que hace dos cosas: sirve la app y hace de puente hacia la IA de Anthropic usando tu propia llave (para que la llave nunca quede expuesta en el navegador de los docentes).
- `.env.example` — plantilla para tu llave y configuración.
- `package.json` — metadatos del proyecto (no hay librerías que instalar).

## 1) Consigue tu llave de la API de Anthropic

1. Entra a [console.anthropic.com](https://console.anthropic.com/) y crea una cuenta de organización (es distinta de tu cuenta normal de claude.ai — aquí es "API", con facturación por uso).
2. Ve a **Settings → API Keys** y crea una llave nueva.
3. En **Settings → Billing**, agrega un método de pago o carga saldo. El uso de la API tiene costo (a diferencia del chat gratuito de claude.ai); revisa los precios vigentes en [anthropic.com/pricing](https://www.anthropic.com/pricing). Cada actividad completa hace unas 9 llamadas a la IA, así que te conviene monitorear el consumo los primeros días para tener una idea de cuánto gasta tu escuela al mes.

## 2) Pruébalo en tu computadora

Necesitas [Node.js](https://nodejs.org/) 18 o más nuevo instalado (para revisar: `node --version` en una terminal).

```
cd telar-standalone
cp .env.example .env
```

Abre `.env` con cualquier editor de texto y pega tu llave en `ANTHROPIC_API_KEY=`. Luego:

```
node server.js
```

Abre `http://localhost:3000` en tu navegador. Deberías ver la app funcionando de principio a fin: contexto → contenido integrado → generar → descargar en Word. Esto solo funciona en tu propia computadora mientras el servidor esté corriendo; para que tus docentes lo usen desde sus casas o celulares, sigue el paso 3.

## 3) Ponlo en línea para que todos lo usen

La forma más simple, sin necesitar un experto en servidores, es un servicio que reciba esta carpeta y la mantenga encendida por ti. Con **Render** (tiene un plan gratuito/económico, es el más sencillo para este tipo de proyecto):

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. En [render.com](https://render.com), crea una cuenta y elige **New → Web Service**, conecta ese repositorio.
3. Configuración del servicio:
   - **Build command**: (déjalo vacío, no hay nada que instalar)
   - **Start command**: `node server.js`
4. En la sección **Environment**, agrega las variables de entorno (igual que en tu `.env`, pero aquí se configuran desde el panel de Render, no subiendo el archivo `.env` — de hecho, nunca subas tu `.env` real a GitHub):
   - `ANTHROPIC_API_KEY` = tu llave
   - (opcional) `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS`
5. Despliega. Render te da una URL pública (algo como `https://telar-multigrado.onrender.com`) — ese es el link que le compartes a tus docentes, sin restricciones: cualquiera que lo abra puede usarlo, no necesita cuenta de Claude ni de Anthropic, solo tú pagas el consumo de IA desde tu llave.

Otras opciones equivalentes si ya usas alguna: Railway, Fly.io, un VPS propio, o el servidor de cómputo de tu propia institución (con Node.js instalado) siempre que tenga una IP o dominio accesible desde fuera.

## Notas importantes

- **La llave es tuya y paga tu cuenta.** Cualquiera con el link puede generar actividades y cada generación consume tu saldo de la API — no hay control de usuarios en esta versión. Si te preocupa el gasto, considera compartir el link solo dentro de tu escuela/zona escolar y no publicarlo abiertamente en redes.
- **El contexto y el historial de cada docente se guardan en su propio navegador** (no en el servidor), igual que en la versión anterior — cada quien ve solo lo suyo.
- **Actualizaciones**: si más adelante quieres que se ajuste algo de la app (textos, diseño, las etapas, etc.), dímelo y te entrego de nuevo `public/index.html` actualizado — solo reemplazas ese archivo en tu repositorio/servidor y Render lo vuelve a desplegar solo.
