import { NextRequest, NextResponse } from 'next/server';

type Ctx = { params: Promise<{ token: string }> };

// Manifeste propre à chaque employé : ajoutée à l'écran d'accueil, l'appli s'ouvre sur son planning.
// Nécessaire sur iPhone pour recevoir les notifications.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  return NextResponse.json(
    {
      name: 'Riad Anyssates',
      short_name: 'Anyssates',
      start_url: `/planning/${token}`,
      scope: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#000000',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  );
}
