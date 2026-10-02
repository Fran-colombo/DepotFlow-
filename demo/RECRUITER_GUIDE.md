# Guía de prueba — Entorno DEMO

Sistema de **gestión de depósito / inventario** para herramientas, materiales y movimientos hacia obras de construcción.

> **Entorno de demostración vacío.** Los cambios no afectan sistemas reales. Hay que cargar depósitos y productos a mano.

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
2. **Gestión depósitos:** crear un galpón y sus zonas.
3. **Agregar** un producto y cargar stock desde el menú del ítem.
4. **Retirar:** elegir el producto → Retirar → una obra → confirmar.
5. **Pendientes:** ver el retiro pendiente de devolución.
6. **Ver dónde están** (menú ⋮ del ítem): ubicación, persona y fecha.
7. **Devolver** parte del stock desde Pendientes o desde Productos.
8. **Trasladar entre obras** un ítem pendiente (Pendientes o menú del producto).
9. **Historial:** filtrar por acción (retiro, devolución, traslado).
10. **Gestión usuarios:** crear un usuario con rol Usuario o Admin; probar **Cambiar contraseña**.
11. (Opcional) Cerrar sesión e ingresar como **demo.user@example.com** — funciones limitadas vs admin.

---

## Datos de arranque

- No hay depósitos, productos ni historial.
- Solo los dos usuarios de acceso (`@example.com`).
- Las categorías base las crea la aplicación al iniciar.

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

Esto deja el inventario vacío **solo en el entorno demo** y conserva los usuarios de acceso.
