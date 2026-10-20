import type { AuthenticityStatus, DeliveryStatus, LedgerCategory, MovementType, PoStatus, SalePaymentStatus } from './types';

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Borrador',
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  shipped: 'Enviado',
  received: 'Recibido',
  reviewed: 'Revisado',
  cancelled: 'Cancelado',
};

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  pending: 'Por enviar',
  shipped: 'Enviado',
  delivered: 'Entregado',
  returned: 'Devuelto',
};

export const PAYMENT_LABEL: Record<SalePaymentStatus, string> = {
  pending: 'Cobro pendiente',
  paid: 'Cobrado',
};

export const AUTH_LABEL: Record<AuthenticityStatus, string> = {
  pending: 'Sin verificar',
  verified: 'Verificado',
  documented: 'Con documentación',
  doubtful: 'Dudoso',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  purchase_in: 'Entrada por compra',
  sale_out: 'Salida por venta',
  sale_cancel_in: 'Venta cancelada',
  return_in: 'Devolución',
  write_off: 'Baja',
};

export const LEDGER_LABEL: Record<LedgerCategory, string> = {
  initial_capital: 'Capital inicial',
  capital_contribution: 'Aportación de capital',
  sale_income: 'Ingreso por venta',
  platform_fee: 'Comisión',
  sale_shipping: 'Envío de venta',
  sale_other_cost: 'Otros gastos de venta',
  supplier_payment: 'Pago a proveedor',
  purchase_shipping: 'Envío de proveedor',
  expense: 'Gasto',
  supplier_refund: 'Reembolso de proveedor',
  customer_refund: 'Devolución a cliente',
  withdrawal: 'Retirada',
  adjustment: 'Ajuste',
};

/** Categorías que se pueden registrar a mano; el resto se generan desde pedidos y ventas. */
export const MANUAL_LEDGER_CATEGORIES = [
  'initial_capital',
  'capital_contribution',
  'expense',
  'withdrawal',
  'supplier_refund',
  'adjustment',
] as const satisfies readonly LedgerCategory[];

export function poStatusTone(s: PoStatus): 'positive' | 'negative' | 'neutral' | 'warn' | 'info' {
  return s === 'received' || s === 'reviewed' ? 'positive' : s === 'cancelled' ? 'negative' : s === 'draft' ? 'neutral' : s === 'pending_payment' ? 'warn' : 'info';
}

/** Mensajes de confirmación que se muestran tras acciones que cambian el estado de una ficha. */
export const FLASH: Record<string, string> = {
  pagado: 'Pago registrado en caja. El stock se añadirá al recibir el pedido.',
  recibido: 'Pedido recibido: stock actualizado con el coste real de cada unidad.',
  cancelado: 'Pedido cancelado. El historial se conserva.',
  cobrada: 'Cobro registrado en caja.',
  venta_cancelada: 'Venta cancelada: stock repuesto y movimientos de caja revertidos.',
  devolucion: 'Devolución registrada y unidades repuestas en stock.',
  devolucion_defectuosa: 'Devolución registrada como defectuosa (pérdida).',
  nueva: 'Venta registrada. El stock se ha reducido.',
};
