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
      background_color: '#f8fafc',
      theme_color: '#8fbca8',
      icons: [{ src: '/logo-riad.png', sizes: '200x200', type: 'image/png' }],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  );
}
