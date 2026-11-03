"""Local LAN access to a Jooan CAM720. No Jooan cloud.

The talk-back token is the camera's UIDInfo.AuthKey, baked into flash at
manufacture. The camera's config-backup CGI returns it to any LAN client that
knows the admin web password (userkey = MD5(password)). Device id/model/mac
come unauthenticated from the setup port (9898).
"""
from __future__ import annotations

import hashlib
import json

import aiohttp

from .const import DEFAULT_ADMIN_USER, HTTP_PORT, SETUP_PORT


class AuthError(Exception):
    """Admin credentials rejected by the camera."""


class CameraError(Exception):
    """Camera unreachable or gave an unexpected response."""


async def identify(session: aiohttp.ClientSession, ip: str) -> dict | None:
    """UID/model/mac/ip from the unauthenticated setup port. None if closed."""
    url = f"http://{ip}:{SETUP_PORT}/get?singleCMD=get_deviceFeatures"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=6)) as r:
            data = json.loads(await r.text())
    except (aiohttp.ClientError, json.JSONDecodeError, OSError):
        return None
    p = data.get("properties", {})
    if not p.get("device_id"):
        return None
    return {
        "uid": p["device_id"],
        "model": p.get("device_model", "CAM720"),
        "mac": p.get("device_mac"),
        "ip": p.get("device_ip", ip),
    }


async def read_config(
    session: aiohttp.ClientSession,
    ip: str,
    password: str,
    skeleton: dict,
    user: str = DEFAULT_ADMIN_USER,
) -> dict:
    """Fill a JSON skeleton with live values via GetJsonConf.

    Pass e.g. {"UIDInfo": {"AuthKey": ""}} to read the talk-back token. A named
    key must be present in the skeleton or the camera returns it empty.
    """
    userkey = hashlib.md5(password.encode()).hexdigest()
    params = {
        "userid": user,
        "userkey": userkey,
        "singleCMD": "GetJsonConf",
        "json_string": json.dumps(skeleton),
    }
    url = f"http://{ip}:{HTTP_PORT}/goform/getOtherSetttings"
    try:
        async with session.get(
            url, params=params, timeout=aiohttp.ClientTimeout(total=8)
        ) as r:
            body = await r.text()
    except (aiohttp.ClientError, OSError) as err:
        raise CameraError(str(err)) from err
    if "error_passwd" in body:
        raise AuthError("wrong admin password")
    if "error_no_user" in body:
        raise AuthError(f"camera rejected user '{user}'")
    start, end = body.find("{"), body.rfind("}")
    if start < 0 or end < 0:
        raise CameraError(f"unexpected response: {body[:120]}")
    try:
        return json.loads(body[start : end + 1])
    except json.JSONDecodeError as err:
        raise CameraError(f"bad JSON: {body[:120]}") from err


async def read_token(
    session: aiohttp.ClientSession, ip: str, password: str, user: str = DEFAULT_ADMIN_USER
) -> str:
    """Read the 14-char talk-back token (device_pwd) from camera flash."""
    cfg = await read_config(session, ip, password, {"UIDInfo": {"AuthKey": ""}}, user)
    token = cfg.get("UIDInfo", {}).get("AuthKey", "")
    if not token:
        raise CameraError("AuthKey empty; camera may not be provisioned")
    return token
