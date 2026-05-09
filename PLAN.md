# Plan de trabajo: plugin Saltcorn DB Code

Plugin para gestionar desde Saltcorn objetos de código de base de datos, empezando por funciones y procedimientos PostgreSQL, con una experiencia similar a Supabase.

## Objetivo

Crear un plugin Saltcorn que permita a usuarios administradores:

- Listar funciones y procedimientos existentes en la base de datos del tenant.
- Ver su definición SQL y metadatos.
- Crear nuevas funciones/procedimientos.
- Editar funciones existentes.
- Eliminar funciones/procedimientos con confirmación.
- Ejecutar/testear funciones simples desde la UI.

El primer alcance será **PostgreSQL-only**. SQLite quedará fuera del MVP porque no soporta stored procedures persistentes.

---

## Planteamiento de UI

El plan inicial plantea la UI como **rutas propias del plugin**, no como un tipo de vista Saltcorn:

- `/db-code` listado principal.
- `/db-code/routine/:oid` detalle.
- `/db-code/new` creación.
- `/db-code/routine/:oid/edit` edición.
- `/db-code/routine/:oid/delete` borrado.
- `/db-code/routine/:oid/execute` ejecución/prueba.

Esto encaja mejor con una consola administrativa tipo Supabase, porque las funciones/procedimientos no son filas de una tabla Saltcorn normal.

### Integración con menú

Para que el usuario pueda añadirlo al menú hay tres opciones:

1. **Opción MVP recomendada: ruta plugin + enlace de menú**
   - El plugin expone `/db-code`.
   - El administrador añade una entrada de menú/enlace hacia `/db-code` desde la configuración normal de Saltcorn.
   - Es la opción más simple, estable y segura.

2. **Opción fase 2: Page/View embebible**
   - Crear un viewtemplate tableless llamado, por ejemplo, `DB Code Console`.
   - El usuario podría crear una vista Saltcorn de ese tipo y añadirla a páginas/menús.
   - Internamente seguiría usando rutas del plugin para acciones POST.
   - Más integrado, pero más trabajo y menos necesario para el MVP.

3. **Opción alternativa: table provider / external table**
   - Exponer las funciones de `pg_proc` como una tabla virtual read-only.
   - Permitirá usar vistas Saltcorn normales tipo List/Show.
   - No es ideal para crear/editar/borrar porque esas operaciones no encajan bien con CRUD tradicional.

### Decisión inicial

El MVP usará la opción 1: **rutas plugin administrativas + enlace de menú manual**.

Después de validar el flujo, se evaluará añadir un viewtemplate tableless para que la consola pueda insertarse como una vista Saltcorn.

---

## Principios de diseño

1. **Plugin independiente**
   - No modificar core de Saltcorn salvo que sea imprescindible.
   - Usar rutas de plugin Saltcorn.

2. **PostgreSQL primero**
   - Usar catálogos `pg_proc`, `pg_namespace`, `pg_language`, `pg_depend`.
   - Operar solo sobre el schema del tenant actual.

3. **Seguridad estricta**
   - Solo usuarios admin (`role_id === 1`).
   - Mantener CSRF activo en formularios.
   - No exponer endpoints públicos.
   - No permitir modificar objetos fuera del schema del tenant.

4. **MVP conservador**
   - UI simple.
   - Formularios estructurados para crear funciones.
   - Editor SQL completo solo en fase posterior o detrás de configuración.

---

## Estructura inicial propuesta

```txt
saltcorn-db-code/
├── package.json
├── index.js
├── README.md
├── PLAN.md
├── lib/
│   ├── auth.js
│   ├── introspection.js
│   ├── sql-builders.js
│   └── validation.js
├── routes/
│   ├── list.js
│   ├── show.js
│   ├── create.js
│   ├── edit.js
│   ├── delete.js
│   └── execute.js
└── tests/
    └── introspection.test.js
```

---

## Fase 0: Preparación del plugin

### Tareas

- [ ] Crear `package.json` básico.
- [ ] Crear `index.js` con export Saltcorn plugin:

```js
module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "db-code",
  routes: [],
};
```

- [ ] Añadir scripts de desarrollo/test.
- [ ] Documentar instalación local con Saltcorn:

```bash
cd /home/devgiu/dev/saltcorn
./packages/saltcorn-cli/bin/saltcorn dev:localize-plugin db-code /home/devgiu/dev/saltcorn-db-code
```

### Resultado esperado

