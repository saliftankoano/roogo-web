import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Roogo | Immobilier au Burkina Faso';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          <span style={{ fontWeight: 'bold', color: '#E11D48', fontSize: '160px' }}>Roogo</span>
        </div>
        <div style={{ fontSize: '48px', color: '#6b7280', textAlign: 'center', maxWidth: '800px' }}>
          La référence de la location immobilière au Burkina Faso.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
