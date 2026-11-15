# Sistema de Control de Caja y Combustible — SC Estevez

Aplicación web local (100% offline) diseñada para el control diario de ventas de combustible, descuento automático de stock en tanques, rendición de caja por medios de pago y emisión de comprobantes e informes mensuales en PDF.

## Características Principales

* **Cierre de Caja:** Cálculo automático de importes (`Litros × Precio por Litro`) para **Super**, **Euro** y **Gasoil**, descuento atómico de stock en tanques y desglose de rendición (**Efectivo**, **Policía**, **Comuna**, **Bomberos**, **Transferencia** y **Otros** con descripción).
* **Comprobantes e Informes PDF:** Emisión automática de comprobante al cerrar caja, historial navegable de los últimos 7 días (con opción de anulación y devolución de stock) e informes mensuales consolidados y por entidad oficial.
* **Gestión de Tanques y Tarifas:** Reposición de cisternas, ajustes manuales de stock y actualización de precios vigentes por litro.
* **Funcionamiento Offline y Respaldo:** Base de datos local SQLite en modo WAL con copia de seguridad automática (`caja_backup.db`) al iniciar el sistema.

---

## Requisitos e Instalación (PC de la Estación)

1. Instalar **Node.js (versión LTS)** desde [nodejs.org](https://nodejs.org/).
2. Copiar o clonar este proyecto en una carpeta local fuera de servicios en la nube (por ejemplo, `C:\YPF-ESTEVEZ`).
3. Abrir una terminal en la carpeta del proyecto e instalar las dependencias una única vez:
   ```powershell
   npm install
   ```

---

## Acceso Directo y Uso Diario

1. Hacer clic derecho sobre el archivo **`Iniciar_Caja.vbs`** → **Enviar a** → **Escritorio (crear acceso directo)**.
2. Renombrar el acceso directo como **Control de Caja SC Estevez**.
3. Al hacer doble clic sobre el ícono del escritorio, el servidor inicia en segundo plano sin mostrar ventanas de consola y abre la interfaz en modo aplicación (`http://localhost:3000`).

---

## Estructura del Proyecto

```text
YPF-ESTEVEZ/
├── server.js          # Servidor Express y base de datos SQLite (modo WAL)
├── Iniciar_Caja.vbs   # Lanzador silencioso en modo ventana de aplicación
├── package.json       # Dependencias del proyecto
└── public/
    ├── index.html     # Interfaz POS
    ├── app.js         # Lógica de cálculo, navegación y generación de PDFs
    └── libs/          # Librerías locales (Tailwind CSS, jsPDF, AutoTable)
```