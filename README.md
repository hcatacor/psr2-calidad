# PSR2 Calidad — App web (Fase 1)

Control de códigos de protocolo (correlativos sin duplicados), carga/descarga de formatos y auditoría.
Sistema independiente: base de datos, archivos, usuarios y lógica propios (no depende de ningún sistema anterior).
Costo cero: Google Apps Script + Sheets + Drive (cuenta hcat) y GitHub Pages.

```
frontend/   Web estática (HTML/JS sin compilación) → GitHub Pages
backend/    API en Google Apps Script → se sube con clasp a la cuenta hcat
dev/        Simulador local de Apps Script, pruebas y servidor de desarrollo (no se despliega)
data/       CSV de referencia usados solo en el análisis; el sistema no los usa (privado, NO se sube a GitHub)
```

## Probar en local (sin desplegar nada)

```bash
npm test        # 90 pruebas de reglas de negocio sobre el backend real
npm run dev     # http://localhost:5173 — entra eligiendo un usuario de prueba
```

## Funcionamiento

**Codificación (Anexo A):** `PROYECTO-FASE-EMPRESA-ESPECIALIDAD-TRAMO-TIPO-CORRELATIVO` → `PSR2-F2-CPC-TOP-GLB-PRC-0001`.
Una **serie** = Fase + Especialidad + Tramo + Tipo (p. ej. `F2-TOP-GLB-PRC`), cada una con su correlativo desde 0001.
Fase, Especialidad, Tramo y Tipo son **catálogos** por proyecto; Proyecto y Empresa son fijos del proyecto.
**Cambio de fase** (p. ej. F2 → F3): crea las mismas series en la nueva fase desde 0001 y cierra las anteriores (quedan de consulta).

**Multiproyecto:** una sola app para PSR2, VERS, etc.; cada proyecto con empresa, catálogos, series, usuarios y numeración propios y aislados.

| Rol | Alcance | Puede |
|---|---|---|
| Propietario (hcat) | Global | Todo. Único que sube plantillas de formato y crea proyectos. Actúa sobre códigos ajenos (queda anotado). |
| Coordinador General | Global | Todo lo del Jefe en todos los proyectos; crea Jefes de Área. |
| Jefe de Área | Proyecto | Usuarios (niveles inferiores), catálogos, series, reasignar, parámetros, validar formatos. |
| Control Documentario | Proyecto | Catálogos, series, cambio de fase, carga inicial, ajuste de contador, exportar, integridad e historial. |
| Auditor | Proyecto | Integridad, validar/observar formatos, historial. No genera códigos. |
| Operador | Proyecto | Generar, llenar protocolos, liberar sus códigos; descargar PDF/Excel y cargar el final firmado. |
| Visitante | Proyecto | Solo consulta. |

Cada rol gestiona solo usuarios de nivel inferior. Un correo puede tener un rol distinto en cada proyecto.

Ciclo de un código: `Pendiente` → (carga final) `Cargado` → `Validado` u `Observado` (vuelve al operador).
Paralelo: `Liberado` → `Reutilizado`. Importados: `Histórico`. Ningún código se borra jamás.

Reglas clave: correlativo asignado en servidor con bloqueo (`LockService`); un código liberado queda libre para
cualquier usuario y es la primera opción al generar en su serie (el de número más bajo); al entrar a Generar se alerta
de los códigos separados sin llenar (llenar o liberar); liberan el dueño o un administrador; con Conforme o formato
cargado ya no se libera; todo queda en `Historial` (solo se agrega, nunca se edita). Reglas completas: [NORMAS.md](NORMAS.md).

**Formatos (biblioteca):** el Propietario sube cada formato aprobado en Administración → Formatos (código tipo
`PSR2-F2-CPC-CAL-EMD-FOR-0001`, nombre, revisión). En el Excel se escriben marcadores (`{CODIGO}`, `{FASE}`, `{FECHA}`,
`{ACTIVIDAD}`, `{PROGRESIVA}`, `{ESPECIALIDAD_DESC}`…) en las celdas de valor. Al descargar desde un código, el usuario elige el
formato y recibe el **mismo .xlsx** relleno (se edita el XML del archivo original: logos, bordes y cuadros de firma intactos).
El formato elegido queda asociado al código. Word se rellena vía Google Docs (Word o PDF); PDF se entrega tal cual.

**Protocolos como formulario:** al generar un código se elige también el protocolo, que se muestra como tramo + número + título
(`EMD-FOR-0001 · REPARACIÓN DE JUNTAS DE WATERSTOP`, el título sale del Excel); la lista pone primero los del tramo de la serie y los GLB,
y tiene buscador. En la app se llena por pasos (encabezado y datos propios del formato, lista de control, cierre) y se descarga el mismo
Excel aprobado lleno; solo faltan las firmas. Los formularios aprobados no se modifican: la estructura de cada ficha se detecta del propio
xlsx (rótulos CLIENTE:, FASE:…, opciones SI/NO/N/A · Conforme/No conforme · CONFORMIDAD · N/M/I/S, celdas con "A:", "____" o
"[ ]", recuadro de reporte fotográfico), así que un formato nuevo no requiere configuración. La foto del reporte fotográfico no se guarda en la
app: queda en el teléfono del usuario y se envía solo para armar la hoja. El correlativo CPC (`ACRÓNIMO-[ELEMENTO]-F2-####`, reparación = mismo N° + `A`)
lo asigna la app al guardar, sin repetir. Listas: Partidas, Acrónimos CPC (oficiales + lista aparte del LOG), Especialidad, Ubicación
y Localización (Administración → Catálogos); Cliente en Proyecto. Al guardar con Conforme quedan Vista previa, Descargar PDF,
Descargar Excel, Enviar y Editar; el PDF se arma al momento (en producción, Google Sheets en una copia temporal que se borra).

