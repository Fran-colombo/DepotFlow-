# Guía de prueba — Entorno DEMO

Sistema de **gestión de depósito / inventario** para herramientas, materiales y movimientos hacia obras de construcción.

> **Entorno de demostración con datos ficticios.** Los cambios no afectan sistemas reales.

---

## Credenciales

En la pantalla de login del demo podés usar los botones **Entrar como Admin** o **Entrar como Usuario** (acceso con un clic).

### Administrador
- **Email:** demo.admin@example.com  
- **Contraseña:** Demo123!

### Usuario estándar
- **Email:** demo.user@example.com  
- **Contraseña:** Demo123!

---

## Qué hace la aplicación

- Inventario por **depósito** y **zona**
- **Retiros** de herramientas hacia obras (quedan pendientes de devolución)
- **Devoluciones** al depósito
- **Traslados** entre obras sin modificar stock en depósito
- **Materiales consumibles** (insumos) que reducen stock permanentemente al retirar
- Historial, pendientes, observaciones por ítem
- Gestión de usuarios y depósitos (solo admin)

---

## Flujo recomendado de prueba

1. **Iniciar sesión** como admin (`demo.admin@example.com`).
2. **Productos:** revisar la lista; notar badges **Insumo** vs **Herramienta** y stock disponible/total.
3. **Retirar:** elegir una herramienta → Retirar → obra ficticia (ej. "Obra Centro") → confirmar.
4. **Pendientes:** ver el retiro pendiente de devolución.
5. **Ver dónde están** (menú ⋮ del ítem): ubicación, persona y fecha.
6. **Devolver** parte del stock desde Pendientes o desde Productos.
7. **Trasladar entre obras** un ítem pendiente (Pendientes o menú del producto).
8. **Historial:** filtrar por acción (retiro, devolución, traslado).
9. **Gestión depósitos:** ver galpones/zonas demo; crear una zona de prueba.
10. **Gestión usuarios:** crear un usuario con rol Usuario o Admin; probar **Cambiar contraseña**.
11. **Agregar** un producto nuevo y **Actualizar stock** desde el menú del ítem.
12. **Eliminados:** revisar ítem de ejemplo dado de baja.
13. (Opcional) Cerrar sesión e ingresar como **demo.user@example.com** — funciones limitadas vs admin.

---

## Datos precargados (ficticios)

- 2 depósitos: Galpón Norte Demo, Galpón Sur Demo  
- Zonas, ~15 productos, retiros pendientes en Obra Centro / Obra Norte  
- Historial de ejemplo, observaciones, un ítem eliminado  

Nombres, emails y obras son inventados (`@example.com`, "Operario Demo", etc.).

---

## Notas

- Los cambios **persisten** hasta que un operador ejecute el reset del demo.
- No ingrese datos personales reales.
- URL demo: _(completar con la URL pública que compartas en tu CV)_

---

## Reset (operadores)

Si el dataset quedó muy modificado:

```bash
bash demo/scripts/reset_demo.sh
```

Esto restaura el estado ficticio inicial **solo en el entorno demo**.
