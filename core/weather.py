"""
weather.py — Open-Meteo API 클라이언트

과거 날짜: Historical API (archive-api.open-meteo.com)
오늘/미래 날짜: Forecast API (api.open-meteo.com)
"""

import requests
from datetime import date, datetime

DAILY_PARAMS = [
    "temperature_2m_max", "temperature_2m_min",
    "precipitation_sum", "rain_sum", "snowfall_sum",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]


def get_weather(lat: float, lon: float, target_date: str) -> dict | None:
    """특정 위치/날짜의 기상 데이터를 조회한다.

    Args:
        lat: 위도
        lon: 경도
        target_date: 날짜 (YYYY-MM-DD)

    Returns:
        {"temperature_2m_max": 25.3, ...} 또는 None
    """
    try:
        d = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return None

    today = date.today()

    if d < today:
        url = "https://archive-api.open-meteo.com/v1/archive"
    else:
        url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": target_date,
        "end_date": target_date,
        "daily": ",".join(DAILY_PARAMS),
        "timezone": "Asia/Seoul",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        daily = data.get("daily", {})
        result = {}
        for param in DAILY_PARAMS:
            values = daily.get(param, [None])
            result[param] = values[0] if values else None
        return result
    except Exception as e:
        print(f"[weather] Error: {e}")
        return None
