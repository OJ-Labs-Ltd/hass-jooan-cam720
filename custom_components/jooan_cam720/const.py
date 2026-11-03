DOMAIN = "jooan_cam720"

DEFAULT_ADMIN_USER = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123"  # factory default, from firmware aging-test scripts

CONF_UID = "uid"
CONF_TOKEN = "token"  # device_pwd / AuthKey, read locally from camera flash
CONF_GO2RTC_URL = "go2rtc_url"

DEFAULT_GO2RTC_URL = "http://localhost:1984"

SETUP_PORT = 9898  # unauthenticated device-info port
HTTP_PORT = 80
RTSP_PORT = 554

SERVICE_TALK = "talk"
ATTR_MEDIA = "media"

# Jooan OUI, for DHCP discovery.
MAC_PREFIX = "743336"
