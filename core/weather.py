"""
weather.py — Open-Meteo API 클라이언트

과거 날짜: Historical API (archive-api.open-meteo.com)
오늘/미래 날짜: Forecast API (api.open-meteo.com)
"""

import time

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


def get_weather_range(lat: float, lon: float, start: str, end: str) -> dict[str, dict] | None:
    """기간(start~end)의 일별 기상을 한 번에 조회한다 (오프라인 대량 수집용).

    Args:
        lat, lon: 위경도
        start, end: 'YYYY-MM-DD' (start <= end)

    Returns:
        {'YYYY-MM-DD': {피처: 값, ...}, ...} 또는 None.
        과거 구간이면 archive, 미래 포함이면 forecast API 사용 (start 기준 판정).
    """
    try:
        d = datetime.strptime(start, "%Y-%m-%d").date()
    except ValueError:
        return None

    url = ("https://archive-api.open-meteo.com/v1/archive"
           if d < date.today()
           else "https://api.open-meteo.com/v1/forecast")
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": ",".join(DAILY_PARAMS),
        "timezone": "Asia/Seoul",
    }
    # 429(rate limit) 대비 exponential backoff 재시도 (대량 수집용)
    for attempt in range(5):
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 2 ** attempt * 5  # 5,10,20,40,80초
                print(f"[weather] 429 rate limit → {wait}s 대기 후 재시도({attempt+1}/5)")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            daily = resp.json().get("daily", {})
            dates = daily.get("time", [])
            out: dict[str, dict] = {}
            for i, day in enumerate(dates):
                out[day] = {
                    p: (daily.get(p, [])[i] if i < len(daily.get(p, [])) else None)
                    for p in DAILY_PARAMS
                }
            return out
        except Exception as e:
            print(f"[weather] Range error: {e}")
            return None
    print("[weather] 429 재시도 소진")
    return None
