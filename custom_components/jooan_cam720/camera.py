"""Camera entity: RTSP video over LAN. Talk-back rides go2rtc (cam720://)."""
from __future__ import annotations

from homeassistant.components.camera import Camera, CameraEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_UID, DEFAULT_ADMIN_USER, DOMAIN, RTSP_PORT


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([JooanCam720Camera(entry)])


class JooanCam720Camera(Camera):
    _attr_has_entity_name = True
    _attr_name = None
    _attr_supported_features = CameraEntityFeature.STREAM

    def __init__(self, entry: ConfigEntry) -> None:
        super().__init__()
        self._host = entry.data[CONF_HOST]
        self._password = entry.data[CONF_PASSWORD]
        self._uid = entry.data[CONF_UID]
        self._attr_unique_id = self._uid
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, self._uid)},
            manufacturer="Jooan",
            model="CAM720 (JA-A12)",
            name=f"CAM720 {self._uid}",
        )

    async def stream_source(self) -> str:
        return (
            f"rtsp://{DEFAULT_ADMIN_USER}:{self._password}"
            f"@{self._host}:{RTSP_PORT}/live/ch00_0"
        )
