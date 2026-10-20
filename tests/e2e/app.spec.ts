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
  const card = page.getByText('Dinero disponible', { exact: true }).locator('..');
  return eur(await card.locator('p.num').first().innerText());
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
  for (const [variant, sku, price] of [['Talla 42', 'ZX-42', '70'], ['Talla 43', 'ZX-43', '75']]) {
    await page.goto('/stock/nuevo');
    await field(page, 'Nombre').fill('Zapatilla');
    await field(page, 'Marca').fill('Marca');
    await field(page, 'Modelo').fill('X1');
    await field(page, 'Variante exacta').fill(variant);
    await field(page, 'SKU / referencia').fill(sku);
    await field(page, 'Proveedor habitual').selectOption({ label: 'Proveedor Test' });
    await field(page, 'Precio de venta previsto').fill(price);
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
  await field(page, 'Comisión plataforma').fill('5');
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

  // Gasto que supera la caja: rechazado con mensaje claro
  await page.goto('/finanzas');
  await field(page, 'Tipo de movimiento').selectOption('expense');
  await field(page, 'Importe').fill('5000');
  await field(page, 'Descripción').fill('Demasiado');
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
  await expect(page.getByText(/Saldo insuficiente/)).toBeVisible();
  await shot(page, '07-finanzas');

  await page.goto('/');
  await shot(page, '08-dashboard');
  await page.goto('/stock');
  await shot(page, '09-stock');
  await page.goto('/analisis');
  await expect(page.getByText('Ranking de productos')).toBeVisible();
  await shot(page, '10-analisis');
  await page.goto('/planificador');
  await page.getByRole('button', { name: 'Capital de referencia' }).click();
  await expect(page.getByText('Unidades', { exact: true }).locator('../..')).toContainText('6 ud');
  await shot(page, '11-planificador');

  const exp = await page.request.get('/api/export?format=json');
  expect(exp.status()).toBe(200);
  const dump = await exp.json();
  expect(dump.sales).toHaveLength(3);
  expect(dump.ledger_entries.reduce((t: number, e: { amount_cents: number }) => t + e.amount_cents, 0)).toBe(17200);
});
