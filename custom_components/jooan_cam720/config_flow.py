"""Config flow: find the camera, read its token locally, add it."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_HOST, CONF_PASSWORD
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.dhcp import DhcpServiceInfo

from . import api
from .const import (
    CONF_GO2RTC_URL,
    CONF_TOKEN,
    CONF_UID,
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_GO2RTC_URL,
    DOMAIN,
)


class JooanCam720ConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._host: str | None = None

    async def async_step_dhcp(
        self, discovery_info: DhcpServiceInfo
    ) -> ConfigFlowResult:
        self._host = discovery_info.ip
        session = async_get_clientsession(self.hass)
        info = await api.identify(session, self._host)
        uid = info["uid"] if info else discovery_info.macaddress
        await self.async_set_unique_id(uid)
        self._abort_if_unique_id_configured(updates={CONF_HOST: self._host})
        self.context["title_placeholders"] = {"name": f"CAM720 {uid}"}
        return await self.async_step_user()

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            session = async_get_clientsession(self.hass)
            host = user_input[CONF_HOST]
            password = user_input[CONF_PASSWORD]
            try:
                token = await api.read_token(session, host, password)
                info = await api.identify(session, host)
            except api.AuthError:
                errors["base"] = "invalid_auth"
            except api.CameraError:
                errors["base"] = "cannot_connect"
            else:
                uid = info["uid"] if info else token[:8]
                await self.async_set_unique_id(uid)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"CAM720 {uid}",
                    data={
                        CONF_HOST: host,
                        CONF_PASSWORD: password,
                        CONF_UID: uid,
                        CONF_TOKEN: token,
                    },
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=self._host or vol.UNDEFINED): str,
                vol.Required(CONF_PASSWORD, default=DEFAULT_ADMIN_PASSWORD): str,
            }
        )
        return self.async_show_form(
            step_id="user", data_schema=schema, errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry) -> OptionsFlow:
        return JooanCam720OptionsFlow()


class JooanCam720OptionsFlow(OptionsFlow):
    async def async_step_init(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = self.config_entry.options.get(CONF_GO2RTC_URL, DEFAULT_GO2RTC_URL)
        schema = vol.Schema({vol.Required(CONF_GO2RTC_URL, default=current): str})
        return self.async_show_form(step_id="init", data_schema=schema)
