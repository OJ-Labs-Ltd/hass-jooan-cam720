"""Config flow: find the camera, read its token locally, add it."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PASSWORD
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from . import api
from .const import CONF_TOKEN, CONF_UID, DEFAULT_ADMIN_PASSWORD, DOMAIN


class JooanCam720ConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

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
                vol.Required(CONF_HOST): str,
                vol.Required(CONF_PASSWORD, default=DEFAULT_ADMIN_PASSWORD): str,
            }
        )
        return self.async_show_form(
            step_id="user", data_schema=schema, errors=errors
        )
