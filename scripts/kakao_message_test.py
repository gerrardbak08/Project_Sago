#!/usr/bin/env python3
"""
Kakao Developers 메시지 API 로컬 테스트 스크립트.

지원 흐름:
  1. OAuth 인가 URL 출력
  2. 인가 code를 access token으로 교환
  3. 카카오톡 친구 목록 조회
  4. 친구에게 기본 템플릿 메시지 발송
  5. 나에게 기본 템플릿 메시지 발송
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.parse
import urllib.request
from typing import Any

AUTH_HOST = "https://kauth.kakao.com"
API_HOST = "https://kapi.kakao.com"
REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_dotenv() -> None:
    """Load simple KEY=VALUE pairs from .env files without overriding shell env."""
    for path in (REPO_ROOT / ".env", REPO_ROOT / "proj" / ".env.local"):
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if not value:
        raise SystemExit(f"환경변수 {name}가 필요합니다.")
    return value


def _mask(value: str | None) -> str:
    if not value:
        return "(not set)"
    if len(value) <= 10:
        return "*" * len(value)
    return f"{value[:6]}...{value[-4:]}"


def _request(
    method: str,
    url: str,
    *,
    access_token: str | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code}: {raw}") from e


def _default_feed_template(title: str, description: str, link_url: str) -> str:
    template = {
        "object_type": "feed",
        "content": {
            "title": title,
            "description": description,
            "image_url": os.environ.get(
                "KAKAO_MESSAGE_IMAGE_URL",
                "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png",
            ),
            "link": {
                "web_url": link_url,
                "mobile_web_url": link_url,
            },
        },
        "buttons": [
            {
                "title": "안전가이드 확인",
                "link": {
                    "web_url": link_url,
                    "mobile_web_url": link_url,
                },
            }
        ],
    }
    return json.dumps(template, ensure_ascii=False, separators=(",", ":"))


def _default_text_template(text: str, link_url: str) -> str:
    template = {
        "object_type": "text",
        "text": text,
        "link": {
            "web_url": link_url,
            "mobile_web_url": link_url,
        },
        "button_title": "안전가이드 확인",
    }
    return json.dumps(template, ensure_ascii=False, separators=(",", ":"))


def auth_url(args: argparse.Namespace) -> None:
    rest_api_key = _env("KAKAO_REST_API_KEY")
    redirect_uri = _env("KAKAO_REDIRECT_URI", "http://localhost:3000/oauth")
    scope = args.scope or "talk_message,friends"

    params = {
        "client_id": rest_api_key,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
    }
    print(f"{AUTH_HOST}/oauth/authorize?{urllib.parse.urlencode(params)}")


def config(args: argparse.Namespace) -> None:
    rest_api_key = os.environ.get("KAKAO_REST_API_KEY")
    redirect_uri = os.environ.get("KAKAO_REDIRECT_URI", "http://localhost:3000/oauth")
    client_secret = os.environ.get("KAKAO_CLIENT_SECRET")

    print("Kakao test config")
    print(f"- KAKAO_REST_API_KEY: {_mask(rest_api_key)}")
    print(f"- KAKAO_REDIRECT_URI: {redirect_uri}")
    print(f"- KAKAO_CLIENT_SECRET: {'set' if client_secret else 'not set'}")
    print("")
    print("주의: auth-url 생성과 token 교환은 같은 REST API 키와 같은 redirect_uri를 사용해야 합니다.")


def token(args: argparse.Namespace) -> None:
    data = {
        "grant_type": "authorization_code",
        "client_id": _env("KAKAO_REST_API_KEY"),
        "redirect_uri": _env("KAKAO_REDIRECT_URI", "http://localhost:3000/oauth"),
        "code": args.code,
    }
    client_secret = os.environ.get("KAKAO_CLIENT_SECRET")
    if client_secret:
        data["client_secret"] = client_secret

    print(json.dumps(_request("POST", f"{AUTH_HOST}/oauth/token", data=data), ensure_ascii=False, indent=2))


def refresh(args: argparse.Namespace) -> None:
    data = {
        "grant_type": "refresh_token",
        "client_id": _env("KAKAO_REST_API_KEY"),
        "refresh_token": args.refresh_token,
    }
    client_secret = os.environ.get("KAKAO_CLIENT_SECRET")
    if client_secret:
        data["client_secret"] = client_secret

    print(json.dumps(_request("POST", f"{AUTH_HOST}/oauth/token", data=data), ensure_ascii=False, indent=2))


def friends(args: argparse.Namespace) -> None:
    url = f"{API_HOST}/v1/api/talk/friends"
    result = _request("GET", url, access_token=_env("KAKAO_ACCESS_TOKEN"))
    print(json.dumps(result, ensure_ascii=False, indent=2))


def scopes(args: argparse.Namespace) -> None:
    result = _request(
        "GET",
        f"{API_HOST}/v2/user/scopes",
        access_token=_env("KAKAO_ACCESS_TOKEN"),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def send_me(args: argparse.Namespace) -> None:
    template_object = _default_feed_template(args.title, args.description, args.link_url)
    result = _request(
        "POST",
        f"{API_HOST}/v2/api/talk/memo/default/send",
        access_token=_env("KAKAO_ACCESS_TOKEN"),
        data={"template_object": template_object},
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def send_me_text(args: argparse.Namespace) -> None:
    template_object = _default_text_template(args.text, args.link_url)
    result = _request(
        "POST",
        f"{API_HOST}/v2/api/talk/memo/default/send",
        access_token=_env("KAKAO_ACCESS_TOKEN"),
        data={"template_object": template_object},
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def send_friend(args: argparse.Namespace) -> None:
    template_object = _default_feed_template(args.title, args.description, args.link_url)
    receiver_uuids = json.dumps([args.uuid], ensure_ascii=False, separators=(",", ":"))
    result = _request(
        "POST",
        f"{API_HOST}/v1/api/talk/friends/message/default/send",
        access_token=_env("KAKAO_ACCESS_TOKEN"),
        data={
            "receiver_uuids": receiver_uuids,
            "template_object": template_object,
        },
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def send_friend_text(args: argparse.Namespace) -> None:
    template_object = _default_text_template(args.text, args.link_url)
    receiver_uuids = json.dumps([args.uuid], ensure_ascii=False, separators=(",", ":"))
    result = _request(
        "POST",
        f"{API_HOST}/v1/api/talk/friends/message/default/send",
        access_token=_env("KAKAO_ACCESS_TOKEN"),
        data={
            "receiver_uuids": receiver_uuids,
            "template_object": template_object,
        },
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Kakao 메시지 API 테스트")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("auth-url", help="OAuth 인가 URL 출력")
    p.add_argument("--scope", default="talk_message,friends")
    p.set_defaults(func=auth_url)

    p = sub.add_parser("config", help=".env에서 읽은 Kakao 설정 확인")
    p.set_defaults(func=config)

    p = sub.add_parser("token", help="인가 code를 access token으로 교환")
    p.add_argument("--code", required=True)
    p.set_defaults(func=token)

    p = sub.add_parser("refresh", help="refresh token으로 access token 갱신")
    p.add_argument("--refresh-token", required=True)
    p.set_defaults(func=refresh)

    p = sub.add_parser("friends", help="친구 목록 조회")
    p.set_defaults(func=friends)

    p = sub.add_parser("scopes", help="현재 access token 동의항목 조회")
    p.set_defaults(func=scopes)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--link-url", required=True)
    common.add_argument("--title", default="다이소 매장 안전가이드")
    common.add_argument("--description", default="오늘 생성된 안전가이드를 확인해주세요.")

    p = sub.add_parser("send-me", parents=[common], help="나에게 메시지 발송")
    p.set_defaults(func=send_me)

    p = sub.add_parser("send-friend", parents=[common], help="친구에게 메시지 발송")
    p.add_argument("--uuid", required=True, help="friends 명령 결과의 uuid")
    p.set_defaults(func=send_friend)

    text_common = argparse.ArgumentParser(add_help=False)
    text_common.add_argument("--link-url", required=True)
    text_common.add_argument("--text", required=True)

    p = sub.add_parser("send-me-text", parents=[text_common], help="나에게 텍스트 메시지 발송")
    p.set_defaults(func=send_me_text)

    p = sub.add_parser("send-friend-text", parents=[text_common], help="친구에게 텍스트 메시지 발송")
    p.add_argument("--uuid", required=True, help="friends 명령 결과의 uuid")
    p.set_defaults(func=send_friend_text)

    return parser


def main() -> int:
    _load_dotenv()
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
