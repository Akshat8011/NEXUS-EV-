import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location');
  const apiKeyORS = process.env.ORS_API_KEY;
  const apiKeyOCM = process.env.OCM_API_KEY;

  if (!location) return NextResponse.json({ error: "Location required" }, { status: 400 });

  try {
    // 1. Get coords
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKeyORS}&text=${encodeURIComponent(location)}&size=1`;
    const res = await fetch(url);
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates; // [lon, lat]

    if (!coords) {
      return NextResponse.json({ error: "Could not find coordinates" }, { status: 400 });
    }
    const [lon, lat] = coords;

    // 2. Get chargers
    const params = new URLSearchParams({
      key: apiKeyOCM || '',
      output: 'json',
      latitude: lat.toString(),
      longitude: lon.toString(),
      distance: '25',
      distanceunit: 'km',
      maxresults: '50',
      includecomments: 'false',
      verbose: 'false'
    });

    const ocmRes = await fetch(`https://api.openchargemap.io/v3/poi/?${params.toString()}`);
    const ocmData = await ocmRes.json();
    
    if (Array.isArray(ocmData)) {
      const chargers = ocmData.map(item => {
        const speed = [22, 22, 22, 60, 80][Math.floor(Math.random() * 5)];
        const totalSpots = Math.floor(Math.random() * 7) + 2;
        const avail = Math.floor(Math.random() * (totalSpots + 1));
        return {
          id: item.ID,
          title: item.AddressInfo?.Title,
          address: `${item.AddressInfo?.AddressLine1 || ''}, ${item.AddressInfo?.Town || ''}`,
          speed,
          available: `${avail} of ${totalSpots}`
        };
      });
      return NextResponse.json({ chargers });
    }
    
    return NextResponse.json({ chargers: [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
