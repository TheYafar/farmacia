# Farmacia · Mostrador

Demo de un sistema de mostrador para farmacias en Venezuela. Una sola app para PC, tablet y teléfono.

**Demo en línea:** https://theyafar.github.io/farmacia/

> Es una demostración con **datos de ejemplo**: no se conecta a ningún servidor y no guarda nada. Si recargas la página, todo vuelve al inicio. La lectura de récipes es una simulación con un récipe fijo.

## Cómo probarla

1. Escoge **Cajero** y toca **Entrar** (cualquier clave sirve).
2. Busca **amoxicilina** y toca **Agregar**: aparece el aviso de alergia de la clienta.
3. Busca **losartán**: salen todas las marcas iguales, de la más barata a la más cara.
4. Toca **Récipe** para ver cómo se presenta la lectura del récipe.
5. Arriba, toca **Entrar como otra persona** y entra como **Dueño** para ver el resumen del negocio.

## Qué incluye

| Persona | Ve |
|---|---|
| Cajero | Vender · Récipe · Clientes |
| Farmacéutico | Lo anterior + Por revisar · Encargos |
| Dueño | Todo, más Inventario y Resumen |

Capturas de pantalla en [`docs/capturas`](docs/capturas).

## Para desarrollar

```bash
npm install
npm run dev
```

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor local |
| `npm run build` | Versión normal |
| `npm run build:pages` | Versión para GitHub Pages (`/farmacia/`, rutas con `#`) |
| `npm run build:demo` | Un solo archivo HTML con todo adentro |

Cada cambio en `main` se publica solo en GitHub Pages (`.github/workflows/deploy.yml`).

## Estructura

```
src/
  config/nav.tsx        menú y permisos por persona
  layout/AppShell.tsx   barra inferior (teléfono) / riel (tablet) / menú lateral (PC)
  components/ui.tsx     botones, avisos, montos en USD y Bs, ventanas
  data/                 tipos y datos de ejemplo
  store/useApp.ts       estado de la app (Zustand)
  features/             una carpeta por pantalla
```

React 18 · Vite · TypeScript · Tailwind CSS · React Router · Zustand · lucide-react.
