# Jooan CAM720 for Home Assistant

Local, cloud-free control of Jooan CAM720 cameras (JA-A12 / W8-U). No Jooan
account, no Jooan servers. Add a camera by entering its IP and admin password;
the integration reads everything else off the camera over the LAN.

## What works over the LAN, with Jooan blocked

- Live video and camera-microphone audio (RTSP).
- Two-way talk (speaker), via the companion go2rtc fork below.
- Pan / tilt (ONVIF).
- The talk-back token (`device_pwd`) is read from the camera's own flash, not
  fetched from Jooan's cloud. Jooan only ever wrote it there once, at the
  factory.

## Setup

1. Put the camera on your network.
2. In Home Assistant: Settings, Devices and services, Add integration, Jooan
   CAM720.
3. Enter the camera's IP and admin web password. The factory default is
   `admin123`. If yours was changed during a previous app setup, use that.

The integration reads the device UID, model and the talk-back token locally and
adds the camera. You can then block the camera from the internet at your router.

## Two-way talk

Live talk-back is carried by go2rtc with CAM720 support, which upstream go2rtc
does not yet have. Use the companion fork:

- [OJ-Labs-Ltd/go2rtc-cam720](https://github.com/OJ-Labs-Ltd/go2rtc-cam720)
  (adds the `cam720://` source)

A `linux/arm64` binary is attached to each release. For any other processor or
OS, build it from source: the fork is pure Go and cross-compiles in one command.
Step-by-step instructions for every architecture are in the fork's
[CAM720.md](https://github.com/OJ-Labs-Ltd/go2rtc-cam720/blob/cam720/CAM720.md#building-for-your-architecture).

Point Home Assistant's go2rtc at that build, or set the integration's go2rtc URL
option to it, and talk-back works. Video, listen-in and pan/tilt work without it.

## How the token read works

The camera's config-backup CGI returns any config field to a LAN client that
knows the admin password:

```
GET /goform/getOtherSetttings
    ?userid=admin&userkey=<MD5(password)>
    &singleCMD=GetJsonConf&json_string={"UIDInfo":{"AuthKey":""}}
```

`UIDInfo.AuthKey` is the 14-character talk-back token. It is baked into the
camera at manufacture and survives a factory reset, so no cloud call is needed
to recover it.

## Status

Early. Video, discovery and local token read are tested against a JA-A12 on
firmware 84025200. Talk-back is proven through the go2rtc fork.
