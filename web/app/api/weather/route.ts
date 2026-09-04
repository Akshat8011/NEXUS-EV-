import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat') || '26.8467';
  const lon = searchParams.get('lon') || '80.9462';
  const apiKey = process.env.WEATHER_API_KEY;

  try {
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;

    const [currentRes, forecastRes, airRes] = await Promise.all([
      fetch(currentUrl), fetch(forecastUrl), fetch(airUrl)
    ]);

    const current = await currentRes.json();
    const forecast = await forecastRes.json();
    const air_pollution = await airRes.json();

    return NextResponse.json({ current, forecast, air_pollution });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
