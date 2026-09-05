import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') || 'Lucknow';

  try {
    // Use Nominatim (OpenStreetMap) to geocode the city - free, no API key needed
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'NEXUS-EV-Hub/1.0' } }
    );
    const geoData = await geoRes.json();

    if (!geoData || geoData.length === 0) {
      return NextResponse.json({ error: `City "${city}" not found.` }, { status: 404 });
    }

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);
    const displayName = geoData[0].display_name?.split(',')[0] || city;

    // Try to fetch real outage data from Electricity Maps (carbon intensity as proxy)
    // If no key is available, we return simulated/manual-only data
    const electricityMapKey = process.env.ELECTRICITY_MAP_KEY;
    let gridCarbonIntensity = null;
    let gridStressLevel = 'normal';

    if (electricityMapKey) {
      try {
        const emRes = await fetch(
          `https://api.electricitymap.org/v3/carbon-intensity/latest?lat=${lat}&lon=${lon}`,
          { headers: { 'auth-token': electricityMapKey } }
        );
        if (emRes.ok) {
          const emData = await emRes.json();
          gridCarbonIntensity = emData.carbonIntensity;
          // High carbon intensity = high grid load = potential instability
          if (gridCarbonIntensity > 700) gridStressLevel = 'high';
          else if (gridCarbonIntensity > 400) gridStressLevel = 'medium';
        }
      } catch { /* silent fail */ }
    }

    return NextResponse.json({
      city: displayName,
      lat,
      lon,
      gridCarbonIntensity,
      gridStressLevel,
      // Manual outages — users can POST to add these
      source: electricityMapKey ? 'electricity_map + manual' : 'manual_only',
      note: 'For real-time outages, enter outage windows manually below. Your local electricity board app or SMS alerts are the best source.',
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
