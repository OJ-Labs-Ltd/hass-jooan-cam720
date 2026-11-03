"""Thin client for the go2rtc fork that carries CAM720 talk-back.

The integration registers each camera as a `cam720://` stream, and the talk
service pushes audio into it the way the proven test did: a one-shot ffmpeg
source transcoded to G.711 A-law at 16 kHz.
"""
from __future__ import annotations

import aiohttp


def stream_name(uid: str) -> str:
    return f"cam720_{uid}"


async def register_stream(
    session: aiohttp.ClientSession, base_url: str, name: str, src: str
) -> None:
    """Add or replace a stream in go2rtc (idempotent)."""
    url = f"{base_url.rstrip('/')}/api/streams"
    async with session.put(
        url, params={"name": name, "src": src},
        timeout=aiohttp.ClientTimeout(total=8),
    ) as r:
        r.raise_for_status()


async def talk(
    session: aiohttp.ClientSession, base_url: str, name: str, media: str
) -> None:
    """Play a media URL/file to the camera speaker via go2rtc (one-shot)."""
    src = f"ffmpeg:{media}#audio=pcma/16000"
    url = f"{base_url.rstrip('/')}/api/streams"
    async with session.post(
        url, params={"dst": name, "src": src},
        timeout=aiohttp.ClientTimeout(total=30),
    ) as r:
        r.raise_for_status()
