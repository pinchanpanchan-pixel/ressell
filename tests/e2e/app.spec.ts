/**
 * Recorrido completo en un móvil (Pixel 7) contra la pila local:
 * acceso, capital inicial, proveedor, productos, pedido, pago, recepción, venta,
 * doble envío, devolución, cancelación, análisis y planificador.
 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR ?? 'test-results/shots';
const OWNER = { email: 'owner@mlsupply.test', password: 'Owner-Password-123' };
const eur = (s: string) => s.replace(/ /g, ' ');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Control de formulario por el texto exacto de su etiqueta. */
function field(page: Page, name: string) {
  return page.locator('label').filter({ has: page.locator(`xpath=./span[normalize-space()="${name}"]`) }).locator('input, select, textarea');
}

async function cash(page: Page) {
  await page.goto('/');
  return eur(await page.locator('[data-cash]').innerText());
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await field(page, 'Email').fill(email);
  await field(page, 'Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe.configure({ mode: 'serial' });

test('acceso protegido', async ({ page }) => {
  await page.goto('/stock');
  await expect(page).toHaveURL(/\/login$/);
  await shot(page, '01-login');
  await login(page, OWNER.email, 'contraseña-mala');
  await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();
  const res = await page.request.get('/api/export?format=json');
  expect(res.status()).toBe(401);
});

test('una cuenta no autorizada no ve datos', async ({ page }) => {
  await login(page, 'stranger@mlsupply.test', 'Stranger-Password-123');
  await expect(page).toHaveURL(/no-autorizado/);
  await expect(page.getByRole('heading', { name: 'Cuenta no autorizada' })).toBeVisible();
  await page.goto('/finanzas');
  await expect(page).toHaveURL(/no-autorizado/);
  expect((await page.request.get('/api/export?format=json')).status()).toBe(403);
});

test('recorrido completo de la propietaria', async ({ page }) => {
  await login(page, OWNER.email, OWNER.password);
  await expect(page.getByText('Dinero disponible', { exact: true })).toBeVisible();
  await shot(page, '02-dashboard-vacio');

  // Capital inicial
  await field(page, 'Importe').fill('150');
  await page.getByRole('button', { name: 'Registrar capital inicial' }).click();
  await expect(page.getByText('Primer paso')).toHaveCount(0);
  expect(await cash(page)).toBe('150,00 €');

  // Proveedor
  await page.goto('/ajustes');
  await field(page, 'Nombre').last().fill('Proveedor Test');
  await page.getByRole('button', { name: 'Añadir proveedor' }).click();
  await expect(page.getByText('Proveedor guardado')).toBeVisible();

  // Productos (variantes separadas)
  for (const [variant, sku, price, category] of [['Talla 42', 'ZX-42', '70', 'Zapatillas'], ['Talla 43', 'ZX-43', '75', '']]) {
    await page.goto('/stock/nuevo');
    await field(page, 'Nombre').fill('Zapatilla');
    await field(page, 'Marca').fill('Marca');
    await field(page, 'Modelo').fill('X1');
    await field(page, 'Variante exacta').fill(variant);
    await field(page, 'SKU / referencia').fill(sku);
    await field(page, 'Proveedor habitual').selectOption({ label: 'Proveedor Test' });
    await field(page, 'Precio de venta previsto').fill(price);
    if (category) await field(page, 'Categoría').fill(category);
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page.getByRole('heading', { name: 'Zapatilla' })).toBeVisible();
  }
  // Variante duplicada rechazada
  await page.goto('/stock/nuevo');
  await field(page, 'Nombre').fill('zapatilla');
  await field(page, 'Marca').fill('marca');
  await field(page, 'Modelo').fill('x1');
  await field(page, 'Variante exacta').fill('talla 42');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText('Esa variante exacta ya está registrada')).toBeVisible();

  // Pedido con dos líneas y costes
  await page.goto('/pedidos/nuevo');
  await field(page, 'Proveedor').selectOption({ label: 'Proveedor Test' });
  const product = page.getByRole('combobox', { name: 'Producto' });
  await product.nth(0).selectOption({ label: 'Marca Zapatilla X1 · Talla 42' });
  await field(page, 'Cantidad').nth(0).fill('4');
  await field(page, 'Precio/ud').nth(0).fill('15');
  await page.getByRole('button', { name: 'Añadir producto' }).click();
  await product.nth(1).selectOption({ label: 'Marca Zapatilla X1 · Talla 43' });
  await field(page, 'Cantidad').nth(1).fill('2');
  await field(page, 'Precio/ud').nth(1).fill('20');
  await field(page, 'Envío del proveedor').fill('20');
  await field(page, 'Empaquetado').fill('3');
  await field(page, 'Descuento del pedido').fill('5');
  await expect(page.getByText('Coste total').locator('../..')).toContainText('118,00');
  await shot(page, '03-nuevo-pedido');
  await page.getByRole('button', { name: 'Pendiente de pago' }).click();
  await expect(page.getByRole('heading', { name: /PED-/ })).toBeVisible();
  const orderUrl = page.url();

  // Pagar: baja la caja, el stock no cambia
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await page.getByRole('button', { name: /Confirmar pago de 118,00/ }).click();
  await expect(page.getByText('Pago registrado en caja')).toBeVisible();
  expect(await cash(page)).toBe('32,00 €');
  await page.goto('/stock?ver=todos');
  await expect(page.getByText('+4 en camino')).toBeVisible();

  // Recibir: stock con coste real
  await page.goto(orderUrl);
  await page.getByRole('button', { name: 'Registrar recepción' }).click();
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  await expect(page.getByText('Pedido recibido')).toBeVisible();
  await page.reload();
  await expect(page.getByText('coste real 17,70 €/ud')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar recepción' })).toHaveCount(0);
  await shot(page, '04-pedido-recibido');

  // Venta con doble pulsación: solo una venta
  await page.goto('/ventas/nueva');
  await field(page, 'Producto y variante').selectOption({ label: 'Marca Zapatilla X1 · Talla 42 — 4 ud' });
  await expect(field(page, 'Precio por unidad')).toHaveValue('70,00');
  await field(page, 'Destacado').fill('5');
  await expect(page.getByText('Beneficio estimado').locator('../..')).toContainText('47,30');
  await shot(page, '05-nueva-venta');
  const submit = page.getByRole('button', { name: 'Registrar venta' });
  await submit.dblclick();
  await expect(page.getByText('Venta registrada')).toBeVisible();
  await shot(page, '06-venta');
  await page.goto('/ventas');
  await expect(page.locator('a[href^="/ventas/"]:not([href="/ventas/nueva"])')).toHaveCount(1);
  expect(await cash(page)).toBe('97,00 €');

  // Segunda venta pendiente de cobro y cancelación
  await page.goto('/ventas/nueva');
  await field(page, 'Producto y variante').selectOption({ label: 'Marca Zapatilla X1 · Talla 42 — 3 ud' });
  await field(page, 'Pago').selectOption('pending');
  await page.getByRole('button', { name: 'Registrar venta' }).click();
  await expect(page.getByText('Venta registrada')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como cobrada' }).click();
  await page.getByRole('button', { name: 'Confirmar cobro' }).click();
  await expect(page.getByText('Cobro registrado en caja')).toBeVisible();
  expect(await cash(page)).toBe('167,00 €');
  await page.goBack();
  await page.reload();
  await page.getByRole('button', { name: 'Cancelar venta' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar venta' }).click();
  await expect(page.getByText('Venta cancelada: stock repuesto y movimientos')).toBeVisible();
  expect(await cash(page)).toBe('97,00 €');

  // Venta de talla 43 y devolución defectuosa con reembolso
  await page.goto('/ventas/nueva');
  await field(page, 'Producto y variante').selectOption({ label: 'Marca Zapatilla X1 · Talla 43 — 2 ud' });
  await field(page, 'Cantidad').fill('2');
  await page.getByRole('button', { name: 'Registrar venta' }).click();
  await expect(page.getByText('Venta registrada')).toBeVisible();
  expect(await cash(page)).toBe('247,00 €');
  await page.goBack();
  await page.reload();
  await field(page, 'Unidades').fill('1');
  await field(page, 'Reembolso').fill('75');
  await field(page, 'Estado del producto devuelto').selectOption('defective');
  await page.getByRole('button', { name: 'Registrar devolución' }).click();
  await page.getByRole('button', { name: 'Confirmar devolución' }).click();
  await expect(page.getByText('Devolución registrada como defectuosa')).toBeVisible();
  expect(await cash(page)).toBe('172,00 €');

  // Gasto que deja la caja en negativo: se acepta y la tarjeta de Inicio se marca en rojo
  await page.goto('/finanzas');
  await field(page, 'Tipo de movimiento').selectOption('expense');
  await field(page, 'Importe').fill('500');
  await field(page, 'Descripción').fill('Gasto grande');
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
  await expect(page.getByText('Movimiento registrado')).toBeVisible();
  expect(await cash(page)).toBe('-328,00 €');
  await expect(page.locator('.negative-cash')).toHaveCount(1);
  await expect(page.getByText('En negativo')).toBeVisible();
  await shot(page, '07-caja-negativa');
  // Se anula con un asiento inverso y la caja vuelve a positivo, sin contorno
  await page.goto('/finanzas');
  await page.getByRole('button', { name: 'Anular' }).first().click();
  await page.getByRole('button', { name: 'Anular movimiento' }).click();
  await page.getByRole('button', { name: 'Crear asiento inverso' }).click();
  await expect(page.getByText(/Gasto · anulado/)).toBeVisible();
  expect(await cash(page)).toBe('172,00 €');
  await expect(page.locator('.negative-cash')).toHaveCount(0);

  // Eliminar la venta cancelada: desaparece del todo
  await page.goto('/ventas?ver=cancelled');
  await page.locator('a[href^="/ventas/"]:not([href="/ventas/nueva"])').first().click();
  await page.getByRole('button', { name: 'Eliminar venta' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar para siempre' }).click();
  await expect(page.getByText('Venta eliminada')).toBeVisible();
  expect(await cash(page)).toBe('172,00 €');

  // Crear un producto desde dentro de un pedido, guardar como borrador y eliminar el pedido
  await page.goto('/pedidos/nuevo');
  await page.getByRole('button', { name: '+ Producto nuevo' }).click();
  await field(page, 'Nombre').fill('Gorra');
  await field(page, 'Categoría').fill('Accesorios');
  await field(page, 'Precio venta previsto').fill('20');
  await field(page, 'Coste unitario').fill('5');
  await shot(page, '12-producto-desde-pedido');
  await page.getByRole('button', { name: 'Crear y añadir al pedido' }).click();
  await expect(page.getByRole('combobox', { name: 'Producto' }).first()).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByRole('combobox', { name: 'Producto' }).first().locator('option:checked')).toHaveText('Gorra');
  await expect(field(page, 'Precio/ud').first()).toHaveValue('5');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: /PED-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar pedido' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar para siempre' }).click();
  await expect(page.getByText('Pedido eliminado')).toBeVisible();

  // Pedido recibido con unidades vendidas: no se puede eliminar
  await page.goto(orderUrl);
  await page.getByRole('button', { name: 'Eliminar pedido' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar para siempre' }).click();
  await expect(page.getByText(/No se puede eliminar: hay unidades de este pedido vendidas/)).toBeVisible();

  // Filtro por categoría en Stock
  await page.goto('/stock?ver=todos');
  await expect(page.getByRole('link', { name: 'Zapatillas', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Accesorios', exact: true }).click();
  await expect(page.getByText('Gorra')).toBeVisible();
  await expect(page.getByText('Talla 42')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zapatillas', exact: true }).click();
  await expect(page.getByText('Marca Zapatilla X1 · Talla 42')).toBeVisible();
  await expect(page.getByText('Gorra')).toHaveCount(0);
  await shot(page, '13-stock-categorias');

  await page.goto('/');
  await shot(page, '08-dashboard');
  await page.goto('/stock');
  await shot(page, '09-stock');
  await page.goto('/analisis');
  await expect(page.getByText('Ranking de productos')).toBeVisible();
  await expect(page.getByText('Propuesta de pedido con toda la caja')).toBeVisible();
  await expect(page.getByText('Análisis de ventas')).toBeVisible();
  await shot(page, '10-analisis');
  for (const enfoque of ['Más dinero', 'Más rápido', 'Productos nuevos']) {
    await page.getByRole('link', { name: enfoque, exact: true }).click();
    await expect(page.getByText('Dinero para el pedido')).toBeVisible();
  }
  await shot(page, '10b-analisis-nuevos');
  await page.goto('/planificador');
  await page.getByRole('button', { name: 'Capital de referencia' }).click();
  await expect(page.getByText('Unidades', { exact: true }).locator('../..')).toContainText('6 ud');
  await shot(page, '11-planificador');

  const exp = await page.request.get('/api/export?format=json');
  expect(exp.status()).toBe(200);
  const dump = await exp.json();
  expect(dump.sales).toHaveLength(2);
  expect(dump.ledger_entries.reduce((t: number, e: { amount_cents: number }) => t + e.amount_cents, 0)).toBe(17200);
});
