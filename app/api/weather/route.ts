import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let lat = searchParams.get('lat');
  let lon = searchParams.get('lon');
  const city = searchParams.get('city');
  const apiKey = process.env.WEATHER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
  }

  try {
    if (city) {
      const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (geoData && geoData.length > 0) {
        lat = geoData[0].lat;
        lon = geoData[0].lon;
      } else {
        return NextResponse.json({ error: "City not found" }, { status: 404 });
      }
    } else {
      lat = lat || '26.8467';
      lon = lon || '80.9462';
    }

    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;

    const [currentRes, forecastRes, airRes] = await Promise.all([
      fetch(currentUrl), fetch(forecastUrl), fetch(airUrl)
    ]);

    const current = await currentRes.json();
    const forecast = await forecastRes.json();
    const air_pollution = await airRes.json();

    if (current.cod && current.cod !== 200) {
      return NextResponse.json({ error: current.message }, { status: current.cod });
    }

    return NextResponse.json({ 
      current, 
      forecast, 
      air_pollution, 
      cityName: current.name 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
