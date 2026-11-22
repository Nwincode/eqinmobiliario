# Respaldo y restauración de la base

La base (Firestore, proyecto `eqinmobiliariobd`) guarda casas, reservas, clientes y chats. Dos protecciones, que se
activan una sola vez y cuestan algo de almacenamiento en Google Cloud:

- **Volver a cualquier minuto de los últimos 7 días** (PITR, recuperación a un punto en el tiempo).
- **Una copia diaria** que se guarda 14 días.

No entran en estos respaldos las **fotos** (Storage) ni las **cuentas para entrar al panel** (Authentication).

## 1. Activar (una vez, 5 minutos)

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta dueña del proyecto y abre
   **Cloud Shell** (el ícono `>_` arriba a la derecha).
2. Pega estas líneas, una por una:

   ```
   gcloud config set project eqinmobiliariobd
   gcloud firestore databases update --database='(default)' --enable-pitr
   gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
   ```
3. Comprueba: `gcloud firestore databases describe` dice `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_ENABLED`,
   y `gcloud firestore backups schedules list --database='(default)'` muestra la copia diaria. La primera copia sale
   en las siguientes 24 horas (Google no deja elegir la hora).

En la consola también se ve en Firestore → la base `(default)` → **Recuperación ante desastres** (nombre del menú sin
comprobar). La copia se puede guardar hasta 14 semanas (`--retention=14w`); más días, más costo.

## 2. Que el sistema avise si falta la copia

La función `respaldo-diario` revisa cada mañana que haya una copia de menos de 48 horas y lo anota en
`estado/respaldo` (para «Estado del sistema»). Para prenderla:

1. Dale a la cuenta de servicio de lectura (la de `GOOGLE_SA_EMAIL` en Netlify) el rol para **ver** respaldos, en
   Cloud Shell (cambia `CORREO` por ese correo):

   ```
   gcloud projects add-iam-policy-binding eqinmobiliariobd --member=serviceAccount:CORREO --role=roles/datastore.backupsViewer
   ```
2. En Netlify → Project configuration → Environment variables agrega `REVISAR_RESPALDO` con el valor `si` y publica de
   nuevo (Deploys → Trigger deploy).

Ese rol solo deja ver la lista de copias: no las borra ni restaura.

## 3. Restaurar

Siempre se restaura a una **base nueva** (aquí, `recuperada`); la del sitio no se toca hasta decidir.

**Desde la copia de un día.** Lista las copias y copia el `NAME` de la que quieres:

```
gcloud firestore backups list --format="table(name, snapshotTime, state)"
gcloud firestore databases restore --source-backup=NAME --destination-database=recuperada
```

**Desde un minuto exacto** (de los últimos 7 días). La hora va en UTC: la de Guatemala más 6 horas
(las 9:00 del 20 de noviembre en Guatemala = `2026-11-20T15:00:00Z`; solo minutos, sin segundos):

```
gcloud firestore databases clone --source-database='projects/eqinmobiliariobd/databases/(default)' --snapshot-time=2026-11-20T15:00:00Z --destination-database=recuperada
```

Tarda de minutos a una hora según el tamaño. Después:

1. **Se revisa** `recuperada` en la consola (Firestore → elegir la base `recuperada`) y se confirma que tiene lo que se
   perdió.
2. **Se pasa a la base del sitio.** El sitio y el panel siempre usan `(default)`; esto lo hace un programador:
   - **Unos pocos documentos** (lo más común: alguien borró una casa o una reserva): se copian esos documentos de
     `recuperada` a `(default)`.
   - **Toda la base atrás:** se avisa al equipo que no use el panel, se exporta `recuperada` a un bucket y se importa
     en `(default)`:

     ```
     gcloud firestore export gs://BUCKET/restauracion --database=recuperada
     gcloud firestore import gs://BUCKET/restauracion --database='(default)'
     ```
     La importación reemplaza los documentos con el mismo id; lo creado después de la copia se queda (sin comprobar:
     revisarlo en la documentación antes de hacerlo).
3. **Se publica** el sitio desde el panel (Publicar), para que la página muestre lo recuperado.
4. **Se borra** la base de revisión para no pagarla: `gcloud firestore databases delete --database=recuperada`.

## Fuentes

Los comandos salen de la ayuda de `gcloud` 570 (`gcloud firestore … --help`) y de la API de Firestore v1. Las páginas
de Google (no se pudieron abrir desde aquí; datos tomados de sus resúmenes):

- [Respaldos programados y restauración](https://cloud.google.com/firestore/docs/backups): una copia diaria y una
  semanal por base, hora no elegible, retención hasta 14 semanas, se restaura a una base nueva.
- [Usar PITR](https://cloud.google.com/firestore/docs/use-pitr) y [qué es PITR](https://cloud.google.com/firestore/docs/pitr):
  7 días con PITR (1 hora sin él), al minuto, con costo de almacenamiento.
- [Roles de Firestore](https://cloud.google.com/firestore/docs/security/iam): `roles/datastore.backupsViewer` ve las
  copias; `roles/datastore.viewer` no las incluye.
- [Exportar e importar](https://cloud.google.com/firestore/docs/manage-data/export-import).
