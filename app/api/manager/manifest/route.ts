import { NextRequest, NextResponse } from 'next/server';

// Manifeste de l'espace manager : ajouté à l'écran d'accueil, l'appli s'ouvre sur le tableau de bord
// (ou sur le lien personnel de l'administrateur, qui le reconnecte automatiquement).
// Nécessaire sur iPhone pour recevoir les notifications.
export async function GET(req: NextRequest) {
  const start = new URL(req.url).searchParams.get('start') || '';
  const startUrl = /^\/planning\/[A-Za-z0-9_-]+$/.test(start) ? start : '/manager/dashboard';
  return NextResponse.json(
    {
      name: 'Riad Anyssates – Planning',
      short_name: 'Planning',
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  );
}