Plugin cargable desde Saltcorn sin funcionalidad todavía.

---

## Fase 1: Introspección de funciones PostgreSQL

### Objetivo

Listar funciones/procedimientos del schema del tenant actual.

### Consulta base

```sql
SELECT
  p.oid,
  n.nspname AS schema,
  p.proname AS name,
  p.prokind,
  CASE p.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
  END AS kind,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_functiondef(p.oid) AS definition,
  l.lanname AS language,
  p.provolatile,
  p.prosecdef,
  obj_description(p.oid, 'pg_proc') AS description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = $1
ORDER BY p.proname, identity_arguments;
```

### Tareas

- [ ] Crear `lib/introspection.js`.
- [ ] Implementar `listRoutines()`.
- [ ] Implementar `getRoutineByOid(oid)`.
- [ ] Detectar si `db.isSQLite` y devolver error claro.
- [ ] Crear ruta `GET /db-code`.
- [ ] Mostrar tabla HTML simple con:
  - nombre
  - tipo
  - argumentos
  - retorno
  - lenguaje
  - acciones

### Resultado esperado

Página `/db-code` lista funciones/procedimientos del tenant.

---

## Fase 2: Vista detalle

### Objetivo

Ver definición SQL y metadatos de una función/procedimiento.

### Tareas

- [ ] Crear ruta `GET /db-code/routine/:oid`.
- [ ] Mostrar:
  - nombre
  - schema
  - argumentos
  - retorno
  - lenguaje
  - volatility
  - security definer/invoker
  - descripción
  - definición SQL en bloque `<pre><code>`
- [ ] Añadir botones:
  - editar
  - eliminar
  - probar/ejecutar

### Resultado esperado

Desde el listado se puede abrir una función y ver su SQL completo.

---

## Fase 3: Crear funciones

### Objetivo

Crear funciones PostgreSQL mediante formulario estructurado.

### Campos iniciales

- Nombre de función.
- Argumentos en texto controlado, ejemplo: `user_id integer, active boolean`.
- Tipo de retorno, ejemplo: `integer`, `text`, `jsonb`, `setof table_name`.
- Lenguaje: `sql` o `plpgsql`.
- Volatility: `VOLATILE`, `STABLE`, `IMMUTABLE`.
- Security: `INVOKER` o `DEFINER`.
- Cuerpo de función.
- Descripción opcional.

### SQL ejemplo

```sql
CREATE OR REPLACE FUNCTION "tenant_schema"."my_function"(user_id integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
AS $scdbcode$
BEGIN
  RETURN jsonb_build_object('user_id', user_id);
END;
$scdbcode$;
```

### Tareas

- [ ] Crear `lib/validation.js`.
- [ ] Validar identificadores.
- [ ] Validar lenguaje permitido.
- [ ] Validar volatility permitido.
- [ ] Crear `lib/sql-builders.js`.
- [ ] Implementar `buildCreateFunctionSql()`.
- [ ] Crear ruta `GET /db-code/new`.
- [ ] Crear ruta `POST /db-code/new`.
- [ ] Añadir flash success/error.

### Resultado esperado

Se puede crear una función en el schema del tenant desde UI.

---

## Fase 4: Editar funciones

### Objetivo

Editar funciones existentes de forma segura.

### Estrategia MVP

- Mostrar definición actual.
- Permitir editar el cuerpo y propiedades compatibles con `CREATE OR REPLACE`.
- Avisar que cambiar firma o tipo de retorno puede requerir borrar y recrear.

### Tareas

- [ ] Ruta `GET /db-code/routine/:oid/edit`.
- [ ] Ruta `POST /db-code/routine/:oid/edit`.
- [ ] Obtener firma actual con `pg_get_function_identity_arguments(oid)`.
- [ ] Usar `CREATE OR REPLACE FUNCTION` manteniendo nombre y argumentos.
- [ ] Añadir advertencias sobre dependencias.

### Resultado esperado

Se puede modificar una función existente sin cambiar su identidad.

---

## Fase 5: Eliminar funciones/procedimientos

### Objetivo

Eliminar objetos con confirmación y advertencia de dependencias.

### Tareas

- [ ] Consultar dependencias con `pg_depend`.
- [ ] Ruta `GET /db-code/routine/:oid/delete` con pantalla de confirmación.
- [ ] Ruta `POST /db-code/routine/:oid/delete`.
- [ ] Generar SQL:

