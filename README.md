# CuidaGest — Portal de gestión de cuidados

Primera maqueta de interfaz para organizar la selección de cuidadores, los perfiles de las personas usuarias y la planificación de servicios.

## Qué incluye esta versión

- Panel general con resumen de ejemplo.
- Listado de cuidadores, búsqueda y filtro por estado.
- Alta temporal de candidatos y cambio de estado (Apto, En valoración, No apto).
- Listado de usuarios del servicio y alta temporal de fichas.
- Agenda semanal ilustrativa.
- Diseño adaptable a ordenador y móvil.

## Cómo probarla

Abre `index.html` en un navegador, o publica el repositorio con GitHub Pages para ver la maqueta en una URL.

## Importante: todavía no es un sistema de producción

Los perfiles y horarios que aparecen son inventados. Los cambios realizados en la interfaz solo existen en la memoria de la pestaña y desaparecen al recargar. **No introduzcas información real de pacientes, usuarios o cuidadores.**

Este repositorio no debe contener datos personales, datos de salud, direcciones, documentos identificativos, credenciales ni claves privadas.

## Próximas fases propuestas

1. Definir los campos definitivos de cuidadores, usuarios y servicios.
2. Añadir inicio de sesión y permisos por rol.
3. Conectar una base de datos privada y un backend con validaciones y registro de cambios.
4. Crear servicios recurrentes y asignar cuidadores evitando solapamientos.
5. Integrar Google Calendar con autorización segura.
6. Probar copias de seguridad, controles de acceso y protección de datos antes de usarlo con información real.

La interfaz actual es únicamente un prototipo visual/funcional y no incorpora autenticación, persistencia segura ni sincronización con Google Calendar.