**LOG de liberaciones (Calidad):** pantalla LOG y botón DATA. Se carga el mismo Excel del LOG (hoja LOG, A–AC) tal cual; las filas con
problemas quedan observadas para su dueño (QC) o Control Documentario; el CPC se guarda corregido para la numeración y se imprime el original.
ESTATUS, TRANSMITAL y FECHA ACONEX solo Control Documentario o superiores. La descarga es el mismo Excel con lo de la app. Reglas en NORMAS.md (4b).

**DATA (carga y descarga):** botón DATA en Códigos. Descarga todos los códigos visibles en CSV. Carga códigos ya usados con una columna `Codigo` (código completo) o `Nomenclatura` + `Correlativo`; todo o nada; ajusta los contadores. Lo tienen Control Documentario y superiores, y los Operadores a quienes el jefe marque como "Encargado de DATA" (solo en series de su área).

**Áreas:** cada serie es de Calidad o Topografía. Operadores y visitantes ven y generan solo en su área; las series de Topografía (TOP-EMD-RGI, TOP-GLB-RGI, TOP-GLB-HOJ, TOP-PTS-RGI, TOP-GLB-FCH) las maneja el asistente.

---

## Despliegue (una sola vez, todo con la cuenta del proyecto, **hcat**)

**Ingreso:** usuario y contraseña propios de la app (sin cuenta de Google ni Google Cloud). La contraseña se guarda solo como hash
con sal; 5 intentos fallidos bloquean 15 minutos; la contraseña temporal se cambia obligatoriamente en el primer ingreso; el jefe de
área (o superior) restablece la de un usuario de nivel inferior. El correo es opcional (solo identificador interno).

### 1. Backend (Apps Script)
```bash
npm install -g @google/clasp
clasp login                      # iniciar con la cuenta hcat
cd backend
clasp create --type standalone --title "PSR2 Calidad API" --rootDir .
clasp push
```
1. `clasp open` → en el editor seleccionar la función **setup** → *Ejecutar* → autorizar.
   Crea la hoja "PSR2 Calidad - Base de datos", las carpetas en Drive, el proyecto PSR2 (empresa CPC), los usuarios
   (Carlos `carlos`, Eduardo `eduardo`, Lesllye `lsalazar`, Jenny `jsanchez`), los catálogos del Anexo A y las 12 series F2 en 0.
   **El registro de ejecución muestra el usuario y la contraseña temporal de cada uno**: entregarlas (se cambian al primer ingreso).
2. *Implementar → Nueva implementación → Aplicación web*: Ejecutar como **Yo (hcat)**, Acceso **Cualquier usuario**.
   Copiar la URL que termina en `/exec`.
   (El acceso "Cualquier usuario" es necesario para que la web llame a la API; la seguridad la dan el usuario/contraseña y la lista de Usuarios.)
3. Para actualizar luego: `clasp push` y *Implementar → Gestionar implementaciones → Editar → Nueva versión* (la URL no cambia).

### 2. Frontend (GitHub Pages)
1. En `frontend/js/config.js` pegar `API_URL` (la URL `/exec`).
2. Crear repositorio **público** en GitHub y subir el proyecto (la carpeta `data/` está excluida por `.gitignore`).
3. *Settings → Pages → Source: GitHub Actions*. El workflow `.github/workflows/pages.yml` publica `frontend/`.
4. Abrir `https://<usuario>.github.io/<repo>/` e ingresar con `carlos` y su contraseña temporal.

### 4. Puesta en marcha (carga inicial)
`npm run carga` arma `data/CARGA INICIAL/` (no se versiona): `1-FORMATOS/` (los 31 FOR en .xlsx; los .xls antiguos ya convertidos sin
cambiar nada) y `2-LOG/` (el Excel del LOG tal cual). Orden:
1. Propietario: revisar Usuarios (Eduardo Jefe de Área, Lesllye y Jenny Operadoras ya cargados); crear Coordinador General, Control Documentario y Auditor.
2. Propietario: Administración → Formatos → subir los 31 de `1-FORMATOS/` (el nombre sale del título del Excel).
3. Control Documentario: pantalla **LOG → Cargar LOG** con `2-LOG/` (revisar la vista previa: filas, observadas, contadores) → Cargar.
4. Topografía: botón **DATA** → cargar sus códigos usados (CSV con columna `Codigo`) o *Ajustar contador* por serie.
4. Desde el lanzamiento, todos los códigos se generan solo en esta app (una sola fuente de numeración).

## Límites del plan gratuito (holgados para ~10 usuarios)
Apps Script: 20 000 llamadas UrlFetch/día, 6 min por ejecución, 30 ejecuciones simultáneas. Drive: 15 GB.
Archivos hasta 20 MB (las fotos del celular se comprimen antes de subir).
