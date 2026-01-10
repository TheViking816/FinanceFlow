# FinanceFlow

App de finanzas personales en Vite + React + Supabase.

## Setup Supabase
1. Crea un proyecto en Supabase.
2. Abre el SQL editor y pega `db/schema.sql`. Ejecuta todo el script.
3. (Opcional) Si quieres categorias base, usa `db/optional_seed.sql` y reemplaza `:user_id` por tu usuario real.
4. Si ya tenias el schema creado, vuelve a ejecutar `db/schema.sql` para aplicar las policies de importacion.

## Configurar variables
1. Copia `.env.example` a `.env.local`.
2. Completa:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_FX_SHEET_URL` (opcional, URL de Google Sheets con tipos FX)

## Ejecutar en local
1. `npm install`
2. `npm run dev`

## Generar iconos PWA
1. `npm run generate:icons`
2. Los PNG se guardan en `public/icons`.

## PWA
- Manifest en `public/manifest.webmanifest`.
- Service worker generado por `vite-plugin-pwa`.
- Meta tags y `apple-touch-icon` configurados en `index.html`.

## Deploy en GitHub Pages
1. Asegura `base: "/FinanceFlow/"` en `vite.config.ts`.
2. El workflow `/.github/workflows/pages.yml` construye y publica `dist`.
3. En GitHub, activa Pages en Settings -> Pages -> Source: GitHub Actions.

## Crear usuario y empezar
1. Abre la app en local.
2. Registra una cuenta con email/password o usa magic link.
3. Completa tu perfil (nombre y moneda base).
4. Crea cuentas, categorias, movimientos y holdings.

## Importar cartera (IBKR / DEGIRO)
1. Ve a **Cartera** o **Ajustes** → **Importar cartera**.
2. Sube el CSV y revisa el preview.
3. Confirma la importacion para guardar holdings y precios.

### IBKR
- Exporta **Open Positions** en CSV.
- Columnas esperadas: `ClientAccountID, CurrencyPrimary, AssetClass, Symbol, Description, ISIN, ListingExchange, ReportDate, Quantity, MarkPrice, PositionValue, CostBasisPrice`.
- Los FX se cargan desde Google Sheets (ver `VITE_FX_SHEET_URL`).

### DEGIRO
- Exporta **Portfolio** en CSV.
- Columnas esperadas: `Producto, Symbol/ISIN, Cantidad, Precio de, Valor local, Valor en EUR`.
- Selecciona la fecha del snapshot (obligatorio).
- Las filas `CASH` se ignoran por defecto (puedes incluirlas con el toggle).

## Notas
- Supabase es la unica fuente de datos. No hay seed automatico.
- Los snapshots de patrimonio se generan desde el Dashboard con "Actualizar hoy".
