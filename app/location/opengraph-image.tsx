import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Roogo | Location à Ouagadougou';
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
          fontSize: 100,
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
        <div style={{ color: '#E11D48', fontSize: '120px', fontWeight: 'bold' }}>Roogo</div>
        <div style={{ fontSize: '64px', color: '#111827', marginTop: '20px', fontWeight: 'bold' }}>
          Location Immobilière
        </div>
        <div style={{ fontSize: '40px', color: '#6b7280', marginTop: '20px' }}>
          Appartements, Maisons & Villas à Ouagadougou
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
