"""Jooan CAM720 — local, cloud-free camera integration."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD, Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from . import go2rtc
from .const import (
    ATTR_MEDIA,
    CONF_GO2RTC_URL,
    CONF_TOKEN,
    CONF_UID,
    DEFAULT_GO2RTC_URL,
    DOMAIN,
    SERVICE_TALK,
)

PLATFORMS = [Platform.CAMERA]


def _go2rtc_url(entry: ConfigEntry) -> str:
    return entry.options.get(CONF_GO2RTC_URL, DEFAULT_GO2RTC_URL)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = async_get_clientsession(hass)
    host, uid, token = (
        entry.data[CONF_HOST],
        entry.data[CONF_UID],
        entry.data[CONF_TOKEN],
    )
    name = go2rtc.stream_name(uid)
    src = f"cam720://{host}/{uid}?token={token}"
    try:
        await go2rtc.register_stream(session, _go2rtc_url(entry), name, src)
    except Exception:  # noqa: BLE001 - go2rtc optional; video/PTZ still work
        pass

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = entry
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_reload))
    _register_talk_service(hass)
    return True


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, SERVICE_TALK)
    return unloaded


def _register_talk_service(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_TALK):
        return

    async def handle_talk(call: ServiceCall) -> None:
        session = async_get_clientsession(hass)
        media = call.data[ATTR_MEDIA]
        for entry in hass.data[DOMAIN].values():
            name = go2rtc.stream_name(entry.data[CONF_UID])
            await go2rtc.talk(session, _go2rtc_url(entry), name, media)

    hass.services.async_register(
        DOMAIN,
        SERVICE_TALK,
        handle_talk,
        schema=vol.Schema({vol.Required(ATTR_MEDIA): cv.string}),
    )
