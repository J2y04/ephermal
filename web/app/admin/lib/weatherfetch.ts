export async function fetchWeather() {
    const position = await getLocation();

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Weather request failed: ${response.status}`);
    }
    else {
        const data = await response.json();
    

    return {
        "temperature": `${Math.round(data["current"]["temperature_2m"])}${data["current_units"]["temperature_2m"]}`,
        "humidity": `${Math.round(data["current"]["relative_humidity_2m"])}${data["current_units"]["relative_humidity_2m"]}`,
        "wind_speed": `${Math.round(data["current"]["wind_speed_10m"])}${data["current_units"]["wind_speed_10m"]}`,
        "emoji": getWeatherEmoji(data.current.weather_code)
    }
}
}

function getLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(resolve, reject);
        }
        else {
            reject(new Error("Geolocation API failed."));
            return;
        }
    });
}

function getWeatherEmoji(weatherCode: number): string {
    switch (weatherCode) {
        case 0:
            return "☀️"; // Clear sky

        case 1:
            return "🌤️"; // Mainly clear
        case 2:
            return "⛅"; // Partly cloudy
        case 3:
            return "☁️"; // Overcast

        case 45:
        case 48:
            return "🌫️"; // Fog

        case 51:
        case 53:
        case 55:
            return "🌦️"; // Drizzle

        case 56:
        case 57:
            return "🌧️"; // Freezing drizzle

        case 61:
        case 63:
        case 65:
            return "🌧️"; // Rain

        case 66:
        case 67:
            return "🌨️"; // Freezing rain

        case 71:
        case 73:
        case 75:
            return "❄️"; // Snowfall

        case 77:
            return "🌨️"; // Snow grains

        case 80:
        case 81:
        case 82:
            return "🌧️"; // Rain showers

        case 85:
        case 86:
            return "🌨️"; // Snow showers

        case 95:
            return "⛈️"; // Thunderstorm

        case 96:
        case 99:
            return "⛈️"; // Thunderstorm with hail

        default:
            return "🌡️"; // Unknown
    }}