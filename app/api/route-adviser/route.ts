import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { startLoc, endLoc } = await request.json();
    const apiKey = process.env.ORS_API_KEY;

    // Helper to get coords
    const getCoords = async (loc: string) => {
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(loc)}&size=1`;
      const res = await fetch(url);
      const data = await res.json();
      return data?.features?.[0]?.geometry?.coordinates;
    };

    const startCoords = await getCoords(startLoc);
    const endCoords = await getCoords(endLoc);

    if (!startCoords || !endCoords) {
      return NextResponse.json({ error: "Could not find coordinates for locations" }, { status: 400 });
    }

    // Get distance
    const routeUrl = "https://api.openrouteservice.org/v2/directions/driving-car";
    const routeRes = await fetch(routeUrl, {
      method: "POST",
      headers: {
        'Authorization': apiKey || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coordinates: [startCoords, endCoords] })
    });
    
    const routeData = await routeRes.json();
    const distanceKm = routeData.routes?.[0]?.summary?.distance / 1000.0;

    return NextResponse.json({ distanceKm });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