```sql
DROP FUNCTION "schema"."name"(identity_arguments);
```

- [ ] No usar `CASCADE` por defecto.
- [ ] Ofrecer `CASCADE` solo como opción explícita en fase posterior.

### Resultado esperado

Se puede borrar una función/procedimiento sin romper dependencias accidentalmente.

---

## Fase 6: Ejecutar/testear funciones

### Objetivo

Permitir probar funciones desde la UI.

### MVP

- Solo funciones, no procedimientos.
- Solo funciones con argumentos simples.
- Formulario JSON o campos texto.
- Ejecutar con parámetros preparados cuando sea posible.

### Tareas

- [ ] Ruta `GET /db-code/routine/:oid/execute`.
- [ ] Ruta `POST /db-code/routine/:oid/execute`.
- [ ] Parsear argumentos desde metadata.
- [ ] Ejecutar:

```sql
SELECT * FROM "schema"."function_name"($1, $2, ...);
```

- [ ] Mostrar resultado tabular o JSON.
- [ ] Manejar errores SQL de forma legible.

### Resultado esperado

Se puede probar una función y ver el resultado en Saltcorn.

---

## Fase 7: Configuración del plugin

### Objetivo

Permitir configurar comportamiento desde Saltcorn.

### Opciones posibles

- Habilitar/deshabilitar editor SQL avanzado.
- Habilitar ejecución de funciones.
- Lenguajes permitidos: `sql`, `plpgsql`.
- Permitir `SECURITY DEFINER` sí/no.
- Permitir `DROP CASCADE` sí/no.

### Tareas

- [ ] Añadir `configuration_workflow`.
- [ ] Usar configuración en rutas y validaciones.

### Resultado esperado

Plugin configurable sin modificar código.

---

## Fase 8: Tests

### Objetivo

Cubrir lógica crítica sin depender demasiado de UI.

### Tests prioritarios

- [ ] Validación de identificadores.
- [ ] Builder SQL para creación.
- [ ] Builder SQL para drop.
- [ ] Introspección en PostgreSQL.
- [ ] Bloqueo en SQLite.
- [ ] Permisos admin.

### Comandos orientativos

Desde Saltcorn core:

```bash
cd /home/devgiu/dev/saltcorn
./packages/saltcorn-cli/bin/saltcorn dev:plugin-test /home/devgiu/dev/saltcorn-db-code
```

Ajustar según comando real disponible en el CLI local.

---

## Riesgos técnicos

### SQL injection

Mayor riesgo del proyecto. Mitigaciones:

- Validar identificadores con regex estricta.
- Quote seguro para identificadores.
- No interpolar valores de ejecución: usar parámetros.
- Restringir lenguajes.
- No aceptar SQL arbitrario en MVP.

### Cambios de firma

PostgreSQL no permite cambiar todo con `CREATE OR REPLACE FUNCTION`. Mitigación:

- MVP edita cuerpo y propiedades compatibles.
- Cambios de firma requerirán flujo separado `drop + create`.

### Dependencias

Borrar funciones puede romper triggers, views u otras funciones. Mitigación:

- Consultar `pg_depend`.
- Mostrar advertencia.
- No usar `CASCADE` por defecto.

### Multi-tenancy

Mitigación:

- Siempre usar `db.getTenantSchema()`.
- Filtrar por `pg_namespace.nspname = tenantSchema`.
- No permitir schema editable por usuario.

---

## Roadmap posterior

### RPC estilo Supabase

Exponer funciones seleccionadas como endpoint:

```http
POST /db-code/rpc/my_function
```

Requiere whitelist, permisos y validación de argumentos.

### Integración con Actions

Crear una acción Saltcorn:

> Call database function

para usar funciones DB desde workflows, botones y vistas.

### Gestión de triggers

Añadir soporte para:

- listar triggers
- crear trigger sobre tabla
- asociar trigger function
- activar/desactivar trigger

### Gestión de views/materialized views

Añadir objetos:

- views SQL
- materialized views
- refresh materialized view

### Auditoría

Registrar operaciones críticas:

- create
- edit
- drop
- execute

---

## Primer milestone recomendado

**Milestone 1: Read-only PostgreSQL routines**

Entregables:

- Plugin cargable.
- Ruta `/db-code`.
- Listado de funciones/procedimientos.
- Vista detalle con SQL.
- Restricción admin.
- Mensaje claro en SQLite.

Este milestone valida la viabilidad sin asumir riesgos de escritura SQL.
