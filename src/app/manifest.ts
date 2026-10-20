import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ML Supply',
    short_name: 'ML Supply',
    description: 'Dinero, inventario, compras, ventas y reinversión.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#202733',
    theme_color: '#202733',
    lang: 'es',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Registrar venta', short_name: 'Venta', url: '/ventas/nueva', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Nuevo pedido', short_name: 'Pedido', url: '/pedidos/nuevo', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
