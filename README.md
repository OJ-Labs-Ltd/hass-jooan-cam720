# Jooan CAM720 for Home Assistant

Local, cloud-free control of Jooan CAM720 cameras (JA-A12 / W8-U). No Jooan
account, no Jooan servers. Add a camera by entering its IP and admin password;
the integration reads everything else off the camera over the LAN.

## Why local

Out of the box the camera keeps a connection open to the vendor's cloud (Jooan
on Alibaba IoT, `use1api.jooaniot.com`), and your video and audio pass through
servers you don't control. This integration needs none of that. It reads the
camera's own token off the device, talks to it directly on your network, and
lets you block it from the internet entirely. Video, microphone audio, pan/tilt
and two-way talk all stay on your LAN.

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

### A brand-new or factory-reset camera

On a camera that has never been set up (or has just been factory reset), the
admin password is the factory default `admin123` and the token is already in
flash, so the steps above work with no Jooan account at all. If you bought the
camera used, or set it up through the Jooan app before, the admin password was
likely changed; use that one.

## Two-way talk

Live talk-back is carried by go2rtc with CAM720 support, which upstream go2rtc
does not yet have. Use the companion fork:

- [OJ-Labs-Ltd/go2rtc-cam720](https://github.com/OJ-Labs-Ltd/go2rtc-cam720)
  (adds the `cam720://` source)

A `linux/arm64` binary is attached to each release. For any other processor or
OS, build it from source: the fork is pure Go and cross-compiles in one command.
Step-by-step instructions for every architecture are in the fork's
[CAM720.md](https://github.com/OJ-Labs-Ltd/go2rtc-cam720/blob/cam720/CAM720.md#building-for-your-architecture).

Point the integration's go2rtc URL option at that build and talk-back works.
Video, listen-in and pan/tilt work without it.

### Announcements and TTS (service)

`jooan_cam720.talk` plays any audio Home Assistant can produce (a media file,
a URL, or TTS) to the camera's speaker. It pushes the audio to the go2rtc fork,
which transcodes to the G.711 A-law the camera expects. Example:

```yaml
action: jooan_cam720.talk
data:
  media: media-source://tts/cloud?message=Dinner's ready
```

### Live hold-to-talk (microphone)

For a press-and-hold microphone button on the camera card, the go2rtc that
serves the camera's WebRTC must speak `cam720://` and must carry the camera's
speaker as a backchannel alongside the video. This works with the
[WebRTC Camera](https://github.com/AlexxIT/WebRTC) (AlexxIT) card, verified on a
JA-A12:

1. **Give that integration the fork binary.** Replace the go2rtc binary it runs
   (in your HA config dir, named like `go2rtc-1.9.9`) with this fork's build of
   the same or newer version. The integration only checks the binary prints
   `go2rtc` for `-v`, so the fork is accepted and not re-downloaded.
2. **Define a combined stream per lens** in `go2rtc.yaml` in your HA config dir:
   the RTSP video source and the `cam720://` speaker source together.

   ```yaml
   streams:
     crib0:
       - rtsp://admin:ADMIN_PASSWORD@CAMERA_IP:554/live/ch00_0
       - cam720://CAMERA_IP/UID?token=DEVICE_PWD
     crib1:
       - rtsp://admin:ADMIN_PASSWORD@CAMERA_IP:554/live/ch01_0
       - cam720://CAMERA_IP/UID?token=DEVICE_PWD
   ```
3. **Point the card at the stream and enable the mic:**

   ```yaml
   type: custom:webrtc-camera
   url: crib0
   media: video,audio,microphone
   ```

Reload the WebRTC Camera integration. The card shows a microphone button; press
and hold to talk. The live feed is the RTSP source; the mic routes through the
`cam720://` backchannel to the camera speaker. This leaves Home Assistant's own
core go2rtc, and every other camera, untouched.

If the WebRTC Camera integration later auto-updates, it may re-download the
stock go2rtc and the mic will stop working; re-apply step 1.

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
